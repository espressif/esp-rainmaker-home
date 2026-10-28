/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPMatterSubscriptionAdapterInterface,
  ESPMatterDeviceUpdate,
} from "../contracts/matter";
import { ESPMatterControlAdapter } from "./ESPMatterControlAdapter";
import { isMatterOperationalNodeIdHex } from "@shared/utils/matterNodeIdHex";
import {
  getSessionId,
  isSessionActive,
  onSessionEnd,
} from "@shared/utils/userSession";

/**
 * JS adapter that satisfies the subscription-channel contract
 * `ESPMatterSubscriptionAdapterInterface` (`subscribeToDevice` / `unsubscribeFromDevice` /
 * `isDeviceReachable` / `initialize` / `dispose`) on top of the lower-level
 * `ESPMatterControlAdapter.subscribe` primitive. The Neo SDK no longer requires
 * `isDeviceReachable`; it stays because the classic SDK and the app contract
 * still do, and one adapter object serves both stacks.
 *
 * Translates the SDK's `(rmNodeId, fabricId)` shape into a Matter operational
 * `matterNodeId` via an in-memory registry populated by the commissioning /
 * discovery pipeline. The registry decouples this adapter from the data
 * store and lets early subscribe attempts gracefully no-op until the
 * mapping is known.
 *
 * Subscription paths are derived per-node from the device's advertised
 * `metadata.Matter.endpoints` clusters (see {@link clusterAttributePaths}),
 * so we only subscribe to attributes the device actually exposes. The
 * Light-only fallback below is only used until metadata is registered for
 * a node — typically just the first frame after fresh commissioning.
 */

const DEFAULT_MIN_INTERVAL_SEC = 1;
const DEFAULT_MAX_INTERVAL_SEC = 30;

/**
 * CHIP error codes that mean "the subscribe attempt was racing another
 * CASE-session-establishing operation; try again in a moment". They are
 * transient by definition and cleared by retrying. Hex strings are used
 * because the native `result.error` is the raw CHIP error message string.
 *
 * - `0x000000DB` — `CHIP_ERROR_BUSY`: device replied with a `BUSY`
 *   {@link https://github.com/project-chip/connectedhomeip status report},
 *   typically with a `minimum wait time: 5000 ms`. Happens when our own
 *   discovery probe and subscribe path both create a {@link ChipClient}
 *   at the same time and the device is still tearing down the first
 *   half-finished CASE handshake.
 * - `0x00000074` — `CHIP_ERROR_CANCELLED`: our local controller was
 *   re-initialised (e.g. `Device Controller Factory already initialized`)
 *   while a CASE handshake was in flight, so the in-flight session was
 *   released. Retrying is fine because the new controller can immediately
 *   open a fresh session.
 * - `0x00000032` — `CHIP_ERROR_TIMEOUT`: occasional UDP retransmit
 *   exhaustion on the discovery side. Cheap to retry once.
 */
const TRANSIENT_SUBSCRIBE_ERRORS = [
  "0x000000DB",
  "0x00000074",
  "0x00000032",
];

/** Retry parameters tuned to the customer firmware's BUSY wait of 5000ms. */
const SUBSCRIBE_RETRY_MAX_ATTEMPTS = 4;
const SUBSCRIBE_RETRY_BACKOFF_MS = [800, 2_500, 6_000];
/**
 * A live link sends something at least every report interval (30 s), so one
 * silent for two intervals is treated as down: the native side can drop the
 * controller without reporting it.
 */
const MATTER_LINK_QUIET_LIMIT_MS = 60_000;

/**
 * @returns `true` when `error` is a CHIP error string we want to retry.
 */
function isTransientSubscribeError(error: string | undefined): boolean {
  if (!error) return false;
  const upper = error.toUpperCase();
  return TRANSIENT_SUBSCRIBE_ERRORS.some((code) =>
    upper.includes(code.toUpperCase()),
  );
}

/** Promise-friendly sleep used by the subscribe retry loop. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface AttributePath {
  endpoint: number;
  clusterId: number;
  /**
   * Concrete attribute id, or `undefined` to request a *cluster-wildcard*
   * subscription (i.e. "all attributes on this cluster"). The native
   * subscribe shim translates an absent `attributeId` into
   * `ChipPathId.forWildcard()` and the device serialises whatever it
   * actually exposes — exactly the way Google Home / chip-tool subscribe.
   *
   * Wildcard is needed for clusters where the customer firmware has the
   * "concrete-path-rejects-but-wildcard-serialises" quirk we observed on
   * the RVC PowerSource cluster (0x002F): every explicit attribute path
   * comes back with `status=0x86 UnsupportedAttribute`, but the same FW
   * happily reports `BatPercentRemaining` under wildcard expansion.
   */
  attributeId?: number;
}

