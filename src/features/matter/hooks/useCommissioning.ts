/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DeviceEventEmitter,
  NativeEventEmitter,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import {
  getMatterUnsupportedMessage,
  isMatterCommissioningSupported,
} from "@features/matter/utils/matterSupport";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import {
  DEFAULT_MATTER_DEVICE_NAME,
  MATTER_COMMISSIONING_EVENT,
  MATTER_EVENT_COMMISSIONING_COMPLETE,
  MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE,
  MATTER_EVENT_COMMISSIONING_ERROR,
} from "@shared/utils/constants";
import type { ESPCDFGroup } from "@store";
import type {
  UseCommissioningParams,
  UseCommissioningResult,
} from "@src/types/global";
import {
  commissioningConfirmResponseIndicatesFailure,
  commissioningPayloadIndicatesFailure,
  extractCommissioningConfirmFailureDescription,
  extractCommissioningDeviceName,
  extractCommissioningErrorMessage,
  getMatterCommissioningPayload,
  isMatterCommissioningTerminalComplete,
  resolveCommissioningFailureMessage,
} from "@features/matter/utils/commissioningEvents";
import ESPMatterModule from "@native-adaptors/interfaces/ESPMatterInterface";
import {
  convertHomeToMatterFabric,
  isFabricReady,
  prepareFabric,
  syncStore,
} from "@features/matter/utils/matterCommissioningHelpers";
import { applyMatterCommissionedNodeTimezone } from "@shared/utils/timezone";
import { startMatterLocalDiscovery } from "@features/matter/utils/matterLocalDiscovery";
import {
  MATTER_COMMISSIONING_PHASE_COMMISSIONING,
  MATTER_COMMISSIONING_PHASE_CONVERTING,
  MATTER_COMMISSIONING_PHASE_ERROR,
  MATTER_COMMISSIONING_PHASE_LOADING,
  MATTER_COMMISSIONING_PHASE_NEEDS_CONVERSION,
  MATTER_COMMISSIONING_PHASE_PREPARING,
  type MatterCommissioningPhase,
} from "@features/matter/constants";

export type { UseCommissioningParams, UseCommissioningResult } from "@src/types/global";

/**
 * Orchestrates end-to-end Matter device commissioning for the **active home**.
 * @description
 * This hook is the feature-layer coordinator for the `/(matter)/Commissioning` flow.
 * It does **not** call RainMaker Matter SDK packages directly; it uses CDF entities from
 * `@store` (`ESPCDFGroup`, `ESPCDFUser`) and pure helpers under
 * `@features/matter/utils/`.
 *
 * **High-level flow**
 * 1. Resolve the current home from `store.getCurrentHome()`.
 * 2. If the home is not Matter-enabled (`!isMatter`), optionally show conversion
 *    consent, then `convertToMatterFabric()`.
 * 3. Prepare the fabric: `getFabricDetails()`, issue/store user NOC if needed.
 * 4. Start ecosystem commissioning with `fabric.startCommissioning(qrData, …)`.
 * 5. Listen for native `MATTER_COMMISSIONING_EVENT` payloads; on success, sync
 *    homes/nodes, refresh Matter local mappings, and navigate to Home.
 *
 * State (phase, messages, errors) lives in this hook. Fabric/NOC/event parsing
 * logic lives in `matterCommissioningHelpers.ts` and `commissioningEvents.ts`.
 *
 * **Phases** (`MatterCommissioningPhase`): `loading` → optional `needs_conversion` →
 * `converting` / `preparing` → `commissioning` → navigate home on success, or `error`
 * (user should go back and scan again—no in-screen retry).
 * @example
 * Commissioning screen: consent, progress, and error UI
 * ```tsx
 * const { qrData } = useLocalSearchParams<{ qrData: string }>();
 * const {
 *   phase,
 *   statusMessage,
 *   errorMessage,
 *   activeHomeName,
 *   onConfirmConvert,
 *   onDeclineConvert,
 * } = useCommissioning({
 *   qrData: qrData ?? "",
 *   fabricConversionConsentRequired: true,
 * });
 *
 * if (phase === MATTER_COMMISSIONING_PHASE_NEEDS_CONVERSION) {
 *   return (
 *     <FabricConversionConsent
 *       homeName={activeHomeName}
 *       onConfirm={onConfirmConvert}
 *       onDecline={onDeclineConvert}
 *     />
 *   );
 * }
 * ```
 * @example
 * From Scan QR—auto-convert non-Matter home without consent UI
 * ```tsx
 * useCommissioning({
 *   qrData: scannedPayload,
 *   fabricConversionConsentRequired: false,
 * });
 * ```
 * @example
 * Native completion path (subscribed inside the hook)
 * ```ts
 * // DeviceEventEmitter emits MATTER_COMMISSIONING_EVENT with eventType:
 * // MATTER_EVENT_COMMISSIONING_COMPLETE | CONFIRMATION_RESPONSE | ERROR
 * // → toast, syncStore(), dismissTo("/(group)/Home") on success
 * ```
 */
