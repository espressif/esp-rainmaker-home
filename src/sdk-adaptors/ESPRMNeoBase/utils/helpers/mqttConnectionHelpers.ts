/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppState, type AppStateStatus } from "react-native";
import {
  ESPRMNeoUser,
  extractNodeIdFromTopic,
  type ESPRMNeoNode,
} from "@espressif/rainmaker-neo-base-sdk";
import { ESPCDF } from "@store";
import { delay } from "@shared/utils/common";
import {
  APP_STATE_ACTIVE,
  APP_STATE_BACKGROUND,
  APP_STATE_INACTIVE,
} from "@shared/utils/constants";
import {
  addMqttMessageHook,
  addMqttConnectionListener,
  ESPMQTTAdapter,
} from "@native-adaptors/implementations/ESPMQTTAdapter";
import { bindRmneoCdfStoreSink, projectShadowDocumentToCdf } from "./cdfStoreSinkHelpers";
import { resetMqttNodeRegistrations } from "./groupHelpers";
import { mqttTransportUiState } from "@shared/state/mqttTransportUiState";

const mqttConnectionByUser = new WeakMap<ESPRMNeoUser, Promise<unknown>>();
const watchdogTimerByUser = new WeakMap<
  ESPRMNeoUser,
  ReturnType<typeof setInterval>
>();
// Dedupes concurrent reconnect callers so only one attempt runs per user.
const reconnectInFlightByUser = new WeakMap<ESPRMNeoUser, Promise<void>>();
const connectionListenerUnsubByUser = new WeakMap<ESPRMNeoUser, () => void>();
const appStateUnsubByUser = new WeakMap<ESPRMNeoUser, () => void>();
let updateAcceptedCdfBridgeInstalled = false;

/**
 * Installs the update-accepted CDF bridge once for the current app process.
 */
function ensureUpdateAcceptedCdfBridge(): void {
  if (updateAcceptedCdfBridgeInstalled) {
    return;
  }
  addMqttMessageHook(forwardRmneoUpdateAcceptedToCdfStore);
  updateAcceptedCdfBridgeInstalled = true;
}

/**
 * `connectMQTT()` has no internal retry; a transient failure (e.g. a 500 from
 * the assumed-roles endpoint) would otherwise permanently block MQTT for the
 * rest of the session (see {@link startRmneoMqttConnection}).
 */
const MQTT_CONNECT_MAX_ATTEMPTS = 3;
const MQTT_CONNECT_RETRY_DELAY_MS = 1500;

/** How often the watchdog polls the transport's connection state. */
const MQTT_WATCHDOG_INTERVAL_MS = 15000;

/**
 * Connects MQTT with bounded retries for transient cloud failures.
 * @param esprmngUser - Authenticated RMNeo user.
 * @returns The SDK MQTT connection result.
 */
