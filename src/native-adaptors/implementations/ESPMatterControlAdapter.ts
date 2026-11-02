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
} from "../contracts/matter";
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
    matterUpdateCatAclSubject?: (
      matterNodeId: string,
      groupCatId: string,
    ) => Promise<ESPMatterControlResult>;
  };
};

/** DeviceEventEmitter event name for native Matter attribute reports (same on both platforms). */
const ATTRIBUTE_REPORT_EVENT = "ESPMatter:attributeReport";

/** Native event telling whether a subscription link is up (Android). */
const SUBSCRIPTION_STATE_EVENT = "ESPMatter:subscriptionState";
/** States that mean the link is up: just set up, or still delivering reports. */
const SUBSCRIPTION_LIVE_STATES: ReadonlySet<string> = new Set([
  "established",
  "alive",
]);
/** Most link states kept while a subscribe has not returned its handle yet. */
const EARLY_STATE_LIMIT = 8;

/** Link-state listeners of open subscriptions; told "down" on shutdown. */
const openLinkStateListeners = new Set<(live: boolean) => void>();

/** Payload shape of a {@link SUBSCRIPTION_STATE_EVENT} device event. */
interface NativeSubscriptionState {
  matterNodeId: string;
  /** Handle of the link, as `matterControlSubscribe` returns it. */
  subscriptionId: string;
  state: string;
}

const SUBSCRIBE_DEFAULTS = {
  minIntervalSec: 1,
  maxIntervalSec: 30,
};

/** Payload shape of an {@link ATTRIBUTE_REPORT_EVENT} device event. */
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
  updateCatAclSubject(
    matterNodeId: string,
    groupCatId: string,
  ): Promise<ESPMatterControlResult>;
};

const ESPMatterControlAdapter: ESPMatterControlAdapterWithTlv = {
  async init(config: ESPMatterInitConfig): Promise<ESPMatterControlResult> {
    const native = ensureNative();
    if (!native.matterControlInit) {
      return { success: true };
    }
    return native.matterControlInit(config as unknown as Record<string, unknown>);
  },

  async shutdown(): Promise<ESPMatterControlResult> {
    // Native closes every link without reporting each one, so say it here.
    for (const onLinkStateChange of openLinkStateListeners) {
      onLinkStateChange(false);
    }
    openLinkStateListeners.clear();
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

  /**
   * Replaces a CAT subject (operate or admin) in a device's EP0 ACL after a
   * CAT rotation; appends a fresh Operate entry when an operate CAT has no
   * subject at all (self-heal). Typed natively — the ACL entry struct
   * round-trips through the platform CHIP cluster helpers, not the generic
   * data-value codec.
   * @param matterNodeId - Target device's Matter node id (hex).
   * @param groupCatId - The fabric's CURRENT CAT value (8-hex id+version).
   * @returns Success, or an error result when the native method is missing/fails.
   */
  async updateCatAclSubject(
    matterNodeId: string,
    groupCatId: string,
  ): Promise<ESPMatterControlResult> {
    const native = ensureNative();
    if (!native.matterUpdateCatAclSubject) {
      return {
        success: false,
        error: "matterUpdateCatAclSubject not implemented natively",
      };
    }
    return native.matterUpdateCatAclSubject(matterNodeId, groupCatId);
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
    onLinkStateChange?: (live: boolean) => void,
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
    let handleKnown = false;
    // A state can arrive before the handle does, so keep the latest per link.
    const earlyStates = new Map<string, boolean>();
    let stateListener: EmitterSubscription | null = onLinkStateChange
      ? DeviceEventEmitter.addListener(
          SUBSCRIPTION_STATE_EVENT,
          (event: NativeSubscriptionState) => {
            if (event?.matterNodeId !== matterNodeId) return;
            const live = SUBSCRIPTION_LIVE_STATES.has(event.state);
            if (!handleKnown) {
              if (
                earlyStates.size < EARLY_STATE_LIMIT ||
                earlyStates.has(event.subscriptionId)
              ) {
                earlyStates.set(event.subscriptionId, live);
              }
            } else if (event.subscriptionId === nativeHandle) {
              onLinkStateChange(live);
            }
          },
        )
      : null;

    try {
      const result = await native.matterControlSubscribe(
        matterNodeId,
        attributes,
        SUBSCRIBE_DEFAULTS.minIntervalSec,
        SUBSCRIBE_DEFAULTS.maxIntervalSec,
      );
      nativeHandle = result?.subscriptionId ?? null;
      handleKnown = true;
      const earlyState = nativeHandle
        ? earlyStates.get(nativeHandle)
        : undefined;
      earlyStates.clear();
      if (!nativeHandle) {
        // No handle to match events against, so stop listening for them.
        stateListener?.remove();
        stateListener = null;
      } else if (onLinkStateChange) {
        openLinkStateListeners.add(onLinkStateChange);
        if (earlyState !== undefined) {
          onLinkStateChange(earlyState);
        }
      }
    } catch (error) {
      listener.remove();
      listener = null;
      stateListener?.remove();
      stateListener = null;
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
      stateListener?.remove();
      stateListener = null;
      if (onLinkStateChange) {
        openLinkStateListeners.delete(onLinkStateChange);
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
   * Encodes Matter invoke command fields to RMNeo MQTT wire form (`0x<tlv-hex>`).
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
