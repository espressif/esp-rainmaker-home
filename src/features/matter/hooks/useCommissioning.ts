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
  getMatterSharedHomeNotAllowedMessage,
  getMatterUnsupportedMessage,
  isMatterCommissioningAllowedForHome,
  isMatterCommissioningSupported,
} from "@features/matter/utils/matterSupport";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import {
  DEFAULT_MATTER_DEVICE_NAME,
  DEVICE_WRITE_TIMEOUT_MS,
  MATTER_CLOUD_CONFIRM_WAIT_TIMEOUT_ERROR,
  MATTER_CLOUD_CONFIRM_WAIT_TIMEOUT_MS,
  MATTER_COMMISSIONING_EVENT,
  MATTER_EVENT_COMMISSIONING_COMPLETE,
  MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE,
  MATTER_EVENT_COMMISSIONING_ERROR,
  MATTER_POST_COMMISSION_SYNC_TIMEOUT_ERROR,
  MATTER_POST_COMMISSION_SYNC_TIMEOUT_MS,
} from "@shared/utils/constants";
import { withTimeout } from "@shared/utils/asyncTimeout";
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
  isCommissioningProgressSettled,
  isMatterCommissioningTerminalComplete,
  resolveCommissioningFailureMessage,
} from "@features/matter/utils/commissioningEvents";
import ESPMatterModule from "@native-adaptors/interfaces/ESPMatterInterface";
import { matterCommissioningAdaptor } from "@native-adaptors/implementations/ESPMatterAdapter";
import {
  convertHomeToMatterFabric,
  findCloudNodeIdByMatterNodeId,
  isFabricReady,
  prepareFabric,
  syncStore,
} from "@features/matter/utils/matterCommissioningHelpers";
import { applyPostCommissioningNodeSetup } from "@shared/utils/matterPostCommissioning";
import { startMatterLocalDiscovery } from "@features/matter/utils/matterLocalDiscovery";
import {
  initialSetupName,
  MATTER_NAME_STEP_SHOWN,
  planSetupNames,
  saveSetupNames,
  sheetDeviceName,
} from "@features/matter/utils/matterSetupNames";
import { findProvisionedNodeById } from "@features/provision/utils/selectDeviceRoomHelpers";
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
 * Frees the native commissioning session after an add that failed or was left,
 * so the next add can start (iOS otherwise refuses it as "already in progress").
 */
