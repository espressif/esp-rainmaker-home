/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import { useCameraPermissions } from "expo-camera";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import { useCDF } from "@shared/hooks/useCDF";
import { useAgent } from "./useAgent";
import {
  validateAgent,
  getAgentConfig,
} from "@features/agent/utils";
import { parseAgentIdFromQrScan } from "@features/agent/utils/agentQrScan";
import { registerAgentFromSettingsScan } from "@features/agent/utils/agentSettingsScanFlow";

/**
 * Camera QR scan hook for agent Settings: validates the agent, persists it, and returns to Settings.
 * @returns Permission state and scan/back handlers for the scanner screen
 */
export function useAgentQrScan() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();
  const { store } = useCDF();
  const { addAgent, selectAgent } = useAgent();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const processingRef = useRef(false);

  const user = store?.userStore.user;

  /**
   * Handles a QR scan result: fetches agent details, adds to settings, and navigates back.
   * @param scannedValue - Raw barcode payload
   */
  const handleScan = useCallback(
    async (scannedValue: string) => {
      if (scannedRef.current || processingRef.current) {
        return;
      }

      const agentId = parseAgentIdFromQrScan(scannedValue);
      if (!agentId) {
        toast.showError(
          t("aiSettings.scan.invalidQRCode"),
          t("aiSettings.scan.invalidQRCodeMessage"),
        );
        return;
      }

      if (!user) {
        toast.showError(t("aiSettings.errors.saveFailed"));
        return;
      }

      processingRef.current = true;
      scannedRef.current = true;

      try {
        const validation = await validateAgent(agentId);
        if (!validation.isValid) {
          toast.showError(
            t("aiSettings.errors.agentInvalid"),
            t("aiSettings.errors.agentNotFound"),
          );
          scannedRef.current = false;
          return;
        }

        let agentName: string | null = null;
        try {
          const config = await getAgentConfig(agentId);
          agentName = config?.name ?? null;
        } catch {
          // Validation passed; fall back to agent id as the display name.
        }

        const result = await registerAgentFromSettingsScan({
          user,
          agentId,
          agentName,
          addAgent,
          selectAgent,
        });

        if (result.isUpdate) {
          toast.showSuccess(
            t("aiSettings.title"),
            t("aiSettings.agentUpdated"),
          );
        } else {
          toast.showSuccess(
            t("aiSettings.title"),
            t("aiSettings.agentAdded"),
          );
        }

        router.back();
      } catch {
        toast.showError(t("aiSettings.errors.saveFailed"));
        scannedRef.current = false;
      } finally {
        processingRef.current = false;
      }
    },
    [addAgent, router, selectAgent, t, toast, user],
  );

  /** Returns to Agent Settings without adding an agent. */
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  return {
    permission,
    requestPermission,
    handleScan,
    handleBack,
  };
}
