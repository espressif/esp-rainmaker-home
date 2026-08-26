/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { firstRouteParam } from "@shared/utils/common";
import {
  DEVICE_SETTINGS_SCREEN_ROUTE,
  DEVICE_SETTINGS_OPEN_PICKER_CONTROL_GROUP,
  DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER,
  DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_CONTROL_GROUP_ID,
  DEVICE_SETTINGS_ROUTE_PARAM_DEVICE,
  GROUP_USER_ACCESS_PRIMARY,
} from "@shared/utils/constants";
import { SettingsFieldCard } from "@shared/components";
import {
  canNodeBeAddedToControlGroup,
  shouldShowAddToControlGroup,
} from "@features/control/utils/settingsHelpers";
import {
  getPrimaryControlGroupIdForNode,
  getControlGroupPickerOptions,
  getCompatibleControlGroupsForNode,
  getControlGroupsForHome,
  moveNodeToControlGroup,
} from "@features/control/utils/controlGroupAssignmentHelpers";
import {
  resolveHomeIdContainingNode,
  stripGroupControlSubgroupDisplayName,
} from "@features/group/utils/controlGroupHelpers";
import { SettingsListPickerSheet } from "@features/control/components/DeviceSettings/SettingsListPickerSheet";
import type { ESPCDFNode } from "@store";

export interface DeviceControlGroupAssignmentProps {
  /** Node whose control group membership is shown and edited. */
  node: ESPCDFNode;
}

/**
 * Single control-group field on device settings: tap opens a bottom-sheet drawer
 * to assign the node to a compatible control group or create a new one.
 * @param props - Node context for visibility and assignment
 */
