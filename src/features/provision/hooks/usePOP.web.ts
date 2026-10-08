/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { ESPCDFProvisioningDevice } from "@store";
import { parseRMakerCapabilities } from "@features/provision/utils/rmakerCapabilities";
import { WEB_BLE_LOG_PREFIX } from "@shared/utils/constants";
import { logWebDebug } from "@shared/utils/webDebugLog";

interface UsePOPReturn {
  popCode: string;
  isLoading: boolean;
  setPopCode: (code: string) => void;
  handleVerify: () => Promise<void>;
}

/**
 * Web POP hook — re-reads device capabilities after `initializeSession()`
 * before routing. Under Web Bluetooth the pre-POP capability advertisement
 * is not reliably available until a GATT session is up, so route flags set
 * at scan time can be missing. The native variant keeps using those flags.
 */
export const usePOP = (): UsePOPReturn => {
  const { t } = useTranslation();
  const { store } = useCDF();
  const toast = useToast();

  const device: ESPCDFProvisioningDevice = store?.nodeStore?.connectedDevice as ESPCDFProvisioningDevice;
  const softAPDeviceInfo = store.nodeStore.softAPDeviceInfo;
  const onNetworkDeviceInfo = store.nodeStore.onNetworkDeviceInfo;

  const [popCode, setPopCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Navigates to Claiming or Wi-Fi based on fresh device capabilities (post-session).
   * @param deviceName - Connected device name
   * @param pop - Verified proof-of-possession
   * @param rmakerCaps - Parsed RainMaker capabilities from proto-ver + GATT
   */
  const navigateAfterPopVerification = (
    deviceName: string,
    pop: string,
    rmakerCaps: ReturnType<typeof parseRMakerCapabilities>,
  ) => {
    if (rmakerCaps.hasClaim) {
      logWebDebug(WEB_BLE_LOG_PREFIX, "pair:navigate", { screen: "Claiming" });
      router.push({
        pathname: "/(provision)/Claiming",
        params: {
          isCameraDevice: rmakerCaps.hasCameraClaim ? "true" : "false",
        },
      });
      return;
    }

    router.push({
      pathname: "/(provision)/Wifi",
      params: { popCode: pop, deviceName },
    });
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
                  isCameraDevice: rmakerCaps.hasCameraClaim ? "true" : "false",
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
        await device.setProofOfPossession(popCode);
        await device.initializeSession();

        const versionInfo = await device.getDeviceVersionInfo();
        const provCapabilities = await device.getDeviceCapabilities();
        const rmakerCaps = parseRMakerCapabilities(
          versionInfo,
          provCapabilities,
        );

        logWebDebug(WEB_BLE_LOG_PREFIX, "pop:parsed-caps", {
          deviceName: device.name,
          rmakerCaps,
          versionInfo,
          provCapabilities,
        });

        navigateAfterPopVerification(device.name, popCode, rmakerCaps);
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
