/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { reaction } from "mobx";

import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { getDeviceNameMaxLength } from "@shared/utils/deviceNaming";
import { identifiableDeviceKey } from "@shared/utils/deviceIdentify";
import { findProvisionedNodeById } from "@features/provision/utils/selectDeviceRoomHelpers";
import {
  initialSetupName,
  planSetupNames,
  saveSetupNames,
  sheetDeviceName,
} from "@features/matter/utils/matterSetupNames";
import type { ESPCDFDevice, ESPCDFNode } from "@store";

export interface UseMatterDeviceSetupReturn {
  /** Display names being edited, keyed by `device.name` (each sub-device on the node). */
  deviceNamesByKey: Record<string, string>;
  setDeviceName: (deviceNameKey: string, name: string) => void;
  getDeviceName: (deviceNameKey: string) => string;
  /** Devices on the commissioned node (for rendering one row per device). */
  deviceList: ESPCDFDevice[];
  isLoading: boolean;
  commissionedNode: ESPCDFNode | null;
  /** Names of the devices an identify request can reach right now. */
  identifiableDevices: Set<string>;
  /** Longest name the device can keep, or undefined for no limit. */
  maxNameLength: number | undefined;
  /** Persist name edits, then continue to room selection. */
  handleContinue: () => Promise<void>;
  /** Skip name edits and go to room selection. */
  handleSkip: () => void;
  /** Leave setup and return to home (e.g. after back confirmation). */
  dismissToHome: () => void;
}

/**
 * Post-commissioning step for Matter devices: set the device name, optionally
 * identify the physical device, then continue to room selection.
 *
 * Android only: Google's sheet never returns a typed name, while on iOS
 * Apple's sheet asks for it and the add skips this screen (see
 * `MATTER_NAME_STEP_SHOWN`). Names persist through {@link saveDeviceName}'s channel policy — Matter
 * `NodeLabel`, `esp.param.name`, or node metadata — so pure Matter and
 * rmneo+matter hybrids are both covered without the screen knowing which.
 */
