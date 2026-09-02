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
  DEVICE_SETTINGS_OPEN_PICKER_ROOM,
  DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER,
  DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_ROOM_ID,
  DEVICE_SETTINGS_ROUTE_PARAM_DEVICE,
  GROUP_USER_ACCESS_PRIMARY,
} from "@shared/utils/constants";
import { getSelectableRoomsForHome } from "@features/provision/utils/selectDeviceRoomHelpers";
import {
  getPrimaryRoomIdForNode,
  getRoomPickerOptions,
  moveNodeToRoom,
} from "@features/control/utils/deviceAssignmentHelpers";
import { resolveHomeIdContainingNode } from "@features/group/utils/controlGroupHelpers";
import { SettingsFieldCard } from "@shared/components";
import { SettingsListPickerSheet } from "@features/control/components/DeviceSettings/SettingsListPickerSheet";
import type { ESPCDFNode } from "@store";

export interface DeviceRoomAssignmentProps {
  /** Node whose room membership is shown and edited. */
  node: ESPCDFNode;
  /** When true, the field is disabled (non-primary users). Offline does not disable this. */
  disabled?: boolean;
}

/**
 * Single room field on device settings: tap opens a bottom-sheet drawer to
 * move the whole node to another room or create a new room when none exist.
 * @param props - Node context and disabled flag
 */
