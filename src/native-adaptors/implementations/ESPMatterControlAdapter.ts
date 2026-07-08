/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DeviceEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from "react-native";
import type {
  ESPMatterAttributeReadResult,
  ESPMatterAttributeReport,
  ESPMatterControlAdapterInterface,
  ESPMatterControlResult,
  ESPMatterInitConfig,
  ESPMatterSubscribeAttribute,
  ESPMatterSubscribeResult,
} from "@espressif/rainmaker-matter-sdk";
import {
  MATTER_DATA_VALUE_TYPE_ARRAY,
  MATTER_DATA_VALUE_TYPE_BOOLEAN,
  MATTER_DATA_VALUE_TYPE_DOUBLE,
  MATTER_DATA_VALUE_TYPE_FLOAT,
  MATTER_DATA_VALUE_TYPE_NULL,
  MATTER_DATA_VALUE_TYPE_OCTET_STRING,
  MATTER_DATA_VALUE_TYPE_SIGNED_INTEGER,
  MATTER_DATA_VALUE_TYPE_STRUCTURE,
  MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER,
  MATTER_DATA_VALUE_TYPE_UTF8_STRING,
} from "@shared/utils/constants";

/**
 * JS shim for the Matter local control adapter.
 *
 * Speaks the new SDK `ESPMatterControlAdapterInterface` and forwards each
 * primitive to the native `ESPMatterModule.matterControl*` methods exposed by
 * Android (`ESPMatterControl.kt`) and iOS (`ESPMatterControl.swift`).
 *
 * Native surface is intentionally narrow: the four canonical Matter
 * Interaction Model operations (Read / Write / Invoke / Subscribe) plus
 * their lifecycle siblings (Init / Shutdown / Unsubscribe). Cluster-
 * specific semantic translation (semantic units, OnOff bool, mode
 * pickers, …) lives above this shim — either in TypeScript hooks/panels
 * or in the Matter SDK outbound transformer.
 *
 * Subscription reports are dispatched as `ESPMatter:attributeReport` device
 * events (same name on both platforms); we filter by `matterNodeId` and forward
 * to the SDK callback. Unsubscribe tears down both the JS listener and the
 * native subscription handle returned by `matterControlSubscribe`.
 *
 * Callers must use `Matter.invoke()` / `Matter.write()` with raw cluster /
 * command / attribute ids instead of a semantic `control()` shortcut.
 */

const { ESPMatterModule } = NativeModules as {
  ESPMatterModule?: {
    matterControlInit?: (config: Record<string, unknown> | null) => Promise<ESPMatterControlResult>;
    matterControlShutdown?: () => Promise<ESPMatterControlResult>;
    matterControlRead?: (
      matterNodeId: string,
      endpoint: number,
      clusterId: number,
      attributeId: number,
    ) => Promise<ESPMatterAttributeReadResult>;
    matterControlWrite?: (
      matterNodeId: string,
      endpoint: number,
      clusterId: number,
      attributeId: number,
      value: Record<string, unknown> | null,
    ) => Promise<ESPMatterControlResult>;
    matterControlInvoke?: (
      matterNodeId: string,
      endpoint: number,
      clusterId: number,
      commandId: number,
      commandFields: Record<string, unknown> | null,
    ) => Promise<ESPMatterControlResult>;
    matterControlSubscribe?: (
      matterNodeId: string,
      attributePaths: ESPMatterSubscribeAttribute[],
      minIntervalSec: number,
      maxIntervalSec: number,
    ) => Promise<{ subscriptionId: string }>;
    matterControlUnsubscribe?: (handle: string) => Promise<ESPMatterControlResult>;
  };
};

const ATTRIBUTE_REPORT_EVENT = "ESPMatter:attributeReport";

const SUBSCRIBE_DEFAULTS = {
  minIntervalSec: 1,
  maxIntervalSec: 30,
};

interface NativeAttributeReport {
  matterNodeId: string;
  endpoint: number;
  clusterId: number;
  attributeId: number;
  value: unknown;
}

function ensureNative(): NonNullable<typeof ESPMatterModule> {
  if (!ESPMatterModule) {
    throw new Error(
      "ESPMatterModule native bridge not available. Did you rebuild after wiring matterControl* methods?",
    );
  }
  return ESPMatterModule;
}

