/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CAT-rotation maintenance for Matter fabrics (revocation follow-up).
 *
 * When a shared user is removed from a fabric, the cloud bumps the version
 * suffix of the affected CAT (`XXXXVVVV` = 4-hex identifier + 4-hex version)
 * but never touches devices. Actually revoking requires two client-side steps,
 * in this order:
 *
 *   1. Every remaining member re-issues their user NOC so it carries the new
 *      CAT version. Matter treats the version in a device ACL subject as a
 *      MINIMUM, so newer-version NOCs keep working against un-swept devices —
 *      re-issuing first is always safe.
 *   2. The primary's phone sweeps every device's EP0 ACL, replacing the old
 *      CAT subject with the new one (operate CAT when a secondary was removed,
 *      admin CAT when a primary was removed — devices key their Administer
 *      entry to the admin CAT via AddNOC `caseAdminSubject`). This raises the
 *      device-side minimum version and is the step that actually cuts off the
 *      revoked user's old NOC.
 *
 * Rotation is detected without backend help by persisting the last CAT values
 * this phone acted on and diffing them against the fabric details returned by
 * group sync. First sight of a fabric only records a baseline (no sweep) —
 * detection starts from then on.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ESPCDFGroup } from "@store";
import { ESPMatterControlAdapter } from "@native-adaptors/implementations/ESPMatterControlAdapter";
import { readMatterNodeIdFromCdfNode } from "@shared/utils/matterDeviceStateEvents";

const CAT_ROTATION_PREFIX = "matter.catRotation.";
const CAT_ID_HEX_LENGTH = 8;

/** Persisted per-fabric CAT state (all values normalized 8-hex uppercase). */
interface MatterCatRotationRecord {
  /** Role CAT embedded in the user NOC stored on this phone. */
  issuedCatId?: string;
  /** Operate CAT this phone last swept the device fleet to (primary only). */
  appliedOperateCatId?: string;
  /**
   * Admin CAT this phone last swept the device fleet to (primary only).
   * Devices carry an admin-CAT-keyed Administer entry (AddNOC caseAdminSubject
   * is the admin CAT on both platforms), so admin-CAT rotation — a primary
   * being removed — needs the same device-side version raise as operate.
   */
  appliedAdminCatId?: string;
  /** Operate CAT the node list below was verified against. */
  verifiedOperateCatId?: string;
  /** Nodes confirmed to carry the operate CAT entry at `verifiedOperateCatId`. */
  verifiedOperateNodeIds?: string[];
}

function rotationKey(groupId: string): string {
  return `${CAT_ROTATION_PREFIX}${groupId}`;
}

/**
 * Normalizes a CAT id to 8 uppercase hex chars (identifier + version).
 * @param catId - Raw CAT value from fabric details (may carry 0x, any case).
 * @returns Normalized CAT id, or null when missing/malformed.
 */
function normalizeCatId(catId: string | undefined): string | null {
  if (!catId) {
    return null;
  }
  const cleaned = catId.replace(/^0[xX]/, "").toUpperCase();
  return cleaned.length === CAT_ID_HEX_LENGTH && /^[0-9A-F]+$/.test(cleaned)
    ? cleaned
    : null;
}

/**
 * Whether `current` is a newer version of the same CAT identifier as `recorded`.
 * @param current - Normalized CAT id from fresh fabric details.
 * @param recorded - Normalized CAT id persisted earlier.
 * @returns True when identifiers match and the current version is higher.
 */
function isNewerCatVersion(current: string, recorded: string): boolean {
  if (current.slice(0, 4) !== recorded.slice(0, 4)) {
    return false;
  }
  return parseInt(current.slice(4), 16) > parseInt(recorded.slice(4), 16);
}

/** Reads the persisted CAT state for a fabric (null when absent/corrupt). */
async function getCatRotationRecord(
  groupId: string,
): Promise<MatterCatRotationRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(rotationKey(groupId));
    return raw ? (JSON.parse(raw) as MatterCatRotationRecord) : null;
  } catch {
    return null;
  }
}

/** Merges fields into the persisted CAT state for a fabric. */
async function mergeCatRotationRecord(
  groupId: string,
  patch: MatterCatRotationRecord,
): Promise<void> {
  try {
    const existing = (await getCatRotationRecord(groupId)) ?? {};
    await AsyncStorage.setItem(
      rotationKey(groupId),
      JSON.stringify({ ...existing, ...patch }),
    );
  } catch {
    // Best effort: a failed write just means the next bootstrap re-detects.
  }
}