export const DeviceRoomAssignment = observer(
  ({ node, disabled = false }: DeviceRoomAssignmentProps) => {
    const { t } = useTranslation();
    const toast = useToast();
    const router = useRouter();
    const routeParams = useLocalSearchParams<{
      [DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_ROOM_ID]?: string | string[];
      [DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER]?: string | string[];
      [DEVICE_SETTINGS_ROUTE_PARAM_DEVICE]?: string | string[];
    }>();
    const { store, syncHomeWithNodes } = useCDF();
    const [isSheetVisible, setIsSheetVisible] = useState(false);
    const [updatingRoomId, setUpdatingRoomId] = useState<string | null>(null);
    const [pendingPickerRoomId, setPendingPickerRoomId] = useState<
      string | undefined
    >();
    const appliedReturnRoomIdRef = useRef<string | undefined>(undefined);
    const isUpdating = updatingRoomId !== null;

    const settingsDeviceParam = firstRouteParam(
      routeParams[DEVICE_SETTINGS_ROUTE_PARAM_DEVICE],
    );
    const returnSelectedRoomId = firstRouteParam(
      routeParams[DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_ROOM_ID],
    );
    const returnOpenPicker = firstRouteParam(
      routeParams[DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER],
    );

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

    const canEditRoomDevices =
      !home?.accessType || home.accessType === GROUP_USER_ACCESS_PRIMARY;

    const rooms = useMemo(() => getSelectableRoomsForHome(home), [home]);
    const options = useMemo(() => getRoomPickerOptions(home), [home]);
    const selectedRoomId = useMemo(
      () => getPrimaryRoomIdForNode(rooms, node.id),
      [rooms, node.id],
    );

    const pickerSelectedRoomId = pendingPickerRoomId ?? selectedRoomId;

    const selectedLabel = useMemo(() => {
      if (!selectedRoomId && !pendingPickerRoomId) {
        return t("device.settings.noRoomAssigned");
      }
      const targetId = selectedRoomId ?? pendingPickerRoomId;
      return (
        options.find((option) => option.id === targetId)?.label ??
        rooms.find((room) => room.id === targetId)?.name ??
        t("device.settings.noRoomAssigned")
      );
    }, [options, pendingPickerRoomId, rooms, selectedRoomId, t]);

    const multiEndpointSubtitle = useMemo(() => {
      const count = node.devices?.length ?? 0;
      if (count <= 1) {
        return undefined;
      }
      return t("device.settings.multiEndpointRoomHint");
    }, [node.devices?.length, t]);

    const isEditable = canEditRoomDevices && !disabled;

    /**
     * Re-opens the room picker after returning from Create Room with a new option.
     */
    useEffect(() => {
      if (
        !returnSelectedRoomId ||
        returnOpenPicker !== DEVICE_SETTINGS_OPEN_PICKER_ROOM ||
        returnSelectedRoomId === appliedReturnRoomIdRef.current
      ) {
        return;
      }

      appliedReturnRoomIdRef.current = returnSelectedRoomId;

      void (async () => {
        try {
          await syncHomeWithNodes(true);
        } catch (error) {
          console.warn("[DeviceRoomAssignment] sync after create failed:", error);
        }
        setPendingPickerRoomId(returnSelectedRoomId);
        setIsSheetVisible(true);
      })();

      router.setParams({
        [DEVICE_SETTINGS_ROUTE_PARAM_SELECTED_ROOM_ID]: undefined,
        [DEVICE_SETTINGS_ROUTE_PARAM_OPEN_PICKER]: undefined,
      } as Record<string, string | undefined>);
    }, [returnOpenPicker, returnSelectedRoomId, router, syncHomeWithNodes]);

    /**
     * Closes the room picker drawer when no save is in flight.
     */
    const handleCloseSheet = useCallback(() => {
      if (!isUpdating) {
        setIsSheetVisible(false);
        setPendingPickerRoomId(undefined);
      }
    }, [isUpdating]);

    /**
     * Navigates to Create Room and returns here with the new room pre-selected.
     */
    const handleCreateRoom = useCallback(() => {
      if (!homeId || isUpdating) {
        return;
      }
      setIsSheetVisible(false);
      router.push({
        pathname: "/(group)/CreateRoom",
        params: {
          id: homeId,
          dismissTo: DEVICE_SETTINGS_SCREEN_ROUTE,
          nodeId: node.id,
          showSelection: "0",
          ...(settingsDeviceParam
            ? { settingsDevice: settingsDeviceParam }
            : {}),
        },
      } as Parameters<typeof router.push>[0]);
    }, [homeId, isUpdating, node.id, router, settingsDeviceParam]);

    /**
     * Moves the node to the chosen room and refreshes the home store.
     * @param roomId - Target room subgroup id
     */
    const handleSelectRoom = useCallback(
      async (roomId: string) => {
        if (isUpdating) {
          return;
        }
        if (!isEditable || roomId === selectedRoomId) {
          setIsSheetVisible(false);
          setPendingPickerRoomId(undefined);
          return;
        }

        setUpdatingRoomId(roomId);
        try {
          await moveNodeToRoom(rooms, node.id, roomId);
          await syncHomeWithNodes();
          toast.showSuccess(t("device.settings.roomUpdatedSuccess"));
          setIsSheetVisible(false);
          setPendingPickerRoomId(undefined);
        } catch (error) {
          console.error("[DeviceRoomAssignment] move failed:", error);
          toast.showError(t("group.errors.fallback"));
        } finally {
          setUpdatingRoomId(null);
        }
      },
      [
        isEditable,
        isUpdating,
        node.id,
        rooms,
        selectedRoomId,
        syncHomeWithNodes,
        t,
        toast,
      ],
    );

    if (!homeId) {
      return null;
    }

    return (
      <>
        <SettingsFieldCard
          label={t("device.settings.roomTitle")}
          value={selectedLabel}
          onPress={
            canEditRoomDevices
              ? () => !isUpdating && setIsSheetVisible(true)
              : undefined
          }
          disabled={!isEditable || isUpdating}
          showArrow={false}
          qaId="device_room_assignment"
        />

        <SettingsListPickerSheet
          visible={isSheetVisible}
          title={t("device.settings.selectRoom")}
          subtitle={multiEndpointSubtitle}
          options={options}
          selectedId={pickerSelectedRoomId}
          onClose={handleCloseSheet}
          onSelect={(roomId) => {
            void handleSelectRoom(roomId);
          }}
          loadingId={updatingRoomId}
          createNewLabel={t("device.settings.createNewRoom")}
          onCreateNew={handleCreateRoom}
        />
      </>
    );
  },
);
