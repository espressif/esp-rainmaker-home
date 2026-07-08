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
  DISCOVERY_UPDATE_EVENT,
  DISCOVERY_LOST_EVENT,
  MDNS_SERVICE_TYPE_MATTER_OPERATIONAL,
  MDNS_DOMAIN_LOCAL,
} from "@shared/utils/constants";
import { syncMatterDiscoveryTargetNodeIds } from "@native-adaptors/implementations/matterDiscoveryTargets";
import {
  syncMatterNodeIdMappings,
  setMatterNodeReachability,
  type MatterEndpointSummary,
} from "@native-adaptors/implementations/ESPMatterSubscriptionAdapter";
import { bootstrapMatterFabricForOperationalDiscovery } from "@features/matter/utils/matterCommissioningHelpers";
import { retrySubscribeForNodeId } from "@shared/utils/matterSubscribeRetry";
import { getMatterLocalDiscoveryRmngHooks } from "@shared/utils/matterLocalDiscoveryRmngHooks";
import {
  describeChipOperationalLookup,
  formatMatterNodeIdForChipLog,
  MATTER_DISCOVERY_VERIFY_LOG,
  normalizeMatterNodeIdHex,
} from "@shared/utils/matterNodeIdHex";
import { readMatterNodeIdFromCdfNode } from "@shared/utils/matterDeviceStateEvents";
import { registerMatterDiscoveryOnNodesAddedKick } from "@shared/utils/matterDiscoveryGroupCallbacks";
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

/** CDF metadata flags set at build time in ESPRMNGMatterBase — prefer registered RMNG hook. */
function shouldSkipMatterSubscriptionForDiscovery(node: ESPCDFNode): boolean {
  const fromHook =
    getMatterLocalDiscoveryRmngHooks()?.shouldSkipMatterSubscriptionForCdfNode;
  if (fromHook) return fromHook(node);

  const meta = node.metadata as
    | { isBridgeParent?: boolean; isBridgedRmngMatterChild?: boolean }
    | undefined;
  return meta?.isBridgeParent === true || meta?.isBridgedRmngMatterChild === true;
}

function isBridgeParentCdfNodeForDiscovery(node: ESPCDFNode): boolean {
  const meta = node.metadata as { isBridgeParent?: boolean } | undefined;
  return meta?.isBridgeParent === true;
}

/** Bridged children share the parent's operational Matter id — keep the parent owner. */
function shouldReplaceMatterNodeMapOwner(
  existingNode: ESPCDFNode | undefined,
  candidateNode: ESPCDFNode,
): boolean {
  if (!existingNode) return true;
  if (isBridgeParentCdfNodeForDiscovery(existingNode)) return false;
  if (isBridgeParentCdfNodeForDiscovery(candidateNode)) return true;
  return true;
}

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
    | Record<string, unknown>
    | undefined;
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

