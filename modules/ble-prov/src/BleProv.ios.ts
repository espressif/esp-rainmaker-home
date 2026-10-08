/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";

import type { BleProvisioningNativeModule } from "./types/types";

/**
 * iOS native bridge — delegates to the legacy `ESPProvModule` RN module
 * registered in the host app until native code is migrated into this package.
 */
export default NativeModules.ESPProvModule as BleProvisioningNativeModule;
