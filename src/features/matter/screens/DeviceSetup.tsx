/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Text,
  BackHandler,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";

import { UpdateDeviceNameSection } from "@features/provision/components/UpdateDeviceName";
import {
  updateDeviceNameContinueButtonStyle,
  updateDeviceNameScreenWrapperStyle,
  updateDeviceNameStyles,
} from "@features/provision/theme";
import { useMatterDeviceSetup } from "@features/matter/hooks/useMatterDeviceSetup";
import {
  Header,
  ScreenWrapper,
  Button,
  ConfirmationDialog,
  IdentifyDeviceButton,
} from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import { globalStyles } from "@shared/theme/globalStyleSheet";

/**
 * Post-commissioning Matter device setup: name the device (parity with the
 * iOS Apple-sheet naming step, which Android's Play Services flow lacks),
 * optionally identify the physical device (Identify cluster / hybrid
 * passthrough param), then continue to room selection.
 *
 * Mirrors the provisioning `UpdateDeviceName` screen so both add-device flows
 * feel the same; reuses its name section and the shared room picker.
 */
export const MatterDeviceSetupScreen = () => {
  const { t } = useTranslation();
  const styles = updateDeviceNameStyles;
  const {
    getDeviceName,
    setDeviceName,
    maxNameLength,
    isLoading,
    commissionedNode,
    deviceList,
    identifiableDevices,
    handleContinue,
    handleSkip,
    dismissToHome,
  } = useMatterDeviceSetup();

  const [isExitSetupDialogOpen, setIsExitSetupDialogOpen] = useState(false);
  const isExitSetupDialogOpenRef = useRef(false);
  isExitSetupDialogOpenRef.current = isExitSetupDialogOpen;

  const handleOpenExitSetupDialog = useCallback(
    () => setIsExitSetupDialogOpen(true),
    [],
  );
  const handleDismissExitSetupDialog = useCallback(
    () => setIsExitSetupDialogOpen(false),
    [],
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
      const sub = BackHandler.addEventListener(
        "hardwareBackPress",
        onHardwareBack,
      );
      return () => sub.remove();
    }, []),
  );

  return (
    <>
      <Header
        label={t("device.deviceDetails.updateNameTitle")}
        showBack
        onBackPress={handleOpenExitSetupDialog}
        rightSlot={
          <Pressable
            {...testProps("button_skip_matter_device_setup")}
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
        }
        qaId="header_matter_device_setup"
      />
      <ScreenWrapper
        style={updateDeviceNameScreenWrapperStyle}
        qaId="screen_wrapper_matter_device_setup"
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View
            {...testProps("view_matter_device_setup")}
            style={[styles.content]}
          >
            <UpdateDeviceNameSection
              styles={styles}
              devices={deviceList}
              provisionedNodeId={commissionedNode?.id}
              getDeviceName={getDeviceName}
              setDeviceName={setDeviceName}
              maxNameLength={maxNameLength}
              renderRowAction={(device) =>
                identifiableDevices.has(device.name) ? (
                  <IdentifyDeviceButton
                    device={device}
                    style={styles.nameRowAction}
                    qaId="button_identify_matter_device"
                  />
                ) : null
              }
            />
          </View>
        </ScrollView>

        <View
          style={styles.footer}
          {...testProps("footer_matter_device_setup_actions")}
        >
          <Button
            label={t("device.deviceDetails.continue")}
            onPress={handleContinue}
            isLoading={isLoading}
            style={updateDeviceNameContinueButtonStyle}
            qaId="button_continue_matter_device_setup"
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
        qaId="matter_device_setup_exit_to_home"
      />
    </>
  );
};

export default MatterDeviceSetupScreen;
