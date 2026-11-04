/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import {
  filterAIAssistantDevices,
  saveAgentConfigToCache,
  getAgentNameFromCache,
  getAgentConfig,
} from "@features/agent/utils";
import { getAgentTermsAccepted } from "@features/agent/utils/storage";

/**
 * useConfigure hook
 * @returns Configure flow state and handler functions
 */
export function useConfigure() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { store } = useCDF();
  const toast = useToast();

  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [updatingDevices, setUpdatingDevices] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [isLoadingAgentName, setIsLoadingAgentName] = useState(false);
  const [agentNameError, setAgentNameError] = useState<boolean>(false);
  const [showTermsBottomSheet, setShowTermsBottomSheet] = useState(false);

  const aiDevices = useMemo(
    () => filterAIAssistantDevices(store?.nodeStore?.nodesList),
    [store?.nodeStore?.nodesList]
  );

  useEffect(() => {
    const user = store?.userStore.user;
    if (user) {
      const termsAccepted = getAgentTermsAccepted(user);
      if (!termsAccepted) {
        setShowTermsBottomSheet(true);
      }
    }
  }, [store]);

  useEffect(() => {
    const fetchAgentName = async () => {
      if (!id) {
        setAgentName(null);
        setIsLoadingAgentName(false);
        setAgentNameError(false);
        return;
      }

      setIsLoadingAgentName(true);
      setAgentNameError(false);

      try {
        const cachedName = await getAgentNameFromCache(id);
        if (cachedName) {
          setAgentName(cachedName);
          setIsLoadingAgentName(false);
          return;
        }

        const agentConfig = await getAgentConfig(id);
        if (agentConfig?.name) {
          setAgentName(agentConfig.name);
          await saveAgentConfigToCache(id, agentConfig);
          setAgentNameError(false);
        } else {
          setAgentName(null);
          setAgentNameError(true);
        }
      } catch (error) {
        console.error("Failed to fetch agent name:", error);
        setAgentName(null);
        setAgentNameError(true);
      } finally {
        setIsLoadingAgentName(false);
      }
    };

    fetchAgentName();
  }, [id]);

  const handleDeviceToggle = useCallback((deviceKey: string) => {
    setSelectedDevices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(deviceKey)) {
        newSet.delete(deviceKey);
      } else {
        newSet.add(deviceKey);
      }
      return newSet;
    });
  }, []);

  const handleUpdateAgentId = useCallback(async () => {
    if (!id || selectedDevices.size === 0) {
      toast.showError(t("agent.configure.noDevicesSelected"));
      return;
    }

    setIsUpdating(true);
    const deviceKeysToUpdate = Array.from(selectedDevices);
    setUpdatingDevices(new Set(deviceKeysToUpdate));

    const updatePromises: Promise<void>[] = [];

    deviceKeysToUpdate.forEach((deviceKey) => {
      const [nodeId, deviceName] = deviceKey.split("-");
      const deviceData = aiDevices.find(
        (d) => d.node.id === nodeId && d.device.name === deviceName
      );

      if (deviceData?.agentIdParam) {
        updatePromises.push(
          (async () => {
            await deviceData.agentIdParam!.setValue(id);
          })()
        );
      }
    });

    try {
      const results = await Promise.allSettled(updatePromises);
      const successfulUpdates = results.filter(
        (r) => r.status === "fulfilled"
      ).length;
      const totalDevices = updatePromises.length;

      if (successfulUpdates > 0) {
        toast.showSuccess(
          t("agent.configure.updateSuccess"),
          successfulUpdates === totalDevices
            ? t("agent.configure.devicesUpdatedCount", {
              count: successfulUpdates,
            })
            : t("agent.configure.devicesUpdatedPartial", {
              successful: successfulUpdates,
              total: totalDevices,
            })
        );
      } else {
        toast.showError(t("agent.configure.updateError"));
      }

      if (id) {
        try {
          const agentConfig = await getAgentConfig(id);
          await saveAgentConfigToCache(id, agentConfig);
        } catch (error) {
          console.error("[configure] Failed to cache agent config:", error);
        }
      }

      setTimeout(() => {
        router.replace("/(group)/Home");
      }, 1500);
    } catch (error) {
      console.error("Failed to update agent IDs:", error);
      toast.showError(t("agent.configure.updateError"));
    } finally {
      setIsUpdating(false);
      setUpdatingDevices(new Set());
      setSelectedDevices(new Set());
    }
  }, [id, selectedDevices, aiDevices, toast, t, router]);

  const getDeviceKey = useCallback((nodeId: string, deviceName: string) => {
    return `${nodeId}-${deviceName}`;
  }, []);

  const handleChatPress = useCallback(() => {
    if (id) {
      const params = new URLSearchParams({ agentId: id });
      if (agentName) {
        params.append("agentName", agentName);
      }
      router.push(`/(agent)/Settings?${params.toString()}`);
    }
  }, [id, agentName, router]);

  const closeTermsBottomSheet = useCallback(() => {
    setShowTermsBottomSheet(false);
    router.replace("/(group)/Home");
  }, [router]);

  const completeTermsBottomSheet = useCallback(() => {
    setShowTermsBottomSheet(false);
  }, []);

  return {
    id,
    aiDevices,
    selectedDevices,
    updatingDevices,
    isUpdating,
    agentName,
    isLoadingAgentName,
    agentNameError,
    showTermsBottomSheet,
    handleDeviceToggle,
    handleUpdateAgentId,
    getDeviceKey,
    handleChatPress,
    closeTermsBottomSheet,
    completeTermsBottomSheet,
  };
}
