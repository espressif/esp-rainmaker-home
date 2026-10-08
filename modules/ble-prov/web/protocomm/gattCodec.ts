/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPProvisioner, Security2 } from "esp-ble-prov";

import { logWebBle, logWebBleError } from "../utils/logger";

/**
 * Minimal GATT characteristic surface used by the codec patches.
 * Avoids depending on ambient `BluetoothRemoteGATTCharacteristic` globals
 * when the package tsconfig does not pull in DOM/`web-bluetooth` types.
 */
type GattCharacteristicLike = {
  uuid?: string;
  properties: {
    broadcast?: boolean;
    read?: boolean;
    write?: boolean;
    writeWithoutResponse?: boolean;
    notify?: boolean;
    indicate?: boolean;
  };
  readValue: () => Promise<DataView>;
  writeValue: (value: Uint8Array) => Promise<void>;
  writeValueWithResponse?: (value: Uint8Array) => Promise<void>;
  writeValueWithoutResponse?: (value: Uint8Array) => Promise<void>;
};

/** ATT payload threshold above which reliable (long) writes are required. */
const GATT_RELIABLE_WRITE_THRESHOLD = 180;

/**
 * Summarizes characteristic write/read capability flags for logs.
 * @param characteristic - GATT characteristic
 * @returns Compact property map
 */
function describeGattProperties(
  characteristic: GattCharacteristicLike,
): Record<string, boolean | string | undefined> {
  const props = characteristic.properties;
  return {
    uuid: characteristic.uuid,
    read: Boolean(props.read),
    write: Boolean(props.write),
    writeWithoutResponse: Boolean(props.writeWithoutResponse),
    notify: Boolean(props.notify),
    indicate: Boolean(props.indicate),
    hasWriteWithResponseFn: typeof characteristic.writeValueWithResponse === "function",
    hasWriteWithoutResponseFn:
      typeof characteristic.writeValueWithoutResponse === "function",
  };
}

/**
 * Builds a short hex preview of a payload (not for secrets — session protobuf only).
 * @param data - Bytes
 * @param maxBytes - Max bytes to include
 * @returns Hex string like `0a1b2c…(+N)`
 */
