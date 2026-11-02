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
import { withTimeout } from "@shared/utils/asyncTimeout";
import { getSessionId, isSessionActive } from "@shared/utils/userSession";
import {
  APP_STATE_ACTIVE,
  APP_STATE_BACKGROUND,
  APP_STATE_INACTIVE,
} from "@shared/utils/constants";
import {
  addMqttMessageHook,
  addMqttConnectionListener,
  allowMqttConnects,
  ESPMQTTAdapter,
  refuseMqttConnects,
} from "@native-adaptors/implementations/ESPMQTTAdapter";
import {
  bindRmneoCdfStoreSink,
  projectShadowDocumentToCdf,
} from "./cdfStoreSinkHelpers";
import { resetMqttNodeRegistrations } from "./groupHelpers";
import { filterCloudUpdate, type CloudShadowDocument } from "./cloudUpdateFilter";
import { mqttTransportUiState } from "@shared/state/mqttTransportUiState";
import { onInternetBack } from "@native-adaptors/utils/internetBack";

/** A connect started by {@link connectAndWatch}; `settled` once it has finished. */
type MqttConnect = { promise: Promise<unknown>; settled: boolean };
const mqttConnectionByUser = new WeakMap<ESPRMNeoUser, MqttConnect>();
/** Background reconnect check per user (see {@link startReconnectWatchdog}). */
type ReconnectWatchdog = {
  timer?: ReturnType<typeof setTimeout>;
  failedChecks: number;
  stopped: boolean;
  /** A check is running now. */
  checking: boolean;
  /** The internet came back during a running check: check again at once. */
  checkAgainAtOnce: boolean;
};
const watchdogByUser = new WeakMap<ESPRMNeoUser, ReconnectWatchdog>();
// Dedupes concurrent reconnect callers so only one attempt runs per user.
const reconnectInFlightByUser = new WeakMap<ESPRMNeoUser, Promise<void>>();
const connectionListenerUnsubByUser = new WeakMap<ESPRMNeoUser, () => void>();
const appStateUnsubByUser = new WeakMap<ESPRMNeoUser, () => void>();
const internetBackUnsubByUser = new WeakMap<ESPRMNeoUser, () => void>();
/** Sign-in session each user's MQTT belongs to; nothing reconnects after it ends. */
const sessionIdByUser = new WeakMap<ESPRMNeoUser, number>();
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
 * the assumed-roles endpoint, or the first connect right after Wi-Fi comes
 * back) is retried a few times here, then the watchdog keeps trying.
 */
const MQTT_CONNECT_MAX_ATTEMPTS = 3;
const MQTT_CONNECT_RETRY_DELAY_MS = 1500;

/**
 * Longest one `connectMQTT()` may take. It mainly covers a credentials request
 * over HTTP that never answers: the native connect after it is bounded on its
 * own (15 s in the native module, 20 s in the adapter), so it is never cut short.
 */
const MQTT_CONNECT_ATTEMPT_TIMEOUT_MS = 40_000;

/** Longest to wait for the native side to drop a connect. */
const MQTT_DROP_CONNECT_TIMEOUT_MS = 5_000;

/**
 * Longest one reconnect may hold the per-user lock (three connect attempts
 * plus resubscribing). After that the lock is let go, so one stuck reconnect
 * can never block every later one.
 */
const MQTT_RECONNECT_TIMEOUT_MS = 180_000;

/** How often the watchdog checks the connection while it is up. */
const MQTT_WATCHDOG_INTERVAL_MS = 15000;

/** Options for a forced MQTT reconnect. */
export interface RmneoMqttReconnectOptions {
  /**
   * Re-subscribe the store's nodes once the transport is back up (default
   * `true`). Pass `false` when a full `syncHomeWithNodes` follows: the sync
   * subscribes every node with fresh SDK instances, and subscribing them
   * here first would leave two listeners per node. The teardown of stale
   * registrations always runs, so the sync's subscribe reaches the wire.
   */
  resubscribe?: boolean;
}

const HTTP_STATUS_CONFLICT = 409;

