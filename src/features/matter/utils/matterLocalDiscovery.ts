/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { reaction, type IReactionDisposer } from "mobx";
import {
  ESPCDF,
  type ESPCDFGroup,
  type ESPCDFTransportConfig,
  ESPCDFNode,
  handleNodeTransportUpdate,
} from "@store";
import {
  MATTER_LOCAL_DISCOVERY_EVENT,
  MATTER_LOCAL_DISCOVERY_LOST_EVENT,
  MATTER_LOCAL_TRANSPORT_KEY,
  MATTER_METADATA_NODE_ID_KEY,
  DISCOVERY_UPDATE_EVENT,
  DISCOVERY_LOST_EVENT,
  MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
  MDNS_DOMAIN_LOCAL,
} from "@shared/utils/constants";
import { syncMatterDiscoveryTargetNodeIds } from "@native-adaptors/implementations/matterDiscoveryTargets";
import {
  syncMatterNodeIdMappings,
  setMatterNodeReachability,
  onMatterLinkLive,
  type MatterEndpointSummary,
} from "@native-adaptors/implementations/ESPMatterSubscriptionAdapter";
import { bootstrapMatterFabricForOperationalDiscovery } from "@features/matter/utils/matterCommissioningHelpers";
import { retrySubscribeForNodeId } from "@shared/utils/matterSubscribeRetry";
import {
  registerMatterNameRetryNodeLookup,
  retryMatterNameNow,
} from "@shared/utils/matterNameRetry";
import {
  MATTER_DISCOVERY_VERIFY_LOG,
  normalizeMatterNodeIdHex,
} from "@shared/utils/matterNodeIdHex";
import { readMatterNodeIdFromCdfNode } from "@shared/utils/matterDeviceStateEvents";
import { registerMatterDiscoveryOnNodesAddedKick } from "@shared/utils/matterDiscoveryGroupCallbacks";
import {
  readHybridSetupFromDevice,
  reportMatterReachability,
} from "@shared/utils/matterLocalNetworkHooks";
import { onSessionEnd } from "@shared/utils/userSession";
import {
  getMatterMetadata,
  setMatterMetadata,
} from "@shared/utils/matterLocalStorage";
import { readAttributesForNodeId } from "@shared/utils/matterAttributeRead";
import {
  DeviceEventEmitter,
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from "react-native";

// iOS: NativeEventEmitter(ESPDiscoveryModule); Android uses DeviceEventEmitter.
const matterDiscoveryEventEmitter =
  Platform.OS === "ios" && NativeModules.ESPDiscoveryModule
    ? new NativeEventEmitter(NativeModules.ESPDiscoveryModule)
    : DeviceEventEmitter;
interface MatterDiscoveryEventPayload {
  nodeId?: string;
  matterNodeId?: string;
  fabricId?: string;
  compressedFabricId?: string;
  host?: string;
  port?: number;
  transportDetails?: ESPCDFTransportConfig;
}

// ─── Pure helpers (no controller state) ─────────────────────────────────────

/**
 *
 * Returns `null` when the payload's `matterNodeId` is not a valid 16-hex
 * Matter operational node id, which guards against the matter SDK adapter
 * leaking unrelated `_esp_local_ctrl._tcp.` events into the matter event
 * channel (RainMaker node ids are 22-char base58, not 16-hex).
 */
function payloadMatterNodeIdKey(
  payload: MatterDiscoveryEventPayload,
): string | null {
  if (!payload.matterNodeId) return null;
  return normalizeMatterNodeIdHex(payload.matterNodeId) ?? null;
}

/**
 * Merges Matter nodes from home `nodeDetails` and the node store so discovery
 * survives transient empty `nodeDetails` during cloud sync.
 */
function collectMatterHomeNodes(
  store: ESPCDF,
  home: ESPCDFGroup,
): ESPCDFNode[] {
  const byId = new Map<string, ESPCDFNode>();
  for (const node of home.nodeDetails ?? []) {
    byId.set(node.id, node);
  }
  for (const node of store.getNodesForCurrentHome()) {
    // The store's instance is the fresher one, but a hybrid's arrives without
    // the Matter id its group copy carries, so overwriting outright drops it
    // from discovery. Carry the id over instead of choosing between them.
    const fromGroup = byId.get(node.id);
    if (fromGroup && readMatterNodeIdFromCdfNode(node) == null) {
      const carried = readMatterNodeIdFromCdfNode(fromGroup);
      if (carried) {
        const target = ((node as { metadata?: Record<string, unknown> })
          .metadata ??= {});
        target[MATTER_METADATA_NODE_ID_KEY] = carried;
      }
    }
    byId.set(node.id, node);
  }
  return Array.from(byId.values());
}

/** Returns whether a CDF node represents a Matter device. */
function isMatterCdfNode(node: ESPCDFNode): boolean {
  if ((node as { isMatter?: boolean }).isMatter === true) {
    return true;
  }
  return readMatterNodeIdFromCdfNode(node) != null;
}

/**
 * Builds CDF transport config for Matter operational LAN reachability.
 * @returns Transport config keyed as `matter_local`, or null when metadata is incomplete.
 */
function toMatterLocalTransportConfig(
  payload: MatterDiscoveryEventPayload,
): ESPCDFTransportConfig | null {
  const transportMeta = payload.transportDetails?.metadata as
    Record<string, unknown> | undefined;
  const host =
    payload.host ??
    (typeof transportMeta?.host === "string" ? transportMeta.host : undefined);
  const port =
    payload.port ??
    (typeof transportMeta?.port === "number" ? transportMeta.port : undefined);
  const matterNodeId =
    payload.matterNodeId ??
    (typeof transportMeta?.matterNodeId === "string"
      ? transportMeta.matterNodeId
      : undefined);

  if (!host || typeof port !== "number" || !matterNodeId) {
    return null;
  }

  return {
    type: MATTER_LOCAL_TRANSPORT_KEY,
    metadata: {
      host,
      port,
      matterNodeId,
      fabricId:
        payload.fabricId ??
        (typeof transportMeta?.fabricId === "string"
          ? transportMeta.fabricId
          : undefined),
      compressedFabricId:
        payload.compressedFabricId ??
        (typeof transportMeta?.compressedFabricId === "string"
          ? transportMeta.compressedFabricId
          : undefined),
    },
  };
}

function arraysEqualOrdered(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ─── Controller factory ─────────────────────────────────────────────────────

interface MatterLocalDiscoveryController {
  /** Idempotent: ensures fabric session + discovery subscriptions are ready. */
  start(): void;
  /** Removes all listeners and clears state. Runs on logout and SDK switch. */
  stop(): Promise<void>;
}

/**
 * On classic Matter both the SDK and the native listener deliver each event.
 * The same event again within this time is skipped.
 */
const REPEAT_EVENT_WINDOW_MS = 1000;

/** Longest stop() waits for setup still running, so a stuck native call never blocks logout. */
const SETUP_WAIT_LIMIT_MS = 3000;

/**
 * Encapsulates all matter-local-discovery state in a single controller
 * scoped to one CDF store. Replaces the previous module-level `let` soup
 * so logout / home-switch teardown becomes possible without rewriting
 * call-site flow, and so unit tests can spin up an isolated controller
 * per test instead of relying on cross-test module reset.
 */
function createMatterLocalDiscoveryController(
  store: ESPCDF,
): MatterLocalDiscoveryController {
  let matterNodeToNodeIdMap = new Map<string, string>();
  let matterDiscoverySubscribed = false;
  /** The user the discovery events were subscribed with; stop() unsubscribes it. */
  let subscribedUser: NonNullable<ESPCDF["userStore"]["user"]> | null = null;
  /** Set by stop(); setup still running gives up instead of finishing. */
  let stopped = false;
  /** Setup still running; stop() waits for it so it never overlaps the next one. */
  let setupInFlight: Promise<void> | null = null;
  /**
   * Direct native DiscoveryUpdate/Lost listeners (belt-and-suspenders for the
   * SDK discovery subscribe, which sometimes never starts its adapter).
   */
  let nativeDiscoveryListeners: EmitterSubscription[] | null = null;
  /** Undo for the hooks that retry device names the device missed. */
  let nameRetryHooks: (() => void)[] | null = null;
  /** Last event handled for each Matter node, to skip repeats. */
  const lastEventByMatterNodeId = new Map<
    string,
    { event: string; at: number }
  >();
  let lastSyncedHomeId: string | null = null;
  let lastSyncedTargets: string[] = [];
  let homeNodeSetReaction: IReactionDisposer | null = null;
  /**
   * Cache of discovery payloads that arrived BEFORE the CDF node-id map had a
   * matching entry — typically on cold start (especially iOS), where Bonjour
   * fires `didResolve` for cached `_matter._tcp.` records before the post-login
   * pipeline finishes hydrating `home.nodeDetails`. Replayed by
   * {@link rebuildMatterNodeIdMap} once a matching CDF node appears so the
   * local transport is attached without waiting for a fresh mDNS event
   * (Bonjour does not re-emit unchanged records). Keyed by normalized
   * lowercase 16-hex matterNodeId.
   */
  const pendingByMatterNodeId = new Map<string, MatterDiscoveryEventPayload>();

  /**
   * Last `(homeId, sorted matterNodeId↔cdfNodeId map)` snapshot the heavy-rebuild
   * path saw. Keyed from {@link rebuildMatterNodeIdMap}'s operational `nextMap`
   * (includes bridge parent) — not subscription pairs alone (bridge nodes are
   * skipped from subscribe sync).
   */
  let lastRebuildSignature: string | null = null;

  // ─── Map sync ──────────────────────────────────────────────────────────

  /**
   * Native CHIP target sync — only re-sends when the target list changed,
   * and never re-clears during transient empty home node lists (cloud sync
   * can briefly drop nodeDetails before re-populating).
   */
  // Native cannot build a ChipClient before the fabric is in its session, so a
  // target pushed too early burns a whole probe cycle (8s) on a guaranteed miss.
  let nativeFabricReady = false;

  function syncMatterDiscoveryTargets(homeId: string, targets: string[]): void {
    if (
      targets.length === 0 &&
      lastSyncedHomeId === homeId &&
      lastSyncedTargets.length > 0
    ) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} skip clearing native targets: home ${homeId} node list transiently empty (keeping ${lastSyncedTargets.length} target(s))`,
      );
      return;
    }

    if (
      lastSyncedHomeId === homeId &&
      arraysEqualOrdered(lastSyncedTargets, targets)
    ) {
      return;
    }

    // Hold the push (without recording it) until the fabric is hydrated: the
    // first real push then looks "newly added" to native, which probes it
    // immediately instead of waiting out the poll interval.
    if (!nativeFabricReady) {
      return;
    }

    lastSyncedHomeId = homeId;
    lastSyncedTargets = targets;
    syncMatterDiscoveryTargetNodeIds(targets);
  }

  /**
   * Builds the `matterNodeId → cdfNodeId` map for the active Matter home and
   * mirrors it into the native subscription adapter. Skipped when the
   * `(homeId, operational nextMap)` signature matches the last rebuild —
   * discovery handlers are expected to call this on every event for correctness,
   * the signature gate makes the repeated call cheap.
   */
  function rebuildMatterNodeIdMap(): void {
    if (stopped) return;
    const home = store.getCurrentHome() as ESPCDFGroup | null;

    if (!home?.isMatter) {
      if (lastRebuildSignature === null) return;
      matterNodeToNodeIdMap = new Map();
      lastSyncedHomeId = null;
      lastSyncedTargets = [];
      pendingByMatterNodeId.clear();
      syncMatterDiscoveryTargetNodeIds([]);
      // Clear the subscription adapter's rm↔matter map so a logout / home
      // switch does not leave stale ids that could shadow the next user.
      syncMatterNodeIdMappings([]);
      lastRebuildSignature = null;
      return;
    }

    const homeNodes = collectMatterHomeNodes(store, home);
    const nextMap = new Map<string, string>();
    const subscriptionPairs: {
      nodeId: string;
      matterNodeId: string;
      matterEndpoints?: readonly MatterEndpointSummary[];
    }[] = [];

    for (const node of homeNodes) {
      if (!isMatterCdfNode(node)) continue;
      const matterNodeId = readMatterNodeIdFromCdfNode(node);
      if (!matterNodeId) continue;
      const normalized = normalizeMatterNodeIdHex(matterNodeId);
      if (!normalized) {
        console.warn(
          `${MATTER_DISCOVERY_VERIFY_LOG} skip invalid matterNodeId on CDF node ${node.id}:`,
          matterNodeId,
        );
        continue;
      }
      nextMap.set(normalized, node.id);

      const rawEndpoints = (
        node._raw as {
          endpoints?: readonly MatterEndpointSummary[];
        }
      )?.endpoints;
      const matterEndpoints = rawEndpoints?.filter(
        (ep) => ep.endpointId !== 0 && ep.serverClusters.length > 0,
      );

      subscriptionPairs.push({
        nodeId: node.id,
        matterNodeId: normalized,
        matterEndpoints:
          matterEndpoints && matterEndpoints.length > 0
            ? matterEndpoints
            : undefined,
      });
    }

    // A cloud refresh can momentarily rebuild a Matter node without its Matter
    // id, emptying this list for one pass. Dropping the map then would re-mark
    // every node "newly added" on the next pass and wipe the subscription
    // adapter's translations, so hold the last known good map instead — the same
    // rule `syncMatterDiscoveryTargets` already applies to the native targets.
    if (nextMap.size === 0 && matterNodeToNodeIdMap.size > 0) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} skip clearing matter node map: home ${home.id} node list transiently empty (keeping ${matterNodeToNodeIdMap.size} node(s))`,
      );
      return;
    }

    // Signature short-circuit: when the operational discovery map (native
    // browse targets) hasn't changed, skip re-sync. Must use nextMap — bridge
    // parent/child nodes are excluded from subscriptionPairs but still need
    // native target sync after commission or pull-to-refresh.
    const signature = `${home.id}|${Array.from(nextMap.entries())
      .map(([matterNodeId, cdfNodeId]) => `${matterNodeId}:${cdfNodeId}`)
      .sort()
      .join(",")}`;
    if (signature === lastRebuildSignature) {
      // Pending replay still safe to attempt — pending entries can grow
      // between rebuilds without changing the signature.
      replayPendingDiscoveries();
      return;
    }
    lastRebuildSignature = signature;
    // Diff against the previous map BEFORE we overwrite it, so we can
    // surface freshly-added matter nodes (typically the just-commissioned
    // RVC) to the subscribe-retry path below. We can't rely on
    // `applyMatterLocalTransport` here — that fires only after mDNS
    // resolves the new device and `matter_local` transport is attached,
    // which can take 10–60s post-commission. Without this trigger, the
    // control screen for a freshly-commissioned matter node stays empty
    // because `subscribeToAllNodes` already ran (at cold-start, before the
    // node existed) and nothing else kicks off a subscribe.
    const newlyAddedCdfNodeIds: string[] = [];
    for (const [matterNodeId, cdfNodeId] of nextMap) {
      if (!matterNodeToNodeIdMap.has(matterNodeId)) {
        newlyAddedCdfNodeIds.push(cdfNodeId);
      }
    }
    matterNodeToNodeIdMap = nextMap;

    const targets = Array.from(nextMap.keys());
    syncMatterDiscoveryTargets(home.id, targets);

    // Mirror the same rm↔matter pairs into the subscription adapter so
    // `MatterSubscriptionChannel.subscribe(rmNodeId, …)` can translate to a
    // `matterNodeId` when calling
    // `ESPMatterControlAdapter.subscribe(matterNodeId, paths, callback)`.
    // The endpoint summary lets the adapter derive subscribe paths from
    // advertised clusters (e.g. RVC's 0x54/0x55/0x61) instead of the
    // Light-only fallback that triggers Status=0x80 + CHIP auto-resubscribe
    // loops on non-Light devices.
    syncMatterNodeIdMappings(subscriptionPairs);

    replayPendingDiscoveries();

    // Kick off per-node subscribe for newly-added matter nodes. Matter
    // subscribe routes through native CHIP CASE and does NOT require the
    // `matter_local` transport to be attached first, so we can fire as soon
    // as the rm↔matter map is synced. The retry helper is idempotent:
    // already-subscribed nodes are a no-op, and the matter channel itself
    // dedupes via `subscribingNodes`/`subscribedNodes`.
    if (newlyAddedCdfNodeIds.length > 0) {
      const espCDFUser = store.userStore.user;
      for (const cdfNodeId of newlyAddedCdfNodeIds) {
        // Pass the raw ESPRMNode lifted off the CDF mirror so the matter
        // user-adaptor's retry helper can subscribe even though the node
        // wasn't part of the cold-start `subscribeToAllNodes` snapshot.
        // Without this node the helper short-circuits on
        // `lastSubscribeSdkNodes.find(...) === undefined` and the freshly
        // commissioned node never has its subscription kicked off.
        const cdfNode = store.nodeStore.getNodeById(cdfNodeId);
        const rawNode = cdfNode?._raw as unknown;
        if (!rawNode) {
          console.warn(
            `${MATTER_DISCOVERY_VERIFY_LOG} kick-subscribe skipped: no _raw for nodeId=${cdfNodeId}`,
          );
          continue;
        }
        void retrySubscribeForNodeId(espCDFUser, cdfNodeId, { rawNode }).catch(
          (error: unknown) => {
            console.warn(
              `${MATTER_DISCOVERY_VERIFY_LOG} kick-subscribe failed for nodeId=${cdfNodeId}:`,
              error,
            );
          },
        );
      }
    }
  }

  /**
   * Replays cached discovery payloads whose matterNodeId is now resolvable
   * to a CDF node. Iterates the (typically 0–2 entry) pending cache rather
   * than the full target map to keep this a near-no-op when nothing is
   * pending.
   */
  function replayPendingDiscoveries(): void {
    if (pendingByMatterNodeId.size === 0) return;
    for (const [matterNodeId, cached] of pendingByMatterNodeId) {
      const cdfNodeId = matterNodeToNodeIdMap.get(matterNodeId);
      if (!cdfNodeId) continue;
      const transport = toMatterLocalTransportConfig(cached);
      pendingByMatterNodeId.delete(matterNodeId);
      if (!transport) continue;
      applyMatterLocalTransport(cdfNodeId, transport, "add");
    }
  }

  // ─── Discovery handlers ────────────────────────────────────────────────

  /**
   * Whether this same event for the node was handled a moment ago.
   * @param matterNodeId - Normalized 16-hex Matter node id.
   * @param event - What happened, e.g. `add|10.0.0.5|5540` or `remove`.
   */
  function wasJustHandled(matterNodeId: string, event: string): boolean {
    const now = Date.now();
    const last = lastEventByMatterNodeId.get(matterNodeId);
    lastEventByMatterNodeId.set(matterNodeId, { event, at: now });
    return (
      last !== undefined &&
      last.event === event &&
      now - last.at < REPEAT_EVENT_WINDOW_MS
    );
  }

  function resolveNodeIdFromPayload(
    payload: MatterDiscoveryEventPayload,
  ): string | undefined {
    if (payload.nodeId) return payload.nodeId;
    if (!payload.matterNodeId) return undefined;
    return matterNodeToNodeIdMap.get(
      normalizeMatterNodeIdHex(payload.matterNodeId) ??
        payload.matterNodeId.toLowerCase(),
    );
  }

  /**
   * Recovers a reachable hybrid's Matter control leg from the device, and
   * caches the topology so later launches rig it without any reads.
   *
   * Only a hybrid commissioned on a different phone gets this far: the SDK
   * declines a node that is already rigged, is pure Matter, or is unknown,
   * and a stored topology short-circuits it here. That last guard matters on
   * the phone that DID commission — discovery can beat the group sync that
   * attaches from storage, and these reads would otherwise compete with the
   * commissioning flow's own traffic to the same node.
   */
  async function hydrateHybridLocalControl(
    matterNodeId: string,
    nodeId: string,
  ): Promise<void> {
    try {
      if (await getMatterMetadata(nodeId)) {
        return;
      }
      const hydrated = await readHybridSetupFromDevice(
        store.userStore.user,
        matterNodeId,
      );
      // Logout clears storage; a late read must not write it back.
      if (!hydrated || stopped) {
        return;
      }
      await setMatterMetadata(hydrated.nodeId, hydrated.metadata);
    } catch (error) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} hybrid topology hydrate failed for matterNodeId=${matterNodeId}:`,
        error,
      );
    }
  }

  /**
   * Applies Matter local transport to a CDF node.
   * On `add`, also kicks the matter retry helper so the post-login race
   * (subscribe-all ran before this transport was attached) recovers.
   */
  function applyMatterLocalTransport(
    nodeId: string,
    transportDetails: ESPCDFTransportConfig,
    operation: "add" | "remove",
  ): void {
    const transportMeta = transportDetails.metadata as
      { matterNodeId?: string } | undefined;
    const matterNodeId =
      typeof transportMeta?.matterNodeId === "string"
        ? normalizeMatterNodeIdHex(transportMeta.matterNodeId)
        : undefined;

    if (matterNodeId) {
      setMatterNodeReachability(matterNodeId, operation === "add");
      // Tell the SDK the node is on the LAN, so control goes over Wi-Fi.
      // Only Neo Matter listens; for other SDKs this resolves false.
      // Seed the store from the device once the LAN path exists, else the card
      // renders defaults (power off) until Control is opened and reads live.
      // Must follow the SDK update: the read self-skips without matter_local.
      void reportMatterReachability(
        store.userStore.user,
        matterNodeId,
        (transportDetails.metadata ?? {}) as Record<string, unknown>,
        operation,
      )
        .catch((error: unknown) => {
          console.warn(
            `${MATTER_DISCOVERY_VERIFY_LOG} reachability update failed for matterNodeId=${matterNodeId}:`,
            error,
          );
          return false;
        })
        .then((toldSdk) => {
          if (operation !== "add" || stopped) return;
          // A hybrid without a saved setup reads one off the device, else its
          // controls keep going to the cloud. Not awaited: it can be slow.
          if (toldSdk) {
            void hydrateHybridLocalControl(matterNodeId, nodeId);
          }
          const espCDFUser = store.userStore.user;
          if (!espCDFUser) return;
          void readAttributesForNodeId(espCDFUser, nodeId).catch(
            (error: unknown) => {
              console.warn(
                `${MATTER_DISCOVERY_VERIFY_LOG} seed read failed for nodeId=${nodeId}:`,
                error,
              );
            },
          );
        });
    }

    handleNodeTransportUpdate(store, nodeId, transportDetails, operation);
    if (operation === "remove") {
      return;
    }

    if (!store.nodeStore.getNodeById(nodeId)) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} transport registered for node ${nodeId} (not in nodeStore yet)`,
      );
      return;
    }

    // A name the device missed while unreachable can reach it now.
    void retryMatterNameNow(nodeId);

    // Recover from the post-login race: the base SDK kicks off
    // `subscribeToAllNodes` ~5s after `syncHomeWithNodes`, but the matter
    // local probe can take longer to attach the `matter_local` transport.
    // When that happens, the matter channel reports
    // `No available subscription channels for node …` and never retries.
    // Now that the node is reachable, re-subscribe it so the manager
    // re-evaluates which channel serves it and moves it onto matter.
    void retrySubscribeForNodeId(store.userStore.user, nodeId).catch(
      (error: unknown) => {
        console.warn(
          `${MATTER_DISCOVERY_VERIFY_LOG} retrySubscribe failed for nodeId=${nodeId}:`,
          error,
        );
      },
    );
  }

  function onMatterDiscovered(event: unknown): void {
    if (stopped) return;
    rebuildMatterNodeIdMap();

    const payload = (
      event && typeof event === "object" ? event : null
    ) as MatterDiscoveryEventPayload | null;
    const transportDetails = payload
      ? toMatterLocalTransportConfig(payload)
      : null;
    if (!payload || !transportDetails) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} skip discovery event: missing transport metadata`,
        event,
      );
      return;
    }

    const nodeId = resolveNodeIdFromPayload(payload);
    if (!nodeId) {
      const key = payloadMatterNodeIdKey(payload);
      if (key) {
        pendingByMatterNodeId.set(key, payload);
        console.warn(
          `${MATTER_DISCOVERY_VERIFY_LOG} cache discovery event for replay: no CDF node yet for matterNodeId=${payload.matterNodeId} (pending=${pendingByMatterNodeId.size})`,
        );
      } else {
        console.warn(
          `${MATTER_DISCOVERY_VERIFY_LOG} skip discovery event: no CDF node for matterNodeId=${payload.matterNodeId}`,
        );
      }
      return;
    }

    const transportMeta = transportDetails.metadata as {
      host?: string;
      port?: number;
      matterNodeId?: string;
    };
    const discoveredMatterNodeId = transportMeta.matterNodeId
      ? normalizeMatterNodeIdHex(transportMeta.matterNodeId)
      : undefined;
    if (
      discoveredMatterNodeId &&
      wasJustHandled(
        discoveredMatterNodeId,
        `add|${transportMeta.host}|${transportMeta.port}`,
      )
    ) {
      return;
    }

    applyMatterLocalTransport(nodeId, transportDetails, "add");
  }

  function onMatterDiscoveryLost(event: unknown): void {
    if (stopped) return;
    rebuildMatterNodeIdMap();

    const payload = (
      event && typeof event === "object" ? event : null
    ) as MatterDiscoveryEventPayload | null;
    if (!payload) return;

    const pendingKey = payloadMatterNodeIdKey(payload);
    if (pendingKey) pendingByMatterNodeId.delete(pendingKey);

    const nodeId = resolveNodeIdFromPayload(payload);
    if (!nodeId) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} skip discovery-lost event: no CDF node for matterNodeId=${payload.matterNodeId}`,
      );
      return;
    }

    const lostMatterNodeId = payloadMatterNodeIdKey(payload);
    if (lostMatterNodeId) {
      if (wasJustHandled(lostMatterNodeId, "remove")) {
        return;
      }
      setMatterNodeReachability(lostMatterNodeId, false);
      void reportMatterReachability(
        store.userStore.user,
        lostMatterNodeId,
        {},
        "remove",
      ).catch((error: unknown) => {
        console.warn(
          `${MATTER_DISCOVERY_VERIFY_LOG} reachability update failed for matterNodeId=${lostMatterNodeId}:`,
          error,
        );
      });
    }

    applyMatterLocalTransport(
      nodeId,
      {
        type: MATTER_LOCAL_TRANSPORT_KEY,
        metadata: {},
      },
      "remove",
    );
  }

  function handleNativeMatterDiscoveryUpdate(raw: unknown): void {
    const data = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const matterNodeId =
      typeof data.matterNodeId === "string" ? data.matterNodeId : undefined;
    if (!matterNodeId) return;
    onMatterDiscovered({
      matterNodeId,
      host: typeof data.host === "string" ? data.host : undefined,
      port: typeof data.port === "number" ? data.port : undefined,
      fabricId: typeof data.fabricId === "string" ? data.fabricId : undefined,
      compressedFabricId:
        typeof data.compressedFabricId === "string"
          ? data.compressedFabricId
          : undefined,
    });
  }

  function handleNativeMatterDiscoveryLost(raw: unknown): void {
    const data = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const matterNodeId =
      typeof data.matterNodeId === "string" ? data.matterNodeId : undefined;
    if (!matterNodeId) return;
    onMatterDiscoveryLost({ matterNodeId });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  /** Unsubscribes the discovery events; a failure is logged, not thrown. */
  async function unsubscribeDiscoveryEvents(
    espCDFUser: NonNullable<ESPCDF["userStore"]["user"]>,
  ): Promise<void> {
    try {
      await espCDFUser.unsubscribeFromEvent(
        MATTER_LOCAL_DISCOVERY_EVENT,
        onMatterDiscovered,
      );
      await espCDFUser.unsubscribeFromEvent(
        MATTER_LOCAL_DISCOVERY_LOST_EVENT,
        onMatterDiscoveryLost,
      );
    } catch (error: unknown) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} matter discovery unsubscribe failed:`,
        error,
      );
    }
    matterDiscoverySubscribed = false;
    subscribedUser = null;
  }

  async function ensureMatterDiscoveryReady(): Promise<void> {
    if (stopped) return;
    rebuildMatterNodeIdMap();
    const home = store.getCurrentHome() as ESPCDFGroup | null;
    if (!home?.isMatter) return;

    // Start Matter browse before fabric bootstrap; on iOS bootstrap rebuilds MTRDeviceController and must not block `_matter._tcp` browse.
    const espCDFUser = store.userStore.user;
    if (espCDFUser && !matterDiscoverySubscribed) {
      if (!nativeDiscoveryListeners) {
        nativeDiscoveryListeners = [
          matterDiscoveryEventEmitter.addListener(
            DISCOVERY_UPDATE_EVENT,
            handleNativeMatterDiscoveryUpdate,
          ),
          matterDiscoveryEventEmitter.addListener(
            DISCOVERY_LOST_EVENT,
            handleNativeMatterDiscoveryLost,
          ),
        ];
      }

      // iOS: kick ESPDiscoveryModule directly to start the `_matter._tcp` browse (Android does this via the CHIP discovery path).
      if (Platform.OS === "ios") {
        const espDiscoveryModule = NativeModules.ESPDiscoveryModule as
          | { startDiscovery?: (params: Record<string, string>) => void }
          | undefined;
        if (espDiscoveryModule?.startDiscovery) {
          espDiscoveryModule.startDiscovery({
            serviceType: MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
            domain: MDNS_DOMAIN_LOCAL,
          });
        }
      }

      try {
        await espCDFUser.subscribeToEvent(
          MATTER_LOCAL_DISCOVERY_EVENT,
          onMatterDiscovered,
        );
        await espCDFUser.subscribeToEvent(
          MATTER_LOCAL_DISCOVERY_LOST_EVENT,
          onMatterDiscoveryLost,
        );
        matterDiscoverySubscribed = true;
        subscribedUser = espCDFUser;
        // stop() ran meanwhile and had nothing to undo yet.
        if (stopped) {
          await unsubscribeDiscoveryEvents(espCDFUser);
          return;
        }
      } catch (error: unknown) {
        // Leave matterDiscoverySubscribed false so the next start() retries.
        console.warn(
          `${MATTER_DISCOVERY_VERIFY_LOG} matter discovery subscribe failed (will retry on next start):`,
          error,
        );
      }
    }

    if (stopped) return;

    // Fabric bootstrap (CASE session) runs after browse; slow on iOS and must not gate `_matter._tcp` start.
    try {
      await bootstrapMatterFabricForOperationalDiscovery(store);
    } catch (error: unknown) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} fabric bootstrap failed:`,
        error,
      );
    }
    if (stopped) return;

    // Fabric is in the native session now, so targets can be pushed for real.
    nativeFabricReady = true;
    const bootstrappedHome = store.getCurrentHome() as ESPCDFGroup | null;
    if (bootstrappedHome?.isMatter) {
      syncMatterDiscoveryTargets(
        bootstrappedHome.id,
        Array.from(matterNodeToNodeIdMap.keys()),
      );
    }

    // Second rebuild picks up any home node hydration that completed during
    // fabric bootstrap (no-op when signature matches).
    rebuildMatterNodeIdMap();

    // Bridge post-commission / late-sync flows: when a new node is added to
    // the CDF nodeStore (e.g. the freshly commissioned matter node lands
    // ~seconds after the home screen mounts) we need to (a) rebuild the
    // rm↔matter id map so subscribe / control paths work, and (b) replay
    // any pendingByMatterNodeId entries — Bonjour caches the announcement
    // and only re-emits on TTL change, so without an explicit replay we'd
    // wait for the next probe cycle (~8s) to attach `matter_local`.
    //
    // Track the matter-node-id set so the reaction fires only when the
    // population of matter nodes actually changes; signature-gated rebuild
    // makes the call cheap when nothing is new.
    if (!homeNodeSetReaction) {
      homeNodeSetReaction = reaction(
        () => {
          const home = store.getCurrentHome() as ESPCDFGroup | null;
          if (!home?.isMatter) return "";
          const ids: string[] = [];
          for (const node of store.getNodesForCurrentHome()) {
            if (!isMatterCdfNode(node)) continue;
            const matterNodeId = readMatterNodeIdFromCdfNode(node);
            if (matterNodeId) ids.push(`${node.id}:${matterNodeId}`);
          }
          ids.sort();
          return `${home.id}|${ids.join(",")}`;
        },
        () => {
          rebuildMatterNodeIdMap();
        },
        { fireImmediately: false, delay: 50 },
      );
    }
  }

  return {
    start(): void {
      // Retries of missed device names find nodes here and run when a
      // device's Matter link comes up.
      if (!nameRetryHooks) {
        nameRetryHooks = [
          registerMatterNameRetryNodeLookup((nodeId) =>
            store.nodeStore.getNodeById(nodeId),
          ),
          onMatterLinkLive((subscribedId) => {
            // Classic subscribes under the node id, Neo under the Matter id.
            const nodeId = store.nodeStore.getNodeById(subscribedId)
              ? subscribedId
              : matterNodeToNodeIdMap.get(
                  normalizeMatterNodeIdHex(subscribedId) ??
                    subscribedId.toLowerCase(),
                );
            if (nodeId) {
              void retryMatterNameNow(nodeId);
            }
          }),
        ];
      }
      const setup = ensureMatterDiscoveryReady().finally(() => {
        if (setupInFlight === setup) setupInFlight = null;
      });
      setupInFlight = setup;
    },
    async stop(): Promise<void> {
      stopped = true;
      // Listeners go first so no event lands while the unsubscribe awaits.
      if (nativeDiscoveryListeners) {
        nativeDiscoveryListeners.forEach((sub) => sub.remove());
        nativeDiscoveryListeners = null;
      }
      // iOS: stop the `_matter._tcp` browse this file started; the local
      // control stop no longer stops it for us.
      if (Platform.OS === "ios") {
        const espDiscoveryModule = NativeModules.ESPDiscoveryModule as
          | { stopDiscoveryForType?: (serviceType: string) => void }
          | undefined;
        espDiscoveryModule?.stopDiscoveryForType?.(
          MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
        );
      }
      nameRetryHooks?.forEach((undo) => undo());
      nameRetryHooks = null;
      if (setupInFlight) {
        let waitLimit: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          setupInFlight.catch(() => undefined),
          new Promise<void>((resolve) => {
            waitLimit = setTimeout(resolve, SETUP_WAIT_LIMIT_MS);
          }),
        ]);
        clearTimeout(waitLimit);
      }
      if (subscribedUser) {
        await unsubscribeDiscoveryEvents(subscribedUser);
      }
      if (homeNodeSetReaction) {
        homeNodeSetReaction();
        homeNodeSetReaction = null;
      }
      matterDiscoverySubscribed = false;
      matterNodeToNodeIdMap = new Map();
      pendingByMatterNodeId.clear();
      lastEventByMatterNodeId.clear();
      lastSyncedHomeId = null;
      lastSyncedTargets = [];
      lastRebuildSignature = null;
      syncMatterDiscoveryTargetNodeIds([]);
      syncMatterNodeIdMappings([]);
    },
  };
}

