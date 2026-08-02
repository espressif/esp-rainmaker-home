/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ClusterParamOption,
  ClusterParamResolver,
} from "@espressif/rainmaker-matter-sdk";
import {
  MATTER_USER_LABEL_CONTEXT_TAG_LABEL,
  MATTER_USER_LABEL_CONTEXT_TAG_VALUE,
  MATTER_USER_LABEL_DEVICE_NAME_KEY,
  MATTER_USER_LABEL_FIELD_LABEL,
  MATTER_USER_LABEL_FIELD_VALUE,
  MATTER_USER_LABEL_MAX_LENGTH,
} from "../constants";
import {
  MATTER_DATA_VALUE_TYPE_ARRAY,
  MATTER_DATA_VALUE_TYPE_STRUCTURE,
  MATTER_DATA_VALUE_TYPE_UTF8_STRING,
} from "@shared/utils/constants";

/** One normalized entry from the Matter User Label LabelList attribute. */
interface MatterUserLabelEntry {
  label: string;
  value: string;
}

/**
 * Unwraps an attribute wrapper while preserving a raw LabelList array.
 * @param rawValue - Attribute value from local Matter or the RainMaker Neo shadow.
 * @returns Candidate LabelList payload.
 */
function unwrapLabelList(rawValue: unknown): unknown {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }
  if (rawValue !== null && typeof rawValue === "object") {
    const wrappedValue = (rawValue as Record<string, unknown>)[
      MATTER_USER_LABEL_FIELD_VALUE
    ];
    if (Array.isArray(wrappedValue)) {
      return wrappedValue;
    }
  }
  return rawValue;
}

/**
 * Normalizes one User Label structure from named fields or Matter context tags.
 * @param candidate - Raw LabelStruct emitted by the local or cloud decoder.
 * @returns Normalized label entry, or undefined for an invalid structure.
 */
function normalizeUserLabelEntry(
  candidate: unknown,
): MatterUserLabelEntry | undefined {
  if (candidate === null || typeof candidate !== "object") {
    return undefined;
  }

  const entry = candidate as Record<string, unknown>;
  const label =
    entry[MATTER_USER_LABEL_FIELD_LABEL] ??
    entry[MATTER_USER_LABEL_CONTEXT_TAG_LABEL];
  const value =
    entry[MATTER_USER_LABEL_FIELD_VALUE] ??
    entry[MATTER_USER_LABEL_CONTEXT_TAG_VALUE];

  if (typeof label !== "string" || typeof value !== "string") {
    return undefined;
  }
  return { label, value };
}

/**
 * Reads the app-reserved `deviceName` entry from a Matter User Label list.
 * @param rawValue - LabelList attribute from local Matter or the RainMaker Neo shadow.
 * @returns Device name, or an empty string when the entry is absent.
 */
export function decodeUserLabelDeviceName(rawValue: unknown): string {
  const labelList = unwrapLabelList(rawValue);
  if (!Array.isArray(labelList)) {
    return "";
  }

  for (const candidate of labelList) {
    const entry = normalizeUserLabelEntry(candidate);
    if (entry?.label === MATTER_USER_LABEL_DEVICE_NAME_KEY) {
      return entry.value;
    }
  }
  return "";
}

/**
 * Builds a UTF8String struct field for the native MatterDataValue codec.
 * @param contextTag - LabelStruct field context tag (0 = label, 1 = value).
 * @param value - Field string, truncated to the spec's 16-char limit.
 * @returns Tagged field entry for a Structure MatterDataValue.
 */
function userLabelStringField(
  contextTag: number,
  value: string,
): Record<string, unknown> {
  return {
    contextTag,
    data: {
      type: MATTER_DATA_VALUE_TYPE_UTF8_STRING,
      value: value.slice(0, MATTER_USER_LABEL_MAX_LENGTH),
    },
  };
}

/**
 * Encodes a device name as a full LabelList write payload (Array<LabelStruct>).
 * The write replaces the whole list with the app's reserved `deviceName`
 * entry — LabelList attribute writes are whole-list per the Matter spec.
 * @param name - Trimmed device name entered by the user.
 * @returns Array-typed MatterDataValue for the native write bridge.
 */
export function encodeUserLabelDeviceNameList(
  name: string,
): Record<string, unknown> {
  return {
    type: MATTER_DATA_VALUE_TYPE_ARRAY,
    value: [
      {
        data: {
          type: MATTER_DATA_VALUE_TYPE_STRUCTURE,
          value: [
            userLabelStringField(
              Number(MATTER_USER_LABEL_CONTEXT_TAG_LABEL),
              MATTER_USER_LABEL_DEVICE_NAME_KEY,
            ),
            userLabelStringField(
              Number(MATTER_USER_LABEL_CONTEXT_TAG_VALUE),
              name,
            ),
          ],
        },
      },
    ],
  };
}

/**
 * Builds the cluster resolver for the User Label-backed name param.
 * Decode extracts the reserved `deviceName` entry; encode replaces the
 * LabelList with a single entry carrying the new name.
 * @returns Resolver wired into the `0x41` registry entry.
 */
export function createUserLabelDeviceNameResolver(): ClusterParamResolver {
  return {
    /**
     * User Label names do not expose selectable options.
     * @returns Empty option list.
     */
    decodeOptions(): ClusterParamOption[] {
      return [];
    },

    /**
     * Extracts the reserved device-name entry from LabelList.
     * @param rawValue - Raw User Label attribute value.
     * @returns Decoded device name.
     */
    decodeValue(rawValue): string {
      return decodeUserLabelDeviceName(rawValue);
    },

    /**
     * Encodes the entered name as an Array<LabelStruct> attribute write.
     * The `ClusterParamResolver` signature types this as `number | null`,
     * so the MatterDataValue dictionary is cast through `unknown` — the
     * write path forwards objects verbatim to the native bridge.
     * @param uiValue - Device name entered by the user.
     * @returns Array-typed MatterDataValue, or null for a blank name.
     */
    encodeValue(uiValue): number | null {
      const name = String(uiValue ?? "").trim();
      if (name.length === 0) {
        return null;
      }
      return encodeUserLabelDeviceNameList(name) as unknown as number;
    },
  };
}