/**
 * Whether a connect failure is the expected "no groups yet" 409.
 *
 * `POST /v1/assumed-roles` answers 409 (`User has no groups`) while the user
 * has no home yet, because there is no membership to scope the IoT policy
 * to. That is the normal state of a brand-new account until the default home
 * is created, so it is not a transient failure worth retrying. The SDK's
 * API manager attaches `status` to the thrown error and `connectMQTT`
 * rethrows the same instance.
 * @param error - Error thrown by `connectMQTT()`.
 * @returns `true` for the no-groups conflict.
 */
function isNoGroupsConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { status?: unknown }).status === HTTP_STATUS_CONFLICT
  );
}

/**
 * Silence after which a client that still says "connected" is treated as a
 * dead socket when the internet comes back: two 40 s keep-alives. (The router
 * can lose the internet while Wi-Fi stays up, and the socket dies quietly.)
 */
const MQTT_SILENT_SOCKET_MS = 80_000;

/** When MQTT last connected or delivered a message. */
let lastMqttActivityAt = 0;
let mqttActivityTrackingInstalled = false;

/** Watchdog retry wait while MQTT is down: 5 s, 10 s, then every 20 s. */
const MQTT_WATCHDOG_RETRY_FIRST_MS = 5_000;
const MQTT_WATCHDOG_RETRY_MAX_MS = 20_000;

/** How long a forced reconnect may run before the UI shows MQTT as down. */
const MQTT_UI_DOWN_GRACE_MS = 3_000;

/**
 * Flags MQTT as down for the UI after the grace period unless cancelled.
 * @returns Cancels the pending flag.
 */
function markTransportDownAfterGrace(): () => void {
  const timer = setTimeout(() => {
    mqttTransportUiState.setConnected(false);
  }, MQTT_UI_DOWN_GRACE_MS);
  return () => clearTimeout(timer);
}

/**
 * Whether the sign-in session this user's MQTT was started in is still on.
 * @param esprmneoUser - RMNeo user.
 * @returns False after logout or an SDK switch, so nothing reconnects for it.
 */
function isUserSessionActive(esprmneoUser: ESPRMNeoUser): boolean {
  const sessionId = sessionIdByUser.get(esprmneoUser);
  return sessionId !== undefined && isSessionActive(sessionId);
}

/**
 * Ends any native MQTT session or connect still running. Never throws.
 */
async function dropNativeConnect(): Promise<void> {
  try {
    await withTimeout(
      ESPMQTTAdapter.disconnect(),
      MQTT_DROP_CONNECT_TIMEOUT_MS,
      "MQTT disconnect gave no answer",
    );
  } catch (error) {
    console.warn(
      "[rmneoMqttConnection] Forced MQTT disconnect failed (continuing):",
      error,
    );
  }
}

/**
 * One `connectMQTT()` with a time limit.
 * @param esprmneoUser - Authenticated RMNeo user.
 * @returns The SDK MQTT connection result.
 */
function connectMQTTOnce(esprmneoUser: ESPRMNeoUser): Promise<unknown> {
  return withTimeout(
    esprmneoUser.connectMQTT(),
    MQTT_CONNECT_ATTEMPT_TIMEOUT_MS,
    `connectMQTT gave no answer within ${MQTT_CONNECT_ATTEMPT_TIMEOUT_MS / 1000} s`,
  );
}

/**
 * Connects MQTT with bounded retries for transient cloud failures.
 * @param esprmneoUser - Authenticated RMNeo user.
 * @returns The SDK MQTT connection result.
 */
