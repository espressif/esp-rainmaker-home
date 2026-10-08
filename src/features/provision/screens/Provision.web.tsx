/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, StyleSheet, Image, ScrollView } from "react-native";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useTranslation } from "react-i18next";
import { useProvision } from "@features/provision/hooks";
import { mapStageStatusToProvisionStatus } from "@features/provision/utils/provisionHelper";
import {
  Header,
  ScreenWrapper,
  Button,
  ConfirmationDialog,
} from "@shared/components";
import {
  ProvisioningStep,
  WifiResetRetryDialog,
} from "@features/provision/components";
import { flattenStyle } from "@shared/utils/flattenStyle";
import { testProps } from "@shared/utils/testProps";

/**
 * Web provision screen with flattened styles for DOM-backed renderers.
 * Keeps exit and Wi-Fi-reset dialogs from the shared `useProvision` hook.
 * @returns Full-screen flow with header, scrollable step list, and continue when complete.
 */
const Provision = () => {
  const { t } = useTranslation();
  const {
    stages,
    isComplete,
    stepsScrollViewRef,
    handleContinue,
    isExitSetupDialogOpen,
    handleConfirmExitSetup,
    handleCancelExitSetup,
    isWifiResetPromptOpen,
    wifiResetErrorMessage,
    handleConfirmWifiReset,
    handleDismissWifiResetPrompt,
    isWifiResetPasswordPromptOpen,
    retrySsid,
    handleRetryWithPassword,
    handleCancelWifiResetPassword,
    isRetrying,
  } = useProvision();

  return (
    <>
      <Header
        label={t("device.provision.title")}
        showBack
        qaId="header_provision"
      />
      <ScreenWrapper
        style={flattenStyle({
          ...globalStyles.screenWrapper,
          backgroundColor: tokens.colors.bg5,
        })}
        qaId="screen_wrapper_provision"
      >
        <View
          {...testProps("view_provision")}
          style={flattenStyle([
            globalStyles.flex1,
            globalStyles.itemCenter,
            styles.content,
          ])}
        >
          <View
            {...testProps("view_image_container_provision")}
            style={flattenStyle([globalStyles.itemCenter, styles.imageContainer])}
          >
            <Image
              {...testProps("image_provision")}
              source={require("@assets/images/network.png")}
              style={styles.networkImage}
              resizeMode="contain"
            />
          </View>

          <ScrollView
            ref={stepsScrollViewRef}
            style={flattenStyle([globalStyles.fullWidth, styles.stepsScrollView])}
            contentContainerStyle={styles.stepsContainer}
            {...testProps("scroll_provision")}
            showsVerticalScrollIndicator={false}
          >
            {stages.map((stage, index) => {
              const isActiveSettingUpStep =
                index === stages.length - 1 &&
                stage.status === "pending" &&
                stages
                  .slice(0, index)
                  .every((prior) => prior.status === "success");

              return (
                <ProvisioningStep
                  key={stage.id}
                  description={stage.title}
                  detail={
                    isActiveSettingUpStep ? stage.description : undefined
                  }
                  status={mapStageStatusToProvisionStatus(stage.status)}
                  error={stage.error}
                />
              );
            })}
          </ScrollView>

          <Button
            label={t("layout.shared.continue")}
            onPress={handleContinue}
            style={flattenStyle({
              ...globalStyles.btn,
              ...globalStyles.bgBlue,
              ...globalStyles.shadowElevationForLightTheme,
            })}
            disabled={!isComplete}
            qaId="button_continue_provision"
          />
        </View>
      </ScreenWrapper>

      <ConfirmationDialog
        open={isExitSetupDialogOpen}
        title={t("device.provision.exitSetupTitle")}
        description={t("device.provision.exitSetupMessage")}
        confirmText={t("device.provision.exitSetupConfirm")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={handleConfirmExitSetup}
        onCancel={handleCancelExitSetup}
        qaId="provision_exit_setup"
      />

      <ConfirmationDialog
        open={isWifiResetPromptOpen}
        title={t("device.provision.wifiResetTitle")}
        description={[
          wifiResetErrorMessage,
          t("device.provision.wifiResetMessage"),
        ]
          .filter(Boolean)
          .join(" ")}
        confirmText={t("device.provision.wifiResetRetryConfirm")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={handleConfirmWifiReset}
        onCancel={handleDismissWifiResetPrompt}
        qaId="provision_wifi_reset"
      />

      <WifiResetRetryDialog
        open={isWifiResetPasswordPromptOpen}
        ssid={retrySsid}
        isRetrying={isRetrying}
        onRetry={handleRetryWithPassword}
        onCancel={handleCancelWifiResetPassword}
      />
    </>
  );
};

const styles = StyleSheet.create({
  content: {
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
    padding: tokens.spacing._20,
  },
  imageContainer: {
    width: "100%",
    height: 160,
    marginBottom: tokens.spacing._20,
  },
  networkImage: {
    width: 160,
    height: 160,
  },
  stepsScrollView: {
    maxHeight: 300,
  },
  stepsContainer: {
    gap: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
  },
});

export default Provision;