async function connectMQTTWithRetries(
  esprmngUser: ESPRMNeoUser,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MQTT_CONNECT_MAX_ATTEMPTS; attempt++) {
    try {
      return await esprmngUser.connectMQTT();
    } catch (error) {
      lastError = error;
      console.error(
        `[startRmneoMqttConnection] connectMQTT attempt ${attempt}/${MQTT_CONNECT_MAX_ATTEMPTS} failed:`,
        error,
      );
      if (attempt < MQTT_CONNECT_MAX_ATTEMPTS) {
        await delay(MQTT_CONNECT_RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError;
}

/**
 * Starts MQTT once per {@link ESPRMNeoUser} for this CDF user transform.
 * Base and Matter transforms share the same promise so connectMQTT is not
 * called twice when Matter layers on top of base.
 *
 * On logout, the SDK's `user.logout()` calls
 * `NodeMQTTOrchestrator.resetSession()` internally, which clears session
 * state without dropping the singleton — so this file never touches the
 * orchestrator directly.
 * @param esprmngUser - Authenticated RMNeo user.
 * @returns Shared MQTT startup promise for this user.
 */
export function startRmneoMqttConnection(
  esprmngUser: ESPRMNeoUser,
): Promise<unknown> {
  const existing = mqttConnectionByUser.get(esprmngUser);
  if (existing) {
    return existing;
  }

  // Only cache the promise once it settles successfully. Retrying a few
  // times inline absorbs transient failures; clearing the cache entry if
  // every retry still fails lets a later caller (e.g. the next resync) try
  // again fresh instead of being stuck with a permanently-cached rejection.
  const promise = connectMQTTWithRetries(esprmngUser)
    .then(() => {
      ensureUpdateAcceptedCdfBridge();
      startReconnectWatchdog(esprmngUser);
      startConnectionStatusListener(esprmngUser);
      startAppStateResumeListener(esprmngUser);
      mqttTransportUiState.setConnected(true);
    })
    .catch((error) => {
      console.error(
        "[startRmneoMqttConnection] Failed to connect MQTT after retries:",
        error,
      );
      mqttConnectionByUser.delete(esprmngUser);
    });
  mqttConnectionByUser.set(esprmngUser, promise);
  return promise;
}

/**
 * Clears the per-user MQTT start promise and stops its watchdog after logout.
 * @param esprmngUser - RMNeo user whose connection state is cleared.
 */
export function clearRmneoMqttConnection(esprmngUser: ESPRMNeoUser): void {
  mqttConnectionByUser.delete(esprmngUser);
  stopReconnectWatchdog(esprmngUser);
  stopConnectionStatusListener(esprmngUser);
  stopAppStateResumeListener(esprmngUser);
}

/**
 * Starts a background poll (once per user) that self-heals MQTT if the
 * transport reports disconnected. Idempotent for the same user.
 * @param esprmngUser - RMNeo user whose connection is watched.
 */
function startReconnectWatchdog(esprmngUser: ESPRMNeoUser): void {
  if (watchdogTimerByUser.has(esprmngUser)) {
    return;
  }
  const timer = setInterval(() => {
    ensureRmneoMqttConnected(esprmngUser).catch((error) => {
      console.warn(
        "[rmneoMqttConnection] watchdog reconnect check failed:",
        error,
      );
    });
  }, MQTT_WATCHDOG_INTERVAL_MS);
  watchdogTimerByUser.set(esprmngUser, timer);
}

/**
 * Stops the reconnect watchdog for an RMNeo user.
 * @param esprmngUser - RMNeo user whose watchdog is stopped.
 */
function stopReconnectWatchdog(esprmngUser: ESPRMNeoUser): void {
  const timer = watchdogTimerByUser.get(esprmngUser);
  if (timer) {
    clearInterval(timer);
    watchdogTimerByUser.delete(esprmngUser);
  }
}

/**
 * Subscribes once per user to native MQTT transport status so disconnect
 * triggers reconnect promptly (watchdog remains the fallback).
 * @param esprmngUser - RMNeo user whose transport is watched.
 */
function startConnectionStatusListener(esprmngUser: ESPRMNeoUser): void {
  if (connectionListenerUnsubByUser.has(esprmngUser)) {
    return;
  }
  console.log(
    "[MQTT_CONN_CB] registering app mqtt connection status listener",
  );
  const unsubscribe = addMqttConnectionListener((status) => {
    if (status.connected) {
      console.log(
        "[MQTT_CONN_CB] app callback: MQTT connected (re-established or initial)",
      );
      return;
    }
    mqttTransportUiState.setConnected(false);
    console.warn(
      "[MQTT_CONN_CB] app callback: MQTT disconnected; triggering ensureRmneoMqttConnected",
    );
    ensureRmneoMqttConnected(esprmngUser).catch((error) => {
      console.warn(
        "[MQTT_CONN_CB] push-driven reconnect failed:",
        error,
      );
    });
  });
  connectionListenerUnsubByUser.set(esprmngUser, unsubscribe);
}

/**
 * Removes the per-user MQTT connection-status listener.
 * @param esprmngUser - RMNeo user whose listener is cleared.
 */
function stopConnectionStatusListener(esprmngUser: ESPRMNeoUser): void {
  const unsubscribe = connectionListenerUnsubByUser.get(esprmngUser);
  if (unsubscribe) {
    unsubscribe();
    connectionListenerUnsubByUser.delete(esprmngUser);
  }
}

/**
 * On foreground resume after background/inactive, force-tears down MQTT and
 * reconnects. Native `isConnected` can stay stale after Wi-Fi changes while
 * backgrounded; a soft ensure would no-op.
 * @param esprmngUser - RMNeo user whose transport is watched.
 */
function startAppStateResumeListener(esprmngUser: ESPRMNeoUser): void {
  if (appStateUnsubByUser.has(esprmngUser)) {
    return;
  }
  let previousState: AppStateStatus = AppState.currentState;
  console.log(
    "[rmneoMqttConnection] registering AppState resume MQTT listener",
  );
  const subscription = AppState.addEventListener(
    "change",
    (nextState: AppStateStatus) => {
      const wasBackgrounded =
        previousState === APP_STATE_BACKGROUND ||
        previousState === APP_STATE_INACTIVE;
      previousState = nextState;
      if (!wasBackgrounded || nextState !== APP_STATE_ACTIVE) {
        return;
      }
      console.warn(
        "[rmneoMqttConnection] App became active; forcing MQTT reconnect",
      );
      forceRmneoMqttReconnectOnResume(esprmngUser).catch((error) => {
        console.warn(
          "[rmneoMqttConnection] resume-driven MQTT reconnect failed:",
          error,
        );
      });
    },
  );
  appStateUnsubByUser.set(esprmngUser, () => subscription.remove());
}

/**
 * Removes the per-user AppState resume listener.
 * @param esprmngUser - RMNeo user whose listener is cleared.
 */
function stopAppStateResumeListener(esprmngUser: ESPRMNeoUser): void {
  const unsubscribe = appStateUnsubByUser.get(esprmngUser);
  if (unsubscribe) {
    unsubscribe();
    appStateUnsubByUser.delete(esprmngUser);
  }
}

/**
 * If the transport is disconnected, reconnects with fresh credentials and
 * re-subscribes every known node so live shadow updates resume. Concurrent
 * callers share the same in-flight attempt.
 * @param esprmngUser - RMNeo user whose MQTT connection is ensured.
 * @returns Promise settled after the connection check or reconnect.
 */
export function ensureRmneoMqttConnected(
  esprmngUser: ESPRMNeoUser,
): Promise<void> {
  return runExclusiveMqttReconnect(esprmngUser, () =>
    ensureRmneoMqttConnectedOnce(esprmngUser),
  );
}

/**
 * Forces MQTT teardown + reconnect + resubscribe after app resume.
 * Does not trust native `isConnected` (may be stale after background network changes).
 * If another reconnect is already running, waits for it then still force-reconnects
 * so a soft ensure that early-returned on a stale CONNECTED flag cannot skip work.
 * @param esprmngUser - RMNeo user whose MQTT session is rebuilt.
 * @returns Promise settled after the forced reconnect attempt.
 */
export function forceRmneoMqttReconnectOnResume(
  esprmngUser: ESPRMNeoUser,
): Promise<void> {
  const prior = reconnectInFlightByUser.get(esprmngUser);
  const promise = (async () => {
    if (prior) {
      await prior.catch(() => {});
    }
    await forceRmneoMqttReconnectOnce(esprmngUser);
  })().finally(() => {
    if (reconnectInFlightByUser.get(esprmngUser) === promise) {
      reconnectInFlightByUser.delete(esprmngUser);
    }
  });
  reconnectInFlightByUser.set(esprmngUser, promise);
  return promise;
}

/**
 * Runs a reconnect task exclusively per user (shared in-flight promise).
 * @param esprmngUser - RMNeo user scoped for dedupe.
 * @param task - Reconnect work to run.
 */
function runExclusiveMqttReconnect(
  esprmngUser: ESPRMNeoUser,
  task: () => Promise<void>,
): Promise<void> {
  const inFlight = reconnectInFlightByUser.get(esprmngUser);
  if (inFlight) {
    return inFlight;
  }

  const promise = task().finally(() => {
    if (reconnectInFlightByUser.get(esprmngUser) === promise) {
      reconnectInFlightByUser.delete(esprmngUser);
    }
  });
  reconnectInFlightByUser.set(esprmngUser, promise);
  return promise;
}

/**
 * Performs one MQTT connection check and resubscription cycle.
 * @param esprmngUser - RMNeo user whose connection is checked.
 */
async function ensureRmneoMqttConnectedOnce(
  esprmngUser: ESPRMNeoUser,
): Promise<void> {
  if (await ESPMQTTAdapter.isConnected()) {
    mqttTransportUiState.setConnected(true);
    return;
  }

  mqttTransportUiState.setConnected(false);
  console.warn(
    "[rmneoMqttConnection] MQTT transport reports disconnected; reconnecting with fresh credentials",
  );
  mqttConnectionByUser.delete(esprmngUser);
  await startRmneoMqttConnection(esprmngUser);
  await finishReconnectWithResubscribe();
}

/**
 * Tears down any native MQTT session, reconnects with fresh credentials, and
 * resubscribes. Used on AppState resume when the CONNECTED flag may be stale.
 * @param esprmngUser - RMNeo user whose session is rebuilt.
 */
async function forceRmneoMqttReconnectOnce(
  esprmngUser: ESPRMNeoUser,
): Promise<void> {
  mqttTransportUiState.setConnected(false);
  console.warn(
    "[rmneoMqttConnection] Forcing MQTT disconnect before resume reconnect",
  );
  try {
    // Bypass SDK disconnectMQTT's isConnected guard so CONNECTING/stale
    // CONNECTED native state cannot block a fresh connect().
    await ESPMQTTAdapter.disconnect();
  } catch (error) {
    console.warn(
      "[rmneoMqttConnection] Forced MQTT disconnect failed (continuing):",
      error,
    );
  }
  mqttConnectionByUser.delete(esprmngUser);
  await startRmneoMqttConnection(esprmngUser);
  await finishReconnectWithResubscribe();
}

/**
 * After a reconnect attempt, resubscribes nodes when the transport is up.
 */
async function finishReconnectWithResubscribe(): Promise<void> {
  const reconnected = await ESPMQTTAdapter.isConnected();
  console.log(
    `[rmneoMqttConnection] reconnect attempt finished, connected=${reconnected}`,
  );
  if (!reconnected) {
    return;
  }

  const nodesList = ESPCDF.instance?.nodeStore?.nodesList ?? [];
  const nodeIds = nodesList.map((node) => node.id);
  const cdfUser = ESPCDF.instance?.userStore?.user;
  await cdfUser?.unsubscribeFromNodeUpdates?.().catch(() => {});
  await resetMqttNodeRegistrations(nodeIds);

  if (cdfUser && nodesList.length > 0) {
    try {
      await cdfUser.subscribeToNodeUpdates({ nodeList: nodesList });
      for (const cdfNode of nodesList) {
        const raw = cdfNode._raw as ESPRMNeoNode | undefined;
        if (raw?.nodeId) {
          bindRmneoCdfStoreSink(raw);
        }
      }
      console.log(
        `[rmneoMqttConnection] resubscribed ${nodesList.length} node(s) after reconnect`,
      );
    } catch (error) {
      console.warn(
        "[rmneoMqttConnection] resubscribe after reconnect failed:",
        error,
      );
    }
  }

  mqttTransportUiState.setConnected(true);
}

/**
 * Vendored rmng-base-sdk 1.5.0's NodeMQTTOrchestrator subscribes to
 * `/update/accepted` but intentionally does not fan it out to param listeners
 * (it only forwards `/update/documents` and `/get/accepted`). On backends that
 * publish live reported-state only on `/update/accepted`, MQTT reaches JS
 * (`mqtt.dispatch`) while DeviceCard never updates.
 *
 * This app-side bridge feeds those messages into the CDF store via the same
 * {@link projectShadowDocumentToCdf} path used for other shadow documents.
 * Idempotent with a future SDK that also forwards `/update/accepted`
 * (MobX merge of the same values).
 * @param topic - MQTT topic carrying the shadow update.
 * @param message - MQTT payload string.
 */
export function forwardRmneoUpdateAcceptedToCdfStore(
  topic: string,
  message: string,
): void {
  if (!topic.endsWith("/update/accepted")) {
    return;
  }

  const nodeId = extractNodeIdFromTopic(topic) ?? undefined;
  if (!nodeId) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return;
  }

  if (!parsed || typeof parsed !== "object") {
    return;
  }

  // Plain shadow doc (`get/accepted` shape). Skip documents envelopes if they
  // ever share this suffix.
  const doc = parsed as { state?: { reported?: unknown }; previous?: unknown };
  if (doc.previous !== undefined || doc.state?.reported === undefined) {
    return;
  }

  projectShadowDocumentToCdf(nodeId, parsed);
}