/**
 * Resolves the CAT the current user's NOC carries on this fabric:
 * admin CAT for the primary, operate CAT for shared (secondary) members.
 * A missing `isPrimaryUser` is treated as primary (owned homes may omit it).
 * @param home - Matter home / fabric group from the store.
 * @returns Normalized role CAT, or null when fabric details lack it.
 */
function resolveRoleCatId(home: ESPCDFGroup): string | null {
  const details = home.fabricDetails;
  const raw =
    home.isPrimaryUser === false
      ? details?.groupCatIdOperate
      : details?.groupCatIdAdmin;
  return normalizeCatId(raw);
}

/**
 * Records the role CAT just embedded in a freshly issued/stored user NOC.
 * Call right after `storePrecommissionInfo` succeeds. Best-effort.
 * @param home - Fabric the NOC was issued for (fabricDetails populated).
 */
export async function recordIssuedCatForFabric(home: ESPCDFGroup): Promise<void> {
  const roleCat = resolveRoleCatId(home);
  if (roleCat) {
    await mergeCatRotationRecord(home.id, { issuedCatId: roleCat });
  }
  // No role CAT in fabricDetails leaves staleness detection disabled for this
  // fabric; the next NOC issue with one re-arms it.
}

/**
 * Whether the user NOC stored for this fabric predates a CAT rotation and
 * must be re-issued (its CAT version is older than the group's current one).
 *
 * A fabric seen for the first time (no record — e.g. a NOC issued before this
 * feature shipped) records the current CAT as the baseline and reports fresh:
 * rotation handling starts from the next rotation onward.
 * @param home - Matter home / fabric group with `fabricDetails` populated.
 * @returns True when the stored NOC's CAT is stale.
 */
export async function isUserNocStaleForFabric(
  home: ESPCDFGroup,
): Promise<boolean> {
  const roleCat = resolveRoleCatId(home);
  if (!roleCat) {
    return false;
  }

  const record = await getCatRotationRecord(home.id);
  if (!record?.issuedCatId) {
    // Pre-feature NOC: adopt the current value, staleness starts next rotation.
    await mergeCatRotationRecord(home.id, { issuedCatId: roleCat });
    return false;
  }
  return isNewerCatVersion(roleCat, record.issuedCatId);
}

/** Matter nodes of a home that carry a usable matter node id. */
function collectMatterNodeIds(
  home: ESPCDFGroup,
): { cdfNodeId: string; matterNodeId: string }[] {
  const result: { cdfNodeId: string; matterNodeId: string }[] = [];
  for (const node of home.nodeDetails ?? []) {
    const matterNodeId = readMatterNodeIdFromCdfNode(node);
    if (matterNodeId) {
      result.push({ cdfNodeId: node.id, matterNodeId });
    }
  }
  return result;
}

/** Fields of {@link MatterCatRotationRecord} that track a fleet-applied CAT. */
type AppliedCatField = "appliedOperateCatId" | "appliedAdminCatId";

/**
 * Sweeps every device's EP0 ACL subject for ONE CAT (operate or admin) when
 * its persisted fleet value is behind the fabric's current one.
 *
 * The record is only advanced when EVERY device was updated, so partial
 * failures (offline devices) retry on the next bootstrap — per-device updates
 * are idempotent. First sight of a fabric records a baseline and never sweeps.
 * @param home - Matter home / fabric group with `fabricDetails` populated.
 * @param field - Which fleet-applied record field this CAT tracks.
 * @param currentCat - The fabric's current normalized CAT value.
 */
async function sweepCatIfRotated(
  home: ESPCDFGroup,
  field: AppliedCatField,
  currentCat: string,
): Promise<void> {
  const record = await getCatRotationRecord(home.id);
  const applied = record?.[field];
  if (!applied) {
    // No baseline yet: adopt the current value, sweeps start next rotation.
    await mergeCatRotationRecord(home.id, { [field]: currentCat });
    return;
  }
  if (applied === currentCat) {
    return;
  }
  if (!isNewerCatVersion(currentCat, applied)) {
    // Different identifier or older version — nothing we can safely sweep to;
    // adopt the current value so detection re-arms from here.
    await mergeCatRotationRecord(home.id, { [field]: currentCat });
    return;
  }

  const nodes = collectMatterNodeIds(home);

  let allUpdated = true;
  for (const { matterNodeId } of nodes) {
    try {
      const result = await ESPMatterControlAdapter.updateCatAclSubject(
        matterNodeId,
        currentCat,
      );
      if (!result.success) {
        allUpdated = false;
      }
    } catch {
      allUpdated = false;
    }
  }

  // Only advance the record when every device took the new CAT; an incomplete
  // sweep leaves it at the old value so the next bootstrap retries the stragglers.
  if (allUpdated) {
    await mergeCatRotationRecord(home.id, { [field]: currentCat });
  }
}

