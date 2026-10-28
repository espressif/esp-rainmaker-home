/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPCDF,
  ESPCDFGroup,
  ESPCDFMatterFabricDetails,
  ESPCDFMatterPrecommissionInfo,
  ESPCDFNode,
  ESPCDFUser,
} from "@store";
import type {
  FabricCommissioningBootstrap,
  MatterCommissioningErrorMessages,
  MatterCommissioningProgressCallbacks,
} from "@src/types/global";
import { ESPMatterUtilityAdapter } from "@native-adaptors/implementations/ESPMatterUtilityAdapter";
import { markForceFreshCsrForFabric } from "@native-adaptors/implementations/ESPMatterAdapter";
import type { SyncHomeWithNodes } from "@context/store.context";
import {
  MATTER_FABRIC_BOOTSTRAP_ERROR_FABRIC_ID_MISMATCH,
  MATTER_FABRIC_BOOTSTRAP_ERROR_MISSING_FABRIC_CREDENTIALS,
} from "@features/matter/constants";
import {
  cleanupDepartedMatterFabricState,
  isUserNocStaleForFabric,
  recordIssuedCatForFabric,
  repairRotatedCatAcls,
} from "@features/matter/utils/matterCatRotation";
import {
  MATTER_DISCOVERY_VERIFY_LOG,
  normalizeMatterNodeIdHex,
} from "@shared/utils/matterNodeIdHex";
import { readMatterNodeIdFromCdfNode } from "@shared/utils/matterDeviceStateEvents";

/**
 * Decides whether commissioning can start on the active home or must pause for fabric conversion.
 *
 * Used by {@link useCommissioning} after reading `store.getCurrentHome()`. When the home is
 * already Matter (`isMatter`), commissioning can proceed. When it is not, either show consent UI
 * or auto-convert depending on the route flag.
 * @example
 * ```ts
 * const bootstrap = isFabricReady(home, fabricConversionConsentRequired);
 * if (bootstrap.kind === "needs_conversion") {
 *   setPhase(MATTER_COMMISSIONING_PHASE_NEEDS_CONVERSION);
 *   return;
 * }
 * let fabric = bootstrap.fabric;
 * if (!fabric.isMatter) {
 *   fabric = await convertHomeToMatterFabric(home);
 * }
 * ```
 */
export function isFabricReady(
  home: ESPCDFGroup,
  fabricConversionConsentRequired: boolean,
): FabricCommissioningBootstrap {
  if (home.isMatter) {
    return { kind: "ready", fabric: home };
  }

  if (fabricConversionConsentRequired) {
    return { kind: "needs_conversion" };
  }

  return { kind: "ready", fabric: home };
}

/**
 * Validates that the group id returned from `issueUserNoC` matches the active fabric.
 *
 * An empty response group id is treated as valid (server omitted the field).
 * @example
 * ```ts
 * if (!isFabricIdMatch(certificate?.groupId ?? "", fabric.id)) {
 *   throw new Error(messages.fabricIdMismatch);
 * }
 * ```
 */
export function isFabricIdMatch(
  groupIdFromResponse: string,
  fabricGroupId: string,
): boolean {
  if (!groupIdFromResponse) {
    return true;
  }
  return groupIdFromResponse === fabricGroupId;
}

/**
 * Assembles the payload passed to `ESPCDFUser.storePrecommissionInfo` after NOC issuance.
 *
 * Requires `fabric.fabricDetails` (from `getFabricDetails`) plus the user NOC string from
 * `issueUserNoC`. Throws when fabric details or credentials are incomplete.
 * @example
 * ```ts
 * const payload = buildCommissioningFabricData(
 *   fabric,
 *   userNoc,
 *   fabric.fabricId ?? "",
 *   t("device.matter.commissioning.missingFabricCredentials"),
 * );
 * await user.storePrecommissionInfo(payload);
 * ```
 */
export function buildCommissioningFabricData(
  fabric: ESPCDFGroup,
  userNoc: string,
  fabricId: string,
  errorMessage: string,
  matterUserIdFromNoc?: string,
): ESPCDFMatterPrecommissionInfo {
  const fabricDetails = fabric.fabricDetails;
  if (!fabricDetails) {
    throw new Error(errorMessage);
  }

  const rootCa = fabricDetails.rootCa ?? "";
  // The two stacks carry this on different payloads: RainMaker returns it with
  // the fabric details, Neo only with the issued NoC. Prefer the fabric so RM is
  // untouched, and fall back to the certificate for Neo.
  const matterUserId = fabricDetails.matterUserId || matterUserIdFromNoc || "";

  if (!userNoc || !rootCa || !matterUserId) {
    throw new Error(errorMessage);
  }

  return {
    groupId: fabric.id,
    fabricId,
    name: fabric.name,
    userNoc,
    matterUserId,
    rootCa,
    ipk: fabricDetails.ipk,
    groupCatIdOperate: fabricDetails.groupCatIdOperate,
    groupCatIdAdmin: fabricDetails.groupCatIdAdmin,
    userCatId: fabricDetails.userCatId,
  };
}

