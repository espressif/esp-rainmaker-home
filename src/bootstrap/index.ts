/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bootstrap module — imported as a side-effect at the very top of _layout.tsx.
 * Runs synchronously when the JS bundle loads, before any React tree is mounted.
 *
 * Keep only things that:
 *   - Must run exactly once
 *   - Are synchronous (or fire-and-forget)
 *   - Have no dependency on React state / context
 */

import "@/i18n";
import "@src/polyfills/init";
import { Platform } from "react-native";
import { configure } from "mobx";
import { registerHeadlessTasks } from "@src/tasks/registerHeadless";
import { installRouterPushThrottle } from "@shared/utils/navigation";

// Global MobX config — must be set before any observable is accessed
configure({ enforceActions: "never" });

// Prevent rapid duplicate `router.push` from stacking the same screen
installRouterPushThrottle();

// HeadlessJS tasks are Android specific
if (Platform.OS === "android") {
  registerHeadlessTasks();
}

