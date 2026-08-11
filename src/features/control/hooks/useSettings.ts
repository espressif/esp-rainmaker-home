/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { router, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { getFeatures } from "@config/features.config";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import {
  getMatterControllerConfig,
  updateMatterControllerDeviceList,
} from "@shared/utils/matterController";
import { updateRmakerUserAuthForNode } from "@shared/utils/userAuthServiceHelper";
import {
  SAVE_DEVICE_NAME_STATUS_SUCCESS,
  SETTINGS_SECTION_NAME,
  RMAKER_AUTH_TOAST_KIND_UPDATED,
  RMAKER_AUTH_TOAST_KIND_NO_REFRESH_TOKEN,
} from "@features/control/constants";
import type { SettingsQuickActionItem } from "@features/control/components";
import {
  SETTINGS_DEFAULT_SECTIONS,
  buildSettingsQuickActions,
  getDeviceNameParam,
  getNodeReadmeUrl,
  getSettingsDisplayName,
  isNodeDeleteSuccess,
  isSettingsDisabled,
  resolveRmakerAuthUpdateToastKind,
  resolveSettingsDevice,
  resolveSettingsNode,
  saveDeviceDisplayName,
  shouldShowAddToControlGroup,
  shouldShowUpdateAuthToken,
  shouldShowUpdateDeviceList,
} from "@features/control/utils/settingsHelpers";
import { resolveHomeIdContainingNode } from "@features/group/utils/controlGroupHelpers";
import { ESPCDFDevice, ESPCDFNode } from "@store";
import type { OTAInfo } from "@src/types/global";

export interface UseSettingsReturn {
  node: ESPCDFNode | undefined;
  device: ESPCDFDevice | undefined;
  displayName: string;
  isConnected: boolean;
  isPrimary: boolean;
  settingsDisabled: boolean;
  deviceName: string;
  setDeviceName: (name: string) => void;
  /** Marks the name field dirty and updates local draft text. */
  handleDeviceNameChange: (name: string) => void;
  isEditingName: boolean;
  setIsEditingName: (editing: boolean) => void;
  isSavingName: boolean;
  /** True when the draft name differs from the persisted display name. */
  isDeviceNameDirty: boolean;
  validSection: string[];
  otaInfo: OTAInfo;
  isCheckingUpdate: boolean;
  isRemovingDevice: boolean;
  showRemoveDeviceDialog: boolean;
  setShowRemoveDeviceDialog: (open: boolean) => void;
  readmeUrl: string | null;
  showAddToControlGroup: boolean;
  settingsQuickActions: SettingsQuickActionItem[];
  otaFeatureEnabled: boolean;
  handleSaveDeviceName: () => Promise<boolean>;
  handleCheckForUpdates: () => Promise<void>;
  handleStartUpdate: () => Promise<void>;
  handleRemoveDevice: () => void;
  confirmRemoveDevice: () => Promise<void>;
  handleGuidePress: () => void;
  handleAddToControlGroup: () => void;
}

/**
 * Encapsulates device Settings screen state, derived flags, and actions.
 * Resolves node/device from route params and the live store (use inside `observer`).
 * @returns View model for the control Settings presentation screen
 */
export const useSettings = (): UseSettingsReturn => {
  const { store } = useCDF();
  const routerNav = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const toast = useToast();
  const { id, device: deviceParam } = useLocalSearchParams<{
    id?: string;
    device?: string;
  }>();

  const nodesByIDMap = store?.nodeStore?.nodesByIDMap;

  const node = useMemo(
    () => resolveSettingsNode(nodesByIDMap, id),
    [id, nodesByIDMap],
  );

  const device = useMemo(
    () => resolveSettingsDevice(node, deviceParam),
    [node, deviceParam],
  );

  const deviceWasFoundRef = useRef(false);
  if (device) {
    deviceWasFoundRef.current = true;
  }

  useEffect(() => {
    if (deviceParam && deviceWasFoundRef.current && !device) {
      routerNav.back();
    }
  }, [deviceParam, device, routerNav]);

  const displayName = useMemo(
    () => getSettingsDisplayName(device, node),
    [device, node],
  );

  const isConnected = node?.connectivityStatus?.isConnected ?? false;
  const isPrimary = node?.isPrimaryUser ?? false;
  const settingsDisabled = isSettingsDisabled(isPrimary, isConnected);

  const [deviceName, setDeviceName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [otaInfo, setOtaInfo] = useState<OTAInfo>({
    currentVersion: "",
    newVersion: undefined,
    isUpdateAvailable: false,
    isUpdating: false,
  });
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isRemovingDevice, setIsRemovingDevice] = useState(false);
  const [isUpdatingAuthToken, setIsUpdatingAuthToken] = useState(false);
  const [isUpdatingDeviceList, setIsUpdatingDeviceList] = useState(false);
  const [showRemoveDeviceDialog, setShowRemoveDeviceDialog] = useState(false);
  const [validSection, setValidSection] = useState<string[]>([
    ...SETTINGS_DEFAULT_SECTIONS,
  ]);

  useEffect(() => {
    const nameParam = getDeviceNameParam(device);
    if (nameParam) {
      if (!isEditingName) {
        setDeviceName(displayName);
      }
    } else {
      setValidSection((prev) =>
        prev.filter((section) => section !== SETTINGS_SECTION_NAME),
      );
    }
  }, [device, displayName, isEditingName]);

  /**
   * Updates the draft device name and locks out store-driven overwrites while editing.
   * @param name - Latest text from the name field
   */
  const handleDeviceNameChange = useCallback((name: string) => {
    setIsEditingName(true);
    setDeviceName(name);
  }, []);

  const isDeviceNameDirty =
    !settingsDisabled && deviceName.trim() !== displayName.trim();

  const readmeUrl = useMemo(() => getNodeReadmeUrl(node), [node]);

  const homeIdForControlGroup = useMemo(() => {
    if (!id) {
      return undefined;
    }
    return resolveHomeIdContainingNode(
      id,
      store?.groupStore?.groupsList ?? [],
      store?.groupStore?.currentHomeId ?? null,
    );
  }, [id, store?.groupStore?.groupsList, store?.groupStore?.currentHomeId]);

  const matterControllerConfig = useMemo(
    () => getMatterControllerConfig(node),
    [node],
  );

  const showAddToControlGroup = shouldShowAddToControlGroup(node, isPrimary);
  const showUpdateAuthToken = shouldShowUpdateAuthToken(node, isPrimary);
  const showUpdateDeviceList = shouldShowUpdateDeviceList(node, isPrimary);
  const otaFeatureEnabled = getFeatures().ota;

  /**
   * Re-pushes the signed-in refresh token to `esp.service.rmaker-user-auth`.
   */
  const handleUpdateAuthToken = useCallback(async () => {
    if (!node || isUpdatingAuthToken) {
      return;
    }

    setIsUpdatingAuthToken(true);
    try {
      const result = await updateRmakerUserAuthForNode(node);
      const toastKind = resolveRmakerAuthUpdateToastKind(result);

      if (toastKind === RMAKER_AUTH_TOAST_KIND_UPDATED) {
        toast.showSuccess(t("device.settings.registrationTokenUpdated"));
        return;
      }
      if (toastKind === RMAKER_AUTH_TOAST_KIND_NO_REFRESH_TOKEN) {
        toast.showError(t("device.settings.registrationTokenNotAvailable"));
        return;
      }
      toast.showError(t("device.settings.registrationTokenUpdateFailed"));
    } catch (error) {
      console.error("Error updating rmaker user auth:", error);
      toast.showError(t("device.settings.registrationTokenUpdateFailed"));
    } finally {
      setIsUpdatingAuthToken(false);
    }
  }, [isUpdatingAuthToken, node, t, toast]);

  /**
   * Persists an edited device name via Matter metadata or the name param.
   * Skips the network call when the draft matches the current display name.
   * @returns True when leave navigation may proceed (saved or unchanged)
   */
  const handleSaveDeviceName = useCallback(async (): Promise<boolean> => {
    if (settingsDisabled || isSavingName) {
      return false;
    }

    const trimmed = deviceName.trim();
    if (!trimmed) {
      toast.showError(t("device.validation.deviceNameCannotBeEmpty"));
      return false;
    }

    if (!node) {
      return false;
    }

    if (trimmed === displayName.trim()) {
      setIsEditingName(false);
      return true;
    }

    setIsEditingName(true);
    setIsSavingName(true);
    try {
      const outcome = await saveDeviceDisplayName(node, device, trimmed);

      if (outcome === SAVE_DEVICE_NAME_STATUS_SUCCESS) {
        toast.showSuccess(t("device.settings.deviceNameUpdatedSuccessfully"));
        setIsEditingName(false);
        return true;
      }

      toast.showError(t("device.errors.failedToUpdateDeviceName"));
      return false;
    } finally {
      setIsSavingName(false);
    }
  }, [
    device,
    deviceName,
    displayName,
    isSavingName,
    node,
    settingsDisabled,
    t,
    toast,
  ]);

  const saveDeviceNameRef = useRef(handleSaveDeviceName);
  saveDeviceNameRef.current = handleSaveDeviceName;

  // Flush a dirty rename before leaving (header back, hardware back, swipe).
  usePreventRemove(isDeviceNameDirty && !isSavingName, ({ data }) => {
    void (async () => {
      const ok = await saveDeviceNameRef.current();
      if (ok) {
        navigation.dispatch(data.action);
      }
    })();
  });

  /**
   * Queries the node for an available firmware update.
   */
  const handleCheckForUpdates = useCallback(async () => {
    if (!node) {
      return;
    }

    setIsCheckingUpdate(true);
    try {
      const hasUpdate = await node.checkOTAUpdate?.();
      if (hasUpdate?.data?.otaAvailable) {
        setOtaInfo((prev) => ({
          ...prev,
          newVersion: hasUpdate.data?.fwVersion,
          isUpdateAvailable: true,
          ...hasUpdate,
        }));
      } else {
        toast.showWarning(t("device.settings.noOTAUpdateAvailable"));
        setOtaInfo((prev) => ({ ...prev, isUpdateAvailable: false }));
      }
    } catch {
      toast.showError(t("device.errors.checkOTAUpdateError"));
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [node, t, toast]);

  /**
   * Starts the OTA flow and updates local progress state.
   */
  const handleStartUpdate = useCallback(async () => {
    setOtaInfo((prev) => ({ ...prev, isUpdating: true }));
    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      setOtaInfo((prev) => ({
        ...prev,
        currentVersion: prev.newVersion || prev.currentVersion,
        newVersion: undefined,
        isUpdateAvailable: false,
        isUpdating: false,
      }));
      toast.showSuccess(t("device.settings.otaUpdateStarted"));
    } catch {
      toast.showError(t("device.errors.otaUpdateStartError"));
      setOtaInfo((prev) => ({ ...prev, isUpdating: false }));
    }
  }, [t, toast]);

  /**
   * Opens the remove-device confirmation dialog.
   */
  const handleRemoveDevice = useCallback(() => {
    setShowRemoveDeviceDialog(true);
  }, []);

  /**
   * Deletes the node after user confirmation.
   */
  const confirmRemoveDevice = useCallback(async () => {
    setIsRemovingDevice(true);
    try {
      const result = await node?.delete();
      if (isNodeDeleteSuccess(result?.status)) {
        router.dismissTo("/(group)/Home");
      }
    } catch (error) {
      console.error(error);
      toast.showError(t("device.errors.failedToRemoveDevice"));
    } finally {
      setIsRemovingDevice(false);
    }
  }, [node, t, toast]);

  /**
   * Navigates to the in-app guide for this node's readme URL.
   */
  const handleGuidePress = useCallback(() => {
    if (!readmeUrl || !node) {
      return;
    }

    const headerName = node.nodeConfig?.info?.name || "Device";
    routerNav.push({
      pathname: "/(control)/Guide" as const,
      params: {
        url: readmeUrl,
        title: headerName,
        deviceName: displayName || headerName,
      },
    });
  }, [displayName, node, readmeUrl, routerNav]);

  /**
   * Navigates to create-control-group with this node preselected.
   */
  const handleAddToControlGroup = useCallback(() => {
    if (!homeIdForControlGroup || !id) {
      toast.showError(t("device.settings.controlGroupNeedHome"));
      return;
    }
    routerNav.push({
      pathname: "/(group)/CreateControlGroup" as const,
      params: { id: homeIdForControlGroup, preselectedNodeId: id },
    });
  }, [homeIdForControlGroup, id, routerNav, t, toast]);

  /**
   * Requests a Matter controller device-list refresh via cloud `MTCtlCMD = 2`.
   */
  const handleUpdateDeviceList = useCallback(async () => {
    if (!node || isUpdatingDeviceList || !matterControllerConfig.canUpdateDeviceList) {
      return;
    }

    setIsUpdatingDeviceList(true);
    try {
      await updateMatterControllerDeviceList(node, matterControllerConfig);
      toast.showSuccess(t("device.settings.deviceListUpdated"));
    } catch (error) {
      console.error("Error updating Matter controller device list:", error);
      toast.showError(t("device.settings.deviceListUpdateFailed"));
    } finally {
      setIsUpdatingDeviceList(false);
    }
  }, [isUpdatingDeviceList, matterControllerConfig, node, t, toast]);

  const settingsQuickActions = useMemo(
    () =>
      buildSettingsQuickActions({
        t,
        showUpdateAuthToken,
        showUpdateDeviceList,
        settingsDisabled,
        isUpdatingAuthToken,
        isUpdatingDeviceList,
        onUpdateAuthToken: handleUpdateAuthToken,
        onUpdateDeviceList: handleUpdateDeviceList,
      }),
    [
      handleUpdateAuthToken,
      handleUpdateDeviceList,
      isUpdatingAuthToken,
      isUpdatingDeviceList,
      settingsDisabled,
      showUpdateAuthToken,
      showUpdateDeviceList,
      t,
    ],
  );

  return {
    node,
    device,
    displayName,
    isConnected,
    isPrimary,
    settingsDisabled,
    deviceName,
    setDeviceName,
    handleDeviceNameChange,
    isEditingName,
    setIsEditingName,
    isSavingName,
    isDeviceNameDirty,
    validSection,
    otaInfo,
    isCheckingUpdate,
    isRemovingDevice,
    showRemoveDeviceDialog,
    setShowRemoveDeviceDialog,
    readmeUrl,
    showAddToControlGroup,
    settingsQuickActions,
    otaFeatureEnabled,
    handleSaveDeviceName,
    handleCheckForUpdates,
    handleStartUpdate,
    handleRemoveDevice,
    confirmRemoveDevice,
    handleGuidePress,
    handleAddToControlGroup,
  };
};