const MATTER_DATA_VALUE_WIRE_TYPES: ReadonlySet<string> = new Set([
  MATTER_DATA_VALUE_TYPE_NULL,
  MATTER_DATA_VALUE_TYPE_BOOLEAN,
  MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER,
  MATTER_DATA_VALUE_TYPE_SIGNED_INTEGER,
  MATTER_DATA_VALUE_TYPE_FLOAT,
  MATTER_DATA_VALUE_TYPE_DOUBLE,
  MATTER_DATA_VALUE_TYPE_UTF8_STRING,
  MATTER_DATA_VALUE_TYPE_OCTET_STRING,
  MATTER_DATA_VALUE_TYPE_STRUCTURE,
  MATTER_DATA_VALUE_TYPE_ARRAY,
]);

/**
 * Returns true when `value` is already a Matter data-value-dictionary object
 * (`{ type, value?, contextTag?, data? }`) suitable for the native bridge.
 * @param value - Candidate write payload from the Matter SDK or UI layer.
 * @returns Whether the payload should be forwarded without coercion.
 */
function isMatterDataValueDictionary(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const type = (value as Record<string, unknown>).type;
  return typeof type === "string" && MATTER_DATA_VALUE_WIRE_TYPES.has(type);
}

/**
 * Coerces a JS primitive (or null) into the Matter `MatterDataValue` wire shape
 * expected by Android [MatterDataValueCodec] and iOS `normalizeOutboundDataValue`.
 *
 * Full dictionaries are passed through unchanged; single scalars are wrapped so
 * callers can write `true` / `42` / `"label"` for common attribute updates.
 * @param value - Raw attribute value from `Matter.write()` (primitive or dict).
 * @returns Normalised map for `matterControlWrite`, or null when unsupported.
 */
/**
 * Fieldless invoke payload for iOS. RN rejects `null` for `NSDictionary *`
 * `commandFields`; Android `MatterDataValueCodec.encodeCommandFieldsToTlv(null)`
 * already emits an empty Structure — keep `null` there.
 */
function fieldlessInvokeCommandFieldsForBridge(
  payload: Record<string, unknown> | undefined | null,
): Record<string, unknown> | null {
  if (payload !== undefined && payload !== null) {
    return payload;
  }
  if (Platform.OS === "ios") {
    return {
      type: MATTER_DATA_VALUE_TYPE_STRUCTURE,
      value: [],
    };
  }
  return null;
}

