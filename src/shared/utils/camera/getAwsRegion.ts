/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import StorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import { getResolvedActiveSdk, getRMNeoSDKConfig } from "@config/sdk.config";
import { ESPRMNeo_BASE_SDK_ID } from "@config/sdk.identifiers";

/** Storage key for the ID token (matches Base_SDK StorageKeys.IDTOKEN) */
const ID_TOKEN_STORAGE_KEY = "com.esprmbase.idToken";

/** Default AWS region fallback */
const DEFAULT_AWS_REGION = "us-east-1";

/**
 * Regex to extract AWS region from the JWT issuer URL.
 * Supports multiple patterns:
 * 1. https://cognito-idp.us-east-1.amazonaws.com/...
 * 2. https://esp-rainmaker-oauth-*-dev.s3.us-east-1.amazonaws.com
 * 3. https://esp-rainmaker-oauth-*-dev.s3.cn-north-1.amazonaws.com.cn
 */
const AWS_REGION_REGEX =
  /(?:cognito-idp\.|\bs3\.)([^.]+)\.amazonaws\.com(?:\.cn)?/;

/**
 * Decodes the payload of a JWT token without verifying the signature.
 * JWTs are base64url-encoded: header.payload.signature
 * @param token - The JWT token string
 * @returns The decoded payload object, or null if decoding fails
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    // Base64url -> Base64 -> decode
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    // Pad with '=' to make length a multiple of 4
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }

    const decoded = atob(base64);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Extracts the AWS region from the stored ID token's `iss` (issuer) claim.
 * This mirrors the Android native app logic:
 * - Reads the ID token from storage
 * - Decodes the JWT payload to get the `iss` claim
 * - Extracts the region from the issuer URL using a regex
 * @returns The AWS region string (e.g. "us-east-1"), or the default region if extraction fails
 */
export async function getAwsRegionFromToken(): Promise<string> {
  try {
    const idToken = await StorageAdapter.getItem(ID_TOKEN_STORAGE_KEY);
    const payload = idToken ? decodeJwtPayload(idToken) : null;
    const match = payload?.iss ? AWS_REGION_REGEX.exec(payload.iss) : null;
    if (match && match[1]) {
      return match[1];
    }
    return getConfiguredAwsRegion() ?? DEFAULT_AWS_REGION;
  } catch {
    return getConfiguredAwsRegion() ?? DEFAULT_AWS_REGION;
  }
}

/**
 * Region from the active deployment config, for SDKs whose ID token issuer
 * carries no region. RainMaker Neo's issuer is an S3-hosted OIDC document
 * (`espuser-oauth-...`), so the token path above yields nothing and the KVS
 * endpoints must follow the deployment's `awsRegion` (QR-scanned or env).
 * @returns Configured region, or null when the active SDK does not define one.
 */
function getConfiguredAwsRegion(): string | null {
  try {
    if (getResolvedActiveSdk() !== ESPRMNeo_BASE_SDK_ID) {
      return null;
    }
    const region = getRMNeoSDKConfig().awsRegion;
    return region && region.trim() ? region.trim() : null;
  } catch {
    return null;
  }
}
