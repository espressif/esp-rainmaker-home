/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ClusterParamOption,
  ClusterParamResolver,
} from "@espressif/rainmaker-matter-sdk";
import { MATTER_PARAM_VALUE_UNKNOWN, MATTER_PARAM_COMMAND_IDLE } from "../matterParamConstants";
import {
  brightnessPercentToMatterLevel,
  hueDegreesToMatterHue,
  matterHueToHueDegrees,
  matterLevelToBrightnessPercent,
  matterSaturationToSaturationPercent,
  moveToHueCommandFields,
  moveToLevelCommandFields,
  moveToSaturationCommandFields,
  moveToColorTemperatureCommandFields,
  kelvinToMatterMireds,
  matterMiredsToKelvin,
  saturationPercentToMatterSaturation,
} from "./matterInvokePayload";

/** Maps a Matter raw enum/mode value to a UI value and label. */
export type MappingDefinition = Record<number, { value: string; label: string }>;

/**
 * Sentinel marker emitted by a resolver's `encodeValue` when a write needs
 * to be routed to a *different* cluster/command than the param's host
 * cluster. The patched `ESPRMMatterDeviceParam.setValue` (installed by
 * `ESPRMMatterBaseSDKAdaptor.initializeSDK`) detects this shape and calls
 * `ESPMatterControlAdapter.invoke(matterNodeId, endpointId, clusterId,
 * commandId, payload)` with the override values instead of the param's
 * own `clusterId`.
 *
 * Use case: RVC Control board "Start" action — the host param sits on
 * cluster `0x61` (RvcOperationalState) for state read-back, but per Matter
 * spec RVCs cannot be started via `0x61`; they must invoke
 * `RvcRunMode.ChangeToMode` on cluster `0x54` cmd `0x00`. The marker lets
 * the cluster.config keep ownership of that decision instead of pushing
 * it into UI / hook layers.
 */
export const MATTER_CROSS_CLUSTER_INVOKE_MARKER = "__matterCrossClusterInvoke";

/** Marker payload returned by a resolver for cross-cluster invoke routing. */
export interface MatterCrossClusterInvokeMarker {
  [MATTER_CROSS_CLUSTER_INVOKE_MARKER]: true;
  /** Override cluster id (overrides the host param's `clusterId`). */
  clusterId: number;
  /** Override command id (ignored if the host param has `matterCommandId`). */
  commandId: number;
  /** Optional invoke payload (typically a Structure-shaped MatterDataValue). */
  payload?: Record<string, unknown>;
}

/** Type guard for the cross-cluster invoke marker. */
export function isCrossClusterInvokeMarker(
  candidate: unknown,
): candidate is MatterCrossClusterInvokeMarker {
  return (
    candidate !== null &&
    typeof candidate === "object" &&
    (candidate as Record<string, unknown>)[MATTER_CROSS_CLUSTER_INVOKE_MARKER] === true
  );
}

/**
 * Builds a cross-cluster invoke marker for the patched `setValue`.
 * @param clusterId - Target Matter cluster id.
 * @param commandId - Target Matter command id.
 * @param payload - Optional invoke payload (Structure-shaped MatterDataValue).
 * @returns Marker object recognised by the SDK setValue patch.
 */
export function createCrossClusterInvokeMarker(
  clusterId: number,
  commandId: number,
  payload?: Record<string, unknown>,
): MatterCrossClusterInvokeMarker {
  return {
    [MATTER_CROSS_CLUSTER_INVOKE_MARKER]: true,
    clusterId,
    commandId,
    payload,
  };
}

/** Config for passthrough or typed value encode/decode resolvers. */
export interface ValueResolverConfig<T = unknown> {
  decode?: (raw: unknown) => T;
  encode?: (value: string) => unknown;
}

/** Config for read-side transform resolvers (battery %, temperature, etc.). */
export interface TransformResolverConfig {
  decode: (raw: unknown) => string;
  encode?: (value: string) => unknown;
}