/**
 * Checks whether the user still needs a NOC stored for this fabric before commissioning.
 *
 * Wraps `user.isUserNocAvailableForFabric`. When this returns `true`, call {@link issueNoc}.
 * @example
 * ```ts
 * if (await isNocRequired(fabric, user)) {
 *   setStatusMessage(t("device.matter.commissioning.statusIssuingCertificate"));
 *   await issueNoc(fabric, user, commissioningErrors);
 * }
 * ```
 */
export async function isNocRequired(
  fabric: ESPCDFGroup,
  user: ESPCDFUser,
): Promise<boolean> {
  const fabricId = fabric.fabricId ?? "";
  const nocAvailable = await user.isUserNocAvailableForFabric(fabricId);
  return !nocAvailable;
}

/**
 * Issues a user NOC, validates the response, and persists precommission credentials.
 *
 * Call only after {@link isNocRequired} is `true` and `fabric.getFabricDetails()` has run.
 * Uses {@link isFabricIdMatch} and {@link buildCommissioningFabricData} internally.
 * @example
 * ```ts
 * if (await isNocRequired(fabric, user)) {
 *   await issueNoc(fabric, user, {
 *     fabricIdMismatch: t("device.matter.commissioning.fabricIdMismatch"),
 *     missingFabricCredentials: t("device.matter.commissioning.missingFabricCredentials"),
 *   });
 * }
 * ```
 */
export async function issueNoc(
  fabric: ESPCDFGroup,
  user: ESPCDFUser,
  messages: MatterCommissioningErrorMessages,
): Promise<void> {
  const fabricId = fabric.fabricId ?? "";
  const response = await fabric.issueUserNoC();
  const certificate = response.certificates?.at(0);
  const groupIdFromResponse = certificate?.groupId ?? "";

  if (!isFabricIdMatch(groupIdFromResponse, fabric.id)) {
    throw new Error(messages.fabricIdMismatch);
  }

  const userNoc = certificate?.userNoC ?? "";
  const precommissionInfo = buildCommissioningFabricData(
    fabric,
    userNoc,
    fabricId,
    messages.missingFabricCredentials,
    certificate?.matterUserId,
  );

  await user.storePrecommissionInfo(precommissionInfo);
  // Remember which CAT version this NOC carries so a later CAT rotation
  // (member removed from the fabric) can be detected and the NOC re-issued.
  await recordIssuedCatForFabric(fabric);
}

/**
 * Loads fabric details and issues/stores NOC when required—single prep step before commissioning.
 *
 * Combines `getFabricDetails`, {@link isNocRequired}, and {@link issueNoc}. The optional
 * progress callback fires immediately before NOC issuance for UI status updates.
 * @example
 * ```ts
 * await prepareFabric(fabric, user, commissioningErrors, {
 *   onIssuingCertificate: () =>
 *     setStatusMessage(t("device.matter.commissioning.statusIssuingCertificate")),
 * });
 * await fabric.startCommissioning(qrData, onProgress);
 * ```
 */
function mergeFabricSessionDetails(
  fabric: ESPCDFGroup,
  details: ESPCDFMatterFabricDetails,
): ESPCDFMatterFabricDetails {
  const cached = fabric.fabricDetails;
  return {
    ...details,
    rootCa: details.rootCa || cached?.rootCa || "",
    matterUserId: details.matterUserId || cached?.matterUserId || "",
    ipk: details.ipk || cached?.ipk,
    groupCatIdOperate: details.groupCatIdOperate || cached?.groupCatIdOperate,
    groupCatIdAdmin: details.groupCatIdAdmin || cached?.groupCatIdAdmin,
    userCatId: details.userCatId || cached?.userCatId,
  };
}

