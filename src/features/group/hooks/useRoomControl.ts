/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import { broadcastGroupParam } from "@features/group/utils/controlGroupHelpers";
import { ESPRM_POWER_PARAM_TYPE, ERROR_CODES } from "@shared/utils/constants";
import { LOADER_VISIBLE_DURATION_MS, POWER_ACTION_ON, POWER_ACTION_OFF } from "@features/group/utils/constants";
import type { RoomPowerEntry, RoomControlSwitchProps } from "@src/types/global";

export interface UseRoomControlResult {
  devicesWithPower: RoomPowerEntry[];
  canToggle: boolean;
  allOn: boolean;
  allOff: boolean;
  activeAction: typeof POWER_ACTION_ON | typeof POWER_ACTION_OFF | null;
  handlePower: (value: boolean) => void;
}

/**
 * Encapsulates room-level power control logic.
 *
 * Derives power-capable devices, computed toggle states, and a broadcast handler.
 */
export function useRoomControl(
  filteredDevices: RoomControlSwitchProps["filteredDevices"],
  roomGroup: RoomControlSwitchProps["roomGroup"]
): UseRoomControlResult {
  const { t } = useTranslation();
  const toast = useToast();
  const [activeAction, setActiveAction] = useState<typeof POWER_ACTION_ON | typeof POWER_ACTION_OFF | null>(null);

  const devicesWithPower = useMemo(() => {
    const entries: RoomPowerEntry[] = [];
    for (const item of filteredDevices) {
      const node = item.node.deref();
      if (!node) continue;
      const powerParam = item.params?.find(
        (p) => p.type === ESPRM_POWER_PARAM_TYPE
      );
      if (powerParam) {
        entries.push({ node, device: item, powerParam });
      }
    }
    return entries;
  }, [filteredDevices]);

  const canToggle = useMemo(
    () =>
      devicesWithPower.length > 0 &&
      devicesWithPower.some(
        (e) => e.node.connectivityStatus?.isConnected ?? false
      ),
    [devicesWithPower]
  );

  const allOn = useMemo(
    () =>
      devicesWithPower.length > 0 &&
      devicesWithPower.every((e) => Boolean(e.powerParam.value)),
    [devicesWithPower]
  );

  const allOff = useMemo(
    () =>
      devicesWithPower.length > 0 &&
      devicesWithPower.every((e) => !Boolean(e.powerParam.value)),
    [devicesWithPower]
  );

  const handlePower = useCallback(
    (value: boolean): void => {
      const onlineEntries = devicesWithPower.filter(
        (e) => e.node.connectivityStatus?.isConnected ?? false
      );
      if (onlineEntries.length === 0) return;

      const action = value ? POWER_ACTION_ON : POWER_ACTION_OFF;
      setActiveAction(action);

      const broadcastTargets = onlineEntries.map((e) => ({
        device: e.device,
        param: e.powerParam,
      }));
      broadcastGroupParam(roomGroup, broadcastTargets, value, {
        onSetParamsError: (err: unknown) => {
          const code = (err as { code?: string })?.code;
          const key =
            code && ERROR_CODES[code as keyof typeof ERROR_CODES];
          toast.showError(key ? t(key) : t("group.errors.fallback"));
        },
      });

      setTimeout(() => setActiveAction(null), LOADER_VISIBLE_DURATION_MS);
    },
    [devicesWithPower, roomGroup, toast, t]
  );

  return { devicesWithPower, canToggle, allOn, allOff, activeAction, handlePower };
}