/** One invoke command exposed as a selectable UI option. */
export interface CommandDefinition {
  value: string;
  label: string;
  commandId: number;
}

/**
 * Coerces an encoded resolver output to the SDK write shape.
 * @param encoded - Raw encode result from a resolver config hook.
 * @returns Matter numeric write value or `null` when not encodable.
 */
function toEncodeResult(encoded: unknown): number | null {
  if (encoded === null || encoded === undefined) {
    return null;
  }
  if (typeof encoded === "number") {
    return Number.isFinite(encoded) ? encoded : null;
  }
  if (typeof encoded === "boolean") {
    return encoded ? 1 : 0;
  }
  const num = Number(encoded);
  return Number.isFinite(num) ? num : null;
}

/**
 * Builds a generic value resolver for scalar Matter attributes.
 * @param config - Optional decode/encode hooks; defaults to string passthrough.
 * @returns Resolver for On/Off, brightness, fan speed, and similar params.
 */
export function createValueResolver(
  config: ValueResolverConfig = {},
): ClusterParamResolver {
  return {
    /**
     * Scalar value params do not derive options from Matter payloads.
     * @returns Empty option list.
     */
    decodeOptions(): ClusterParamOption[] {
      return [];
    },

    /**
     * Decodes a raw Matter attribute to a UI string.
     * @param rawValue - Raw attribute value from Matter.
     * @returns UI-facing string value.
     */
    decodeValue(rawValue): string {
      const value = config.decode ? config.decode(rawValue) : rawValue;
      return String(value);
    },

    /**
     * Encodes a UI string back to a Matter write value.
     * @param uiValue - Selected or entered UI value.
     * @returns Numeric Matter value or `null` when not encodable.
     */
    encodeValue(uiValue): number | null {
      if (config.encode) {
        return toEncodeResult(config.encode(uiValue));
      }
      return toEncodeResult(uiValue);
    },
  };
}

/**
 * Builds a mapping resolver for fixed Matter enums and mode indices.
 * @param mapping - Raw Matter value to UI slug and label.
 * @returns Resolver for dropdown/status params backed by enum tables.
 */
export function createMappingResolver(mapping: MappingDefinition): ClusterParamResolver {
  const rawModes = Object.fromEntries(
    Object.entries(mapping).map(([raw, entry]) => [entry.value, Number(raw)]),
  );

  return {
    /**
     * Materializes static enum/mode options from the mapping table.
     * @returns Sorted UI options with raw Matter indices.
     */
    decodeOptions(): ClusterParamOption[] {
      return Object.entries(mapping)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([raw, entry]) => ({
          value: entry.value,
          label: entry.label,
          rawMode: Number(raw),
        }));
    },

    /**
     * Maps a raw Matter enum/mode index to a UI slug.
     * @param rawValue - Raw attribute value from Matter.
     * @returns Semantic UI value or unknown placeholder.
     */
    decodeValue(rawValue): string {
      return mapping[Number(rawValue)]?.value ?? MATTER_PARAM_VALUE_UNKNOWN;
    },

    /**
     * Encodes a UI slug to a raw Matter enum/mode index.
     * @param uiValue - Selected UI value.
     * @returns Raw Matter index or `null` when unmapped.
     */
    encodeValue(uiValue): number | null {
      const raw = rawModes[uiValue];
      return raw === undefined ? null : raw;
    },
  };
}

/**
 * Builds a transform resolver for values that need unit or scale conversion.
 * @param config - Decode hook and optional encode hook for read/write transforms.
 * @returns Resolver for battery %, temperature, voltage, and similar readouts.
 */