/** Hydrates native {@link FabricSessionManager} when user NOC already exists in KeyStore. */
export async function hydrateNativeFabricSessionIfNeeded(
  fabric: ESPCDFGroup,
  user: ESPCDFUser,
): Promise<void> {
  const fabricId = fabric.fabricId ?? "";
  if (!fabricId) {
    return;
  }

  if (await isNocRequired(fabric, user)) {
    return;
  }

  const details = mergeFabricSessionDetails(
    fabric,
    fabric.fabricDetails ?? (await fabric.getFabricDetails()),
  );

  if (!details.rootCa || !details.ipk) {
    throw new Error(MATTER_FABRIC_BOOTSTRAP_ERROR_MISSING_FABRIC_CREDENTIALS);
  }

  await ESPMatterUtilityAdapter.syncFabricSession({
    groupId: fabric.id,
    fabricId,
    name: fabric.name,
    rootCa: details.rootCa,
    matterUserId: details.matterUserId ?? "",
    ipk: details.ipk,
    groupCatIdOperate: details.groupCatIdOperate,
    groupCatIdAdmin: details.groupCatIdAdmin,
    userCatId: details.userCatId,
  });
}

/**
 * Serializes NOC issuance/hydration per fabricId.
 *
 * `generateKeypair` (Android KeyStore, keyed by fabricId) unconditionally overwrites any
 * existing key for that alias, and `storePrecommissionInfo` rebinds the newly-issued NOC to
 * whatever key currently sits under that alias with no check that they still match. Two
 * overlapping callers issuing/hydrating a NOC for the same fabricId can therefore leave the
 * KeyStore private key permanently mismatched with the NOC stored alongside it - every later
 * CASE session on that fabric then fails Sigma3 signature verification ("ECP - The signature
 * is not valid") until that fabric's key/NOC pair is regenerated together. Callers here
 * (`prepareFabric`, `bootstrapMatterFabricForOperationalDiscovery`) share one in-flight
 * promise per fabricId so only one issuance/hydration ever runs at a time.
 */
const fabricSessionInFlight = new Map<string, Promise<void>>();

async function ensureNocReadyForFabric(
  fabric: ESPCDFGroup,
  user: ESPCDFUser,
  messages: MatterCommissioningErrorMessages,
  onIssuingCertificate?: () => void,
): Promise<void> {
  const fabricId = fabric.fabricId ?? "";
  if (!fabricId) {
    return;
  }

  const existing = fabricSessionInFlight.get(fabricId);
  if (existing) {
    return existing;
  }

  const run = (async () => {
    if (await isNocRequired(fabric, user)) {
      onIssuingCertificate?.();
      await issueNoc(fabric, user, messages);
    } else if (await isUserNocStaleForFabric(fabric)) {
      // The group's CAT version moved past the stored NOC's (a member was
      // removed and the CAT rotated) — re-issue so this phone keeps matching
      // device ACLs once the primary's sweep raises their minimum version.
      // Matter treats ACL CAT versions as minimums, so re-issuing before the
      // sweep lands is always safe.
      // The KeyStore already holds a chain for this fabric, which would make
      // Android's generateCSR short-circuit without a CSR — force a fresh
      // keypair for this one issuance (key + NOC are rebound together below).
      markForceFreshCsrForFabric(fabricId);
      onIssuingCertificate?.();
      await issueNoc(fabric, user, messages);
    } else {
      await hydrateNativeFabricSessionIfNeeded(fabric, user);
    }
  })();

  fabricSessionInFlight.set(fabricId, run);
  try {
    await run;
  } finally {
    fabricSessionInFlight.delete(fabricId);
  }
}

/**
 * Ensures the given Matter fabric has fabric details and a ready user NOC.
 * @param fabric - Matter home / fabric group from the store
 * @param user - Current CDF user used for NOC issuance when needed
 * @param messages - Localized error copy for commissioning failures
 * @param progress - Optional callbacks (e.g. certificate issuance UI)
 * @returns Fabric details after NOC readiness is ensured
 */
export async function prepareFabric(
  fabric: ESPCDFGroup,
  user: ESPCDFUser,
  messages: MatterCommissioningErrorMessages,
  progress?: MatterCommissioningProgressCallbacks,
): Promise<ESPCDFMatterFabricDetails> {
  const details = await fabric.getFabricDetails();
  await ensureNocReadyForFabric(fabric, user, messages, progress?.onIssuingCertificate);
  return details;
}

/**
 * Ensures the given Matter home has a stored user NOC and a hydrated native fabric session.
 *
 * Works for any home the user can access — owned or shared. For a shared home the
 * NOC issuance is the fabric-join step: the cloud embeds the operate CAT for a
 * secondary member, and devices already grant that CAT via the ACL entry written
 * at commissioning time, so no device interaction is needed here.
 *
 * No-ops (without error) when the home is not a Matter fabric or has no fabricId.
 * Serialized per fabricId via {@link ensureNocReadyForFabric}.
 * @param home - Matter home / fabric group from the store (owned or shared).
 * @param user - Current CDF user used for NOC issuance when needed.
 */