function hexPreview(data: Uint8Array, maxBytes = 8): string {
  const head = Array.from(data.slice(0, maxBytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (data.length <= maxBytes) {
    return head;
  }
  return `${head}…(+${data.length - maxBytes})`;
}

/**
 * Serializes an unknown error for GATT logs.
 * @param error - Caught value
 * @returns Plain diagnostic object
 */
function serializeError(error: unknown): { name?: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

/**
 * Copies a Web Bluetooth `DataView` into a tightly sized `Uint8Array`.
 *
 * Chrome often returns a view into a larger `ArrayBuffer`. Using `.buffer`
 * alone (as `esp-ble-prov` does) prepends/appends foreign bytes and corrupts
 * protobuf session payloads / SRP salt+pubkey.
 * @param view - GATT characteristic read result
 * @returns Bytes for the view only
 */
export function dataViewToUint8Array(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/**
 * Copies payload bytes into a fresh ArrayBuffer-backed `Uint8Array`.
 * protobufjs `.finish()` views often sit inside a larger pool buffer; some
 * Web Bluetooth stacks mishandle non-zero `byteOffset` on write.
 * @param data - Source bytes
 * @returns Tight copy safe for GATT write
 */
export function toGattWritePayload(data: Uint8Array): Uint8Array {
  return Uint8Array.from(data);
}

/** Brief pause between GATT write mode retries after Chrome NotSupportedError. */
const GATT_WRITE_RETRY_SETTLE_MS = 50;

/**
 * Writes bytes using the best available GATT write mode, with fallbacks.
 *
 * Sec2 cmd0 is large (needs reliable/long write). Sec2 cmd1 is small; after a
 * long write Chrome often rejects the next `writeValue` /
 * `writeValueWithResponse` with `NotSupportedError`. Falling back to
 * `writeValueWithoutResponse` fixes it — even when
 * `properties.writeWithoutResponse` is false (Chrome still exposes the API).
 * @param characteristic - Target characteristic
 * @param data - Payload bytes
 * @param epName - Endpoint name for diagnostics
 */
async function writeCharacteristicValue(
  characteristic: GattCharacteristicLike,
  data: Uint8Array,
  epName: string,
): Promise<void> {
  const payload = toGattWritePayload(data);
  const props = characteristic.properties;
  const attempts: { mode: string; run: () => Promise<void> }[] = [];
  const startedAt = Date.now();

  const pushWithResponse = (): void => {
    if (props.write && characteristic.writeValueWithResponse) {
      attempts.push({
        mode: "writeValueWithResponse",
        run: () => characteristic.writeValueWithResponse!(payload),
      });
    }
    attempts.push({
      mode: "writeValue",
      run: () => characteristic.writeValue(payload),
    });
  };

  /**
   * Prefer the without-response API whenever the browser exposes it.
   * Do not gate only on `properties.writeWithoutResponse` — after a long
   * reliable write Chrome may clear that flag while the method still works.
   */
  const pushWithoutResponse = (): void => {
    if (typeof characteristic.writeValueWithoutResponse === "function") {
      attempts.push({
        mode: "writeValueWithoutResponse",
        run: () => characteristic.writeValueWithoutResponse!(payload),
      });
    }
  };

  const longWrite = payload.length > GATT_RELIABLE_WRITE_THRESHOLD;
  if (longWrite) {
    pushWithResponse();
    pushWithoutResponse();
  } else {
    // Short Sec2 cmd1: try without-response first after Chrome's long cmd0.
    pushWithoutResponse();
    pushWithResponse();
  }

  logWebBle("gatt:write-start", {
    endPoint: epName,
    bytes: payload.length,
    longWrite,
    hex: hexPreview(payload),
    properties: describeGattProperties(characteristic),
    attemptOrder: attempts.map((attempt) => attempt.mode),
  });

  let lastError: unknown;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const attemptStartedAt = Date.now();
    try {
      await attempt.run();
      logWebBle("gatt:write-ok", {
        endPoint: epName,
        mode: attempt.mode,
        attempt: index + 1,
        attemptsTotal: attempts.length,
        bytes: payload.length,
        ms: Date.now() - attemptStartedAt,
        totalMs: Date.now() - startedAt,
      });
      return;
    } catch (error) {
      lastError = error;
      const willRetry = index + 1 < attempts.length;
      logWebBleError("gatt:write-retry", {
        endPoint: epName,
        mode: attempt.mode,
        attempt: index + 1,
        attemptsTotal: attempts.length,
        bytes: payload.length,
        ms: Date.now() - attemptStartedAt,
        error: serializeError(error),
        willRetry,
      });
      if (willRetry) {
        await new Promise((resolve) =>
          setTimeout(resolve, GATT_WRITE_RETRY_SETTLE_MS),
        );
      }
    }
  }

  logWebBleError("gatt:write-failed", {
    endPoint: epName,
    bytes: payload.length,
    longWrite,
    attemptsTried: attempts.map((attempt) => attempt.mode),
    totalMs: Date.now() - startedAt,
    error: serializeError(lastError),
  });

  throw lastError instanceof Error
    ? lastError
    : new Error(`GATT write failed for ${epName}`);
}

/**
 * Patches provisioner GATT read/write:
 * - reads: respect DataView byteOffset/byteLength
 * - writes: tight byte copy + write-mode fallbacks for Chrome Sec2 cmd1
 * @param provisioner - Connected provisioner instance
 */
export function patchProvisionerGattReads(provisioner: ESPProvisioner): void {
  provisioner.readValue = async (epName: string): Promise<Uint8Array> => {
    const characteristic = provisioner.getCharacteristic(
      epName,
    ) as unknown as GattCharacteristicLike;
    const startedAt = Date.now();
    logWebBle("gatt:read-start", {
      endPoint: epName,
      properties: describeGattProperties(characteristic),
    });
    try {
      const view = await characteristic.readValue();
      const bytes = dataViewToUint8Array(view);
      logWebBle("gatt:read-ok", {
        endPoint: epName,
        bytes: bytes.length,
        byteOffset: view.byteOffset,
        bufferByteLength: view.buffer.byteLength,
        hex: hexPreview(bytes),
        ms: Date.now() - startedAt,
      });
      return bytes;
    } catch (error) {
      logWebBleError("gatt:read-failed", {
        endPoint: epName,
        ms: Date.now() - startedAt,
        error: serializeError(error),
      });
      throw error;
    }
  };

  provisioner.writeValue = async (
    epName: string,
    data: Uint8Array,
  ): Promise<void> => {
    const characteristic = provisioner.getCharacteristic(
      epName,
    ) as unknown as GattCharacteristicLike;
    await writeCharacteristicValue(characteristic, data, epName);
  };

  logWebBle("gatt:codec-patched", {
    endpoints: Array.from(provisioner.endpoints.keys()),
  });
}

/**
 * Runtime fields used by Security2 AES-GCM that are private on the typed class.
 * Kept as a plain shape (not `Security2 & …`) so TS does not collapse to `never`.
 */
type Security2AesRuntime = {
  sessionKey: CryptoKey | null;
  nonce: Uint8Array | null;
  staticNonce: boolean;
  incrementNonce: () => void;
  encrypt: (data: Uint8Array) => Promise<Uint8Array>;
  decrypt: (data: Uint8Array) => Promise<Uint8Array>;
};

/**
 * Patches Security2 AES-GCM to pass the nonce `Uint8Array` (not `.buffer`).
 * Same DataView/ArrayBuffer pitfall as GATT reads — breaks post-session crypto.
 * @param security - Security2 handler instance
 */
export function patchSecurity2AesGcmIv(security: Security2): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- private fields not in public .d.ts
  const runtime = security as any as Security2AesRuntime;

  runtime.encrypt = async (data: Uint8Array): Promise<Uint8Array> => {
    if (!runtime.sessionKey || !runtime.nonce) {
      throw new Error("Secure session not established.");
    }
    const iv = Uint8Array.from(runtime.nonce);
    const plain = Uint8Array.from(data);
    const cipherBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      runtime.sessionKey,
      plain,
    );
    if (!runtime.staticNonce) {
      runtime.incrementNonce();
    }
    return new Uint8Array(cipherBuf);
  };

  runtime.decrypt = async (data: Uint8Array): Promise<Uint8Array> => {
    if (!runtime.sessionKey || !runtime.nonce) {
      throw new Error("Secure session not established.");
    }
    const iv = Uint8Array.from(runtime.nonce);
    const cipher = Uint8Array.from(data);
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      runtime.sessionKey,
      cipher,
    );
    if (!runtime.staticNonce) {
      runtime.incrementNonce();
    }
    return new Uint8Array(plainBuf);
  };
}
