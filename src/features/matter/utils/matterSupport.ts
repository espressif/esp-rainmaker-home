/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from "i18next";

import { getFeatures } from "@config/features.config";
import { getResolvedActiveSdk, isRmneoStackSdkId } from "@config/sdk.config";
import type { ESPCDFGroup } from "@store";
import {
  getCurrentDeploymentKind,
  getDeploymentLabelKey,
} from "@features/landing";

/**
 * Commissioning has two checks, kept separate because each has its own message:
 * {@link isMatterCommissioningSupported} asks whether this build has Matter,
 * {@link isMatterCommissioningAllowedForHome} asks whether this user owns the
 * home. Check support first — merging them would tell a build without Matter
 * that it has a shared-home problem.
 */

/**
 * Whether the active stack can commission Matter devices.
 *
 * Both Matter adaptors implement the CDF Matter operations; the base RainMaker
 * and Neo adaptors do not, and calling into them throws an internal SDK message,
 * so callers gate on this before entering the flow.
 * @returns `true` when Matter commissioning is available.
 */
export function isMatterCommissioningSupported(): boolean {
  return getFeatures().matterCommissioning;
}

/**
 * Whether the current user may commission Matter devices onto this home.
 *
 * On the Neo stack the backend lets any member mint device NOCs, but a device
 * commissioned by a shared (secondary) member ends up administered by that
 * member's controller — the primary could not repair its ACLs later. Classic
 * already rejects secondary node-CSR requests server-side. So commissioning is
 * gated to primary users on Neo Matter homes; a missing `isPrimaryUser` is
 * treated as primary (owned homes may omit the field).
 * @param home - The active home / fabric group from the store.
 * @returns `true` when this user may commission onto this home.
 */
export function isMatterCommissioningAllowedForHome(
  home: ESPCDFGroup,
): boolean {
  if (!isRmneoStackSdkId(getResolvedActiveSdk())) {
    return true;
  }
  return home.isPrimaryUser !== false;
}

/**
 * "Only the home owner can add Matter devices" copy for shared-home members.
 * @param t - Translation function from `useTranslation()`.
 * @returns Localized message for the shared-home commissioning gate.
 */
export function getMatterSharedHomeNotAllowedMessage(t: TFunction): string {
  return t("device.matter.commissioning.notAllowedSharedHome");
}

/**
 * "Matter isn't available here" text, naming the deployment picked on Landing
 * when one is known so the reason is obvious.
 * @param t - Translation function from `useTranslation()`.
 * @returns Localized message for the unsupported-deployment case.
 */
export function getMatterUnsupportedMessage(t: TFunction): string {
  const kind = getCurrentDeploymentKind();
  return kind
    ? t("device.matter.commissioning.notSupported", {
        deployment: t(getDeploymentLabelKey(kind)),
      })
    : t("device.matter.commissioning.notSupportedGeneric");
}