/**
 * Endpoint summary used to derive subscription paths for a node. Mirrors
 * the shape of `ESPRMMatterMetadataInterface.endpoints` from the Matter
 * SDK without taking a hard dependency on it — as with the adapter contracts
 * in `../contracts/matter`, this adapter must not import @espressif/*.
 */
interface MatterEndpointSummary {
  /** Application endpoint id (1, 2, …). */
  endpointId: number;
  /** Set of server cluster ids hosted on this endpoint. */
  serverClusters: number[];
}

/**
 * Sentinel used in {@link CLUSTER_DEFAULT_ATTRIBUTES} to request a
 * cluster-wildcard subscription instead of a list of concrete attribute
 * ids. See {@link AttributePath.attributeId} for why this is needed.
 */
const CLUSTER_WILDCARD = "*" as const;
type ClusterAttributeEntry = number | typeof CLUSTER_WILDCARD;

/**
 * Per-cluster set of attributes worth subscribing to for live UI state.
 * Keep narrow: only attributes that change at runtime and that some panel
 * actually consumes today (or imminently). Adding more is cheap once the
 * matching panel exists.
 *
 * Use {@link CLUSTER_WILDCARD} (`"*"`) as the sole entry to subscribe to
 * the entire cluster — required for FW that rejects concrete paths but
 * serialises attributes under wildcard expansion.
 *
 * Cluster ids are decimal in the map key (numeric for fast lookup); the
 * comments use Matter's hex convention.
 */
const CLUSTER_DEFAULT_ATTRIBUTES: Readonly<
  Record<number, readonly ClusterAttributeEntry[]>
> = {
  // -- Light --
  [0x0006]: [0x0000], // OnOff: OnOff
  [0x0008]: [0x0000], // LevelControl: CurrentLevel
  // ColorControl: Hue / Saturation / CurrentX / CurrentY / ColorTemperatureMireds.
  // CurrentX/CurrentY feed the XY color bridge on lights whose FW exposes
  // XY|CT without HS (the pure Matter light example); FW that lacks any of
  // these attributes simply never reports them.
  [0x0300]: [0x0000, 0x0001, 0x0003, 0x0004, 0x0007],

  // -- Robotic Vacuum Cleaner --
  [0x0054]: [0x0001], // RvcRunMode: CurrentMode
  [0x0055]: [0x0001], // RvcCleanMode: CurrentMode
  [0x0060]: [0x0001, 0x0004], // OperationalState: CurrentPhase / OperationalState
  [0x0061]: [0x0001, 0x0004], // RvcOperationalState: CurrentPhase / OperationalState

  // -- Door / Window --
  [0x0101]: [0x0000], // DoorLock: LockState
  [0x0102]: [0x0008, 0x0009], // WindowCovering: Lift / Tilt CurrentPositionPercent100ths

  // -- Thermostat --
  [0x0201]: [0x0000, 0x001c, 0x0029], // Thermostat: LocalTemperature / SystemMode / ThermostatRunningState

  // -- Sensors --
  // PowerSource (0x002F): subscribe to BatPercentRemaining (0x000C), the
  // spec-defined attribute for battery percentage and the only PowerSource
  // attribute the UI consumes today (cluster.config.ts → "Battery"
  // valueAttribute: 12). The device advertises 0x000C under cluster 0x2F
  // on its commissioning metadata, so the path is concrete-correct.
  //
  // Caveat — earlier probing on the customer RVC FW (vendor 0x6006) showed
  // PowerSource attributes only serialise under wildcard expansion, not
  // concrete-path resolution (returned `status=0x86 UnsupportedAttribute`
  // for 0x0B / 0x0E / 0x12 explicit subscribes).
  [0x002f]: [0x000c],
  [0x0400]: [0x0000], // IlluminanceMeasurement: MeasuredValue
  [0x0402]: [0x0000], // TemperatureMeasurement: MeasuredValue
  [0x0405]: [0x0000], // RelativeHumidityMeasurement: MeasuredValue
  [0x0406]: [0x0000], // OccupancySensing: Occupancy
  [0x0500]: [0x0002], // IasZone: ZoneStatus
};