const releaseNativeCommissioning = (): void => {
  void matterCommissioningAdaptor.cancelCommissioning?.();
};

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
 *    homes/nodes, refresh Matter local mappings, and continue to the device
 *    setup step. Android: `/(matter)/DeviceSetup` (name + identify + room).
 *    iOS: Apple's sheet asked for the name, so it is saved and the room step opens.
 *
 * State (phase, messages, errors) lives in this hook. Fabric/NOC/event parsing
 * logic lives in `matterCommissioningHelpers.ts` and `commissioningEvents.ts`.
 *
 * **Phases** (`MatterCommissioningPhase`): `loading` → optional `needs_conversion` →
 * `converting` / `preparing` → `commissioning` → device setup on success, or `error`
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
 * // → toast, syncStore(), then the name step (Android) or the room step (iOS)
 * ```
 */
export function useCommissioning({
  qrData,
  fabricConversionConsentRequired = true,
}: UseCommissioningParams): UseCommissioningResult {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { espCDFUser, store, syncHomeWithNodes } = useCDF();

  const [phase, setPhase] = useState<MatterCommissioningPhase>(
    MATTER_COMMISSIONING_PHASE_LOADING,
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeHomeName, setActiveHomeName] = useState("");
  const [matterUnsupported, setMatterUnsupported] = useState(false);

  const preparedFabricRef = useRef<ESPCDFGroup | null>(null);
  /** Adapter teardown from `startCommissioning`; removes its native listener. */
  const commissioningCleanupRef = useRef<(() => void) | null>(null);
  /** Per run: has the SDK reported its cloud confirm finished, and who is waiting on it. */
  const cloudConfirmSettledRef = useRef(false);
  const cloudConfirmWaitersRef = useRef<(() => void)[]>([]);
  const unmountedRef = useRef(false);
  /** Set once this add succeeded; until then leaving the screen frees the native session. */
  const commissioningDoneRef = useRef(false);

  const storeRef = useRef(store);
  const userRef = useRef(espCDFUser);
  const syncHomeWithNodesRef = useRef(syncHomeWithNodes);
  const toastRef = useRef(toast);
  const routerRef = useRef(router);

  storeRef.current = store;
  userRef.current = espCDFUser;
  syncHomeWithNodesRef.current = syncHomeWithNodes;
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

  const sharedHomeNotAllowedMessage = useMemo(
    () => getMatterSharedHomeNotAllowedMessage(t),
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

      // The SDK hands off to native from here and returns the adapter's teardown,
      // which owns a native event listener — hold it for the unmount cleanup.
      cloudConfirmSettledRef.current = false;
      cloudConfirmWaitersRef.current = [];
      const teardown = await fabric.startCommissioning(
        qrData,
        (progress) => {
          if (progress.description) {
            setStatusMessage(progress.description);
          }
          if (isCommissioningProgressSettled(progress.status)) {
            cloudConfirmSettledRef.current = true;
            cloudConfirmWaitersRef.current.splice(0).forEach((wake) => wake());
          }
        },
      );
      // The screen may already be gone by the time the SDK hands the session over.
      if (unmountedRef.current) {
        teardown();
        releaseNativeCommissioning();
        return;
      }
      commissioningCleanupRef.current = teardown;
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

    // Shared (secondary) members can control but not commission: on Neo the
    // backend would mint the device NOC, leaving the device administered by
    // the secondary's controller instead of the home owner's.
    if (!isMatterCommissioningAllowedForHome(home)) {
      fail(sharedHomeNotAllowedMessage);
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
    sharedHomeNotAllowedMessage,
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
      releaseNativeCommissioning();
      fail(failureMessage);
    },
    [fail, t],
  );

  /** Resolves once the SDK reports its cloud confirm done, or after a bounded wait. */
  const waitForCloudConfirm = useCallback(async () => {
    if (cloudConfirmSettledRef.current) return;
    await withTimeout(
      new Promise<void>((resolve) => cloudConfirmWaitersRef.current.push(resolve)),
      MATTER_CLOUD_CONFIRM_WAIT_TIMEOUT_MS,
      MATTER_CLOUD_CONFIRM_WAIT_TIMEOUT_ERROR,
    ).catch((error: unknown) => {
      console.warn(
        "[useCommissioning] cloud confirm not reported in time; syncing anyway:",
        error instanceof Error ? error.message : error,
      );
    });
  }, []);

  /**
   * iOS: saves the name typed in Apple's sheet with the name screen's rules,
   * then opens the room step. A name that can't be kept opens the name screen.
   * @param nodeId - Cloud id of the added node
   * @param deviceName - Name from the commissioning event
   */
  const saveSheetNameThenPickRoom = useCallback(
    async (nodeId: string, deviceName: string) => {
      const node = findProvisionedNodeById(
        storeRef.current?.nodeStore?.nodesList,
        nodeId,
      );
      if (!node) {
        // Sync raced the navigation; room assignment needs the node.
        routerRef.current.dismissTo("/(group)/Home");
        return;
      }

      const sheetName = sheetDeviceName(deviceName);
      const namesByDevice = Object.fromEntries(
        (node.devices ?? []).map((device) => [
          device.name,
          initialSetupName(device, node, sheetName),
        ]),
      );
      const plan = planSetupNames(node, namesByDevice);
      if (plan.problemKey !== undefined) {
        toastRef.current.showError(t(plan.problemKey));
        routerRef.current.replace({
          pathname: "/(matter)/DeviceSetup",
          params: { nodeId, deviceName },
        } as never);
        return;
      }

      // Bounded so a slow device can't hold the loader; the save goes on and retries by itself.
      const allSaved = await withTimeout(
        saveSetupNames(node, plan.renames),
        DEVICE_WRITE_TIMEOUT_MS,
        new Error("Name save still running"),
      ).catch(() => true);
      if (!allSaved) {
        toastRef.current.showError(t("device.matter.setup.nameSaveFailed"));
      }

      // Nothing to go back to under it, so its Back goes Home.
      routerRef.current.replace({
        pathname: "/(provision)/SelectDeviceRoom",
        params: { nodeId, backToHome: "1" },
      } as never);
    },
    [t],
  );

  /**
   * `MATTER_EVENT_COMMISSIONING_COMPLETE`: validate payload, success toast, {@link syncStore},
   * then the name step (Android) or the room step (iOS).
   *
   * iOS may nest fields under `requestBody`; use {@link getMatterCommissioningPayload}.
   * Still navigates on if post-commission sync throws (logged); without a cloud
   * node id there is nothing to set up, so it falls back to Home.
   * @example
   * ```ts
   * if (commissioningPayloadIndicatesFailure(payload)) {
   *   handleCommissioningFailure(extractCommissioningErrorMessage(payload));
   *   return;
   * }
   * await syncStore(store, syncHomeWithNodes, refreshMatterMappingsAndRematch);
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
      commissioningDoneRef.current = true;

      const deviceName = extractCommissioningDeviceName(
        payload,
        rawEvent,
        DEFAULT_MATTER_DEVICE_NAME,
      );

      toastRef.current.showSuccess(
        t("device.matter.commissioning.success", { deviceName }),
      );

      // The Neo CLOUD id — rmNodeId is the RainMaker-cluster identity, blank
      // for mirror hybrids. It keys both the setup screen and the TZ push.
      let cloudNodeId =
        (typeof payload.neoNodeId === "string" && payload.neoNodeId
          ? payload.neoNodeId
          : undefined) ??
        (typeof payload.rainmakerNodeId === "string" && payload.rainmakerNodeId
          ? payload.rainmakerNodeId
          : undefined);

      // iOS: native reports done before the SDK's cloud confirm and config PUT land; a sync now sees a device-less node.
      if (Platform.OS === "ios") {
        await waitForCloudConfirm();
      }

      // Bound it: a stalled sync would strand the user on the commissioning loader.
      try {
        await withTimeout(
          syncStore(
            storeRef.current,
            syncHomeWithNodesRef.current,
            async () => {},
          ),
          MATTER_POST_COMMISSION_SYNC_TIMEOUT_MS,
          MATTER_POST_COMMISSION_SYNC_TIMEOUT_ERROR,
        );
      } catch (error) {
        console.error(
          "[useCommissioning] post-commission refresh failed:",
          error,
        );
      }

      // Classic pure Matter: the confirm response carries no cloud node id,
      // so both payload keys arrive blank even though the cloud minted one at
      // confirm time. The sync above pulled that node — recover its id via
      // the Matter node id the event does carry, so the name and room steps
      // and the post-commissioning setup still run.
      if (!cloudNodeId) {
        cloudNodeId = findCloudNodeIdByMatterNodeId(
          storeRef.current,
          payload.matterNodeId,
        );
      }
      startMatterLocalDiscovery(storeRef.current);

      if (!cloudNodeId) {
        routerRef.current.dismissTo("/(group)/Home");
      } else if (MATTER_NAME_STEP_SHOWN) {
        // Android: name + identify + room step, as Google's sheet asks for no
        // name; the screen falls back to Home if the node isn't synced yet.
        routerRef.current.replace({
          pathname: "/(matter)/DeviceSetup",
          params: { nodeId: cloudNodeId, deviceName },
        } as never);
      } else {
        // iOS: Apple's sheet already asked for the name.
        void saveSheetNameThenPickRoom(cloudNodeId, deviceName);
      }

      // Cloud-side setup the provisioning path would have done; the helper
      // owns which steps those are.
      applyPostCommissioningNodeSetup(
        userRef.current,
        cloudNodeId,
        payload.matterNodeId,
      );
    },
    [handleCommissioningFailure, saveSheetNameThenPickRoom, t, waitForCloudConfirm],
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

  /** Native commissioning events; declared before the start so none are missed. */
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

    return () => {
      listener.remove();
    };
  }, [onMatterCommissioningEvent]);

  const startCommissioningRef = useRef(startCommissioningForActiveHome);
  const toErrorMessageRef = useRef(toErrorMessage);
  useEffect(() => {
    startCommissioningRef.current = startCommissioningForActiveHome;
    toErrorMessageRef.current = toErrorMessage;
  }, [startCommissioningForActiveHome, toErrorMessage]);

  /** One SDK session per mount: a dependency change must never start a second one. */
  useEffect(() => {
    unmountedRef.current = false;
    commissioningDoneRef.current = false;
    void startCommissioningRef.current().catch((error: unknown) => {
      releaseNativeCommissioning();
      fail(toErrorMessageRef.current(error));
    });

    return () => {
      unmountedRef.current = true;
      commissioningCleanupRef.current?.();
      commissioningCleanupRef.current = null;
      if (!commissioningDoneRef.current) {
        releaseNativeCommissioning();
      }
    };
  }, [fail]);

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