/**
 * Confirms every device actually carries the operate CAT entry, once per device.
 *
 * The rotation sweep only runs when the fabric's CAT changes, so a device whose
 * commissioning-time ACL write never landed is otherwise never revisited and
 * silently stays unreachable to secondary members. The per-device update is
 * idempotent and appends a missing entry, so re-running it is the repair.
 * @param home - Matter home / fabric group with `fabricDetails` populated.
 * @param currentOperateCat - Fabric's current operate CAT, already normalized.
 */
async function verifyOperateCatEntries(
  home: ESPCDFGroup,
  currentOperateCat: string,
): Promise<void> {
  const record = await getCatRotationRecord(home.id);
  // A fleet behind on rotation is the sweep's job; only cover what it leaves.
  if (record?.appliedOperateCatId !== currentOperateCat) {
    return;
  }

  const verified =
    record.verifiedOperateCatId === currentOperateCat
      ? new Set(record.verifiedOperateNodeIds ?? [])
      : new Set<string>();
  const pending = collectMatterNodeIds(home).filter(
    ({ matterNodeId }) => !verified.has(matterNodeId),
  );
  if (pending.length === 0) {
    return;
  }

  for (const { matterNodeId } of pending) {
    try {
      const result = await ESPMatterControlAdapter.updateCatAclSubject(
        matterNodeId,
        currentOperateCat,
      );
      if (result.success) {
        verified.add(matterNodeId);
      }
      // An unconfirmed node stays out of `verified`, so the next bootstrap retries it.
    } catch {
      // Unreachable device: same as above, retried next bootstrap.
    }
  }

  await mergeCatRotationRecord(home.id, {
    verifiedOperateCatId: currentOperateCat,
    verifiedOperateNodeIds: [...verified],
  });
}

/**
 * Device-side half of revocation (primary only): after a CAT rotation, raise
 * every device's ACL subject to the fabric's current CAT version.
 *
 * Covers BOTH CATs, since devices key their Administer entry to the admin CAT
 * (AddNOC `caseAdminSubject`) and their Operate entry to the operate CAT:
 * - operate CAT rotates when a secondary member is removed;
 * - admin CAT rotates when a primary member is removed — without the sweep the
 *   removed primary would retain full ADMIN control.
 *
 * Run only after this phone's own NOC readiness (re-issue precedes sweep).
 * @param home - Matter home / fabric group with `fabricDetails` populated.
 */
export async function repairRotatedCatAcls(home: ESPCDFGroup): Promise<void> {
  if (home.isPrimaryUser === false || !home.isMatter) {
    return;
  }

  const currentOperateCat = normalizeCatId(home.fabricDetails?.groupCatIdOperate);
  if (currentOperateCat) {
    await sweepCatIfRotated(home, "appliedOperateCatId", currentOperateCat);
    await verifyOperateCatEntries(home, currentOperateCat);
  }

  const currentAdminCat = normalizeCatId(home.fabricDetails?.groupCatIdAdmin);
  if (currentAdminCat) {
    await sweepCatIfRotated(home, "appliedAdminCatId", currentAdminCat);
  }
}

/**
 * Drops persisted CAT state for fabrics the user no longer has access to
 * (left, unshared, or deleted homes). Call after a successful group sync;
 * an empty group list is ignored so a failed sync never wipes state.
 * @param currentGroupIds - Group ids present in the store after sync.
 */
export async function cleanupDepartedMatterFabricState(
  currentGroupIds: readonly string[],
): Promise<void> {
  if (currentGroupIds.length === 0) {
    return;
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const departed = keys.filter(
      (key) =>
        key.startsWith(CAT_ROTATION_PREFIX) &&
        !currentGroupIds.includes(key.slice(CAT_ROTATION_PREFIX.length)),
    );
    if (departed.length > 0) {
      await AsyncStorage.multiRemove(departed);
    }
  } catch {
    // Stale keys are harmless; the next bootstrap tries again.
  }
}
