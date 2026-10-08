/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Re-exports BLE PoP / capability helpers from `@modules/ble-prov`
 * so feature code does not import the package directly.
 */
export { deviceRequiresProofOfPossession } from "@modules/ble-prov/utils";
