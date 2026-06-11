/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Temporary AWS credentials used for SigV4 calls into KVS.
 * Duck-typed so host apps can pass their own credential objects.
 */
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional for long-lived keys; required for RainMaker assume-role tokens. */
  sessionToken?: string;
}

/**
 * Root KVS client config: region + credentials shared by all services
 * (archived media and signaling).
 */
export interface KvsClientConfig {
  region: string;
  credentials: AwsCredentials;
}