/**
 * Light-only fallback used when a node has no registered metadata yet —
 * matches the SDK's `transformMatterToRainmaker` default mapping so an
 * early subscribe still surfaces Power/Brightness/Color reports.
 */
const FALLBACK_ATTRIBUTE_PATHS: AttributePath[] = [
  { endpoint: 1, clusterId: 0x0006, attributeId: 0x0000 },
  { endpoint: 1, clusterId: 0x0008, attributeId: 0x0000 },
  { endpoint: 1, clusterId: 0x0300, attributeId: 0x0000 },
  { endpoint: 1, clusterId: 0x0300, attributeId: 0x0001 },
  { endpoint: 1, clusterId: 0x0300, attributeId: 0x0003 },
  { endpoint: 1, clusterId: 0x0300, attributeId: 0x0004 },
  { endpoint: 1, clusterId: 0x0300, attributeId: 0x0007 },
];

const rmNodeIdToMatterNodeId = new Map<string, string>();
const matterNodeIdToRmNodeId = new Map<string, string>();
const reachabilityByMatterNodeId = new Map<string, boolean>();
const matterEndpointsByRmNodeId = new Map<string, MatterEndpointSummary[]>();
const subscriptionUnsubscribers = new Map<string, () => void>();
/** Each node's current link: whether native says it is up, and when it last spoke. */
const subscriptionLinks = new Map<
  string,
  { live: boolean; heardAtMs: number }
>();
// A signed-out session's links say nothing about the next one.
onSessionEnd(() => subscriptionLinks.clear());
/** Told the node id each time a node's Matter link comes up. */
const linkLiveListeners = new Set<(nodeId: string) => void>();

/**
 * Calls `listener` with the node id each time a node's Matter link comes up
 * (first established or back after a drop).
 * @param listener - Receives the id the node was subscribed under
 * @returns Function that stops the calls
 */
function onMatterLinkLive(listener: (nodeId: string) => void): () => void {
  linkLiveListeners.add(listener);
  return () => {
    linkLiveListeners.delete(listener);
  };
}

/**
 * Tells every listener a node's link came up. Runs inside a native event, so
 * a listener that throws is only logged.
 * @param nodeId - Id the node was subscribed under
 */
function notifyLinkLive(nodeId: string): void {
  for (const listener of linkLiveListeners) {
    try {
      listener(nodeId);
    } catch (error) {
      console.warn(
        `[ESPMatterSubscriptionAdapter] link-live listener failed for nodeId=${nodeId}:`,
        error,
      );
    }
  }
}
/**
 * Counts unsubscribes per node. A subscribe still retrying when this changes
 * gives up; a newer subscribe does not cancel an older one, because the
 * classic SDK channel drops the node's callback when a subscribe fails.
 */
const unsubscribeCountByNodeId = new Map<string, number>();
/** Nodes whose report handler already failed once, so the log is not flooded. */
const reportFailureLoggedNodeIds = new Set<string>();

/**
 * Walks a node's endpoint summaries and produces the union of subscribable
 * attribute paths advertised by clusters known to {@link CLUSTER_DEFAULT_ATTRIBUTES}.
 * Endpoints are visited in ascending order so the resulting list is stable
 * across calls (helps native bridges that key sub-handles off path order).
 * @param endpoints - Endpoint summaries from `node.metadata.Matter.endpoints`.
 * @returns Attribute paths to subscribe to. May be empty if the device
 *   hosts no recognised clusters; caller should fall back accordingly.
 */
function clusterAttributePaths(
  endpoints: readonly MatterEndpointSummary[],
): AttributePath[] {
  const paths: AttributePath[] = [];
  const sorted = [...endpoints].sort(
    (left, right) => left.endpointId - right.endpointId,
  );
  for (const ep of sorted) {
    for (const clusterId of ep.serverClusters) {
      const attrs = CLUSTER_DEFAULT_ATTRIBUTES[clusterId];
      if (!attrs) continue;
      for (const entry of attrs) {
        if (entry === CLUSTER_WILDCARD) {
          // Cluster-wildcard: emit a single path with no attributeId.
          // Native subscribe shim translates this into
          // `ChipPathId.forWildcard()` for the attribute segment.
          paths.push({ endpoint: ep.endpointId, clusterId });
        } else {
          paths.push({
            endpoint: ep.endpointId,
            clusterId,
            attributeId: entry,
          });
        }
      }
    }
  }
  return paths;
}

