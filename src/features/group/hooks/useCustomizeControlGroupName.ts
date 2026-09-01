/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";

export interface UseCustomizeControlGroupNameOptions {
  currentGroupName: string | string[] | undefined;
  id: string | string[] | undefined;
  groupId: string | string[] | undefined;
  preselectedNodeId?: string | string[];
  dismissTo?: string | string[];
  settingsDevice?: string | string[];
  router: {
    dismissTo: (opts: {
      pathname: string;
      params: Record<string, unknown>;
    }) => void;
    back: () => void;
  };
}

export interface UseCustomizeControlGroupNameResult {
  groupName: string;
  canConfirm: boolean;
  handleConfirm: () => void;
  handleGroupNameChange: (value: string) => void;
}

/**
 * Manages customize control group name state and related actions.
 */
export function useCustomizeControlGroupName(
  options: UseCustomizeControlGroupNameOptions
): UseCustomizeControlGroupNameResult {
  const { currentGroupName, id, groupId, preselectedNodeId, dismissTo, settingsDevice, router } = options;

  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    if (currentGroupName === undefined || currentGroupName === "") return;
    const s = Array.isArray(currentGroupName)
      ? currentGroupName[0]
      : currentGroupName;
    setGroupName(s);
  }, [currentGroupName]);

  const handleConfirm = useCallback(() => {
    const finalName = groupName.trim();
    const idStr = Array.isArray(id) ? id[0] : id;
    const groupIdStr = Array.isArray(groupId) ? groupId[0] : groupId;
    const pre =
      typeof preselectedNodeId === "string"
        ? preselectedNodeId
        : preselectedNodeId?.[0];
    const dismissToParam =
      typeof dismissTo === "string" ? dismissTo : dismissTo?.[0];
    const settingsDeviceParam =
      typeof settingsDevice === "string"
        ? settingsDevice
        : settingsDevice?.[0];
    if (finalName) {
      router.dismissTo({
        pathname: "/(group)/CreateControlGroup",
        params: {
          roomName: finalName,
          id: idStr,
          groupId: groupIdStr ?? "",
          ...(pre?.trim() ? { preselectedNodeId: pre.trim() } : {}),
          ...(dismissToParam ? { dismissTo: dismissToParam } : {}),
          ...(settingsDeviceParam ? { settingsDevice: settingsDeviceParam } : {}),
        },
      });
    } else {
      router.back();
    }
  }, [groupName, router, id, groupId, preselectedNodeId, dismissTo, settingsDevice]);

  const handleGroupNameChange = useCallback((value: string) => {
    setGroupName(value);
  }, []);

  const canConfirm = Boolean(groupName.trim());

  return {
    groupName,
    canConfirm,
    handleConfirm,
    handleGroupNameChange,
  };
}
