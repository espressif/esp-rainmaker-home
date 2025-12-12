/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Trash2, ChevronRight } from "lucide-react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import { ESPRMDevice, ESPRMNode } from "@espressif/rainmaker-base-sdk";
import { ESPRMServiceParam } from "@espressif/rainmaker-base-cdf/dist/types";

// Hooks
import { useLocalSearchParams, router, useRouter } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";

import { observer } from "mobx-react-lite";

// Components
import {
  Header,
  ScreenWrapper,
  ActionButton,
  ConfirmationDialog,
  // device settings components
  DeviceName,
  DeviceInfo,
  OTA,
  ContentWrapper,
} from "@/components";
import DeviceOperations from "@/components/DeviceSettings/DeviceOperations";

// validations
import { validateEmail as _validateEmail } from "@/utils/validations";

// Constants
import {
  SUCESS,
  ESPRM_SYSTEM_SERVICE,
  ESPRM_FACTORY_RESET_PARAM_TYPE,
  ESPRM_NAME_PARAM_TYPE,
  MATTER_METADATA_KEY,
  MATTER_METADATA_DEVICE_NAME_KEY,
} from "@/utils/constants";

// Types
import { OTAInfo } from "@/types/global";
import { testProps } from "@/utils/testProps";

/**
 * Settings Component
 *
 * Main device settings screen component.
 * Manages device configuration, updates, sharing, and removal.
 *
 * Features:
 * - Device name management
 * - Device information display
 * - OTA updates
 * - User sharing
 * - Device removal
 * - Error handling
 *
 * Route Params:
 * @param {string} [id] - Device ID to manage
 */