// ─── Public entry ───────────────────────────────────────────────────────────

let controllerSingleton: {
  store: ESPCDF;
  user: ESPCDF["userStore"]["user"];
  controller: MatterLocalDiscoveryController;
} | null = null;

/** Old controllers while they stop, in order; a new one waits for them. */
let previousControllerStopping: Promise<void> | null = null;

/**
 * Stops discovery and forgets the controller, so the next start makes a new
 * one for the current store. Runs on logout and on SDK switch.
 * @returns Promise settled once the old controller has stopped.
 */
const stopMatterLocalDiscovery = (): Promise<void> => {
  const current = controllerSingleton;
  controllerSingleton = null;
  if (!current) {
    return previousControllerStopping ?? Promise.resolve();
  }
  const stopping = (previousControllerStopping ?? Promise.resolve())
    .then(() => current.controller.stop())
    .catch((error: unknown) => {
      console.warn(`${MATTER_DISCOVERY_VERIFY_LOG} discovery stop failed:`, error);
    })
    .finally(() => {
      if (previousControllerStopping === stopping) previousControllerStopping = null;
    });
  previousControllerStopping = stopping;
  return stopping;
};

/**
 * Starts SDK-managed Matter local discovery and keeps CDF node transports in sync.
 *
 * Mirrors {@link startNodeLocalDiscovery}: subscribe once per app session via the
 * CDF user, rebuild the node-id map on each call (refresh / home switch), and
 * route discovered/lost payloads through the transport store.
 *
 * Safe to call repeatedly: one controller per session. After logout or an
 * SDK switch the next call makes a new one.
 * @param store - The CDF store instance that manages application state.
 */
const startMatterLocalDiscovery = (store: ESPCDF): void => {
  // Never let a controller made for another store or user run for this one.
  if (
    controllerSingleton &&
    (controllerSingleton.store !== store ||
      controllerSingleton.user !== store.userStore.user)
  ) {
    void stopMatterLocalDiscovery();
  }
  if (!controllerSingleton) {
    controllerSingleton = {
      store,
      user: store.userStore.user,
      controller: createMatterLocalDiscoveryController(store),
    };
  }
  const { controller } = controllerSingleton;
  if (previousControllerStopping) {
    // The old one clears shared native state as it stops; start after it.
    void previousControllerStopping.then(() => {
      // Another stop may have dropped this controller in the meantime.
      if (controllerSingleton?.controller === controller) controller.start();
    });
    return;
  }
  controller.start();
};

onSessionEnd(stopMatterLocalDiscovery);

registerMatterDiscoveryOnNodesAddedKick(() => {
  if (ESPCDF.instance) {
    startMatterLocalDiscovery(ESPCDF.instance);
  }
});

export { startMatterLocalDiscovery };
