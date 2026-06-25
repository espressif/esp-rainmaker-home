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

/** MoveToColorTemperature command fields (tags 0–2). */
export function moveToColorTemperatureCommandFields(
  colorTemperatureMireds: number,
  transitionTime = 0,
  optionsMask = 0,
  optionsOverride = 0,
): MatterDataValueDictionary {
  // Mireds are uint16 on the wire; clamp to the spec's valid range (1..65279).
  const mireds = Math.max(1, Math.min(65279, Math.round(colorTemperatureMireds)));
  return structure([
    taggedField(0, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, mireds),
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

/** UI saturation percent (0–100) → Matter saturation byte (0–254). */
export function saturationPercentToMatterSaturation(percent: number): number {
  const pct = Math.max(0, Math.min(100, percent));
  return Math.round((pct / 100) * 254);
}

/** Matter saturation byte (0–254) → UI saturation percent (0–100). */
export function matterSaturationToSaturationPercent(saturation: number): number {
  if (!Number.isFinite(saturation)) {
    return 0;
  }
  return Math.round((Math.max(0, Math.min(254, saturation)) / 254) * 100);
}

/** MoveToSaturation command fields (tags 0–3). */
export function moveToSaturationCommandFields(
  saturation: number,
  transitionTime = 0,
  optionsMask = 0,
  optionsOverride = 0,
): MatterDataValueDictionary {
  const satByte = Math.max(0, Math.min(254, Math.round(saturation)));
  return structure([
    taggedField(0, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, satByte),
    taggedField(1, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, transitionTime),
    taggedField(2, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, optionsMask),
    taggedField(3, MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, optionsOverride),
  ]);
}

/** Mireds ↔ Kelvin are reciprocal: K = 1e6 / mireds. ColorTemperatureSlider works in Kelvin. */
const MIRED_KELVIN_CONSTANT = 1_000_000;

/** UI color temperature (Kelvin) → Matter ColorTemperatureMireds. */
export function kelvinToMatterMireds(kelvin: number): number {
  const k = Number(kelvin);
  if (!Number.isFinite(k) || k <= 0) {
    return 0;
  }
  return Math.round(MIRED_KELVIN_CONSTANT / k);
}

/** Matter ColorTemperatureMireds → UI color temperature (Kelvin). */
export function matterMiredsToKelvin(mireds: number): number {
  const m = Number(mireds);
  if (!Number.isFinite(m) || m <= 0) {
    return 0;
  }
  return Math.round(MIRED_KELVIN_CONSTANT / m);
}
