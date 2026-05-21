/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";
import { ESPCDFDevice, ESPCDFNode } from "@store";
import { extractDeviceType, findDeviceConfig } from "@shared/utils/device";

interface UseControlReturn {
  node: ESPCDFNode | undefined;
  device: ESPCDFDevice | undefined;
  displayName: string;
  deviceType: string;
  deviceConfig: any;
  handleMorePress: () => void;
}

/**
 * Custom hook for Control screen business logic
 */
export const useControl = (): UseControlReturn => {
  const { store } = useCDF();
  const router = useRouter();
  const { t } = useTranslation();
  const { id, device: _device } = useLocalSearchParams<{
    id?: string;
    device?: string;
  }>();

  const nodeList = store?.nodeStore?.nodesList || [];
  const node = nodeList.find((n) => n.id === id);
  const device = node?.devices?.find((d) => d.name === _device) as
    | ESPCDFDevice
    | undefined;

  const deviceWasFoundRef = useRef(false);
  if (device) {
    deviceWasFoundRef.current = true;
  }

  useEffect(() => {
    if (_device && deviceWasFoundRef.current && !device) {
      router.back();
    }
  }, [_device, device, router]);

  const handleMorePress = () => {
    router.push(`/(control)/Settings?id=${id}&device=${_device}`);
  };

  const deviceType = device ? extractDeviceType(device.type) : "";
  const deviceConfig = deviceType ? findDeviceConfig(deviceType) : null;
  const displayName = device?.displayName || t("device.control.title");

  return {
    node,
    device,
    displayName,
    deviceType,
    deviceConfig,
    handleMorePress,
  };
};
