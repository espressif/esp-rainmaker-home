/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useMemo } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useCDF } from "@shared/hooks/useCDF";
import { ESPCDFDevice, ESPCDFNode } from "@store";
import { ESPRM_NAME_PARAM_TYPE } from "@shared/utils/constants";
import { getSubDeviceInitialDisplayName } from "@shared/utils/device";

interface UseSettingsReturn {
  node: ESPCDFNode | undefined;
  device: ESPCDFDevice | undefined;
  displayName: string;
  isConnected: boolean;
  isPrimary: boolean;
}

/**
 * Resolves Settings screen node/device state from route params and the live node store.
 * Mirrors {@link useControl} so param and display-name updates stay in sync with the store.
 *
 * @returns Node, device, derived display name, and connectivity / role flags
 */
export const useSettings = (): UseSettingsReturn => {
  const { store } = useCDF();
  const router = useRouter();
  const { id, device: _device } = useLocalSearchParams<{
    id?: string;
    device?: string;
  }>();

  const nodesByIDMap = store?.nodeStore?.nodesByIDMap;

  const node = useMemo(
    () => (id ? nodesByIDMap?.[id] : undefined),
    [id, nodesByIDMap],
  );

  const device = useMemo(() => {
    if (!_device || !node?.devices) return undefined;
    return node.devices.find((d) => d.name === _device) as
      | ESPCDFDevice
      | undefined;
  }, [node, _device, node?.devices]);

  const deviceWasFoundRef = useRef(false);
  if (device) {
    deviceWasFoundRef.current = true;
  }

  useEffect(() => {
    if (_device && deviceWasFoundRef.current && !device) {
      router.back();
    }
  }, [_device, device, router]);

  const nameParamValue = device?.params?.find(
    (param) => param.type === ESPRM_NAME_PARAM_TYPE,
  )?.value as string | undefined;

  const displayName = useMemo(() => {
    if (!device || !node) return "";
    return getSubDeviceInitialDisplayName(device, node);
  }, [
    device,
    node,
    nameParamValue,
    device?.displayName,
    device?.name,
    node?.nodeConfig?.info?.name,
  ]);

  const isConnected = node?.connectivityStatus?.isConnected ?? false;
  const isPrimary = node?.isPrimaryUser ?? false;

  return {
    node,
    device,
    displayName,
    isConnected,
    isPrimary,
  };
};
