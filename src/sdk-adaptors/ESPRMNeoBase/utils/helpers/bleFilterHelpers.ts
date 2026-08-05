/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RMNeo BLE manufacturer advertisement layout matches RainMaker base SDK
 * `SearchESPBLEDevices` (product signature at offset 0 or 2, 16-bit customer id at off+4 / off+5),
 * but uses the 4-byte ASCII "RMNG" signature instead of "Nov".
 *
 * Note: the signature bytes below still spell "RMNG" — they are the
 * firmware-side product signature broadcast by RMNeo devices, unrelated to the
 * SDK's own rename. Do not change the bytes until firmware advertises a new
 * signature.
 * @see node_modules/@espressif/rainmaker-base-sdk/dist/esm/methods/ESPRMUser/SearchESPBLEDevices.js
 */

/** ASCII "RMNG" — firmware product signature in manufacturer data (see note above). */
export const RMNEO_BLE_SIGNATURE_BYTES: readonly [
  number,
  number,
  number,
  number,
] = [0x52, 0x4d, 0x4e, 0x47];

/**
 * Reads normalized manufacturer bytes from BLE advertisement data.
 * @param advertisementData - Native BLE advertisement payload.
 * @returns Byte array or `null` when manufacturer data is absent.
 */
function readManufacturerBytes(advertisementData: unknown): number[] | null {
  const raw = (
    advertisementData as { kCBAdvDataManufacturerData?: unknown } | null
  )?.kCBAdvDataManufacturerData;
  if (!raw || !Array.isArray(raw)) {
    return null;
  }
  return raw.map((byte) => Number(byte) & 0xff);
}

/**
 * Checks for the RMNeo signature at a supported manufacturer-data offset.
 * @param dataArray - Normalized manufacturer bytes.
 * @param offset - Supported signature offset.
 * @returns Whether the RMNeo signature matches.
 */
function matchesRmneoSignatureAt(
  dataArray: number[],
  offset: 0 | 2,
): boolean {
  const sig = RMNEO_BLE_SIGNATURE_BYTES;
  if (dataArray.length < offset + sig.length) {
    return false;
  }
  return sig.every((byte, index) => dataArray[offset + index] === byte);
}

/**
 * Locates the RMNeo signature in manufacturer data.
 * @param dataArray - Normalized manufacturer bytes.
 * @returns Signature offset, or `-1` when absent.
 */
function signatureOffsetRmneo(dataArray: number[]): 0 | 2 | -1 {
  if (matchesRmneoSignatureAt(dataArray, 0)) {
    return 0;
  }
  if (matchesRmneoSignatureAt(dataArray, 2)) {
    return 2;
  }
  return -1;
}

/**
 * Reads the 16-bit customer id from RMNeo-formatted manufacturer data.
 * @param advertisementData - Native BLE advertisement payload.
 * @returns Customer ID, or `null` when not present.
 */
export function getRmneoManufacturerCustomerId(
  advertisementData: unknown,
): number | null {
  const dataArray = readManufacturerBytes(advertisementData);
  if (!dataArray || dataArray.length < 10) {
    return null;
  }
  const offset = signatureOffsetRmneo(dataArray);
  if (offset < 0 || dataArray.length < offset + 10) {
    return null;
  }
  return (
    ((dataArray[offset + 4] ?? 0) << 8) | (dataArray[offset + 5] ?? 0)
  );
}

/**
 * Checks whether BLE advertisement data belongs to an RMNeo customer.
 * @param advertisementData - Native BLE advertisement payload.
 * @param customerId - Expected RMNeo customer ID.
 * @returns Whether the signature and customer ID match.
 */
export function isRmneoBleDeviceForCustomer(
  advertisementData: unknown,
  customerId: number,
): boolean {
  const cid = getRmneoManufacturerCustomerId(advertisementData);
  return cid !== null && cid === customerId;
}

/**
 * Filters provision scan results to RMNeo-signed BLE advertisements with the given customer id.
 * @param devices - Provision scan results.
 * @param customerId - Expected RMNeo customer ID.
 * @returns Matching provision devices.
 */
export function filterEspProvisionDevicesByRmneoCustomerId<
  T extends { advertisementData?: unknown },
>(devices: readonly T[], customerId: number): T[] {
  return devices.filter((device) =>
    isRmneoBleDeviceForCustomer(device.advertisementData, customerId),
  );
}