async function connectMQTTWithRetries(
  esprmneoUser: ESPRMNeoUser,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MQTT_CONNECT_MAX_ATTEMPTS; attempt++) {
    try {
      return await connectMQTTOnce(esprmneoUser);
    } catch (error) {
      lastError = error;
      if (isNoGroupsConflict(error)) {
        // Expected for a first sign-in with no home yet. The default-home
        // creation in syncHomeWithNodes reconnects once a group exists.
        console.info(
          "[startRmneoMqttConnection] user has no groups yet; deferring MQTT until a home exists",
        );
        break;
      }
      // A warning, not an error: while offline this repeats every watchdog
      // round, and an error is a red overlay in debug builds.
      console.warn(
        `[startRmneoMqttConnection] connectMQTT attempt ${attempt}/${MQTT_CONNECT_MAX_ATTEMPTS} failed:`,
        error,
      );
      if (attempt < MQTT_CONNECT_MAX_ATTEMPTS) {
        await delay(MQTT_CONNECT_RETRY_DELAY_MS * attempt);
      }
      if (!isUserSessionActive(esprmneoUser)) {
        break;
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
 * @param esprmneoUser - Authenticated RMNeo user.
 * @returns Shared MQTT startup promise for this user. It never rejects.
 */
export function startRmneoMqttConnection(
  esprmneoUser: ESPRMNeoUser,
): Promise<unknown> {
  sessionIdByUser.set(esprmneoUser, getSessionId());
  allowMqttConnects();
  return connectAndWatch(esprmneoUser);
}

/**
 * Connects MQTT, or returns the connect already started for this user. On
 * success it starts the watchdog and listeners that bring MQTT back after a
 * drop; on failure it starts them too, so retrying goes on in the background.
 * @param esprmneoUser - Authenticated RMNeo user.
 * @returns The connect's promise. It never rejects.
 */
function connectAndWatch(esprmneoUser: ESPRMNeoUser): Promise<unknown> {
  const existing = mqttConnectionByUser.get(esprmneoUser);
  if (existing) {
    return existing.promise;
  }
  if (!isUserSessionActive(esprmneoUser)) {
    return Promise.resolve();
  }

  // The entry stays after a success and goes after a failure, so a later
  // caller (e.g. the next resync) tries again fresh instead of being stuck
  // with a cached failure.
  const promise = connectMQTTWithRetries(esprmneoUser).then(
    () => {
      connect.settled = true;
      if (!isUserSessionActive(esprmneoUser)) {
        return;
      }
      ensureUpdateAcceptedCdfBridge();
      trackMqttActivity();
      startRecoveryWatchers(esprmneoUser, MQTT_WATCHDOG_INTERVAL_MS);
      mqttTransportUiState.setConnected(true);
    },
    (error) => {
      connect.settled = true;
      if (!isNoGroupsConflict(error)) {
        console.warn(
          "[startRmneoMqttConnection] Failed to connect MQTT after retries:",
          error,
        );
      }
      if (mqttConnectionByUser.get(esprmneoUser) === connect) {
        mqttConnectionByUser.delete(esprmneoUser);
      }
      if (!isUserSessionActive(esprmneoUser)) {
        return;
      }
      mqttTransportUiState.setConnected(false);
      startRecoveryWatchers(esprmneoUser, MQTT_WATCHDOG_RETRY_FIRST_MS);
    },
  );
  const connect: MqttConnect = { promise, settled: false };
  mqttConnectionByUser.set(esprmneoUser, connect);
  return promise;
}

/**
 * Waits for a connect that is still running for this user, if any.
 * @param esprmneoUser - RMNeo user.
 * @returns True when there was one to wait for.
 */
async function waitForRunningConnect(
  esprmneoUser: ESPRMNeoUser,
): Promise<boolean> {
  const running = mqttConnectionByUser.get(esprmneoUser);
  if (!running || running.settled) {
    return false;
  }
  await running.promise;
  return true;
}

/**
 * Starts what brings MQTT back after it drops: the watchdog, the native
 * status listener, the resume listener and the internet-back listener. Each
 * starts once per user.
 * @param esprmneoUser - RMNeo user whose transport is watched.
 * @param firstWatchdogCheckMs - Wait before the watchdog's first check.
 */
function startRecoveryWatchers(
  esprmneoUser: ESPRMNeoUser,
  firstWatchdogCheckMs: number,
): void {
  startReconnectWatchdog(esprmneoUser, firstWatchdogCheckMs);
  startConnectionStatusListener(esprmneoUser);
  startAppStateResumeListener(esprmneoUser);
  startInternetBackListener(esprmneoUser);
}

/**
 * Notes the time of each connect and message, to spot a dead socket that
 * still says "connected". Installed once for the app process.
 */
function trackMqttActivity(): void {
  lastMqttActivityAt = Date.now();
  if (mqttActivityTrackingInstalled) {
    return;
  }
  addMqttMessageHook(() => {
    lastMqttActivityAt = Date.now();
  });
  mqttActivityTrackingInstalled = true;
}

/**
 * When the internet comes back, reconnects at once instead of waiting for
 * the watchdog's next slot (up to 20 s away).
 * @param esprmneoUser - RMNeo user whose transport is watched.
 */
function startInternetBackListener(esprmneoUser: ESPRMNeoUser): void {
  if (internetBackUnsubByUser.has(esprmneoUser)) {
    return;
  }
  const unsubscribe = onInternetBack(() => {
    void reconnectAfterInternetBack(esprmneoUser);
  });
  internetBackUnsubByUser.set(esprmneoUser, unsubscribe);
}

/**
 * Internet is back: checks MQTT now. A client that says "connected" but has
 * been silent for over two keep-alives is rebuilt, since its socket most
 * likely died while the internet was gone.
 * @param esprmneoUser - RMNeo user whose transport is watched.
 */
async function reconnectAfterInternetBack(
  esprmneoUser: ESPRMNeoUser,
): Promise<void> {
  if (!isUserSessionActive(esprmneoUser)) {
    return;
  }
  const silentForMs = Date.now() - lastMqttActivityAt;
  if (
    silentForMs > MQTT_SILENT_SOCKET_MS &&
    (await ESPMQTTAdapter.isConnected().catch(() => false))
  ) {
    console.warn(
      `[rmneoMqttConnection] Internet is back but MQTT has been silent for ${Math.round(silentForMs / 1000)} s; reconnecting`,
    );
    await forceRmneoMqttReconnectOnResume(esprmneoUser).catch((error) => {
      console.warn(
        "[rmneoMqttConnection] internet-back reconnect failed:",
        error,
      );
    });
    return;
  }
  checkWatchdogNow(esprmneoUser);
}

/**
 * Removes the per-user internet-back listener.
 * @param esprmneoUser - RMNeo user whose listener is cleared.
 */
function stopInternetBackListener(esprmneoUser: ESPRMNeoUser): void {
  internetBackUnsubByUser.get(esprmneoUser)?.();
  internetBackUnsubByUser.delete(esprmneoUser);
}

/**
 * Clears the per-user MQTT start promise and stops its watchdog after logout.
 * Also ends the native client and refuses connects until the next sign-in, so
 * a connect still waiting on the network (even one this file already gave up
 * on) cannot come up for the signed-out user.
 * @param esprmneoUser - RMNeo user whose connection state is cleared.
 */
export function clearRmneoMqttConnection(esprmneoUser: ESPRMNeoUser): void {
  stopRecovery(esprmneoUser);
  void refuseMqttConnects();
}

/**
 * Stops everything that reconnects MQTT for this user. Leaves the native
 * client alone: by now it may belong to the next signed-in user.
 * @param esprmneoUser - RMNeo user whose recovery is stopped.
 */
function stopRecovery(esprmneoUser: ESPRMNeoUser): void {
  // Also stops a connect still running from starting anything afterwards.
  sessionIdByUser.delete(esprmneoUser);
  mqttConnectionByUser.delete(esprmneoUser);
  reconnectInFlightByUser.delete(esprmneoUser);
  stopReconnectWatchdog(esprmneoUser);
  stopConnectionStatusListener(esprmneoUser);
  stopAppStateResumeListener(esprmneoUser);
  stopInternetBackListener(esprmneoUser);
}

/**
 * Starts a background check (once per user) that reconnects MQTT whenever
 * it is down: every 15 s while it is up; while it is down, again after 5 s,
 * 10 s, then every 20 s until it is back. Stops when the session ends.
 * @param esprmneoUser - RMNeo user whose connection is watched.
 * @param firstCheckMs - Wait before the first check.
 */
function startReconnectWatchdog(
  esprmneoUser: ESPRMNeoUser,
  firstCheckMs: number,
): void {
  if (watchdogByUser.has(esprmneoUser)) {
    return;
  }
  const watchdog: ReconnectWatchdog = {
    failedChecks: 0,
    stopped: false,
    checking: false,
    checkAgainAtOnce: false,
  };
  watchdogByUser.set(esprmneoUser, watchdog);
  scheduleWatchdogCheck(esprmneoUser, watchdog, firstCheckMs);
}

/**
 * Runs the watchdog's next check after `waitMs`.
 * @param esprmneoUser - RMNeo user whose connection is watched.
 * @param watchdog - This user's watchdog.
 * @param waitMs - Wait before the check.
 */
function scheduleWatchdogCheck(
  esprmneoUser: ESPRMNeoUser,
  watchdog: ReconnectWatchdog,
  waitMs: number,
): void {
  watchdog.timer = setTimeout(() => {
    void runWatchdogCheck(esprmneoUser, watchdog);
  }, waitMs);
}

/**
 * One watchdog check: reconnects if MQTT is down, then picks the wait
 * before the next check.
 * @param esprmneoUser - RMNeo user whose connection is watched.
 * @param watchdog - This user's watchdog.
 */
async function runWatchdogCheck(
  esprmneoUser: ESPRMNeoUser,
  watchdog: ReconnectWatchdog,
): Promise<void> {
  if (watchdog.stopped) {
    return;
  }
  if (!isUserSessionActive(esprmneoUser)) {
    stopRecovery(esprmneoUser);
    return;
  }
  watchdog.checking = true;
  let connected = false;
  try {
    await ensureRmneoMqttConnected(esprmneoUser);
    connected = await ESPMQTTAdapter.isConnected();
  } catch (error) {
    console.warn(
      "[rmneoMqttConnection] watchdog reconnect check failed:",
      error,
    );
  }
  watchdog.checking = false;
  if (watchdog.stopped) {
    return;
  }
  const checkAgainAtOnce = watchdog.checkAgainAtOnce && !connected;
  watchdog.checkAgainAtOnce = false;
  watchdog.failedChecks =
    connected || checkAgainAtOnce ? 0 : watchdog.failedChecks + 1;
  scheduleWatchdogCheck(
    esprmneoUser,
    watchdog,
    connected
      ? MQTT_WATCHDOG_INTERVAL_MS
      : checkAgainAtOnce
        ? 0
        : watchdogRetryWait(watchdog.failedChecks),
  );
}

/**
 * Runs the watchdog's check now instead of at its next slot, and starts its
 * waits again from the shortest. A check already running is followed by
 * another one at once if it fails. Goes through the same reconnect lock.
 * @param esprmneoUser - RMNeo user whose connection is watched.
 */
function checkWatchdogNow(esprmneoUser: ESPRMNeoUser): void {
  const watchdog = watchdogByUser.get(esprmneoUser);
  if (!watchdog || watchdog.stopped || !isUserSessionActive(esprmneoUser)) {
    return;
  }
  console.log(
    "[rmneoMqttConnection] Internet is back; checking MQTT now",
  );
  if (watchdog.checking) {
    watchdog.checkAgainAtOnce = true;
    return;
  }
  clearTimeout(watchdog.timer);
  watchdog.failedChecks = 0;
  void runWatchdogCheck(esprmneoUser, watchdog);
}

/**
 * Wait before the next watchdog check after `failedChecks` failed checks in
 * a row: doubles from 5 s up to 20 s.
 * @param failedChecks - Failed checks in a row (1 or more).
 * @returns Wait in milliseconds.
 */
function watchdogRetryWait(failedChecks: number): number {
  return Math.min(
    MQTT_WATCHDOG_RETRY_FIRST_MS * 2 ** (failedChecks - 1),
    MQTT_WATCHDOG_RETRY_MAX_MS,
  );
}

/**
 * Stops the reconnect watchdog for an RMNeo user.
 * @param esprmneoUser - RMNeo user whose watchdog is stopped.
 */
function stopReconnectWatchdog(esprmneoUser: ESPRMNeoUser): void {
  const watchdog = watchdogByUser.get(esprmneoUser);
  if (watchdog) {
    watchdog.stopped = true;
    clearTimeout(watchdog.timer);
    watchdogByUser.delete(esprmneoUser);
  }
}

/**
 * Subscribes once per user to native MQTT transport status so disconnect
 * triggers reconnect promptly (watchdog remains the fallback).
 * @param esprmneoUser - RMNeo user whose transport is watched.
 */
function startConnectionStatusListener(esprmneoUser: ESPRMNeoUser): void {
  if (connectionListenerUnsubByUser.has(esprmneoUser)) {
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
    ensureRmneoMqttConnected(esprmneoUser).catch((error) => {
      console.warn(
        "[MQTT_CONN_CB] push-driven reconnect failed:",
        error,
      );
    });
  });
  connectionListenerUnsubByUser.set(esprmneoUser, unsubscribe);
}

/**
 * Removes the per-user MQTT connection-status listener.
 * @param esprmneoUser - RMNeo user whose listener is cleared.
 */
function stopConnectionStatusListener(esprmneoUser: ESPRMNeoUser): void {
  const unsubscribe = connectionListenerUnsubByUser.get(esprmneoUser);
  if (unsubscribe) {
    unsubscribe();
    connectionListenerUnsubByUser.delete(esprmneoUser);
  }
}

/**
 * On foreground resume after background/inactive, force-tears down MQTT and
 * reconnects. Native `isConnected` can stay stale after Wi-Fi changes while
 * backgrounded; a soft ensure would no-op.
 * @param esprmneoUser - RMNeo user whose transport is watched.
 */
function startAppStateResumeListener(esprmneoUser: ESPRMNeoUser): void {
  if (appStateUnsubByUser.has(esprmneoUser)) {
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
      forceRmneoMqttReconnectOnResume(esprmneoUser).catch((error) => {
        console.warn(
          "[rmneoMqttConnection] resume-driven MQTT reconnect failed:",
          error,
        );
      });
    },
  );
  appStateUnsubByUser.set(esprmneoUser, () => subscription.remove());
}

/**
 * Removes the per-user AppState resume listener.
 * @param esprmneoUser - RMNeo user whose listener is cleared.
 */
function stopAppStateResumeListener(esprmneoUser: ESPRMNeoUser): void {
  const unsubscribe = appStateUnsubByUser.get(esprmneoUser);
  if (unsubscribe) {
    unsubscribe();
    appStateUnsubByUser.delete(esprmneoUser);
  }
}

/**
 * If the transport is disconnected, reconnects with fresh credentials and
 * re-subscribes every known node so live shadow updates resume. Concurrent
 * callers share the same in-flight attempt.
 * @param esprmneoUser - RMNeo user whose MQTT connection is ensured.
 * @returns Promise settled after the connection check or reconnect.
 */
export function ensureRmneoMqttConnected(
  esprmneoUser: ESPRMNeoUser,
): Promise<void> {
  if (!isUserSessionActive(esprmneoUser)) {
    return Promise.resolve();
  }
  return runExclusiveMqttReconnect(esprmneoUser, () =>
    ensureRmneoMqttConnectedOnce(esprmneoUser),
  );
}

/**
 * Forces MQTT teardown + reconnect + resubscribe after app resume.
 * Does not trust native `isConnected` (may be stale after background network changes).
 * If another reconnect is already running, waits for it then still force-reconnects
 * so a soft ensure that early-returned on a stale CONNECTED flag cannot skip work.
 * @param esprmneoUser - RMNeo user whose MQTT session is rebuilt.
 * @param options - Reconnect options (see {@link RmneoMqttReconnectOptions}).
 * @returns Promise settled after the forced reconnect attempt.
 */
export function forceRmneoMqttReconnectOnResume(
  esprmneoUser: ESPRMNeoUser,
  options?: RmneoMqttReconnectOptions,
): Promise<void> {
  if (!isUserSessionActive(esprmneoUser)) {
    return Promise.resolve();
  }
  const prior = reconnectInFlightByUser.get(esprmneoUser);
  const promise = (async () => {
    if (prior) {
      await prior.catch(() => {});
    }
    await withReconnectTimeLimit(
      forceRmneoMqttReconnectOnce(esprmneoUser, options),
    );
  })().finally(() => {
    if (reconnectInFlightByUser.get(esprmneoUser) === promise) {
      reconnectInFlightByUser.delete(esprmneoUser);
    }
  });
  reconnectInFlightByUser.set(esprmneoUser, promise);
  return promise;
}

/**
 * Re-vends MQTT credentials after the user's home membership changed
 * (share accepted, home created). The assume-role IoT policy is scoped to
 * membership at vend time, so the existing connection cannot subscribe to or
 * publish for a home gained mid-session, and {@link ensureRmneoMqttConnected}
 * would no-op because the transport is still connected.
 *
 * Callers await this before syncing so the new home's nodes subscribe under
 * the fresh policy. Never throws: a failed reconnect must not fail the
 * accept / create that already succeeded server-side (the watchdog and
 * resume paths retry later).
 * @param esprmneoUser - RMNeo user whose membership changed.
 * @param reason - Short tag for the warning log (e.g. `share.accept`).
 * @param options - Pass `{ resubscribe: false }` when the caller runs a full
 *   sync right after, so existing nodes are not subscribed twice.
 */
export async function refreshRmneoMqttCredentials(
  esprmneoUser: ESPRMNeoUser,
  reason: string,
  options?: RmneoMqttReconnectOptions,
): Promise<void> {
  try {
    await forceRmneoMqttReconnectOnResume(esprmneoUser, options);
  } catch (error) {
    console.warn(
      `[rmneoMqttConnection] membership-change reconnect (${reason}) failed; watchdog/resume will retry:`,
      error,
    );
  }
}

/**
 * Runs a reconnect task exclusively per user (shared in-flight promise).
 * The lock is always let go, even when the task never finishes.
 * @param esprmneoUser - RMNeo user scoped for dedupe.
 * @param task - Reconnect work to run.
 */
function runExclusiveMqttReconnect(
  esprmneoUser: ESPRMNeoUser,
  task: () => Promise<void>,
): Promise<void> {
  const inFlight = reconnectInFlightByUser.get(esprmneoUser);
  if (inFlight) {
    return inFlight;
  }

  const promise = withReconnectTimeLimit(task()).finally(() => {
    if (reconnectInFlightByUser.get(esprmneoUser) === promise) {
      reconnectInFlightByUser.delete(esprmneoUser);
    }
  });
  reconnectInFlightByUser.set(esprmneoUser, promise);
  return promise;
}

/**
 * Gives up waiting on one reconnect after {@link MQTT_RECONNECT_TIMEOUT_MS}.
 * @param reconnect - The reconnect's promise.
 * @returns The same outcome, or a rejection once the time is up.
 */
function withReconnectTimeLimit(reconnect: Promise<void>): Promise<void> {
  return withTimeout(
    reconnect,
    MQTT_RECONNECT_TIMEOUT_MS,
    `MQTT reconnect took over ${MQTT_RECONNECT_TIMEOUT_MS / 1000} s; letting the next one run`,
  );
}

/**
 * Performs one MQTT connection check and resubscription cycle.
 * @param esprmneoUser - RMNeo user whose connection is checked.
 */
async function ensureRmneoMqttConnectedOnce(
  esprmneoUser: ESPRMNeoUser,
): Promise<void> {
  if (await ESPMQTTAdapter.isConnected()) {
    mqttTransportUiState.setConnected(true);
    return;
  }

  mqttTransportUiState.setConnected(false);
  // A connect already running (e.g. the first one after sign-in) is joined,
  // so two never run side by side.
  if (!(await waitForRunningConnect(esprmneoUser))) {
    if (!isUserSessionActive(esprmneoUser)) {
      return;
    }
    console.warn(
      "[rmneoMqttConnection] MQTT transport reports disconnected; reconnecting with fresh credentials",
    );
    // Ends a native client still "connecting" with old credentials (iOS
    // answers a connect at once in that state), so fresh ones are used.
    await dropNativeConnect();
    mqttConnectionByUser.delete(esprmneoUser);
    await connectAndWatch(esprmneoUser);
  }
  await finishReconnectWithResubscribe();
}

/**
 * Tears down any native MQTT session, reconnects with fresh credentials, and
 * resubscribes. Used on AppState resume when the CONNECTED flag may be stale.
 * @param esprmneoUser - RMNeo user whose session is rebuilt.
 * @param options - Reconnect options (see {@link RmneoMqttReconnectOptions}).
 */
async function forceRmneoMqttReconnectOnce(
  esprmneoUser: ESPRMNeoUser,
  options?: RmneoMqttReconnectOptions,
): Promise<void> {
  // Do not flag MQTT down right away: a quick reconnect should not flash
  // "Unreachable" on every card. The timer covers a slow one.
  const cancelGrace = markTransportDownAfterGrace();
  try {
    // Lets a connect already running finish first, so two never overlap.
    await waitForRunningConnect(esprmneoUser);
    if (!isUserSessionActive(esprmneoUser)) {
      return;
    }
    console.warn(
      "[rmneoMqttConnection] Forcing MQTT disconnect before resume reconnect",
    );
    // Bypass SDK disconnectMQTT's isConnected guard so CONNECTING/stale
    // CONNECTED native state cannot block a fresh connect().
    await dropNativeConnect();
    mqttConnectionByUser.delete(esprmneoUser);
    await connectAndWatch(esprmneoUser);
    await finishReconnectWithResubscribe(options);
  } finally {
    cancelGrace();
  }
}

/**
 * After a reconnect attempt, resets node registrations when the transport is
 * up and, unless `options.resubscribe` is `false`, subscribes the store's
 * nodes again.
 *
 * The reset always runs: the forced disconnect dropped every wire
 * subscription, but the SDK orchestrator still marks each shadow as
 * subscribed. Unsubscribing every node clears that flag so the next
 * subscribe (here, or in the caller's sync) actually reaches the broker.
 * @param options - Reconnect options (see {@link RmneoMqttReconnectOptions}).
 */
async function finishReconnectWithResubscribe(
  options?: RmneoMqttReconnectOptions,
): Promise<void> {
  const reconnected = await ESPMQTTAdapter.isConnected();
  console.log(
    `[rmneoMqttConnection] reconnect attempt finished, connected=${reconnected}`,
  );
  if (!reconnected) {
    // A reconnect that ends disconnected must flag MQTT down here.
    mqttTransportUiState.setConnected(false);
    return;
  }

  // A home may still be subscribing its nodes meanwhile; subscribes and
  // unsubscribes run in one queue per user. So the registration reset goes
  // first, the unsubscribe-all waits for any subscribe already queued, and
  // the node list is read again after it: a node subscribed meanwhile is
  // kept or subscribed again, never left out.
  const cdfUser = ESPCDF.instance?.userStore?.user;
  const resetNodeIds = (ESPCDF.instance?.nodeStore?.nodesList ?? []).map(
    (node) => node.id,
  );
  await resetMqttNodeRegistrations(resetNodeIds);
  await cdfUser?.unsubscribeFromNodeUpdates?.().catch(() => {});
  const nodesList = ESPCDF.instance?.nodeStore?.nodesList ?? [];

  if (options?.resubscribe === false) {
    console.log(
      `[rmneoMqttConnection] reset ${resetNodeIds.length} node registration(s); caller's sync re-subscribes`,
    );
  } else if (cdfUser && nodesList.length > 0) {
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
 * Vendored rainmaker-neo-base-sdk 1.2.0's NodeMQTTOrchestrator subscribes to
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

  // The Matter adaptor may drop what a live Matter link already carries.
  const filtered = filterCloudUpdate(nodeId, parsed as CloudShadowDocument);
  if (filtered) {
    projectShadowDocumentToCdf(nodeId, filtered);
  }
}