export const DeviceControlGroupAssignment = observer(
  ({ node }: DeviceControlGroupAssignmentProps) => {
    const { t } = useTranslation();
    const toast = useToast();
    const router = useRouter();
    const routeParams = useLocalSearchParams<{
      [DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_CONTROL_GROUP_ID]?:
        | string
        | string[];
      [DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER]?: string | string[];
      [DEVICE_SETTINGS_ROUTE_PARAM_DEVICE]?: string | string[];
    }>();
    const { store, syncHomeWithNodes } = useCDF();
    const [isSheetVisible, setIsSheetVisible] = useState(false);
    const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
    const [pendingPickerGroupId, setPendingPickerGroupId] = useState<
      string | undefined
    >();
    const appliedReturnGroupIdRef = useRef<string | undefined>(undefined);
    const isUpdating = updatingGroupId !== null;

    const settingsDeviceParam = firstRouteParam(
      routeParams[DEVICE_SETTINGS_ROUTE_PARAM_DEVICE],
    );
    const returnSelectedGroupId = firstRouteParam(
      routeParams[DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_CONTROL_GROUP_ID],
    );
    const returnOpenPicker = firstRouteParam(
      routeParams[DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER],
    );

    const isPrimary = node.isPrimaryUser ?? false;
    const isVisible = shouldShowAddToControlGroup(node, isPrimary);
    const canAddToControlGroup = canNodeBeAddedToControlGroup(node);

    const homeId = useMemo(
      () =>
        resolveHomeIdContainingNode(
          node.id,
          store?.groupStore?.groupsList ?? [],
          store?.groupStore?.currentHomeId ?? null,
        ),
      [
        node.id,
        store?.groupStore?.groupsList,
        store?.groupStore?.currentHomeId,
      ],
    );

    const home = homeId
      ? store?.groupStore?.groupsByIDMap?.[homeId] ?? null
      : null;

    const canEditControlGroups =
      !home?.accessType || home.accessType === GROUP_USER_ACCESS_PRIMARY;

    const allControlGroups = useMemo(
      () => getControlGroupsForHome(home),
      [home],
    );

    const compatibleGroups = useMemo(
      () =>
        getCompatibleControlGroupsForNode(
          allControlGroups,
          node,
          store?.nodeStore?.nodesByIDMap,
        ),
      [allControlGroups, node, store?.nodeStore?.nodesByIDMap],
    );

    const options = useMemo(
      () => getControlGroupPickerOptions(compatibleGroups),
      [compatibleGroups],
    );

    const selectedGroupId = useMemo(
      () => getPrimaryControlGroupIdForNode(allControlGroups, node.id),
      [allControlGroups, node.id],
    );

    const pickerSelectedGroupId = pendingPickerGroupId ?? selectedGroupId;

    const selectedLabel = useMemo(() => {
      if (!selectedGroupId && !pendingPickerGroupId) {
        return t("device.settings.noControlGroupAssigned");
      }
      const targetId = selectedGroupId ?? pendingPickerGroupId;
      const fallbackName = stripGroupControlSubgroupDisplayName(
        allControlGroups.find((group) => group.id === targetId)?.name,
      );
      return (
        options.find((option) => option.id === targetId)?.label ??
        (fallbackName || t("device.settings.noControlGroupAssigned"))
      );
    }, [allControlGroups, options, pendingPickerGroupId, selectedGroupId, t]);

    const isEditable = canEditControlGroups && canAddToControlGroup;
    const ineligibleDrawerMessage = canAddToControlGroup
      ? undefined
      : t("device.settings.multiDeviceControlGroupUnsupported");

    /**
     * Re-opens the control group picker after returning from create flow.
     */
    useEffect(() => {
      if (
        !returnSelectedGroupId ||
        returnOpenPicker !== DEVICE_SETTINGS_OPEN_PICKER_CONTROL_GROUP ||
        returnSelectedGroupId === appliedReturnGroupIdRef.current
      ) {
        return;
      }

      appliedReturnGroupIdRef.current = returnSelectedGroupId;

      void (async () => {
        try {
          await syncHomeWithNodes(true);
        } catch (error) {
          console.warn(
            "[DeviceControlGroupAssignment] sync after create failed:",
            error,
          );
        }
        setPendingPickerGroupId(returnSelectedGroupId);
        setIsSheetVisible(true);
      })();

      router.setParams({
        [DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_CONTROL_GROUP_ID]: undefined,
        [DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER]: undefined,
      } as Record<string, string | undefined>);
    }, [returnOpenPicker, returnSelectedGroupId, router, syncHomeWithNodes]);

    /**
     * Closes the control group picker drawer when no save is in flight.
     */
    const handleCloseSheet = useCallback(() => {
      if (!isUpdating) {
        setIsSheetVisible(false);
        setPendingPickerGroupId(undefined);
      }
    }, [isUpdating]);

    /**
     * Navigates to Create Control Group and returns here with the new group selected.
     */
    const handleCreateControlGroup = useCallback(() => {
      if (!homeId || isUpdating || !canAddToControlGroup) {
        return;
      }
      setIsSheetVisible(false);
      router.push({
        pathname: "/(group)/CreateControlGroup",
        params: {
          id: homeId,
          dismissTo: DEVICE_SETTINGS_SCREEN_ROUTE,
          preselectedNodeId: node.id,
          ...(settingsDeviceParam
            ? { settingsDevice: settingsDeviceParam }
            : {}),
        },
      } as Parameters<typeof router.push>[0]);
    }, [
      canAddToControlGroup,
      homeId,
      isUpdating,
      node.id,
      router,
      settingsDeviceParam,
    ]);

    /**
     * Assigns the node to the chosen control group and refreshes the home store.
     * @param groupId - Target control group id
     */
    const handleSelectGroup = useCallback(
      async (groupId: string) => {
        if (isUpdating) {
          return;
        }
        if (!isEditable || groupId === selectedGroupId) {
          setIsSheetVisible(false);
          setPendingPickerGroupId(undefined);
          return;
        }

        setUpdatingGroupId(groupId);
        try {
          await moveNodeToControlGroup(compatibleGroups, node.id, groupId);
          await syncHomeWithNodes();
          toast.showSuccess(t("device.settings.controlGroupUpdatedSuccess"));
          setIsSheetVisible(false);
          setPendingPickerGroupId(undefined);
        } catch (error) {
          console.error("[DeviceControlGroupAssignment] move failed:", error);
          toast.showError(t("group.errors.fallback"));
        } finally {
          setUpdatingGroupId(null);
        }
      },
      [
        compatibleGroups,
        isEditable,
        isUpdating,
        node.id,
        selectedGroupId,
        syncHomeWithNodes,
        t,
        toast,
      ],
    );

    if (!isVisible || !homeId) {
      return null;
    }

    return (
      <>
        <SettingsFieldCard
          label={t("device.settings.controlGroupTitle")}
          value={selectedLabel}
          onPress={
            canEditControlGroups
              ? () => !isUpdating && setIsSheetVisible(true)
              : undefined
          }
          disabled={!canEditControlGroups || isUpdating}
          showArrow={false}
          qaId="device_control_group_assignment"
        />

        <SettingsListPickerSheet
          visible={isSheetVisible}
          title={t("device.settings.selectControlGroup")}
          options={canAddToControlGroup ? options : []}
          selectedId={pickerSelectedGroupId}
          onClose={handleCloseSheet}
          onSelect={(groupId) => {
            void handleSelectGroup(groupId);
          }}
          loadingId={updatingGroupId}
          createNewLabel={
            canAddToControlGroup
              ? t("device.settings.createNewControlGroup")
              : undefined
          }
          onCreateNew={
            canAddToControlGroup ? handleCreateControlGroup : undefined
          }
          emptyStateMessage={ineligibleDrawerMessage}
        />
      </>
    );
  },
);