/**
 * Resolves the attribute paths to subscribe to for a given rmNodeId.
 * Prefers metadata-derived paths; falls back to the Light-only set when
 * metadata has not been registered yet.
 * @param rmNodeId - Rainmaker node id.
 * @returns Subscription paths for that node.
 */
function resolveAttributePaths(rmNodeId: string): AttributePath[] {
  const endpoints = matterEndpointsByRmNodeId.get(rmNodeId);
  if (endpoints && endpoints.length > 0) {
    const derived = clusterAttributePaths(endpoints);
    if (derived.length > 0) return derived;
  }
  return FALLBACK_ATTRIBUTE_PATHS;
}

/**
 * Registers / replaces the rm↔matter id pair used by the subscription
 * adapter to translate `(rmNodeId, fabricId)` into a `matterNodeId`.
 * Optionally records the node's Matter endpoint summary so subscription
 * paths can be derived from advertised clusters.
 *
 * Call this whenever the commissioning / discovery pipeline learns
 * a new mapping, e.g. right after `extractRmMatterNodeIdPairsFromFabric`.
 * @param rmNodeId - Rainmaker node id from the SDK.
 * @param matterNodeId - Hex Matter operational node id.
 * @param endpoints - Optional endpoint summary used to derive subscription paths.
 */
function registerMatterNodeIdMapping(
  rmNodeId: string,
  matterNodeId: string,
  endpoints?: readonly MatterEndpointSummary[],
): void {
  if (!rmNodeId || !matterNodeId) return;
  const normalised = matterNodeId.toLowerCase();
  rmNodeIdToMatterNodeId.set(rmNodeId, normalised);
  matterNodeIdToRmNodeId.set(normalised, rmNodeId);
  if (endpoints && endpoints.length > 0) {
    matterEndpointsByRmNodeId.set(rmNodeId, [...endpoints]);
  }
}

/**
 * Bulk replace of the rm↔matter id table — useful when the home boots
 * up and we re-extract the pair list from the active fabric. Pairs may
 * carry a `matterEndpoints` summary; nodes that omit it keep the
 * Light-only fallback subscription set.
 * @param pairs - Iterable of `(rmNodeId, matterNodeId, matterEndpoints?)`.
 */
function syncMatterNodeIdMappings(
  pairs: Iterable<{
    nodeId: string;
    matterNodeId: string;
    matterEndpoints?: readonly MatterEndpointSummary[];
  }>,
): void {
  rmNodeIdToMatterNodeId.clear();
  matterNodeIdToRmNodeId.clear();
  matterEndpointsByRmNodeId.clear();
  for (const pair of pairs) {
    registerMatterNodeIdMapping(
      pair.nodeId,
      pair.matterNodeId,
      pair.matterEndpoints,
    );
  }
}

/**
 * The rm↔matter mapping is registered by discovery verification, which can run
 * only after the SDK's first subscribe (the node is built and subscribed as soon
 * as the group loads). A pure Matter node's RainMaker node id is its Matter node
 * id — the same rule the cloud uses to classify it — so fall back to that rather
 * than fail the subscribe and park it in a retry queue nothing flushes on Neo.
 * @param rmNodeId - Rainmaker node id from the SDK.
 * @returns The corresponding Matter operational node id, if known.
 */
function getMatterNodeIdForRmNodeId(rmNodeId: string): string | undefined {
  const registered = rmNodeIdToMatterNodeId.get(rmNodeId);
  if (registered) return registered;
  return isMatterOperationalNodeIdHex(rmNodeId)
    ? rmNodeId.toLowerCase()
    : undefined;
}

/**
 * Updates the local-network reachability flag for a Matter node. The
 * `MatterDiscoverAdapter` populates this from CHIP probe results so that
 * `isDeviceReachable` can answer without blocking on a fresh probe.
 * @param matterNodeId - Hex Matter operational node id.
 * @param reachable - Whether the node was last seen on the LAN.
 */
function setMatterNodeReachability(
  matterNodeId: string,
  reachable: boolean,
): void {
  reachabilityByMatterNodeId.set(matterNodeId.toLowerCase(), reachable);
}

/**
 * Whether a node's Matter subscription is up right now: the native layer
 * reported it established and has not reported a re-subscribe or an error
 * since, and it spoke within the last minute. False while a subscribe is
 * failing, re-subscribing or re-armed, after Matter shut down or the session
 * ended, and on platforms that do not report link state (the cloud then stays
 * the source).
 * @param nodeIds - Ids the node may be subscribed under (RainMaker or Matter id)
 * @returns True when one of the ids has a live subscription
 */