export function useCommissioning({
  qrData,
  fabricConversionConsentRequired = true,
}: UseCommissioningParams): UseCommissioningResult {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { espCDFUser, store } = useCDF();

  const [phase, setPhase] = useState<MatterCommissioningPhase>(
    MATTER_COMMISSIONING_PHASE_LOADING,
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeHomeName, setActiveHomeName] = useState("");
  const [matterUnsupported, setMatterUnsupported] = useState(false);

  const preparedFabricRef = useRef<ESPCDFGroup | null>(null);

  const storeRef = useRef(store);
  const userRef = useRef(espCDFUser);
  const toastRef = useRef(toast);
  const routerRef = useRef(router);

  storeRef.current = store;
  userRef.current = espCDFUser;
  toastRef.current = toast;
  routerRef.current = router;

  const commissioningErrors = useMemo(
    () => ({
      fabricIdMismatch: t("device.matter.commissioning.fabricIdMismatch"),
      missingFabricCredentials: t(
        "device.matter.commissioning.missingFabricCredentials",
      ),
    }),
    [t],
  );

  const deploymentUnsupportedMessage = useMemo(
    () => getMatterUnsupportedMessage(t),
    [t],
  );

  /** Sets commissioning phase to error and shows `message`. */
  const fail = useCallback((message: string) => {
    setPhase(MATTER_COMMISSIONING_PHASE_ERROR);
    setErrorMessage(message);
  }, []);

  /** Maps unknown errors to a display string for {@link fail}. */
  const toErrorMessage = useCallback(
    (error: unknown) =>
      error instanceof Error ? error.message : t("error.fallBack"),
    [t],
  );

  /** Returns current home or calls {@link fail} and returns `null`. */
  const getActiveHomeOrFail = useCallback((): ESPCDFGroup | null => {
    if (!espCDFUser) {
      fail(t("device.matter.commissioning.authRequired"));
      return null;
    }

    const home = store.getCurrentHome() ?? null;
    if (!home?.id) {
      fail(t("device.matter.commissioning.noActiveHome"));
      return null;
    }

    setActiveHomeName(home.name ?? "");
    return home;
  }, [espCDFUser, fail, store, t]);

  /** Converts home to Matter fabric and updates commissioning UI phase. */
  const convertActiveHomeToFabric = useCallback(
    async (home: ESPCDFGroup): Promise<ESPCDFGroup> => {
      setPhase(MATTER_COMMISSIONING_PHASE_CONVERTING);
      setStatusMessage(t("device.matter.commissioning.statusConvertingFabric"));

      const fabric = await convertHomeToMatterFabric(home);
      setActiveHomeName(fabric.name ?? "");
      return fabric;
    },
    [t],
  );

  /**
   * Prepares the fabric and starts native Matter commissioning for the scanned QR payload.
   *
   * Sequence: `getFabricDetails` → {@link isNocRequired} / {@link issueNoc} →
   * `startCommissioning(qrData)` after fabric prep and optional user NOC issuance.
   * @example
   * ```ts
   * await fabric.getFabricDetails();
   * if (await isNocRequired(fabric, user)) {
   *   await issueNoc(fabric, user, commissioningErrors);
   * }
   * await fabric.startCommissioning(qrData, onProgress);
   * ```
   */
  const runFabricCommissioning = useCallback(
    async (fabric: ESPCDFGroup) => {
      if (!espCDFUser) {
        fail(t("device.matter.commissioning.authRequired"));
        return;
      }

      setPhase(MATTER_COMMISSIONING_PHASE_PREPARING);
      setStatusMessage(t("device.matter.commissioning.statusPreparingFabric"));

      await prepareFabric(fabric, espCDFUser, commissioningErrors, {
        onIssuingCertificate: () =>
          setStatusMessage(
            t("device.matter.commissioning.statusIssuingCertificate"),
          ),
      });
      preparedFabricRef.current = fabric;

      setStatusMessage(
        t("device.matter.commissioning.statusStartingCommissioning"),
      );

      setPhase(MATTER_COMMISSIONING_PHASE_COMMISSIONING);

      await fabric.startCommissioning(qrData, (progress) => {
        if (progress.description) {
          setStatusMessage(progress.description);
        }
      });
    },
    [commissioningErrors, espCDFUser, fail, qrData, t],
  );

  /**
   * Main pipeline: active home → fabric bootstrap → {@link runFabricCommissioning}.
   *
   * Clears `errorMessage`, sets `loading`, then {@link getActiveHomeOrFail} and
   * {@link isFabricReady}. Stops at `needs_conversion` for consent, auto-converts when
   * allowed, or commissions an already-Matter home. Runs once on screen mount.
   * @example
   * ```ts
   * const bootstrap = isFabricReady(home, fabricConversionConsentRequired);
   * if (bootstrap.kind === "needs_conversion") {
   *   setPhase(MATTER_COMMISSIONING_PHASE_NEEDS_CONVERSION);
   *   return;
   * }
   * await runFabricCommissioning(fabric);
   * ```
   */
  const startCommissioningForActiveHome = useCallback(async () => {
    setErrorMessage(null);
    setPhase(MATTER_COMMISSIONING_PHASE_LOADING);

    if (!isMatterCommissioningSupported()) {
      setMatterUnsupported(true);
      fail(deploymentUnsupportedMessage);
      return;
    }

    const home = getActiveHomeOrFail();
    if (!home) {
      return;
    }

    const bootstrap = isFabricReady(
      home,
      fabricConversionConsentRequired,
    );

    if (bootstrap.kind === "needs_conversion") {
      setPhase(MATTER_COMMISSIONING_PHASE_NEEDS_CONVERSION);
      return;
    }

    let fabric = bootstrap.fabric;

    if (!fabric.isMatter) {
      fabric = await convertActiveHomeToFabric(home);
    }

    await runFabricCommissioning(fabric);
  }, [
    convertActiveHomeToFabric,
    deploymentUnsupportedMessage,
    fabricConversionConsentRequired,
    fail,
    getActiveHomeOrFail,
    runFabricCommissioning,
  ]);

  /**
   * User confirmed fabric conversion on {@link FabricConversionConsent}.
   *
   * Re-reads the active home, {@link convertActiveHomeToFabric}, then
   * {@link runFabricCommissioning}. Surfaces errors via {@link fail} (no retry).
   * @example
   * ```tsx
   * <FabricConversionConsent
   *   homeName={activeHomeName}
   *   onConfirm={onConfirmConvert}
   *   onDecline={onDeclineConvert}
   * />
   * ```
   */
  const onConfirmConvert = useCallback(async () => {
    const home = getActiveHomeOrFail();
    if (!home) {
      return;
    }

    try {
      const fabric = await convertActiveHomeToFabric(home);
      await runFabricCommissioning(fabric);
    } catch (error: unknown) {
      fail(toErrorMessage(error));
    }
  }, [
    convertActiveHomeToFabric,
    fail,
    getActiveHomeOrFail,
    runFabricCommissioning,
    toErrorMessage,
  ]);

  /**
   * User declined fabric conversion; navigates back (typically to Scan QR / home).
   * @example
   * ```tsx
   * <FabricConversionConsent onDecline={onDeclineConvert} />
   * ```
   */
  const onDeclineConvert = useCallback(() => {
    router.back();
  }, [router]);

  /**
   * Native or pipeline failure: error toast and {@link fail}.
   *
   * Empty messages fall back to `device.matter.commissioning.failed`.
   * @example
   * ```ts
   * handleCommissioningFailure(extractCommissioningErrorMessage(payload));
   * ```
   */
  const handleCommissioningFailure = useCallback(
    (message?: string) => {
      const failureMessage = resolveCommissioningFailureMessage(
        message,
        t("device.matter.commissioning.failed"),
      );

      toastRef.current.showError(
        t("device.matter.commissioning.failedTitle"),
        failureMessage,
      );
      fail(failureMessage);
    },
    [fail, t],
  );

  /**
   * `MATTER_EVENT_COMMISSIONING_COMPLETE`: validate payload, success toast, {@link syncStore}, Home.
   *
   * iOS may nest fields under `requestBody`; use {@link getMatterCommissioningPayload}.
   * Still navigates home if post-commission sync throws (logged).
   * @example
   * ```ts
   * if (commissioningPayloadIndicatesFailure(payload)) {
   *   handleCommissioningFailure(extractCommissioningErrorMessage(payload));
   *   return;
   * }
   * await syncStore(store, user, refreshMatterMappingsAndRematch);
   * ```
   */
  const handleCommissioningComplete = useCallback(
    async (rawEvent: Record<string, unknown>) => {
      if (!isMatterCommissioningTerminalComplete(rawEvent)) {
        return;
      }

      const payload = getMatterCommissioningPayload(rawEvent);

      if (commissioningPayloadIndicatesFailure(payload)) {
        handleCommissioningFailure(extractCommissioningErrorMessage(payload));
        return;
      }

      const deviceName = extractCommissioningDeviceName(
        payload,
        rawEvent,
        DEFAULT_MATTER_DEVICE_NAME,
      );

      toastRef.current.showSuccess(
        t("device.matter.commissioning.success", { deviceName }),
      );

      try {
        await syncStore(storeRef.current, userRef.current, async () => {});
        routerRef.current.dismissTo("/(group)/Home");
      } catch (error) {
        console.error(
          "[useCommissioning] post-commission refresh failed:",
          error,
        );
        routerRef.current.dismissTo("/(group)/Home");
      }
      startMatterLocalDiscovery(storeRef.current);

      // Matter commissioning skips the provisioning-time timezone stage, so push
      // it best-effort in the background (hybrid-only; never blocks navigation).
      const rainmakerNodeId =
        typeof payload.rainmakerNodeId === "string"
          ? payload.rainmakerNodeId
          : undefined;
      void applyMatterCommissionedNodeTimezone(userRef.current, rainmakerNodeId);
    },
    [handleCommissioningFailure, t],
  );

  /**
   * `MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE`—fails on non-success status.
   *
   * Uses {@link commissioningConfirmResponseIndicatesFailure} and
   * {@link extractCommissioningConfirmFailureDescription}.
   */
  const handleConfirmResponse = useCallback(
    (event: Record<string, unknown>) => {
      const payload = getMatterCommissioningPayload(event);
      if (!commissioningConfirmResponseIndicatesFailure(payload, event)) {
        return;
      }

      handleCommissioningFailure(
        extractCommissioningConfirmFailureDescription(
          payload,
          event,
          t("device.matter.commissioning.invalidChallenge"),
        ),
      );
    },
    [handleCommissioningFailure, t],
  );

  /**
   * Dispatches native `MatterCommissioningEvent` payloads by `eventType`.
   *
   * Subscribed via {@link NativeEventEmitter} on Android (same module that emits from
   * HeadlessJS `handleHeadlessTaskResult`) and via the shared event name on iOS.
   */
  const onMatterCommissioningEvent = useCallback(
    (event: Record<string, unknown>) => {
      if (event.eventType === MATTER_EVENT_COMMISSIONING_COMPLETE) {
        void handleCommissioningComplete(event);
      } else if (
        event.eventType === MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE
      ) {
        handleConfirmResponse(event);
      } else if (event.eventType === MATTER_EVENT_COMMISSIONING_ERROR) {
        const p = getMatterCommissioningPayload(event);
        handleCommissioningFailure(extractCommissioningErrorMessage(p));
      }
    },
    [
      handleCommissioningComplete,
      handleCommissioningFailure,
      handleConfirmResponse,
    ],
  );

  /**
   * Subscribes to native commissioning events, then starts the commissioning pipeline.
   *
   * Listener is registered before {@link startCommissioningForActiveHome} so HeadlessJS
   * completion events are not missed while fabric prep runs.
   */
  useEffect(() => {
    const eventEmitter =
      Platform.OS === "android" && ESPMatterModule
        ? new NativeEventEmitter(ESPMatterModule as never)
        : null;

    const listener = eventEmitter
      ? eventEmitter.addListener(
          MATTER_COMMISSIONING_EVENT,
          onMatterCommissioningEvent,
        )
      : DeviceEventEmitter.addListener(
          MATTER_COMMISSIONING_EVENT,
          onMatterCommissioningEvent,
        );

    void startCommissioningForActiveHome().catch((error: unknown) => {
      fail(toErrorMessage(error));
    });

    return () => listener.remove();
  }, [
    fail,
    onMatterCommissioningEvent,
    startCommissioningForActiveHome,
    toErrorMessage,
  ]);

  return {
    phase,
    statusMessage,
    errorMessage,
    matterUnsupported,
    activeHomeName,
    onConfirmConvert,
    onDeclineConvert,
  };
}
