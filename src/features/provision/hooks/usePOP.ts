/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { ESPCDFProvisioningDevice } from "@store";
import { parseRMakerCapabilities } from "@features/provision/utils/rmakerCapabilities";

interface UsePOPReturn {
  popCode: string;
  isLoading: boolean;
  setPopCode: (code: string) => void;
  handleVerify: () => Promise<void>;
}

/**
 * Custom hook for POP screen business logic
 */
export const usePOP = (): UsePOPReturn => {
  const { t } = useTranslation();
  const { store } = useCDF();
  const params = useLocalSearchParams<{
    hasClaimCap?: string;
    hasCameraClaim?: string;
  }>();
  const toast = useToast();

  const device: ESPCDFProvisioningDevice = store?.nodeStore?.connectedDevice as ESPCDFProvisioningDevice;
  const softAPDeviceInfo = store.nodeStore.softAPDeviceInfo;
  const onNetworkDeviceInfo = store.nodeStore.onNetworkDeviceInfo;
  const hasClaimCap = params.hasClaimCap === "true";
  const hasCameraClaim = params.hasCameraClaim === "true";

  const [popCode, setPopCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Navigate to the next screen based on claiming capability
   */
  const navigateToNextScreen = (deviceName: string, pop: string) => {
    if (hasClaimCap) {
      router.push({
        pathname: "/(provision)/Claiming",
        params: {
          isCameraDevice: hasCameraClaim ? "true" : "false",
        },
      });
    } else {
      router.push({
        pathname: "/(provision)/Wifi",
        params: { popCode: pop, deviceName },
      });
    }
  };

  /**
   * Handles the verification of the POP code
   */
  const handleVerify = async () => {
    setIsLoading(true);

    try {
      // Dispatch off the device model rather than route params — same
      // pattern useProvision uses for chal-resp vs. MQTT.
      const isOnNetwork =
        (await device?.checkOnNetworkProvisioning()) ?? false;

      // On-network flow: device is already on Wi-Fi; we just stash the POP
      // for the next screen. Cloud verifies the signed challenge — no live
      // device session here.
      if (isOnNetwork) {
        if (!onNetworkDeviceInfo) {
          toast.showError(t("device.errors.deviceNotConnected"));
          return;
        }
        store.nodeStore.onNetworkDevicePop = popCode;
        router.push("/(provision)/Provision");
      } else if (softAPDeviceInfo) {
        // iOS SoftAP flow - Create provisioning device for SoftAP with the provided POP code
        const user = store?.userStore.user;
        const cdfDevice = await user?.createProvisioningDevice(
          softAPDeviceInfo.deviceName,
          softAPDeviceInfo.transport, // "softap"
          2, // security type (SECURITY_2)
          popCode
        );

        if (cdfDevice && cdfDevice.name) {
          // Connect and initialize the device
          const connected = await cdfDevice.connect();
          if (connected) {
            // Store the connected device
            store.nodeStore.connectedDevice = cdfDevice;
            // Clear SoftAP device info
            store.nodeStore.softAPDeviceInfo = null;

            // Fetch version info and prov capabilities
            const versionInfo = await cdfDevice.getDeviceVersionInfo();
            const provCapabilities = await cdfDevice.getDeviceCapabilities();

            // Parse RMaker capabilities from version info
            const rmakerCaps = parseRMakerCapabilities(
              versionInfo,
              provCapabilities
            );

            // Navigate based on claiming capability
            if (rmakerCaps.hasClaim) {
              router.push({
                pathname: "/(provision)/Claiming",
                params: {
                  isCameraDevice: hasCameraClaim ? "true" : "false",
                },
              });
            } else {
              router.push({
                pathname: "/(provision)/Wifi",
                params: { popCode, deviceName: cdfDevice.name },
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
    } catch {
      toast.showError(t("device.errors.failedToVerifyCode"));
    } finally {
      setIsLoading(false);
    }
  };

  return {
    popCode,
    isLoading,
    setPopCode,
    handleVerify,
  };
};
