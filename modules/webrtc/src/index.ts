/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native entry for `@modules/webrtc`.
 * On native platforms the app continues to use `react-native-webrtc` directly;
 * on web Metro loads `./web` which re-exports browser WebRTC plus a DOM RTCView.
 */

export {};
