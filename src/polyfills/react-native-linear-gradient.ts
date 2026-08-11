/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Metro/babel shim so `react-native-reanimated-skeleton` resolves against
 * Expo's gradient (named export) instead of `react-native-linear-gradient`.
 */
export { LinearGradient as default } from "expo-linear-gradient";