function normalizeWriteValue(value: unknown): Record<string, unknown> | null {
  if (isMatterDataValueDictionary(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return { type: MATTER_DATA_VALUE_TYPE_NULL };
  }

  if (typeof value === "boolean") {
    return { type: MATTER_DATA_VALUE_TYPE_BOOLEAN, value };
  }

  if (typeof value === "string") {
    return { type: MATTER_DATA_VALUE_TYPE_UTF8_STRING, value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    if (Number.isInteger(value)) {
      if (value < 0) {
        return { type: MATTER_DATA_VALUE_TYPE_SIGNED_INTEGER, value };
      }
      return { type: MATTER_DATA_VALUE_TYPE_UNSIGNED_INTEGER, value };
    }
    return { type: MATTER_DATA_VALUE_TYPE_DOUBLE, value };
  }

  return null;
}

type ESPMatterControlAdapterWithTlv = ESPMatterControlAdapterInterface & {
  encodeCommandFieldsToTlvHex(
    commandFields: Record<string, unknown> | null,
  ): Promise<string>;
};

const ESPMatterControlAdapter: ESPMatterControlAdapterWithTlv = {
  async init(config: ESPMatterInitConfig): Promise<ESPMatterControlResult> {
    const native = ensureNative();
    if (!native.matterControlInit) {
      return { success: true };
    }
    // Probe: native CHIP controller (re)init. Repeated init resets operational
    // discovery / CASE sessions, so this pinpoints churn that stalls WLAN.
    console.log("[MatterProbe][control] init native controller");
    return native.matterControlInit(config as unknown as Record<string, unknown>);
  },

  async shutdown(): Promise<ESPMatterControlResult> {
    const native = ensureNative();
    if (!native.matterControlShutdown) {
      return { success: true };
    }
    return native.matterControlShutdown();
  },

  async read(
    matterNodeId: string,
    endpoint: number,
    clusterId: number,
    attributeId: number,
  ): Promise<ESPMatterAttributeReadResult> {
    const native = ensureNative();
    if (!native.matterControlRead) {
      return { success: false, error: "matterControlRead not implemented natively" };
    }
    return native.matterControlRead(matterNodeId, endpoint, clusterId, attributeId);
  },

  async write(
    matterNodeId: string,
    endpoint: number,
    clusterId: number,
    attributeId: number,
    value: unknown,
  ): Promise<ESPMatterControlResult> {
    const native = ensureNative();
    if (!native.matterControlWrite) {
      return { success: false, error: "matterControlWrite not implemented natively" };
    }
    const wireValue = normalizeWriteValue(value);
    if (wireValue === null) {
      return {
        success: false,
        error:
          "write: value must be a Matter data-value object ({ type, value }) or a supported primitive (boolean, number, string, null)",
      };
    }
    const result = await native.matterControlWrite(
      matterNodeId,
      endpoint,
      clusterId,
      attributeId,
      wireValue,
    );
    return result;
  },

  async invoke(
    matterNodeId: string,
    endpoint: number,
    clusterId: number,
    commandId: number,
    payload?: Record<string, unknown>,
  ): Promise<ESPMatterControlResult> {
    const native = ensureNative();
    if (!native.matterControlInvoke) {
      return { success: false, error: "matterControlInvoke not implemented natively" };
    }
    const commandFields = fieldlessInvokeCommandFieldsForBridge(payload ?? null);
    const result = await native.matterControlInvoke(
      matterNodeId,
      endpoint,
      clusterId,
      commandId,
      commandFields,
    );
    return result;
  },

  async subscribe(
    matterNodeId: string,
    attributes: ESPMatterSubscribeAttribute[],
    callback: (report: ESPMatterAttributeReport) => void,
  ): Promise<ESPMatterSubscribeResult> {
    const native = ensureNative();
    if (!native.matterControlSubscribe) {
      return { success: false, error: "matterControlSubscribe not implemented natively" };
    }

    let listener: EmitterSubscription | null = DeviceEventEmitter.addListener(
      ATTRIBUTE_REPORT_EVENT,
      (event: NativeAttributeReport) => {
        if (event?.matterNodeId !== matterNodeId) return;
        callback({
          endpoint: event.endpoint,
          clusterId: event.clusterId,
          attributeId: event.attributeId,
          value: event.value,
        });
      },
    );

    let nativeHandle: string | null = null;

    // Probe: exact native subscribe attempt + outcome, keyed by matterNodeId.
    console.log("[MatterProbe][control] subscribe →", {
      matterNodeId,
      pathCount: attributes?.length ?? 0,
      paths: attributes,
    });
    try {
      const result = await native.matterControlSubscribe(
        matterNodeId,
        attributes,
        SUBSCRIBE_DEFAULTS.minIntervalSec,
        SUBSCRIBE_DEFAULTS.maxIntervalSec,
      );
      nativeHandle = result?.subscriptionId ?? null;
      console.log("[MatterProbe][control] subscribe ok", {
        matterNodeId,
        subscriptionId: nativeHandle,
      });
    } catch (error) {
      console.warn("[MatterProbe][control] subscribe error", {
        matterNodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      listener.remove();
      listener = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : "matterControlSubscribe failed",
      };
    }

    const unsubscribe = (): void => {
      if (listener) {
        listener.remove();
        listener = null;
      }
      if (nativeHandle && native.matterControlUnsubscribe) {
        native.matterControlUnsubscribe(nativeHandle).catch((error: unknown) => {
          console.warn(
            "[ESPMatterControlAdapter] matterControlUnsubscribe failed:",
            error,
          );
        });
        nativeHandle = null;
      }
    };

    return { success: true, unsubscribe };
  },

  /**
   * Encodes Matter invoke command fields to RMNG MQTT wire form (`0x<tlv-hex>`).
   * Pass `null` for fieldless commands (empty anonymous Structure TLV).
   */
  async encodeCommandFieldsToTlvHex(
    commandFields: Record<string, unknown> | null,
  ): Promise<string> {
    const native = ensureNative() as {
      matterEncodeCommandFieldsToTlvHex?: (
        fields: Record<string, unknown> | null,
      ) => Promise<string>;
    };
    if (!native.matterEncodeCommandFieldsToTlvHex) {
      throw new Error(
        "matterEncodeCommandFieldsToTlvHex not implemented on this platform",
      );
    }
    return native.matterEncodeCommandFieldsToTlvHex(commandFields);
  },
};

export { ESPMatterControlAdapter };
export default ESPMatterControlAdapter;
