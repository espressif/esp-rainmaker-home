/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNeoUser,
  extractNodeIdFromTopic,
  type ESPRMNeoNode,
} from "@espressif/rainmaker-neo-base-sdk";
import { ESPCDF } from "@store";
import { delay } from "@shared/utils/common";
import {
  addMqttMessageHook,
  ESPMQTTAdapter,
} from "@native-adaptors/implementations/ESPMQTTAdapter";
import { bindRmneoCdfStoreSink, projectShadowDocumentToCdf } from "./cdfStoreSinkHelpers";
import { resetMqttNodeRegistrations } from "./groupHelpers";

const mqttConnectionByUser = new WeakMap<ESPRMNeoUser, Promise<unknown>>();
const watchdogTimerByUser = new WeakMap<
  ESPRMNeoUser,
  ReturnType<typeof setInterval>
>();
// Dedupes concurrent reconnect callers so only one attempt runs per user.
const reconnectInFlightByUser = new WeakMap<ESPRMNeoUser, Promise<void>>();
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
 * If the transport is disconnected, reconnects with fresh credentials and
 * re-subscribes every known node so live shadow updates resume. Concurrent
 * callers share the same in-flight attempt.
 * @param esprmngUser - RMNeo user whose MQTT connection is ensured.
 * @returns Promise settled after the connection check or reconnect.
 */
export function ensureRmneoMqttConnected(
  esprmngUser: ESPRMNeoUser,
): Promise<void> {
  const inFlight = reconnectInFlightByUser.get(esprmngUser);
  if (inFlight) {
    return inFlight;
  }

  const promise = ensureRmneoMqttConnectedOnce(esprmngUser).finally(() => {
    reconnectInFlightByUser.delete(esprmngUser);
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
    return;
  }

  console.warn(
    "[rmneoMqttConnection] MQTT transport reports disconnected; reconnecting with fresh credentials",
  );
  mqttConnectionByUser.delete(esprmngUser);
  await startRmneoMqttConnection(esprmngUser);

  const reconnected = await ESPMQTTAdapter.isConnected();
  console.log(
    `[rmneoMqttConnection] reconnect attempt finished, connected=${reconnected}`,
  );
  if (!reconnected) {
    return;
  }

  // Reset and re-subscribe every known node so orchestrator bookkeeping
  // matches the fresh transport.
  const nodesList = ESPCDF.instance?.nodeStore?.nodesList ?? [];
  const nodeIds = nodesList.map((node) => node.id);
  const cdfUser = ESPCDF.instance?.userStore?.user;
  await cdfUser?.unsubscribeFromNodeUpdates?.().catch(() => {});
  await resetMqttNodeRegistrations(nodeIds);

  if (cdfUser && nodesList.length > 0) {
    try {
      await cdfUser.subscribeToNodeUpdates({ nodeList: nodesList });
      // reset wiped transform-time store sinks; re-bind so UI params update.
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