export async function bootstrapMatterFabricForHome(
  home: ESPCDFGroup,
  user: ESPCDFUser,
): Promise<void> {
  if (!home.isMatter) {
    return;
  }

  const fabricId = home.fabricId ?? "";
  if (!fabricId) {
    console.warn(`${MATTER_DISCOVERY_VERIFY_LOG} fabric bootstrap: missing fabricId on home`);
    return;
  }

  // Classic's home-list sync never carries fabric credentials (the request
  // flag that would fetch them is coupled to an is_matter filter that drops
  // non-Matter homes from the list), so a shared home reaches here with no
  // fabricDetails and NOC issuance would fail. Hydrate on demand — Neo homes
  // arrive hydrated and skip this. Best-effort: on failure fall through so
  // the NOC path surfaces the real error.
  if (!home.fabricDetails) {
    try {
      await home.getFabricDetails();
    } catch (error) {
      console.warn(
        `${MATTER_DISCOVERY_VERIFY_LOG} fabric bootstrap: getFabricDetails failed for home id=${home.id}:`,
        error,
      );
    }
  }

  await ensureNocReadyForFabric(
    home,
    user,
    {
      fabricIdMismatch: MATTER_FABRIC_BOOTSTRAP_ERROR_FABRIC_ID_MISMATCH,
      missingFabricCredentials: MATTER_FABRIC_BOOTSTRAP_ERROR_MISSING_FABRIC_CREDENTIALS,
    },
  );

  // Revocation follow-up (primary only, no-op without a detected rotation):
  // sweep device ACLs to the current operate/admin CAT versions. Runs after
  // NOC readiness so this phone's own re-issue (above) always precedes the
  // sweep. Fire-and-forget — a partial sweep retries on the next bootstrap.
  void repairRotatedCatAcls(home).catch((error: unknown) => {
    console.warn(
      `${MATTER_DISCOVERY_VERIFY_LOG} CAT ACL sweep failed for ${home.id}:`,
      error,
    );
  });
}

/**
 * Runs the fabric bootstrap for every Matter home among the given group ids.
 *
 * Shared sync-then-bootstrap follow-up for group-membership events (share
 * accepted, member removed): call after the store has been synced so the
 * affected groups carry fresh `fabricDetails`. Each home gets the full
 * {@link bootstrapMatterFabricForHome} treatment — user NOC issuance or
 * re-issuance when the CAT rotated, plus the primary's device ACL sweep.
 *
 * Fire-and-forget semantics: per-home failures are logged only, since the
 * triggering operation already succeeded and the home-focus bootstrap retries
 * later as the safety net. Non-Matter groups are skipped silently.
 * @param store - CDF store, synced so the affected groups are present.
 * @param groupIds - Group ids touched by the triggering event. A room
 * (subgroup) id resolves to the Matter home that owns it, so room-scoped
 * shares still bootstrap the parent fabric.
 * @param logContext - Greppable tag + event prefix for the failure log line, e.g.
 * `"[SHARED-FABRIC-VERIFY] share accepted"`.
 */
export async function bootstrapMatterFabricsForGroups(
  store: ESPCDF,
  groupIds: readonly string[],
  logContext: string,
): Promise<void> {
  const user = store.userStore.user;
  if (!user) {
    return;
  }

  const homes = store.groupStore.groupsList ?? [];
  // A room (subgroup) share carries the subgroup id, not the home id — the
  // room itself is never a Matter home, so resolve each id to the top-level
  // home that owns it before filtering on isMatter.
  const matterHomesById = new Map<string, ESPCDFGroup>();
  for (const groupId of groupIds) {
    const home =
      homes.find((candidate) => candidate.id === groupId) ??
      homes.find((candidate) =>
        (candidate.subGroups ?? []).some((subGroup) => subGroup.id === groupId),
      );
    if (home?.isMatter) {
      matterHomesById.set(home.id, home);
    }
  }
  const matterHomes = [...matterHomesById.values()];

  for (const home of matterHomes) {
    try {
      await bootstrapMatterFabricForHome(home, user);
    } catch (error) {
      console.warn(
        `${logContext}: fabric bootstrap failed for home id=${home.id} (will retry on next bootstrap):`,
        error,
      );
    }
  }
}