export const useMatterDeviceSetup = (): UseMatterDeviceSetupReturn => {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();
  const { store } = useCDF();
  const { nodeId, deviceName: commissionedDeviceName } = useLocalSearchParams<{
    nodeId: string;
    /** Name from the commissioning event (iOS: Apple-sheet name) used as prefill fallback. */
    deviceName?: string;
  }>();

  const [deviceNamesByKey, setDeviceNamesByKey] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const lastSyncedNodeIdRef = useRef<string | null>(null);

  const commissionedNode = useMemo(
    () => findProvisionedNodeById(store?.nodeStore?.nodesList, nodeId),
    [nodeId, store?.nodeStore?.nodesList],
  );

  const deviceList = useMemo(
    () => commissionedNode?.devices ?? [],
    [commissionedNode?.devices],
  );

  // A hybrid's identify param is in the node config from the start, but a
  // pure Matter node becomes identifiable only when local discovery attaches
  // the `matter_local` transport — often seconds after this screen mounts.
  // That attach mutates the node in place without re-rendering this screen
  // (it is not a MobX observer), so hold the answer in state and let a
  // reaction below flip it the moment discovery lands.
  const [identifiableKey, setIdentifiableKey] = useState<string>(() =>
    identifiableDeviceKey(commissionedNode ?? undefined),
  );

  useEffect(() => {
    if (!nodeId) {
      setIdentifiableKey("");
      return undefined;
    }
    const dispose = reaction(
      () => {
        // `registerTransport` replaces this observable map on every discovery
        // add/remove; reading the node's entry is what re-runs the expression
        // (the same tracking source useDeviceConnected relies on). The
        // nodesList read additionally covers the node itself arriving late.
        void store?.subscriptionStore?.registeredTransports?.[nodeId];
        const node = findProvisionedNodeById(store?.nodeStore?.nodesList, nodeId);
        return identifiableDeviceKey(node ?? undefined);
      },
      (key) => setIdentifiableKey(key),
      { fireImmediately: true },
    );
    return dispose;
  }, [nodeId, store]);

  const identifiableDevices = useMemo(
    () => new Set(identifiableKey ? identifiableKey.split("\n") : []),
    [identifiableKey],
  );

  // A sheet name leads when there is one; the app placeholder never prefills.
  const sheetName = sheetDeviceName(commissionedDeviceName);
  const initialNameForDevice = useCallback(
    (device: ESPCDFDevice, node: ESPCDFNode): string =>
      initialSetupName(device, node, sheetName),
    [sheetName],
  );

  useEffect(() => {
    if (!commissionedNode) {
      lastSyncedNodeIdRef.current = null;
      setDeviceNamesByKey({});
      return;
    }
    const syncedNodeId = commissionedNode.id;
    const devices = commissionedNode.devices ?? [];
    const deviceKeys = new Set(devices.map((d) => d.name));

    if (lastSyncedNodeIdRef.current !== syncedNodeId) {
      lastSyncedNodeIdRef.current = syncedNodeId;
      const next: Record<string, string> = {};
      for (const d of devices) {
        next[d.name] = initialNameForDevice(d, commissionedNode);
      }
      setDeviceNamesByKey(next);
      return;
    }

    setDeviceNamesByKey((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const d of devices) {
        if (!(d.name in next)) {
          next[d.name] = initialNameForDevice(d, commissionedNode);
        }
      }
      for (const k of Object.keys(next)) {
        if (!deviceKeys.has(k)) {
          delete next[k];
        }
      }
      return next;
    });
  }, [commissionedNode, initialNameForDevice]);

  const getDeviceName = useCallback(
    (deviceNameKey: string) => deviceNamesByKey[deviceNameKey] ?? "",
    [deviceNamesByKey],
  );

  const setDeviceName = useCallback((deviceNameKey: string, name: string) => {
    setDeviceNamesByKey((prev) => ({ ...prev, [deviceNameKey]: name }));
  }, []);

  const dismissToHome = useCallback(() => {
    router.dismissTo("/(group)/Home" as any);
  }, [router]);

  const goToRoomSelection = useCallback(() => {
    if (!commissionedNode) {
      // Store sync raced the navigation and the node is not visible yet;
      // room assignment needs it, so land on Home rather than a dead picker.
      dismissToHome();
      return;
    }
    router.push({
      pathname: "/(provision)/SelectDeviceRoom" as const,
      params: { nodeId: commissionedNode.id },
    } as any);
  }, [commissionedNode, dismissToHome, router]);

  const handleContinue = useCallback(async () => {
    if (!commissionedNode) {
      dismissToHome();
      return;
    }

    const plan = planSetupNames(commissionedNode, deviceNamesByKey);
    if (plan.problemKey !== undefined) {
      toast.showError(t(plan.problemKey));
      return;
    }

    setIsLoading(true);
    try {
      // Name stays editable from device settings; don't block the room step.
      if (!(await saveSetupNames(commissionedNode, plan.renames))) {
        toast.showError(t("device.matter.setup.nameSaveFailed"));
      }

      goToRoomSelection();
    } catch (e) {
      console.error("[MatterDeviceSetup] handleContinue error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [
    commissionedNode,
    deviceNamesByKey,
    dismissToHome,
    goToRoomSelection,
    t,
    toast,
  ]);

  const handleSkip = useCallback(() => {
    if (isLoading) return;
    goToRoomSelection();
  }, [goToRoomSelection, isLoading]);

  return {
    deviceNamesByKey,
    setDeviceName,
    getDeviceName,
    deviceList,
    isLoading,
    commissionedNode,
    identifiableDevices,
    maxNameLength: getDeviceNameMaxLength(commissionedNode ?? undefined),
    handleContinue,
    handleSkip,
    dismissToHome,
  };
};
