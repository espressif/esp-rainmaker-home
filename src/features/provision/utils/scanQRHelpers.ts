/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MATTER_QR_CODE_PREFIX,
  RM_QR_CODE_PREFIX,
  RM_QR_TRANSPORT_MAP,
} from "@shared/utils/constants";

/** Fields extracted from ESP / RainMaker device QR payloads used for BLE provision. */
export type ParsedQrPayload = {
  security?: number;
  name?: string;
  pop?: string;
  transport?: string;
};

/** Discriminated result of classifying a scanned QR string for provision flows. */
export type ProvisionQrParseResult =
  | { kind: "matter"; qrData: string }
  | { kind: "device"; payload: ParsedQrPayload }
  | { kind: "invalid" };

/**
 * Parses RainMaker-prefixed QR payloads (`TYPE:name|pop|transport`).
 * @param qrData - Raw QR string (typically starting with `NP:`)
 * @returns Parsed fields, or null when the payload is malformed
 */
export function parseRMNodeQrPayload(
  qrData: string,
): (ParsedQrPayload & { type: string }) | null {
  const firstColon = qrData.indexOf(":");
  const type = firstColon >= 0 ? qrData.slice(0, firstColon).trim() : "";
  const payload =
    firstColon >= 0 ? qrData.slice(firstColon + 1).trim() : qrData.trim();

  if (!payload.includes("|")) {
    return null;
  }

  const [name, pop, transport] = payload
    .split("|")
    .map((part: string) => part.trim());

  return {
    type,
    name,
    pop,
    transport:
      RM_QR_TRANSPORT_MAP[transport as keyof typeof RM_QR_TRANSPORT_MAP],
  };
}

/**
 * Parses a JSON ESP provisioning QR payload into device fields.
 * @param qrData - Raw QR string expected to be JSON
 * @returns Parsed payload, or null when JSON is missing or not an object
 */
export function parseEspJsonQrPayload(qrData: string): ParsedQrPayload | null {
  try {
    const parsed = JSON.parse(qrData) as ParsedQrPayload;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Classifies and parses a scanned QR string for Matter vs RainMaker vs ESP JSON.
 * @param qrData - Raw barcode data string
 * @returns Discriminated parse result for the ScanQR provision flow
 */
export function parseProvisionQrData(qrData: string): ProvisionQrParseResult {
  if (qrData.startsWith(MATTER_QR_CODE_PREFIX)) {
    return { kind: "matter", qrData };
  }

  if (qrData.startsWith(RM_QR_CODE_PREFIX)) {
    const transformed = parseRMNodeQrPayload(qrData);
    if (!transformed?.name || !transformed?.transport) {
      return { kind: "invalid" };
    }
    return { kind: "device", payload: transformed };
  }

  const jsonPayload = parseEspJsonQrPayload(qrData);
  if (!jsonPayload) {
    return { kind: "invalid" };
  }
  return { kind: "device", payload: jsonPayload };
}
