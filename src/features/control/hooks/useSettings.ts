/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useNavigation,
  usePreventRemove,
  type NavigationAction,
} from "@react-navigation/native";
import { router, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { getFeatures } from "@config/features.config";
import { useCDF } from "@shared/hooks/useCDF";
import { hasActiveControlPath } from "@shared/utils/device";
import {
  canRenameWithoutNameParam,
  DEVICE_NAME_PROBLEM_MESSAGE_KEYS,
  findDeviceNameProblem,
  getDeviceNameMaxLength,
} from "@shared/utils/deviceNaming";
import {
  getDeviceDisplayName,
  getDeviceNameParam,
} from "@shared/utils/deviceDisplayName";
import {
  canIdentifyDevice,
  identifyDevice,
} from "@shared/utils/deviceIdentify";
import { useIdentifyAction } from "@shared/hooks/useIdentifyAction";
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
  getNodeReadmeUrl,
  isNodeDeleteSuccess,
  isSettingsDisabled,
  resolveRmakerAuthUpdateToastKind,
  resolveSettingsDevice,
  resolveSettingsNode,
  saveDeviceDisplayName,
  shouldShowUpdateAuthToken,
  shouldShowUpdateDeviceList,
} from "@features/control/utils/settingsHelpers";
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
  settingsQuickActions: SettingsQuickActionItem[];
  otaFeatureEnabled: boolean;
  handleSaveDeviceName: () => Promise<boolean>;
  /** Whether the "save the edited name before leaving?" question is showing. */
  isLeaveDialogOpen: boolean;
  /** Leave question, Save: saves like Done, then leaves only if it saved. */
  saveNameAndLeave: () => Promise<void>;
  /** Leave question, Discard: leaves without saving the edited name. */
  discardNameAndLeave: () => void;
  /** Leave question dismissed: stays on the screen with the edit kept. */
  stayOnSettings: () => void;
  handleCheckForUpdates: () => Promise<void>;
  handleStartUpdate: () => Promise<void>;
  handleRemoveDevice: () => void;
  confirmRemoveDevice: () => Promise<void>;
  handleGuidePress: () => void;
  /** Character cap for the name field, or undefined when the channel imposes none. */
  maxNameLength: number | undefined;
  /** Whether asking this device to show itself would reach it. */
  showIdentify: boolean;
  /** Whether the device is visibly identifying itself. */
  isIdentifying: boolean;
  /** Asks the device to identify itself. */
  identify: () => Promise<void>;
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

  // Looked up during render: a refreshed node replaces the old one under the
  // same map, so a memo on the map would keep showing the old node.
  const node = resolveSettingsNode(nodesByIDMap, id);
  const device = resolveSettingsDevice(node, deviceParam);

  const deviceWasFoundRef = useRef(false);
  if (device) {
    deviceWasFoundRef.current = true;
  }

  useEffect(() => {
    if (deviceParam && deviceWasFoundRef.current && !device) {
      routerNav.back();
    }
  }, [deviceParam, device, routerNav]);

  // Read during render (Settings is an observer) so a rename shows at once.
  const displayName = device && node ? getDeviceDisplayName(device, node) : "";

  // Cloud connectivity alone is not enough: some nodes are LAN-only and report
  // `isConnected: false` forever, so ask for any live control path instead.
  const registeredTransports = node
    ? store?.subscriptionStore?.registeredTransports?.[node.id]
    : undefined;
  const isConnected = hasActiveControlPath(node, registeredTransports);
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

  // Some nodes have no cloud name param but can still be renamed over their own channel.
  const canRename =
    Boolean(getDeviceNameParam(device)) || canRenameWithoutNameParam(node);

  useEffect(() => {
    if (canRename) {
      if (!isEditingName) {
        setDeviceName(displayName);
      }
    } else {
      setValidSection((prev) =>
        prev.filter((section) => section !== SETTINGS_SECTION_NAME),
      );
    }
  }, [canRename, displayName, isEditingName]);

  // Undefined when no channel caps the name. Read during render: the cap can
  // appear when the device is found on the local network.
  const maxNameLength = getDeviceNameMaxLength(node);

  /**
   * Updates the draft device name and locks out store-driven overwrites while editing.
   * @param name - Latest text from the name field
   */
  const handleDeviceNameChange = useCallback((name: string) => {
    setIsEditingName(true);
    setDeviceName(name);
  }, []);

  // Only an edit the user made counts: the draft is empty until it is first
  // filled in, and a device with no name field has nothing to lose.
  const isDeviceNameDirty =
    !settingsDisabled &&
    Boolean(device) &&
    canRename &&
    isEditingName &&
    deviceName.trim() !== displayName.trim();

  const readmeUrl = useMemo(() => getNodeReadmeUrl(node), [node]);

  const matterControllerConfig = useMemo(
    () => getMatterControllerConfig(node),
    [node],
  );

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
   * Persists an edited device name over whichever channel the node supports.
   * Skips the network call when the draft matches the current display name.
   * @returns True when leave navigation may proceed (saved or unchanged)
   */
  const handleSaveDeviceName = useCallback(async (): Promise<boolean> => {
    if (settingsDisabled || isSavingName) {
      return false;
    }

    if (!node) {
      return false;
    }

    const trimmed = deviceName.trim();
    if (trimmed && trimmed === displayName.trim()) {
      setIsEditingName(false);
      return true;
    }

    // Nothing is written for a name that breaks a rule, on any channel.
    const problem = findDeviceNameProblem(
      trimmed,
      getDeviceNameMaxLength(node),
    );
    if (problem) {
      toast.showError(t(DEVICE_NAME_PROBLEM_MESSAGE_KEYS[problem]));
      return false;
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

  /** The leave the user started while the edited name was unsaved. */
  const [blockedLeave, setBlockedLeave] = useState<NavigationAction | null>(
    null,
  );
  /** A leave the user allowed; set one render before it runs, see below. */
  const [allowedLeave, setAllowedLeave] = useState<NavigationAction | null>(
    null,
  );

  // Ask before an unsaved name edit is lost (header back, hardware back,
  // swipe). Leaving never saves by itself: only Done, or Save in the question.
  usePreventRemove(
    isDeviceNameDirty && !isSavingName && !isRemovingDevice && !allowedLeave,
    ({ data }) => {
      setBlockedLeave(data.action);
    },
  );

  // Runs after the guard above is released, so the leave is not stopped again.
  useEffect(() => {
    if (allowedLeave) {
      navigation.dispatch(allowedLeave);
    }
  }, [allowedLeave, navigation]);

  const saveNameAndLeave = useCallback(async () => {
    const leave = blockedLeave;
    // Close first: an error toast would be hidden under the dialog.
    setBlockedLeave(null);
    if (leave && (await handleSaveDeviceName())) {
      setAllowedLeave(leave);
    }
  }, [blockedLeave, handleSaveDeviceName]);

  const discardNameAndLeave = useCallback(() => {
    const leave = blockedLeave;
    setBlockedLeave(null);
    if (leave) {
      setAllowedLeave(leave);
    }
  }, [blockedLeave]);

  const stayOnSettings = useCallback(() => setBlockedLeave(null), []);

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

  /** Whether asking this device to show itself would reach it. */
  const showIdentify = useMemo(() => canIdentifyDevice(device), [device]);

  const performIdentify = useCallback(() => identifyDevice(device), [device]);

  const { isIdentifying, identify } = useIdentifyAction(performIdentify);

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
    settingsQuickActions,
    otaFeatureEnabled,
    handleSaveDeviceName,
    isLeaveDialogOpen: blockedLeave !== null,
    saveNameAndLeave,
    discardNameAndLeave,
    stayOnSettings,
    handleCheckForUpdates,
    handleStartUpdate,
    handleRemoveDevice,
    confirmRemoveDevice,
    handleGuidePress,
    maxNameLength,
    showIdentify,
    isIdentifying,
    identify,
  };
};
