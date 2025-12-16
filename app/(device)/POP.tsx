/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

// SDK
import { ESPDevice } from "@espressif/rainmaker-base-sdk";

// styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// hooks
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";

// components
import { ScreenWrapper, Header, Input, Button } from "@/components";

// adapters
import { provisionAdapter } from "@/adaptors/implementations/ESPProvAdapter";

import POPCODE_Image from "@/assets/images/popcode.png";
import { testProps } from "@/utils/testProps";
import { parseRMakerCapabilities } from "@/utils/rmakerCapabilities";

/**
 * POPScreen component for device Proof of Possession code input.
 *
 * This component displays a screen for entering the POP code that comes with the device.
 * The POP code is typically printed on the device or included in the device packaging.
 */
const POPScreen = () => {
  const { t } = useTranslation();
  const { store } = useCDF();
  const params = useLocalSearchParams<{
    hasClaimCap?: string;
  }>();
  const device: ESPDevice = store.nodeStore.connectedDevice;
  const softAPDeviceInfo = store.nodeStore.softAPDeviceInfo;
  const toast = useToast();
  const [popCode, setPopCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Parse claiming capability params
  const hasClaimCap = params.hasClaimCap === "true";

  /**
   * Navigate to the next screen based on claiming capability
   */
  const navigateToNextScreen = (deviceName: string, pop: string) => {
    // If device supports claiming, go to Claiming screen first
    if (hasClaimCap) {
      router.push({
        pathname: "/(device)/Claiming",
      });
    } else {
      // Otherwise go directly to WiFi
      router.push({
        pathname: "/(device)/Wifi",
        params: { popCode: pop, deviceName },
      });
    }
  };

  /**
   * Handles the verification of the POP code.
   * This function will verify the entered POP code and proceed with device provisioning.
   */
  const handleVerify = async () => {
    setIsLoading(true);

    try {
      // Check if this is a SoftAP device (coming from SoftAP flow)
      if (softAPDeviceInfo) {
        // iOS SoftAP flow - Create ESP device for SoftAP with the provided POP code
        const deviceInterface = await provisionAdapter.createESPDevice(
          softAPDeviceInfo.deviceName,
          softAPDeviceInfo.transport, // "softap"
          2, // security type (SECURITY_2)
          popCode
        );

        if (deviceInterface && deviceInterface.name) {
          // Create proper ESPDevice instance from interface
          const espDevice = new ESPDevice(deviceInterface);
          // Connect and initialize the device
          const connectResponse = await espDevice.connect();
          if (connectResponse === 0) {
            // Store the connected device
            store.nodeStore.connectedDevice = espDevice;
            // Clear SoftAP device info
            store.nodeStore.softAPDeviceInfo = null;

            // Fetch version info and prov capabilities
            const versionInfo = await espDevice.getDeviceVersionInfo();
            const provCapabilities = await espDevice.getDeviceCapabilities();

            // Parse RMaker capabilities from version info (parsing done in app)
            const rmakerCaps = parseRMakerCapabilities(
              versionInfo,
              provCapabilities
            );

            // Navigate based on claiming capability
            if (rmakerCaps.hasClaim) {
              router.push({
                pathname: "/(device)/Claiming",
              });
            } else {
              router.push({
                pathname: "/(device)/Wifi",
                params: { popCode, deviceName: espDevice.name },
              });
            }
          }
        }
      } else if (device) {
        // Common flow for BLE devices and Android SoftAP
        await device.setProofOfPossession(popCode);
        await device.initializeSession();

        // Navigate to the next screen based on claiming capability
        navigateToNextScreen(device.name, popCode);
      } else {
        toast.showError(t("device.errors.deviceNotConnected"));
      }
    } catch (e) {
      toast.showError(t("device.errors.failedToVerifyCode"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Header showBack label={t("device.pop.title")} qaId="header_pop" />
      <ScreenWrapper
        style={{
          ...globalStyles.screenWrapper,
          backgroundColor: tokens.colors.bg5,
        }} qaId="screen_wrapper_pop"
      >
        <ScrollView {...testProps("scroll_pop")} contentContainerStyle={globalStyles.scrollViewContent}>
          <View {...testProps("view_image_pop")} style={styles.imageContainer}>
            <Image
              {...testProps("image_pop")}
              source={POPCODE_Image}
              style={styles.popcodeImage}
              resizeMode="contain"
            />
          </View>

          <Text {...testProps("text_title_pop")} style={[globalStyles.heading, globalStyles.verificationTitle]}>
            {t("device.pop.enterCode")}
          </Text>
          <Text
            {...testProps("text_subtitle_pop")}
            style={[globalStyles.subHeading, globalStyles.verificationSubtitle]}
          >
            {t("device.pop.description")}
          </Text>

          <View {...testProps("view_verification_pop")} style={globalStyles.verificationContainer}>
            {/* POP Code Input */}
            <Input
              initialValue={popCode}
              onFieldChange={(value) => setPopCode(value)}
              style={[
                globalStyles.verificationInput,
                globalStyles.shadowElevationForLightTheme,
              ]}
              placeholder={t("device.pop.placeholder")}
              maxLength={8}
              qaId="pop_code"
            />
          </View>

          {/* Verify Button */}
          <Button
            label={t("device.pop.verify")}
            onPress={handleVerify}
            style={{
              ...globalStyles.btn,
              ...globalStyles.bgBlue,
              ...globalStyles.shadowElevationForLightTheme,
            }}
            disabled={isLoading}
            isLoading={isLoading}
            qaId="button_verify_pop"
          />
        </ScrollView>
      </ScreenWrapper>
    </>
  );
};

export default POPScreen;

const styles = StyleSheet.create({
  button: {
    height: 48,
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginTop: tokens.spacing._20,
    width: "100%",
  },
  buttonDisabled: {
    borderColor: tokens.colors.bg2,
    opacity: 0.5,
  },
  imageContainer: {
    width: "100%",
    height: 160,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: tokens.spacing._20,
  },
  popcodeImage: {
    width: 160,
    height: 160,
  },
});
