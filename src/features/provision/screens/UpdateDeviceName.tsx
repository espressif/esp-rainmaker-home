/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef } from "react";
import { View, ScrollView, Pressable, Text, BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";

import { UpdateDeviceNameSection } from "@features/provision/components/UpdateDeviceName";
import {
  updateDeviceNameContinueButtonStyle,
  updateDeviceNameScreenWrapperStyle,
  updateDeviceNameStyles,
} from "@features/provision/theme";
import { useUpdateDeviceName } from "@features/provision/hooks/useUpdateDeviceName";
import { Header, ScreenWrapper, Button, ConfirmationDialog } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import { globalStyles } from "@shared/theme/globalStyleSheet";

/**
 * First post-provision step: set device name(s), then continue to room selection.
 * Uses {@link UpdateDeviceNameSection} for the editable name list (one or more devices).
 */
const UpdateDeviceNameScreen = () => {
  const { t } = useTranslation();
  const styles = updateDeviceNameStyles;
  const {
    getDeviceName,
    setDeviceName,
    maxNameLength,
    isLoading,
    provisionedNode,
    deviceList,
    handleContinue,
    handleSkip,
    dismissToHome,
  } = useUpdateDeviceName();

  const [isExitSetupDialogOpen, setIsExitSetupDialogOpen] = useState(false);
  const isExitSetupDialogOpenRef = useRef(false);
  isExitSetupDialogOpenRef.current = isExitSetupDialogOpen;

  const handleOpenExitSetupDialog = useCallback(
    () => setIsExitSetupDialogOpen(true),
    []
  );
  const handleDismissExitSetupDialog = useCallback(
    () => setIsExitSetupDialogOpen(false),
    []
  );
  const handleConfirmExitToHome = useCallback(() => {
    setIsExitSetupDialogOpen(false);
    dismissToHome();
  }, [dismissToHome]);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        if (isExitSetupDialogOpenRef.current) {
          setIsExitSetupDialogOpen(false);
          return true;
        }
        setIsExitSetupDialogOpen(true);
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, [])
  );

  return (
    <>
      <Header
        label={t("device.deviceDetails.updateNameTitle")}
        showBack
        onBackPress={handleOpenExitSetupDialog}
        rightSlot={
          provisionedNode ? (
            <Pressable
              {...testProps("button_skip_update_device_name")}
              onPress={handleSkip}
              disabled={isLoading}
              style={globalStyles.agentSettingsEditButtonContainer}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text
                style={[
                  globalStyles.agentSettingsEditButton,
                  isLoading && { opacity: 0.4 },
                ]}
              >
                {t("device.deviceDetails.skip")}
              </Text>
            </Pressable>
          ) : null
        }
        qaId="header_update_device_name"
      />
      <ScreenWrapper
        style={updateDeviceNameScreenWrapperStyle}
        qaId="screen_wrapper_update_device_name"
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View
            {...testProps("view_update_device_name")}
            style={[styles.content]}
          >
            <UpdateDeviceNameSection
              styles={styles}
              devices={deviceList}
              provisionedNodeId={provisionedNode?.id}
              getDeviceName={getDeviceName}
              setDeviceName={setDeviceName}
              maxNameLength={maxNameLength}
            />
          </View>
        </ScrollView>

        <View
          style={styles.footer}
          {...testProps("footer_update_device_name_actions")}
        >
          <Button
            label={t("device.deviceDetails.continue")}
            onPress={handleContinue}
            isLoading={isLoading}
            style={updateDeviceNameContinueButtonStyle}
            qaId="button_continue_device_name"
          />
        </View>
      </ScreenWrapper>

      <ConfirmationDialog
        open={isExitSetupDialogOpen}
        title={t("device.deviceDetails.exitSetupToHomeTitle")}
        description={t("device.deviceDetails.exitSetupToHomeMessage")}
        confirmText={t("device.deviceDetails.goToHome")}
        cancelText={t("device.deviceDetails.cancel")}
        onConfirm={handleConfirmExitToHome}
        onCancel={handleDismissExitSetupDialog}
        qaId="update_device_name_exit_to_home"
      />
    </>
  );
};

export default UpdateDeviceNameScreen;
