/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export { LandingScreen } from "./screens";
export { useLanding } from "./hooks";
export { PLATFORM_OPTIONS } from "./config/platformOptions";
export type {
  PlatformKind,
  PlatformOption,
} from "./config/platformOptions";
export {
  DEPLOYMENT_KIND,
  getCurrentDeploymentKind,
  getDeploymentLabelKey,
  getDeploymentWordmark,
  shouldSkipLandingScreen,
  getPreAuthRoute,
} from "./utils/currentDeployment";
export type { CurrentDeploymentKind } from "./utils/currentDeployment";