export function createTransformResolver(
  config: TransformResolverConfig,
): ClusterParamResolver {
  return {
    /**
     * Transform params expose a computed value, not a selectable option list.
     * @returns Empty option list.
     */
    decodeOptions(): ClusterParamOption[] {
      return [];
    },

    /**
     * Applies the configured decode transform to a raw Matter value.
     * @param rawValue - Raw attribute value from Matter.
     * @returns Transformed UI string.
     */
    decodeValue(rawValue): string {
      return config.decode(rawValue);
    },

    /**
     * Encodes a UI string when a reverse transform is configured.
     * @param uiValue - UI value to write back to Matter.
     * @returns Encoded Matter value or `null` for read-only transforms.
     */
    encodeValue(uiValue): number | null {
      if (!config.encode) {
        return null;
      }
      return toEncodeResult(config.encode(uiValue));
    },
  };
}

/**
 * Builds a resolver for any Matter cluster that derives from the
 * **ModeBase** cluster (cluster spec id `0x50`). Every ModeBase
 * derivative — `RvcRunMode 0x54`, `RvcCleanMode 0x55`, `LaundryWasherMode
 * 0x51`, `DishwasherMode 0x59`, `RefrigeratorAndTemperatureControlledCabinetMode
 * 0x52`, `OvenMode 0x49`, `MicrowaveOvenMode 0x5e`, `EnergyEvseMode 0x9d`,
 * etc. — exposes the same shape:
 *   - `CurrentMode` (attr `0x01`, read-only)
 *   - `ChangeToMode` (cmd `0x00`, field `NewMode` at context tag `0`)
 *
 * Pair this with `writeAsCommand: true` and `matterCommandId: 0x00` on
 * the param. {@link ESPRMMatterDeviceParam.setValue} then routes through
 * the adapter `invoke()` path, and the {@link MatterDataValue} Structure
 * produced here is forwarded as the command-fields TLV by the native
 * codec (`MatterDataValueCodec.encodeCommandFieldsToTlv`). Reads still
 * flow through `decodeValue` → UI slug, exactly like
 * {@link createMappingResolver}.
 *
 * Why not reuse {@link createMappingResolver}: that resolver's
 * `encodeValue` returns the bare mode index as a number, so the SDK
 * write path writes to the read-only attribute and the device responds
 * `0x88 UnsupportedWrite` (the UI then silently no-ops).
 * @param mapping  Raw mode index → UI slug + label.
 * @param newModeContextTag  Context tag for the `NewMode` field on
 *   `ChangeToMode`. Defaults to `0` per Matter spec; the override exists
 *   only as a safety hatch — callers shouldn't need it.
 * @returns Resolver whose `encodeValue` produces a MatterDataValue
 *   Structure `{ type: "Structure", value: [{ contextTag, data: { type:
 *   "UnsignedInteger", value: rawIndex } }] }` consumed by SetValue's
 *   invoke branch and the native TLV writer.
 */
export function createModeChangeResolver(
  mapping: MappingDefinition,
  newModeContextTag = 0,
): ClusterParamResolver {
  const rawModes = Object.fromEntries(
    Object.entries(mapping).map(([raw, entry]) => [entry.value, Number(raw)]),
  );

  return {
    decodeOptions(): ClusterParamOption[] {
      return Object.entries(mapping)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([raw, entry]) => ({
          value: entry.value,
          label: entry.label,
          rawMode: Number(raw),
        }));
    },

    decodeValue(rawValue): string {
      return mapping[Number(rawValue)]?.value ?? MATTER_PARAM_VALUE_UNKNOWN;
    },

    /**
     * SDK SetValue inspects this return: if it is an object (and the
     * param has `writeAsCommand: true` / `matterCommandId`), the SDK
     * uses the object verbatim as the invoke payload. We return the
     * Structure-shaped MatterDataValue the native codec expects. The
     * `ClusterParamResolver` signature types this as `number | null`,
     * so we cast through `unknown`.
     */
    encodeValue(uiValue): number | null {
      const raw = rawModes[uiValue];
      if (raw === undefined) return null;
      const matterDataValue = {
        type: "Structure" as const,
        value: [
          {
            contextTag: newModeContextTag,
            data: { type: "UnsignedInteger" as const, value: raw },
          },
        ],
      };
      return matterDataValue as unknown as number;
    },
  };
}

