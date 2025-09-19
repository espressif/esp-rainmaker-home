/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";
import { ESPLocalControlAdapterInterface } from "@espressif/rainmaker-base-sdk";

const { ESPLocalControlModule } = NativeModules;

export default ESPLocalControlModule as ESPLocalControlAdapterInterface;
