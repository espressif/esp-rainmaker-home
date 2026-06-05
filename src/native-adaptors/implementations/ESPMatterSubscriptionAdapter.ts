/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPMatterAdapter,
  MatterDeviceUpdate,
} from "@espressif/rainmaker-matter-sdk";
import { ESPMatterControlAdapter } from "./ESPMatterControlAdapter";

/**
 * JS adapter that satisfies the SDK's subscription-channel `ESPMatterAdapter`
 * interface (`subscribeToDevice` / `unsubscribeFromDevice` /
 * `isDeviceReachable` / `initialize` / `dispose`) on top of the lower-level
 * `ESPMatterControlAdapter.subscribe` primitive.
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
 * SDK without taking a hard dependency on it (this adapter must not
 * import @espressif/* beyond the control adapter shim).
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
  [0x0300]: [0x0000, 0x0001, 0x0007], // ColorControl: Hue / Saturation / ColorTemperatureMireds

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
  { endpoint: 1, clusterId: 0x0300, attributeId: 0x0007 },
];

const rmNodeIdToMatterNodeId = new Map<string, string>();
const matterNodeIdToRmNodeId = new Map<string, string>();
const reachabilityByMatterNodeId = new Map<string, boolean>();
const matterEndpointsByRmNodeId = new Map<string, MatterEndpointSummary[]>();
const subscriptionUnsubscribers = new Map<string, () => void>();

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
 * @param rmNodeId - Rainmaker node id from the SDK.
 * @returns The corresponding Matter operational node id, if known.
 */
function getMatterNodeIdForRmNodeId(rmNodeId: string): string | undefined {
  return rmNodeIdToMatterNodeId.get(rmNodeId);
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

const ESPMatterSubscriptionAdapter: ESPMatterAdapter = {
  async initialize(): Promise<void> {
    // Native control adapter has its own `init` which is a no-op today;
    // call it for forward compatibility.
    await ESPMatterControlAdapter.init?.({
      fabricId: "",
      groupId: "",
    });
  },

  async dispose(): Promise<void> {
    for (const unsubscribe of subscriptionUnsubscribers.values()) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn("[ESPMatterSubscriptionAdapter] dispose: unsubscribe failed:", error);
      }
    }
    subscriptionUnsubscribers.clear();
    await ESPMatterControlAdapter.shutdown?.();
  },

  async subscribeToDevice(
    nodeId: string,
    fabricId: string,
    callback: (update: MatterDeviceUpdate) => void,
  ): Promise<void> {
    const matterNodeId = getMatterNodeIdForRmNodeId(nodeId);
    if (!matterNodeId) {
      console.warn(
        `[ESPMatterSubscriptionAdapter] subscribeToDevice: no matterNodeId for rmNodeId=${nodeId} fabricId=${fabricId}`,
      );
      return;
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
      callback({
        endpointId: report.endpoint,
        clusterId: report.clusterId,
        attributeId: report.attributeId,
        value: report.value,
      });
    };

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
      const result = await ESPMatterControlAdapter.subscribe(
        matterNodeId,
        paths,
        reportCallback,
      );

      if (result.success) {
        if (result.unsubscribe) {
          const previous = subscriptionUnsubscribers.get(nodeId);
          previous?.();
          subscriptionUnsubscribers.set(nodeId, result.unsubscribe);
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

    console.warn(
      `[ESPMatterSubscriptionAdapter] subscribeToDevice failed for nodeId=${nodeId} matterNodeId=${matterNodeId}: ${
        lastError ?? "unknown error"
      }`,
    );
  },

  async unsubscribeFromDevice(
    nodeId: string,
    _fabricId: string,
  ): Promise<void> {
    const unsubscribe = subscriptionUnsubscribers.get(nodeId);
    if (unsubscribe) {
      unsubscribe();
      subscriptionUnsubscribers.delete(nodeId);
    }
  },

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
};
export type { MatterEndpointSummary };
export default ESPMatterSubscriptionAdapter;
