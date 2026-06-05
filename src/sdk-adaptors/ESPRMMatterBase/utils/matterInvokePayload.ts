/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Matter invoke command field payloads for the RN control bridge.
 *
 * Produces the JS wire shape consumed by Android {@link MatterDataValueCodec}
 * and iOS `normalizeOutboundDataValue` — TLV encoding happens natively.
 */

import {
  MATTER_DATA_VALUE_TYPE_STRUCTURE,
  MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER,
} from "@shared/utils/constants";

/** Matter data-value dictionary passed to `matterControlInvoke`. */
export type MatterDataValueDictionary = {
  type: string;
  value?: unknown;
};

type TaggedField = {
  contextTag: number;
  data: MatterDataValueDictionary;
};

function taggedField(
  contextTag: number,
  type: string,
  value: number,
): TaggedField {
  return {
    contextTag,
    data: { type, value },
  };
}

function structure(fields: TaggedField[]): MatterDataValueDictionary {
  return {
    type: MATTER_DATA_VALUE_TYPE_STRUCTURE,
    value: fields,
  };
}

/** MoveToLevel / MoveToLevelWithOnOff command fields (tags 0–3). */
export function moveToLevelCommandFields(
  level: number,
  transitionTime = 0,
  optionsMask = 0,
  optionsOverride = 0,
): MatterDataValueDictionary {
  const levelByte = Math.max(0, Math.min(254, Math.round(level)));
  return structure([
    taggedField(0, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, levelByte),
    taggedField(1, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, transitionTime),
    taggedField(2, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, optionsMask),
    taggedField(3, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, optionsOverride),
  ]);
}

/** MoveToHue command fields (tags 0–4). Direction defaults to shortest path (0). */
export function moveToHueCommandFields(
  hue: number,
  direction = 0,
  transitionTime = 0,
  optionsMask = 0,
  optionsOverride = 0,
): MatterDataValueDictionary {
  const hueByte = Math.max(0, Math.min(254, Math.round(hue)));
  return structure([
    taggedField(0, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, hueByte),
    taggedField(1, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, direction),
    taggedField(2, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, transitionTime),
    taggedField(3, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, optionsMask),
    taggedField(4, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, optionsOverride),
  ]);
}

/** UI brightness percent (0–100) → Matter level byte (0–254). */
export function brightnessPercentToMatterLevel(percent: number): number {
  const pct = Math.max(0, Math.min(100, percent));
  return Math.round((pct / 100) * 254);
}

/** Matter level byte (0–254) → UI brightness percent (0–100). */
export function matterLevelToBrightnessPercent(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }
  return Math.round((Math.max(0, Math.min(254, level)) / 254) * 100);
}

/** UI hue degrees (0–360) → Matter hue byte (0–254). */
export function hueDegreesToMatterHue(degrees: number): number {
  const deg = Math.max(0, Math.min(360, degrees));
  return Math.round((deg / 360) * 254);
}

/** Matter hue byte (0–254) → UI hue degrees (0–360). */
export function matterHueToHueDegrees(hue: number): number {
  if (!Number.isFinite(hue)) {
    return 0;
  }
  return Math.round((Math.max(0, Math.min(254, hue)) / 254) * 360);
}
