/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";
import { useDeviceConnected } from "@shared/hooks/useDeviceConnected";
import { useToast } from "@shared/hooks/useToast";
import { ESPCDFDevice, ESPCDFNode } from "@store";
import { extractErrorMessage } from "@shared/utils/common";
import {
  extractDeviceType,
  findDeviceConfig,
  getSubDeviceInitialDisplayName,
  type DeviceConfig,
} from "@shared/utils/device";

interface UseControlReturn {
  node: ESPCDFNode | undefined;
  device: ESPCDFDevice | undefined;
  displayName: string;
  deviceType: string;
  deviceConfig: DeviceConfig | null | undefined;
  isConnected: boolean;
  refreshing: boolean;
  handleRefresh: () => Promise<void>;
  handleMorePress: () => void;
}

/**
 * Resolves Control screen state from route params and the live node-store entry.
 * Reads `nodesByIDMap` so param, metadata, and connectivity updates on the
 * target node stay in sync with the store (used inside an `observer` screen).
 * Owns pull-to-refresh (`device.getParams`) so Control can use one scroll
 * surface like Home / ControlGroupPanel.
 * @returns Node, device, derived display metadata, refresh, and settings navigation
 */
export const useControl = (): UseControlReturn => {
  const { store } = useCDF();
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const { id, device: _device } = useLocalSearchParams<{
    id?: string;
    device?: string;
  }>();
  const [refreshing, setRefreshing] = useState(false);

  const nodesByIDMap = store?.nodeStore?.nodesByIDMap;

  // Derive during render (Control is an `observer`): useMemo on node/device
  // object identity would stale when MobX mutates nested fields in place.
  const node = id ? nodesByIDMap?.[id] : undefined;

  const device =
    _device && node?.devices
      ? (node.devices.find((d) => d.name === _device) as
          | ESPCDFDevice
          | undefined)
      : undefined;

  const isConnected = useDeviceConnected(node);

  const deviceWasFoundRef = useRef(false);
  if (device) {
    deviceWasFoundRef.current = true;
  }

  useEffect(() => {
    if (_device && deviceWasFoundRef.current && !device) {
      router.back();
    }
  }, [_device, device, router]);

  const handleMorePress = useCallback(() => {
    router.push(`/(control)/Settings?id=${id}&device=${_device}`);
  }, [router, id, _device]);

  /**
   * Pull-to-refresh: fetch latest params for the active device (same idea as
   * Light / Switch panels and ControlGroupPanel member refresh).
   * Allowed while offline so the user can retry reachability / param sync.
   */
  const handleRefresh = useCallback(async () => {
    if (refreshing || !device) return;
    setRefreshing(true);
    try {
      const params = await device.getParams();
      if (params) {
        device.params = params;
      }
    } catch (error) {
      console.error("Error refreshing device params:", error);
      toast.showError(
        t("layout.shared.errorHeader"),
        extractErrorMessage(error) ||
          t("device.errors.failedToRefreshDeviceState"),
      );
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, device, toast, t]);

  const deviceType = device ? extractDeviceType(device.type) : "";
  const deviceConfig = deviceType ? findDeviceConfig(deviceType) : null;

  const displayName =
    device && node
      ? getSubDeviceInitialDisplayName(device, node) || t("device.control.title")
      : t("device.control.title");

  return {
    node,
    device,
    displayName,
    deviceType,
    deviceConfig,
    isConnected,
    refreshing,
    handleRefresh,
    handleMorePress,
  };
};
