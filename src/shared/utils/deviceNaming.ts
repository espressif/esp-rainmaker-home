/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Device naming policy: which channel can persist a name, how long it may be,
 * and how to write it.
 *
 * Deployments differ in where a device name actually lives — a writable cloud
 * param, a local device attribute, or node metadata — and picking between them
 * needs protocol knowledge the UI should not carry. Callers get plain answers
 * (`boolean`, `number | undefined`, a neutral result) and never learn which
 * channel served them. `deviceDisplayName.ts` reads the name back from the
 * same places.
 */

import type { ESPCDFDevice, ESPCDFNode } from "@store";
import {
  MATTER_METADATA_DEVICE_NAME_KEY,
  MATTER_METADATA_KEY,
} from "./constants";
import { getDeviceNameParam } from "./deviceDisplayName";
import {
  canRenameViaMatterNodeLabel,
  isNamedByMatterNodeLabel,
  MATTER_NODE_LABEL_MAX_LENGTH,
  renameViaMatterNodeLabel,
} from "./matterBasicInformation";
import {
  dropMatterNameRetry,
  pauseMatterNameRetry,
  queueMatterNameRetry,
} from "./matterNameRetry";

/**
 * Outcome of {@link saveDeviceName}, in channel-neutral terms. `invalid`
 * means nothing was written because the name breaks a naming rule.
 */
export type DeviceNameSaveResult = "saved" | "no-channel" | "failed" | "invalid";

/** Why a typed device name cannot be saved. */
export type DeviceNameProblem = "empty" | "too-long";

/** Message key to show for each {@link DeviceNameProblem}. */
export const DEVICE_NAME_PROBLEM_MESSAGE_KEYS: Record<DeviceNameProblem, string> =
  {
    empty: "device.validation.deviceNameCannotBeEmpty",
    "too-long": "device.validation.deviceNameTooLong",
  };

/**
 * Length of a name the way a Matter device counts it: UTF-8 bytes. For plain
 * English names this is the number of characters.
 * @param text - Name to measure
 * @returns Byte count
 */
const utf8ByteLength = (text: string): number => {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code < 0x10000) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
};

/**
 * Whether a node can be renamed despite exposing no writable name param.
 *
 * Callers use this to decide whether offering the rename field is meaningful;
 * which channel would carry the write is deliberately not exposed.
 * @param node - CDF node backing the settings screen
 * @returns True when a rename can still reach the device
 */
export const canRenameWithoutNameParam = (
  node: ESPCDFNode | undefined,
): boolean => (node ? canRenameViaMatterNodeLabel(node) : false);

/**
 * Length cap for a device name, or `undefined` when no app-side cap applies.
 *
 * A cap exists only where a channel imposes one: the name also goes to the
 * device's Matter name, now or once the device is back on the local network.
 * Cloud names are not capped, so the field stays unrestricted for them.
 * @param node - CDF node backing the settings screen
 * @returns Maximum name length, or undefined for no limit
 */
export const getDeviceNameMaxLength = (
  node: ESPCDFNode | undefined,
): number | undefined =>
  node && isNamedByMatterNodeLabel(node)
    ? MATTER_NODE_LABEL_MAX_LENGTH
    : undefined;

/**
 * Checks a typed name against every naming rule before anything is written.
 * @param name - Name as typed; surrounding spaces do not count
 * @param maxLength - Cap from {@link getDeviceNameMaxLength}
 * @returns The first rule the name breaks, or undefined when it can be saved
 */
export const findDeviceNameProblem = (
  name: string,
  maxLength: number | undefined,
): DeviceNameProblem | undefined => {
  const trimmed = name.trim();
  if (!trimmed) {
    return "empty";
  }
  if (maxLength !== undefined && utf8ByteLength(trimmed) > maxLength) {
    return "too-long";
  }
  return undefined;
};

/**
 * Writes the device's Matter name without letting a failure stop the save.
 * @param node - Node to rename
 * @param name - Name to write
 * @returns True when the device took the name
 */