/**
 * Prepares native fabric session for operational discovery on the active Matter home.
 *
 * Fetches cloud fabric details via `home.getFabricDetails()`, issues/stores user NOC when
 * KeyStore is empty, otherwise syncs session metadata + existing KeyStore chain to
 * the native fabric session (Android {@link FabricSessionManager}, iOS
 * `ESPMatterModule.syncFabricSession`).
 * @param store - CDF store with active Matter home selected.
 */
export async function bootstrapMatterFabricForOperationalDiscovery(
  store: ESPCDF,
): Promise<void> {
  const home = store.getCurrentHome() as ESPCDFGroup | null;
  if (!home?.isMatter) {
    return;
  }

  const user = store.userStore.user;
  if (!user) {
    console.warn(`${MATTER_DISCOVERY_VERIFY_LOG} fabric bootstrap: no CDF user`);
    return;
  }

  // Drop CAT-rotation state for homes that left the account (unshared/deleted),
  // so a re-share later starts from a fresh baseline. Best-effort.
  const groupIds = (store.groupStore.groupsList ?? []).map((group) => group.id);
  void cleanupDepartedMatterFabricState(groupIds);

  await bootstrapMatterFabricForHome(home, user);
}

/**
 * Converts the active RainMaker home to a Matter fabric via the group CDF operation.
 *
 * Thin wrapper around `ESPCDFGroup.convertToMatterFabric()` so the hook stays free of
 * duplicate SDK wiring.
 * @example
 * ```ts
 * const fabric = await convertHomeToMatterFabric(home);
 * await prepareFabric(fabric, user, commissioningErrors);
 * ```
 */
export async function convertHomeToMatterFabric(
  home: ESPCDFGroup,
): Promise<ESPCDFGroup> {
  return home.convertToMatterFabric();
}

/**
 * Refreshes CDF state after successful Matter commissioning.
 *
 * Syncs homes and nodes from the cloud, then runs Matter local mapping refresh (e.g.
 * `refreshMatterMappingsAndRematch`). Mapping failures are logged and do not throw so
 * navigation home is not blocked.
 * @example
 * ```ts
 * await syncStore(store, syncHomeWithNodes, refreshMatterMappingsAndRematch);
 * router.dismissTo("/(group)/Home");
 * ```
 */
export async function syncStore(
  store: ESPCDF,
  syncHomeWithNodes: SyncHomeWithNodes,
  refreshMappings: (cdfStore: ESPCDF) => Promise<void>,
): Promise<void> {
  await syncHomeWithNodes({ force: true });

  try {
    await refreshMappings(store);
  } catch (error: unknown) {
    console.warn(
      "[matterCommissioningHelpers] syncStore refreshMappings failed:",
      error,
    );
  }
}

/**
 * Resolves a commissioned node's cloud node id by matching its Matter node id
 * against the synced store.
 *
 * Classic pure Matter has no other source for the cloud id: the confirm
 * response returns only `{status, description}` (the cloud mints the node id
 * at confirm time but does not echo it back), so the completion event's
 * cloud-id keys arrive blank. After {@link syncStore} the minted node is in
 * the store carrying the Matter node id the event does have.
 * @param store - CDF store, synced after commissioning completed.
 * @param matterNodeId - Matter node id from the completion event payload.
 * @returns Cloud node id, or `undefined` when no synced node matches.
 */
export function findCloudNodeIdByMatterNodeId(
  store: ESPCDF,
  matterNodeId: unknown,
): string | undefined {
  const target = normalizeMatterNodeIdHex(
    typeof matterNodeId === "string" ? matterNodeId : undefined,
  );
  if (!target) {
    return undefined;
  }

  return findSyncedNode(
    store,
    (node) =>
      normalizeMatterNodeIdHex(readMatterNodeIdFromCdfNode(node)) === target,
  )?.id;
}

/**
 * Finds a node in the freshly synced store.
 *
 * Two places have to be checked: the node store can lag a per-group sync, and
 * until it catches up the commissioned node is only reachable through its
 * home's `nodeDetails`.
 * @param store - CDF store, synced after commissioning completed.
 * @param matches - Predicate identifying the wanted node.
 * @returns The node, or `undefined` when neither list holds it yet.
 */
function findSyncedNode(
  store: ESPCDF,
  matches: (node: ESPCDFNode) => boolean,
): ESPCDFNode | undefined {
  const fromNodeStore = (store.nodeStore?.nodesList ?? []).find(matches);
  if (fromNodeStore) {
    return fromNodeStore;
  }

  for (const home of store.groupStore?.groupsList ?? []) {
    const fromHome = (home.nodeDetails ?? []).find(matches);
    if (fromHome) {
      return fromHome;
    }
  }
  return undefined;
}
