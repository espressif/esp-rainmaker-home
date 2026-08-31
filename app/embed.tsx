/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Redirect } from "expo-router";

/**
 * Native builds do not offer the web `/embed` iPhone showcase.
 * Send users to the app root instead.
 */
export default function EmbedNativeRedirect() {
  return <Redirect href="/" />;
}