const Settings = observer(() => {
  // Hooks
  const { store } = useCDF();
  const { t } = useTranslation();
  const toast = useToast();
  const routerNav = useRouter();

  const { id, device: _device } = useLocalSearchParams<{
    id?: string;
    device?: string;
  }>();

  // State
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
  const [showRemoveDeviceDialog, setShowRemoveDeviceDialog] = useState(false);
  const [validSection, setValidSection] = useState<string[]>([
    "name",
    "info",
    "ota",
    "sharing",
    "remove",
  ]);

  // Get device info
  const node = store?.nodeStore?.nodeList?.find((node) => node.id === id) as
    | ESPRMNode
    | undefined;
  const device = node?.nodeConfig?.devices.find((d) => d.name === _device) as
    | ESPRMDevice
    | undefined;
  const isConnected = node?.connectivityStatus?.isConnected || false;
  const isPrimary = node?.isPrimaryUser || false;

  /**
   * Get device name from Matter metadata or fallback to device display name
   */
  const getDeviceNameFromMetadata = () => {
    if (!node) return "";

    // Check if node metadata contains Matter key
    const metadata = node.metadata;
    if (metadata && metadata[MATTER_METADATA_KEY]) {
      const deviceName =
        metadata[MATTER_METADATA_KEY][MATTER_METADATA_DEVICE_NAME_KEY];
      if (deviceName) {
        return deviceName;
      }
    }
    // Fallback to device display name
    return device?.displayName || "";
  };

  /**
   * Effect: Initialize valid sections
   * Determines which sections should be shown based on device capabilities
   */
  useEffect(() => {
    const nameParam = device?.params?.find(
      (param) => param.type === ESPRM_NAME_PARAM_TYPE
    );
    if (nameParam) {
      // Use Matter metadata device name if available, otherwise use device display name
      const matterDeviceName = getDeviceNameFromMetadata();
      setDeviceName(matterDeviceName || device?.displayName || "");
    } else {
      setValidSection((prev) => prev.filter((section) => section !== "name"));
    }
  }, [device, node]);

  /**
   * Saves device name changes
   * Validates input and updates device configuration
   * For Matter devices, updates metadata; for non-Matter devices, uses param.setValue
   */
  const handleSaveDeviceName = async () => {
    if (!deviceName.trim()) {
      toast.showError(t("device.validation.deviceNameCannotBeEmpty"));
      return;
    }
    setIsSavingName(true);

    try {
      // Check if this is a Matter device by checking metadata
      const isMatterDevice =
        node?.metadata && node.metadata[MATTER_METADATA_KEY];

      if (isMatterDevice && node) {
        // For Matter devices, update metadata
        const currentMetadata = node.metadata || {};
        const matterMetadata = currentMetadata[MATTER_METADATA_KEY] || {};

        const updatedMatterMetadata = {
          ...matterMetadata,
          [MATTER_METADATA_DEVICE_NAME_KEY]: deviceName,
        };

        // Update the full metadata structure
        const updatedMetadata = {
          ...currentMetadata,
          [MATTER_METADATA_KEY]: updatedMatterMetadata,
        };

        // Call updateMetadata API
        await node.updateMetadata(updatedMetadata);

        if (device) {
          device.displayName = deviceName;
        }
        node.metadata = updatedMetadata;

        toast.showSuccess(t("device.settings.deviceNameUpdatedSuccessfully"));
      } else {
        const nameParam = device?.params?.find(
          (param) => param.type === "esp.param.name"
        );

        if (nameParam) {
          await (nameParam as any).setValue(deviceName);
          if (device) {
            device.displayName = deviceName;
          }
          toast.showSuccess(t("device.settings.deviceNameUpdatedSuccessfully"));
        } else {
          toast.showError(t("device.errors.failedToUpdateDeviceName"));
        }
      }
    } catch (error) {
      toast.showError(t("device.errors.failedToUpdateDeviceName"));
    } finally {
      setIsSavingName(false);
    }
  };

  /**
   * Checks for available OTA updates
   * Updates state with new version information
   */
  const handleCheckForUpdates = async () => {
    if (!node) return;

    setIsCheckingUpdate(true);
    try {
      const hasUpdate = await (node as any).checkOTAUpdate();
      if (hasUpdate?.otaAvailable) {
        setOtaInfo((prev) => ({
          ...prev,
          newVersion: hasUpdate.fwVersion,
          isUpdateAvailable: true,
          ...hasUpdate,
        }));
      } else {
        toast.showWarning(t("device.settings.noOTAUpdateAvailable"));
        setOtaInfo((prev) => ({ ...prev, isUpdateAvailable: false }));
      }
    } catch (error) {
      toast.showError(t("device.errors.checkOTAUpdateError"));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  /**
   * Initiates OTA update process
   * Handles update state and user feedback
   */
  const handleStartUpdate = async () => {
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
    } catch (error) {
      toast.showError(t("device.errors.otaUpdateStartError"));
      setOtaInfo((prev) => ({ ...prev, isUpdating: false }));
    }
  };

  /**
   * Removes device from account
   * Shows confirmation dialog and handles factory reset
   */
  const handleRemoveDevice = () => {
    setShowRemoveDeviceDialog(true);
  };

  const confirmRemoveDevice = async () => {
    setIsRemovingDevice(true);
    try {
      const factoryReset = node?.nodeConfig?.services?.find(
        (service) => service.type === ESPRM_SYSTEM_SERVICE
      );

      const factoryResetParam: ESPRMServiceParam | undefined =
        factoryReset?.params?.find(
          (param) => param.type === ESPRM_FACTORY_RESET_PARAM_TYPE
        );

      if (factoryReset && factoryResetParam) {
        await node?.setMultipleParams({
          [factoryReset.name]: [
            {
              [factoryResetParam.name]: true,
            },
          ],
        });
      }

      const result = await node?.delete();
      if (result?.status === SUCESS) {
        router.dismiss(2);
      }
    } catch (error) {
      console.error(error);
      toast.showError(t("device.errors.failedToRemoveDevice"));
    } finally {
      setIsRemovingDevice(false);
    }
  };

  /**
   * Opens the Guide page with the readme URL from node info
   */
  const handleGuidePress = () => {
    const readmeUrl = (node?.nodeConfig?.info as any)?.readme;
    if (!readmeUrl) return;

    const headerName = node?.nodeConfig?.info?.name || "Device";
    const deviceDisplayName = device?.displayName || headerName;

    routerNav.push({
      pathname: "/(device)/Guide" as any,
      params: {
        url: readmeUrl,
        title: headerName,
        deviceName: deviceDisplayName,
      },
    });
  };

  // Get readme URL from node config info
  const readmeUrl = useMemo(
    () => (node?.nodeConfig?.info as any)?.readme || null,
    [node]
  );

  /**
   * Renders error state when device is not found
   */
  const renderError = () => (
    <>
      <Header
        label={t("device.settings.title")}
        showBack={true}
        qaId="header_settings"
      />
      <ScreenWrapper
        style={globalStyles.container}
        excludeTop={true}
        qaId="screen_wrapper_settings"
      >
        <View
          {...testProps("view_settings")}
          style={globalStyles.errorContainer}
        >
          <Text
            {...testProps("text_error_settings")}
            style={globalStyles.errorText}
          >
            {t("device.settings.deviceNotFound")}
          </Text>
        </View>
      </ScreenWrapper>
    </>
  );

  /**
   * Renders the guide section
   */
  const renderGuideSection = () => (
    <>
      <ContentWrapper
        style={{
          marginBottom: tokens.spacing._15,
          ...globalStyles.shadowElevationForLightTheme,
          backgroundColor: tokens.colors.white,
        }}
      >
        <View
          style={[globalStyles.settingsSection, { gap: tokens.spacing._10 }]}
        >
          <Pressable
            style={globalStyles.settingsItem}
            onPress={handleGuidePress}
          >
            {/* Left Section */}
            <View style={globalStyles.settingsItemLeft}>
              <Text
                style={[
                  {
                    flex: 1,
                    fontWeight: 500,
                    fontFamily: tokens.fonts.medium,
                  },
                ]}
              >
                {t("device.settings.guide") || "Guide"}
              </Text>
            </View>

            {/* Right Section */}
            <View style={[globalStyles.flex, globalStyles.alignCenter]}>
              <ChevronRight size={20} color={tokens.colors.primary} />
            </View>
          </Pressable>
        </View>
      </ContentWrapper>
    </>
  );

  if (!node) {
    return renderError();
  }

  return (
    <>
      <Header
        label={t("device.settings.title")}
        showBack={true}
        qaId="header_settings"
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
        excludeTop={true}
        qaId="screen_wrapper_settings"
      >
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Device Name Section */}
          {validSection.includes("name") && (
            <DeviceName
              initialDeviceName={
                getDeviceNameFromMetadata() || device?.displayName || ""
              }
              deviceName={deviceName}
              setDeviceName={setDeviceName}
              isEditingName={isEditingName}
              setIsEditingName={setIsEditingName}
              onSave={handleSaveDeviceName}
              isSaving={isSavingName}
              isConnected={isConnected}
              disabled={!isPrimary || !isConnected}
            />
          )}
          <DeviceInfo
            node={node}
            nodeConfig={node?.nodeConfig}
            device={device}
            otaInfo={otaInfo}
            disabled={!isPrimary || !isConnected}
          />

          {/* Guide Section - Show only if readme URL exists */}
          {readmeUrl && renderGuideSection()}
          <DeviceOperations
            node={node}
            disabled={!isPrimary || !isConnected}
          />

          <OTA
            otaInfo={otaInfo}
            onCheckUpdates={handleCheckForUpdates}
            onStartUpdate={handleStartUpdate}
            isChecking={isCheckingUpdate}
          />

          {isPrimary && (
            <ActionButton
              onPress={handleRemoveDevice}
              variant="danger"
              disabled={isRemovingDevice}
              style={{
                ...globalStyles.shadowElevationForLightTheme,
              }}
              qaId="button_settings"
            >
              <Trash2 size={16} color={tokens.colors.white} />
              <Text
                {...testProps("text_remove_device_settings")}
                style={[globalStyles.buttonTextDanger, { marginLeft: 8 }]}
              >
                {isRemovingDevice ? (
                  <ActivityIndicator size="small" color={tokens.colors.white} />
                ) : (
                  t("device.settings.removeDevice")
                )}
              </Text>
            </ActionButton>
          )}
        </ScrollView>
      </ScreenWrapper>

      <ConfirmationDialog
        open={showRemoveDeviceDialog}
        title={t("device.settings.removeDevice")}
        description={t("device.settings.removeDeviceConfirm")}
        confirmText={t("layout.shared.remove")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={confirmRemoveDevice}
        onCancel={() => setShowRemoveDeviceDialog(false)}
        confirmColor={tokens.colors.red}
        isLoading={isRemovingDevice}
        qaId="remove_device"
      />
    </>
  );
});

export default Settings;
