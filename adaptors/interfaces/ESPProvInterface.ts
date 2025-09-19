/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPProvisionAdapterInterface } from "@espressif/rainmaker-base-sdk";
import { NativeModules } from "react-native";
const { ESPProvModule } = NativeModules;

export default ESPProvModule as ESPProvisionAdapterInterface;
