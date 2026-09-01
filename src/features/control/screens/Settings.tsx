/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Trash2, ChevronRight } from "lucide-react-native";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import {
  Header,
  ScreenWrapper,
  ActionButton,
  ConfirmationDialog,
  ContentWrapper,
} from "@shared/components";
import {
  DeviceName,
  DeviceInfo,
  DeviceRoomAssignment,
  DeviceControlGroupAssignment,
  OTA,
  DeviceOperations,
  SettingsQuickActions,
} from "@features/control/components";
import { useSettings } from "@features/control/hooks";
import { SETTINGS_SECTION_NAME } from "@features/control/constants";
import { testProps } from "@shared/utils/testProps";

/**
 * Device settings screen — presentation layer.
 * Business logic and state live in {@link useSettings}.
 */
const Settings = observer(() => {
  const { t } = useTranslation();
  const {
    node,
    device,
    displayName,
    isConnected,
    isPrimary,
    settingsDisabled,
    deviceName,
    handleDeviceNameChange,
    setIsEditingName,
    isSavingName,
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
    handleCheckForUpdates,
    handleStartUpdate,
    handleRemoveDevice,
    confirmRemoveDevice,
    handleGuidePress,
  } = useSettings();

  if (!node) {
    return (
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
        <ScrollView
          {...testProps("scroll_settings")}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Device Name Section */}
          {validSection.includes(SETTINGS_SECTION_NAME) && (
            <DeviceName
              initialDeviceName={displayName}
              deviceName={deviceName}
              setDeviceName={handleDeviceNameChange}
              setIsEditingName={setIsEditingName}
              onSave={handleSaveDeviceName}
              isSaving={isSavingName}
              isConnected={isConnected}
              disabled={settingsDisabled}
            />
          )}

          <DeviceInfo
            node={node}
            nodeConfig={node.nodeConfig}
            device={device}
            otaInfo={otaInfo}
            disabled={settingsDisabled}
          />

          <DeviceRoomAssignment node={node} disabled={!isPrimary} />

          <DeviceControlGroupAssignment node={node} />

          <SettingsQuickActions actions={settingsQuickActions} />

          {readmeUrl && (
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
                  <View style={globalStyles.settingsItemLeft}>
                    <Text
                      style={{
                        flex: 1,
                        fontWeight: 500,
                        fontFamily: tokens.fonts.medium,
                      }}
                    >
                      {t("device.settings.guide")}
                    </Text>
                  </View>
                  <View style={[globalStyles.flex, globalStyles.alignCenter]}>
                    <ChevronRight size={20} color={tokens.colors.primary} />
                  </View>
                </Pressable>
              </View>
            </ContentWrapper>
          )}

          <DeviceOperations node={node} disabled={settingsDisabled} />

          {otaFeatureEnabled && (
            <OTA
              otaInfo={otaInfo}
              onCheckUpdates={handleCheckForUpdates}
              onStartUpdate={handleStartUpdate}
              isChecking={isCheckingUpdate}
            />
          )}

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