function arraysEqualOrdered(a: readonly string[], b: readonly string[]): boolean {
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
  /**
   * Tears down event subscriptions and clears native + JS state.
   *
   * Currently unused by the app (no logout hook drives it yet) but exposed
   * so a future logout/home-switch handler can dispose cleanly without
   * leaking handlers across user sessions.
   */
  stop(): Promise<void>;
}

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
  /**
   * Direct native DiscoveryUpdate/Lost listeners (belt-and-suspenders for the
   * SDK discovery subscribe, which sometimes never starts its adapter).
   */
  let nativeDiscoveryListeners: EmitterSubscription[] | null = null;
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
    const homeNodesById = new Map(homeNodes.map((n) => [n.id, n]));
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
      const existingOwnerId = nextMap.get(normalized);
      if (
        shouldReplaceMatterNodeMapOwner(
          existingOwnerId ? homeNodesById.get(existingOwnerId) : undefined,
          node,
        )
      ) {
        nextMap.set(normalized, node.id);
      }

      if (shouldSkipMatterSubscriptionForDiscovery(node)) {
        continue;
      }

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

    for (const pair of subscriptionPairs) {
      console.log(
        `${MATTER_DISCOVERY_VERIFY_LOG} CDF node ${pair.nodeId} → matterNodeId=${pair.matterNodeId} (${formatMatterNodeIdForChipLog(pair.matterNodeId)}) | ${describeChipOperationalLookup(pair.matterNodeId)}`,
      );
    }

    const targets = Array.from(nextMap.keys());
    console.log(
      `${MATTER_DISCOVERY_VERIFY_LOG} sync ${targets.length} target(s) to native:`,
      targets.map((id) => formatMatterNodeIdForChipLog(id)),
    );
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
    console.log(
      `${MATTER_DISCOVERY_VERIFY_LOG} sync ${subscriptionPairs.length} rm↔matter pair(s) to ESPMatterSubscriptionAdapter (with endpoints for ${
        subscriptionPairs.filter((p) => p.matterEndpoints !== undefined).length
      } node(s))`,
    );

    replayPendingDiscoveries();

    // Kick off per-node subscribe for newly-added matter nodes. Matter
    // subscribe routes through native CHIP CASE and does NOT require the
    // `matter_local` transport to be attached first, so we can fire as soon
    // as the rm↔matter map is synced. The retry helper is idempotent:
    // already-subscribed nodes are a no-op, and the matter channel itself
    // dedupes via `subscribingNodes`/`subscribedNodes`.
    if (newlyAddedCdfNodeIds.length > 0) {
      const espCDFUser = store.userStore.user;
      console.log(
        `${MATTER_DISCOVERY_VERIFY_LOG} kick subscribe for ${newlyAddedCdfNodeIds.length} newly-added matter node(s):`,
        newlyAddedCdfNodeIds,
      );
      for (const cdfNodeId of newlyAddedCdfNodeIds) {
        // Pass the raw ESPRMNode lifted off the CDF mirror so the matter
        // user-adaptor's retry helper can subscribe even though the node
        // wasn't part of the cold-start `subscribeToAllNodes` snapshot.
        // Without this fallback the helper short-circuits on
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
      console.log(
        `${MATTER_DISCOVERY_VERIFY_LOG} replay cached discovery: matterNodeId=${matterNodeId} → nodeId=${cdfNodeId}`,
      );
      applyMatterLocalTransport(cdfNodeId, transport, "add");
    }
  }

  // ─── Discovery handlers ────────────────────────────────────────────────

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
      | { matterNodeId?: string }
      | undefined;
    const matterNodeId =
      typeof transportMeta?.matterNodeId === "string"
        ? normalizeMatterNodeIdHex(transportMeta.matterNodeId)
        : undefined;

    if (matterNodeId) {
      setMatterNodeReachability(matterNodeId, operation === "add");
    }

    handleNodeTransportUpdate(store, nodeId, transportDetails, operation);
    if (operation === "remove") {
      getMatterLocalDiscoveryRmngHooks()?.onMatterLocalTransportRemoved?.(
        store,
        nodeId,
      );
      return;
    }

    if (!store.nodeStore.getNodeById(nodeId)) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} transport registered for node ${nodeId} (not in nodeStore yet)`,
      );
      return;
    }

    console.log(
      `${MATTER_DISCOVERY_VERIFY_LOG} transport add: nodeId=${nodeId} type=${transportDetails.type}`,
      transportDetails.metadata,
    );
    // Recover from the post-login race: the base SDK kicks off
    // `subscribeToAllNodes` ~5s after `syncHomeWithNodes`, but the matter
    // local probe can take longer to attach the `matter_local` transport.
    // When that happens, the matter channel reports
    // `No available subscription channels for node …` and never retries.
    // Now that a channel is available, re-subscribe just this node — the
    // matter channel is idempotent, so this is a no-op when the initial
    // subscribe already succeeded.
    void retrySubscribeForNodeId(store.userStore.user, nodeId).catch(
      (error: unknown) => {
        console.warn(
          `${MATTER_DISCOVERY_VERIFY_LOG} retrySubscribe failed for nodeId=${nodeId}:`,
          error,
        );
      },
    );

    getMatterLocalDiscoveryRmngHooks()?.onMatterLocalTransportAdded?.(
      store,
      nodeId,
      transportDetails,
    );

    const cdfNode = store.nodeStore.getNodeById(nodeId);
    const meta = cdfNode?.metadata as
      | { isRmngPureMatterOfflineStub?: boolean }
      | undefined;
    if (cdfNode && meta?.isRmngPureMatterOfflineStub) {
      console.log(
        `${MATTER_DISCOVERY_VERIFY_LOG} pure-Matter offline stub refresh: nodeId=${nodeId}`,
      );
      getMatterLocalDiscoveryRmngHooks()?.onPureMatterStubReachable?.(
        store,
        nodeId,
        cdfNode,
      );
    }
  }

  function onMatterDiscovered(event: unknown): void {
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

    applyMatterLocalTransport(nodeId, transportDetails, "add");
  }

  function onMatterDiscoveryLost(event: unknown): void {
    rebuildMatterNodeIdMap();

    const payload = (
      event && typeof event === "object" ? event : null
    ) as MatterDiscoveryEventPayload | null;
    if (!payload) return;

    const pendingKey = payloadMatterNodeIdKey(payload);
    if (pendingKey && pendingByMatterNodeId.delete(pendingKey)) {
      console.log(
        `${MATTER_DISCOVERY_VERIFY_LOG} drop pending discovery on lost event: matterNodeId=${pendingKey}`,
      );
    }

    const nodeId = resolveNodeIdFromPayload(payload);
    if (!nodeId) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} skip discovery-lost event: no CDF node for matterNodeId=${payload.matterNodeId}`,
      );
      return;
    }

    const lostMatterNodeId = payloadMatterNodeIdKey(payload);
    if (lostMatterNodeId) {
      setMatterNodeReachability(lostMatterNodeId, false);
    }

    applyMatterLocalTransport(
      nodeId,
      {
        type: MATTER_LOCAL_TRANSPORT_KEY,
        metadata: {},
      },
      "remove",
    );
    console.log(
      `${MATTER_DISCOVERY_VERIFY_LOG} transport remove: nodeId=${nodeId} type=${MATTER_LOCAL_TRANSPORT_KEY}`,
      payload,
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

  async function ensureMatterDiscoveryReady(): Promise<void> {
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

      // iOS: RMNG never starts `_matter._tcp` browse — kick ESPDiscoveryModule directly (Android already does via CHIP/RMNG path).
      if (Platform.OS === "ios") {
        const espDiscoveryModule = NativeModules.ESPDiscoveryModule as
          | { startDiscovery?: (params: Record<string, string>) => void }
          | undefined;
        if (espDiscoveryModule?.startDiscovery) {
          console.log(
            `${MATTER_DISCOVERY_VERIFY_LOG} iOS direct matter browse → ESPDiscoveryModule.startDiscovery:`,
            { serviceType: MDNS_SERVICE_TYPE_MATTER_OPERATIONAL, domain: MDNS_DOMAIN_LOCAL },
          );
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
      } catch (error: unknown) {
        // Leave matterDiscoverySubscribed false so the next start() retries.
        console.warn(
          `${MATTER_DISCOVERY_VERIFY_LOG} matter discovery subscribe failed (will retry on next start):`,
          error,
        );
      }
    }

    // Fabric bootstrap (CASE session) runs after browse; slow on iOS and must not gate `_matter._tcp` start.
    try {
      await bootstrapMatterFabricForOperationalDiscovery(store);
    } catch (error: unknown) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} fabric bootstrap failed:`,
        error,
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
      void ensureMatterDiscoveryReady();
    },
    async stop(): Promise<void> {
      const espCDFUser = store.userStore.user;
      if (espCDFUser && matterDiscoverySubscribed) {
        await espCDFUser.unsubscribeFromEvent(
          MATTER_LOCAL_DISCOVERY_EVENT,
          onMatterDiscovered,
        );
        await espCDFUser.unsubscribeFromEvent(
          MATTER_LOCAL_DISCOVERY_LOST_EVENT,
          onMatterDiscoveryLost,
        );
      }
      if (nativeDiscoveryListeners) {
        nativeDiscoveryListeners.forEach((sub) => sub.remove());
        nativeDiscoveryListeners = null;
      }
      if (homeNodeSetReaction) {
        homeNodeSetReaction();
        homeNodeSetReaction = null;
      }
      matterDiscoverySubscribed = false;
      matterNodeToNodeIdMap = new Map();
      pendingByMatterNodeId.clear();
      lastSyncedHomeId = null;
      lastSyncedTargets = [];
      lastRebuildSignature = null;
      syncMatterDiscoveryTargetNodeIds([]);
      syncMatterNodeIdMappings([]);
    },
  };
}

// ─── Public entry ───────────────────────────────────────────────────────────

let controllerSingleton: MatterLocalDiscoveryController | null = null;

/**
 * Starts SDK-managed Matter local discovery and keeps CDF node transports in sync.
 *
 * Mirrors {@link startNodeLocalDiscovery}: subscribe once per app session via the
 * CDF user, rebuild the node-id map on each call (refresh / home switch), and
 * route discovered/lost payloads through the transport store.
 *
 * Idempotent across calls — re-invocations re-run `ensureMatterDiscoveryReady`
 * but reuse the same controller instance + event subscriptions.
 * @param store - The CDF store instance that manages application state.
 */
const startMatterLocalDiscovery = (store: ESPCDF): void => {
  if (!controllerSingleton) {
    controllerSingleton = createMatterLocalDiscoveryController(store);
  }
  controllerSingleton.start();
};

registerMatterDiscoveryOnNodesAddedKick(() => {
  if (ESPCDF.instance) {
    startMatterLocalDiscovery(ESPCDF.instance);
  }
});

export { startMatterLocalDiscovery };
