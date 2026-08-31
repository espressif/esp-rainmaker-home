/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";

import type { BleProvisioningNativeModule } from "./types/types";

/**
 * Default native bridge — Metro resolves `.android.ts` / `.ios.ts` / `.web.ts` first.
 */
export default NativeModules.ESPProvModule as BleProvisioningNativeModule;
