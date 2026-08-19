/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import {
  MATTER_ENTRY_METHOD_MANUAL,
  MATTER_ROUTE_PARAM_ENTRY_METHOD,
  MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED,
  MATTER_ROUTE_PARAM_VALUE_FALSE,
} from "@features/matter/constants";
import {
  isValidManualPairingCode,
  sanitizeManualPairingCode,
} from "@features/matter/utils/manualPairingCode";

/** Return shape of {@link useManualCommissioning}. */
export interface UseManualCommissioningResult {
  /** Sanitised (digits-only) pairing code currently entered. */
  pairingCode: string;
  /** Whether {@link pairingCode} is a plausible Matter manual pairing code. */
  isValid: boolean;
  /** Updates the pairing code, stripping separators as the user types. */
  setPairingCode: (value: string) => void;
  /** Validates the code and navigates into the Matter commissioning pipeline. */
  handleContinue: () => void;
}

/**
 * Business logic for the manual Matter pairing-code entry screen.
 *
 * The manual path reuses the exact same commissioning pipeline as the QR path:
 * once a valid pairing code is entered it is forwarded to `/(matter)/Commissioning`
 * as the `qrData` onboarding payload, where {@link useCommissioning} runs fabric
 * prep and `fabric.startCommissioning(payload)`. The native onboarding-payload
 * parsers on both platforms accept a manual pairing code just as they accept an
 * `MT:` QR string, so no platform-specific handling is required here.
 *
 * Consent behaviour matches the QR-initiated Matter flow: the home is converted
 * to a Matter fabric automatically (`fabricConversionConsentRequired=false`).
 * @returns Field state and handlers for the manual commissioning screen.
 * @example
 * ```tsx
 * const { pairingCode, isValid, setPairingCode, handleContinue } =
 *   useManualCommissioning();
 * <Input initialValue={pairingCode} onFieldChange={setPairingCode} />
 * <Button disabled={!isValid} onPress={handleContinue} />
 * ```
 */
export function useManualCommissioning(): UseManualCommissioningResult {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { store } = useCDF();

  const [pairingCode, setPairingCodeState] = useState("");

  const setPairingCode = useCallback((value: string) => {
    setPairingCodeState(sanitizeManualPairingCode(value));
  }, []);

  const isValid = useMemo(
    () => isValidManualPairingCode(pairingCode),
    [pairingCode],
  );

  const handleContinue = useCallback(() => {
    if (!isValid) {
      toast.showError(t("device.matter.manual.invalidCode"));
      return;
    }

    // Mirror the QR Matter path (ScanQR.handleMatterCommissioning): require an
    // authenticated user before entering the fabric/commissioning pipeline.
    if (!store?.userStore?.user) {
      toast.showError(t("device.matter.manual.authRequired"));
      return;
    }

    router.push({
      pathname: "/(matter)/Commissioning",
      params: {
        qrData: pairingCode,
        [MATTER_ROUTE_PARAM_ENTRY_METHOD]: MATTER_ENTRY_METHOD_MANUAL,
        [MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED]:
          MATTER_ROUTE_PARAM_VALUE_FALSE,
      },
    });
  }, [isValid, pairingCode, router, store, t, toast]);

  return { pairingCode, isValid, setPairingCode, handleContinue };
}