/**
 * Builds a command resolver for write-only invoke and transport-control params.
 * @param commands - UI actions mapped to Matter command ids.
 * @returns Resolver whose options compile into param `rawModes` for writes.
 */
export function createCommandResolver(commands: CommandDefinition[]): ClusterParamResolver {
  return {
    /**
     * Exposes invoke/transport commands as UI options.
     * @returns Command options with semantic values and command ids.
     */
    decodeOptions(): ClusterParamOption[] {
      return commands.map((command) => ({
        value: command.value,
        label: command.label,
        rawMode: command.commandId,
      }));
    },

    /**
     * Command params do not reflect live Matter state on the value field.
     * @returns Idle UI state for command controls.
     */
    decodeValue(): string {
      return MATTER_PARAM_COMMAND_IDLE;
    },

    /**
     * Encodes a UI action token to a Matter command id via compiled `rawModes`.
     * @param uiValue - Selected command token such as `start` or `invoke`.
     * @param rawModes - UI value → command id map compiled on the param instance.
     * @returns Matter command id or `null` when unmapped.
     */
    encodeValue(uiValue, rawModes): number | null {
      const raw = rawModes?.[uiValue];
      return raw === undefined ? null : raw;
    },
  };
}

/**
 * Resolver for Level Control invoke (MoveToLevelWithOnOff) from UI brightness %.
 */
export function createBrightnessInvokeResolver(): ClusterParamResolver {
  return {
    decodeOptions(): ClusterParamOption[] {
      return [];
    },
    decodeValue(rawValue): string {
      return String(matterLevelToBrightnessPercent(Number(rawValue)));
    },
    encodeValue(uiValue): number | null {
      const pct = Number(uiValue);
      if (!Number.isFinite(pct)) {
        return null;
      }
      const matterDataValue = moveToLevelCommandFields(
        brightnessPercentToMatterLevel(pct),
      );
      return matterDataValue as unknown as number;
    },
  };
}

/**
 * Resolver for Color Control invoke (MoveToHue) from UI hue degrees.
 */
export function createHueInvokeResolver(): ClusterParamResolver {
  return {
    decodeOptions(): ClusterParamOption[] {
      return [];
    },
    decodeValue(rawValue): string {
      return String(matterHueToHueDegrees(Number(rawValue)));
    },
    encodeValue(uiValue): number | null {
      const deg = Number(uiValue);
      if (!Number.isFinite(deg)) {
        return null;
      }
      const matterDataValue = moveToHueCommandFields(hueDegreesToMatterHue(deg));
      return matterDataValue as unknown as number;
    },
  };
}

/** Resolver for Color Control invoke (MoveToSaturation) from UI saturation %. */
export function createSaturationInvokeResolver(): ClusterParamResolver {
  return {
    decodeOptions(): ClusterParamOption[] {
      return [];
    },
    decodeValue(rawValue): string {
      return String(matterSaturationToSaturationPercent(Number(rawValue)));
    },
    encodeValue(uiValue): number | null {
      const pct = Number(uiValue);
      if (!Number.isFinite(pct)) {
        return null;
      }
      const matterDataValue = moveToSaturationCommandFields(
        saturationPercentToMatterSaturation(pct),
      );
      return matterDataValue as unknown as number;
    },
  };
}

/** Resolver for Color Control invoke (MoveToColorTemperature) from UI Kelvin. */
export function createColorTemperatureInvokeResolver(): ClusterParamResolver {
  return {
    decodeOptions(): ClusterParamOption[] {
      return [];
    },
    decodeValue(rawValue): string {
      return String(matterMiredsToKelvin(Number(rawValue)));
    },
    encodeValue(uiValue): number | null {
      const kelvin = Number(uiValue);
      if (!Number.isFinite(kelvin) || kelvin <= 0) {
        return null;
      }
      const matterDataValue = moveToColorTemperatureCommandFields(
        kelvinToMatterMireds(kelvin),
      );
      return matterDataValue as unknown as number;
    },
  };
}
