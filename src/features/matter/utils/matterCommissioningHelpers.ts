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
  ESPCDFUser,
} from "@store";
import type {
  FabricCommissioningBootstrap,
  MatterCommissioningErrorMessages,
  MatterCommissioningProgressCallbacks,
} from "@src/types/global";
import { ESPMatterUtilityAdapter } from "@native-adaptors/implementations/ESPMatterUtilityAdapter";
import {
  MATTER_FABRIC_BOOTSTRAP_ERROR_FABRIC_ID_MISMATCH,
  MATTER_FABRIC_BOOTSTRAP_ERROR_MISSING_FABRIC_CREDENTIALS,
} from "@features/matter/constants";
import { MATTER_DISCOVERY_VERIFY_LOG } from "@shared/utils/matterNodeIdHex";

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
): ESPCDFMatterPrecommissionInfo {
  const fabricDetails = fabric.fabricDetails;
  if (!fabricDetails) {
    throw new Error(errorMessage);
  }

  const rootCa = fabricDetails.rootCa ?? "";
  const matterUserId = fabricDetails.matterUserId ?? "";

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
  );

  await user.storePrecommissionInfo(precommissionInfo);
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

  console.log(
    `${MATTER_DISCOVERY_VERIFY_LOG} hydrateNativeFabricSession fabricId=${fabricId} groupId=${fabric.id} hasMatterUserId=${Boolean(details.matterUserId)}`,
  );

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

  const fabricId = home.fabricId ?? "";
  if (!fabricId) {
    console.warn(`${MATTER_DISCOVERY_VERIFY_LOG} fabric bootstrap: missing fabricId on home`);
    return;
  }

  await ensureNocReadyForFabric(
    home,
    user,
    {
      fabricIdMismatch: MATTER_FABRIC_BOOTSTRAP_ERROR_FABRIC_ID_MISMATCH,
      missingFabricCredentials: MATTER_FABRIC_BOOTSTRAP_ERROR_MISSING_FABRIC_CREDENTIALS,
    },
    () =>
      console.log(
        `${MATTER_DISCOVERY_VERIFY_LOG} fabric bootstrap: issuing user NOC for fabricId=${fabricId}`,
      ),
  );
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
 * await syncStore(store, user, refreshMatterMappingsAndRematch);
 * router.dismissTo("/(group)/Home");
 * ```
 */
export async function syncStore(
  store: ESPCDF,
  user: ESPCDFUser | null | undefined,
  refreshMappings: (cdfStore: ESPCDF) => Promise<void>,
): Promise<void> {
  if (user) {
    await user.syncHomeWithNodes?.();
  }

  try {
    await refreshMappings(store);
  } catch (error: unknown) {
    console.warn(
      "[matterCommissioningHelpers] syncStore refreshMappings failed:",
      error,
    );
  }
}
