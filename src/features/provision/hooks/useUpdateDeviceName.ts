/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { getDeviceDisplayName } from "@shared/utils/deviceDisplayName";
import {
  DEVICE_NAME_PROBLEM_MESSAGE_KEYS,
  findDeviceNameProblem,
  getDeviceNameMaxLength,
  saveDeviceName,
} from "@shared/utils/deviceNaming";
import type { ESPCDFDevice, ESPCDFNode } from "@store";

export interface UseUpdateDeviceNameReturn {
  /** Display names being edited, keyed by `device.name` (each sub-device on the node). */
  deviceNamesByKey: Record<string, string>;
  setDeviceName: (deviceNameKey: string, name: string) => void;
  getDeviceName: (deviceNameKey: string) => string;
  /** Devices on the provisioned node (for rendering one row per device). */
  deviceList: ESPCDFDevice[];
  isLoading: boolean;
  provisionedNode: ESPCDFNode | null;
  /** Longest name the device can keep, or undefined for no limit. */
  maxNameLength: number | undefined;
  handleContinue: () => Promise<void>;
  /** Skip name edits and go to room selection. */
  handleSkip: () => void;
  /** Leave provision setup and return to home (e.g. after back confirmation). */
  dismissToHome: () => void;
}

/** Post-provision step: set device display name, then go to room selection. */
export const useUpdateDeviceName = (): UseUpdateDeviceNameReturn => {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();
  const { store } = useCDF();
  const { nodeId } = useLocalSearchParams<{ nodeId: string }>();

  const [deviceNamesByKey, setDeviceNamesByKey] = useState<Record<string, string>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const lastSyncedNodeIdRef = useRef<string | null>(null);

  const provisionedNode = useMemo(() => {
    if (!nodeId) return null;
    return (
      store?.nodeStore?.nodesList?.find((n) => n.id === nodeId) ?? null
    );
  }, [nodeId, store?.nodeStore?.nodesList]);

  const deviceList = useMemo(
    () => provisionedNode?.devices ?? [],
    [provisionedNode?.devices]
  );

  useEffect(() => {
    if (!provisionedNode) {
      lastSyncedNodeIdRef.current = null;
      setDeviceNamesByKey({});
      return;
    }
    const nodeId = provisionedNode.id;
    const devices = provisionedNode.devices ?? [];
    const deviceKeys = new Set(devices.map((d) => d.name));

    if (lastSyncedNodeIdRef.current !== nodeId) {
      lastSyncedNodeIdRef.current = nodeId;
      const next: Record<string, string> = {};
      for (const d of devices) {
        next[d.name] = getDeviceDisplayName(d, provisionedNode);
      }
      setDeviceNamesByKey(next);
      return;
    }

    setDeviceNamesByKey((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const d of devices) {
        if (!(d.name in next)) {
          next[d.name] = getDeviceDisplayName(d, provisionedNode);
        }
      }
      for (const k of Object.keys(next)) {
        if (!deviceKeys.has(k)) {
          delete next[k];
        }
      }
      return next;
    });
  }, [provisionedNode]);

  const getDeviceName = useCallback(
    (deviceNameKey: string) => deviceNamesByKey[deviceNameKey] ?? "",
    [deviceNamesByKey]
  );

  const setDeviceName = useCallback((deviceNameKey: string, name: string) => {
    setDeviceNamesByKey((prev) => ({ ...prev, [deviceNameKey]: name }));
  }, []);

  const handleContinue = useCallback(async () => {
    if (!provisionedNode) return;

    const devices = provisionedNode.devices ?? [];
    for (const device of devices) {
      const trimmed = (deviceNamesByKey[device.name] ?? "").trim();
      if (!trimmed) {
        toast.showError(t("device.deviceDetails.nameRequired"));
        return;
      }
    }

    const renames = devices
      .map((device) => ({
        device,
        trimmed: (deviceNamesByKey[device.name] ?? "").trim(),
      }))
      .filter(
        ({ device, trimmed }) =>
          trimmed !== getDeviceDisplayName(device, provisionedNode).trim()
      );

    // Checked for every device before any write, so no name is half saved.
    const maxLength = getDeviceNameMaxLength(provisionedNode);
    const problem = renames
      .map(({ trimmed }) => findDeviceNameProblem(trimmed, maxLength))
      .find((found) => found !== undefined);
    if (problem) {
      toast.showError(t(DEVICE_NAME_PROBLEM_MESSAGE_KEYS[problem]));
      return;
    }

    setIsLoading(true);
    try {
      for (const { device, trimmed } of renames) {
        // Same save as Device Settings, so a Matter device gets the name too.
        const result = await saveDeviceName(provisionedNode, device, trimmed);
        if (result === "failed" || result === "invalid") {
          // Name stays editable from device settings; don't block the room step.
          console.warn(
            `[UpdateDeviceName] Could not set name for device ${device.name}`,
          );
        }
      }

      router.push({
        pathname: "/(provision)/SelectDeviceRoom" as const,
        params: { nodeId: provisionedNode.id },
      } as any);
    } catch (e) {
      console.error("[UpdateDeviceName] handleContinue error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [
    deviceNamesByKey,
    provisionedNode,
    router,
    t,
    toast,
  ]);

  const handleSkip = useCallback(() => {
    if (!provisionedNode || isLoading) return;
    router.push({
      pathname: "/(provision)/SelectDeviceRoom" as const,
      params: { nodeId: provisionedNode.id },
    } as any);
  }, [isLoading, provisionedNode, router]);

  const dismissToHome = useCallback(() => {
    router.dismissTo("/(group)/Home" as any);
  }, [router]);

  return {
    deviceNamesByKey,
    setDeviceName,
    getDeviceName,
    deviceList,
    isLoading,
    provisionedNode,
    maxNameLength: getDeviceNameMaxLength(provisionedNode ?? undefined),
    handleContinue,
    handleSkip,
    dismissToHome,
  };
};