const writeMatterNameQuietly = async (
  node: ESPCDFNode,
  name: string,
): Promise<boolean> => {
  try {
    return await renameViaMatterNodeLabel(node, name);
  } catch (error) {
    console.warn("[deviceNaming] Matter name write failed:", error);
    return false;
  }
};

/**
 * Persists an edited device name over whichever channel the node supports.
 *
 * A name that breaks a rule is refused before any write, so the channels can
 * never end up with different names because one of them cut it. Writes the
 * device's Matter name (NodeLabel) first, then the name param that every
 * phone reads; not all firmware copies one into the other, so both are
 * written. The name param (or, without one, node metadata) decides the
 * result: a Matter name the device did not take is retried later, see
 * `matterNameRetry.ts`.
 * @param node - Parent CDF node
 * @param device - Target sub-device
 * @param name - Trimmed name to persist
 * @returns Neutral result the caller maps to its own UI states
 */
export const saveDeviceName = async (
  node: ESPCDFNode,
  device: ESPCDFDevice | undefined,
  name: string,
): Promise<DeviceNameSaveResult> => {
  if (findDeviceNameProblem(name, getDeviceNameMaxLength(node))) {
    return "invalid";
  }

  // A derived pure Matter node has a Name param bound to NodeLabel; writing it
  // through the param reaches the device *and* reports the name into the node's
  // shadow (the durable, cross-phone store). Skip the direct NodeLabel write.
  const isDerivedMatterNode = Boolean(
    (node._raw as { derivedConfig?: unknown } | undefined)?.derivedConfig,
  );
  const namesMatterDevice =
    isNamedByMatterNodeLabel(node) && !isDerivedMatterNode;
  // An older name still waiting for the device must not land after this one.
  const resumeRetries = namesMatterDevice
    ? await pauseMatterNameRetry(node.id)
    : undefined;

  try {
    const nameParam = getDeviceNameParam(device);

    // Neither write updates the local param, so mirror it for the next transform.
    const applyLocally = () => {
      if (nameParam) {
        nameParam.value = name;
      }
      if (device) {
        device.displayName = name;
      }
    };

    // Only durable name store for a node with no name param.
    const persistMetadataName = async () => {
      const currentMetadata = node.metadata || {};
      const matterMetadata = currentMetadata[MATTER_METADATA_KEY] || {};
      await node.updateMetadata({
        ...currentMetadata,
        [MATTER_METADATA_KEY]: {
          ...matterMetadata,
          [MATTER_METADATA_DEVICE_NAME_KEY]: name,
        },
      });
    };

    // Never throws: a device that did not take the name is retried later.
    const matterNameWritten =
      namesMatterDevice && canRenameViaMatterNodeLabel(node)
        ? await writeMatterNameQuietly(node, name)
        : false;

    // Once the name is saved, the device either has it or gets it later.
    const settleMatterName = () => {
      if (!namesMatterDevice) {
        return;
      }
      if (matterNameWritten) {
        dropMatterNameRetry(node.id);
      } else {
        queueMatterNameRetry(node, device?.name, name);
      }
    };

    if (nameParam) {
      // A failed name param write fails the save even after NodeLabel: the name
      // every phone reads did not change, so it would come back after a restart.
      await nameParam.setValue(name);
      applyLocally();
      settleMatterName();
      return "saved";
    }

    const hasMetadataStore = Boolean(
      node.metadata && node.metadata[MATTER_METADATA_KEY],
    );

    if (hasMetadataStore) {
      try {
        await persistMetadataName();
      } catch (error) {
        // Device already renamed and the write is queued, so only pure fails.
        if (!matterNameWritten) {
          throw error;
        }
      }
      applyLocally();
      settleMatterName();
      return "saved";
    }

    return "no-channel";
  } catch {
    return "failed";
  } finally {
    resumeRetries?.();
  }
};