function isMatterSubscriptionLive(...nodeIds: (string | undefined)[]): boolean {
  const wanted = new Set<string>();
  for (const id of nodeIds) {
    if (!id) continue;
    wanted.add(id.toLowerCase());
    const matterNodeId = rmNodeIdToMatterNodeId.get(id);
    if (matterNodeId) wanted.add(matterNodeId.toLowerCase());
  }
  const now = Date.now();
  for (const [subscribedId, link] of subscriptionLinks) {
    if (
      link.live &&
      now - link.heardAtMs <= MATTER_LINK_QUIET_LIMIT_MS &&
      wanted.has(subscribedId.toLowerCase())
    ) {
      return true;
    }
  }
  return false;
}

const ESPMatterSubscriptionAdapter: ESPMatterSubscriptionAdapterInterface = {
  async initialize(): Promise<void> {
    // Native control adapter has its own `init` which is a no-op today;
    // call it for forward compatibility.
    await ESPMatterControlAdapter.init?.({
      fabricId: "",
      groupId: "",
    });
  },

  /**
   * Called by an SDK subscription channel when it is retired. The Neo SDK now
   * disposes the channel it replaces on every `configure()`, fire-and-forget,
   * so this can run while the replacement channel is already live. The retiring
   * channel unsubscribes its own nodes through `unsubscribeFromDevice` before
   * it gets here, so anything left in `subscriptionUnsubscribers` belongs to a
   * live channel and must survive. The native controller is shared by both
   * stacks and owned by commissioning; on Android `matterControlShutdown` drops
   * every native subscription and device pointer, which would silently kill the
   * new channel's subscriptions. Nothing to do here.
   */
  async dispose(): Promise<void> {},

  async subscribeToDevice(
    nodeId: string,
    fabricId: string,
    callback: (update: ESPMatterDeviceUpdate) => void,
  ): Promise<void> {
    const matterNodeId = getMatterNodeIdForRmNodeId(nodeId);
    if (!matterNodeId) {
      // Returning would report success and leave a callback that never fires.
      throw new Error(
        `[ESPMatterSubscriptionAdapter] subscribeToDevice: no matterNodeId for rmNodeId=${nodeId} fabricId=${fabricId}`,
      );
    }

    // `AttributePath.attributeId` is optional locally (cluster-wildcard
    // sentinel), while the SDK's `ESPMatterSubscribeAttribute.attributeId`
    // is `number`. The native subscribe shim handles the missing field by
    // emitting `ChipPathId.forWildcard()`, so the runtime contract is
    // satisfied; cast through `unknown` to keep TS quiet without widening
    // the SDK's public type.
    const paths = resolveAttributePaths(nodeId) as unknown as Parameters<
      typeof ESPMatterControlAdapter.subscribe
    >[1];
    const reportCallback = (report: {
      endpoint: number;
      clusterId: number;
      attributeId: number;
      value: unknown;
    }): void => {
      const link = subscriptionLinks.get(nodeId);
      if (link) link.heardAtMs = Date.now();
      // This runs inside a native event listener, where a throw is uncaught
      // and can end a release app; a bad report must only be dropped.
      try {
        callback({
          endpointId: report.endpoint,
          clusterId: report.clusterId,
          attributeId: report.attributeId,
          value: report.value,
        });
      } catch (error) {
        if (!reportFailureLoggedNodeIds.has(nodeId)) {
          reportFailureLoggedNodeIds.add(nodeId);
          console.warn(
            `[ESPMatterSubscriptionAdapter] report handler failed for nodeId=${nodeId}; dropping it:`,
            error,
          );
        }
      }
    };

    // A retry can outlive its request: the device gets unsubscribed or the
    // user logs out while it waits. Such a request stops, and closes any link
    // it opened, instead of leaving one that nobody owns.
    const sessionId = getSessionId();
    const unsubscribeCount = unsubscribeCountByNodeId.get(nodeId) ?? 0;
    const isStillWanted = (): boolean =>
      isSessionActive(sessionId) &&
      (unsubscribeCountByNodeId.get(nodeId) ?? 0) === unsubscribeCount;
    const cancelledError = (): Error =>
      new Error(
        `[ESPMatterSubscriptionAdapter] subscribeToDevice cancelled for nodeId=${nodeId}: no longer wanted`,
      );

    // Subscribe-with-retry. Post-login, the matter local discovery probe
    // and this subscribe path can both try to open a CASE session for the
    // same node at almost the same instant. The second one to call
    // `resolveChipClient` re-initialises the controller and the first
    // session gets released (`CHIP Error 0x00000074: cancelled`); when
    // the second one then sends its own Sigma1 the device is still
    // tearing down and replies `BUSY (0x000000DB, wait 5000ms)`. Both
    // are transient — retrying after a short backoff resolves the race
    // without surfacing the failure to the user.
    let lastError: string | undefined;
    for (
      let attempt = 0;
      attempt < SUBSCRIBE_RETRY_MAX_ATTEMPTS;
      attempt += 1
    ) {
      if (!isStillWanted()) throw cancelledError();
      // One per attempt, so a closed link's late news never marks the new one.
      const link = { live: false, heardAtMs: 0 };
      const result = await ESPMatterControlAdapter.subscribe(
        matterNodeId,
        paths,
        reportCallback,
        (live) => {
          const cameUp = live && !link.live;
          link.live = live;
          if (live) link.heardAtMs = Date.now();
          if (cameUp) notifyLinkLive(nodeId);
        },
      );

      if (!isStillWanted()) {
        if (result.success) result.unsubscribe?.();
        throw cancelledError();
      }

      if (result.success) {
        if (result.unsubscribe) {
          const previous = subscriptionUnsubscribers.get(nodeId);
          previous?.();
          subscriptionUnsubscribers.set(nodeId, result.unsubscribe);
          subscriptionLinks.set(nodeId, link);
        }
        if (attempt > 0) {
          console.log(
            `[ESPMatterSubscriptionAdapter] subscribeToDevice succeeded after ${
              attempt + 1
            } attempt(s) for nodeId=${nodeId} matterNodeId=${matterNodeId}`,
          );
        }
        return;
      }

      lastError = result.error ?? "unknown error";

      if (!isTransientSubscribeError(result.error)) {
        break;
      }

      const isLastAttempt = attempt === SUBSCRIBE_RETRY_MAX_ATTEMPTS - 1;
      if (isLastAttempt) {
        break;
      }

      const waitMs = SUBSCRIBE_RETRY_BACKOFF_MS[attempt] ?? 6_000;
      console.log(
        `[ESPMatterSubscriptionAdapter] subscribeToDevice transient failure for nodeId=${nodeId} (attempt ${
          attempt + 1
        }/${SUBSCRIBE_RETRY_MAX_ATTEMPTS}), retrying in ${waitMs}ms: ${lastError}`,
      );
      await delay(waitMs);
    }

    const message = `[ESPMatterSubscriptionAdapter] subscribeToDevice failed for nodeId=${nodeId} matterNodeId=${matterNodeId}: ${
      lastError ?? "unknown error"
    }`;
    console.warn(message);
    // Propagate: the SDK's matter channel marks the node attached when this
    // resolves, after which every later subscribe (including the discovery
    // retry once the fabric is hydrated) is an idempotent no-op. Rejecting
    // lets the channel drop this attempt so the retry re-attaches for real.
    throw new Error(message);
  },

  async unsubscribeFromDevice(
    nodeId: string,
    _fabricId: string,
  ): Promise<void> {
    // Also stops a subscribe for this device that is still retrying.
    unsubscribeCountByNodeId.set(
      nodeId,
      (unsubscribeCountByNodeId.get(nodeId) ?? 0) + 1,
    );
    const unsubscribe = subscriptionUnsubscribers.get(nodeId);
    if (unsubscribe) {
      unsubscribe();
      subscriptionUnsubscribers.delete(nodeId);
    }
    subscriptionLinks.delete(nodeId);
  },

  isLinkLive: isMatterSubscriptionLive,

  async isDeviceReachable(
    nodeId: string,
    _fabricId: string,
  ): Promise<boolean> {
    const matterNodeId = getMatterNodeIdForRmNodeId(nodeId);
    if (!matterNodeId) return false;
    return reachabilityByMatterNodeId.get(matterNodeId) ?? true;
  },
};

export {
  ESPMatterSubscriptionAdapter,
  DEFAULT_MIN_INTERVAL_SEC,
  DEFAULT_MAX_INTERVAL_SEC,
  registerMatterNodeIdMapping,
  syncMatterNodeIdMappings,
  getMatterNodeIdForRmNodeId,
  setMatterNodeReachability,
  isMatterSubscriptionLive,
  onMatterLinkLive,
};
export type { MatterEndpointSummary };
export default ESPMatterSubscriptionAdapter;
