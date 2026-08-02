/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from "i18next";

import { getFeatures } from "@config/features.config";
import {
  getCurrentDeploymentKind,
  getDeploymentLabelKey,
} from "@features/landing";

/**
 * Whether the active stack can commission Matter devices.
 *
 * Only the RainMaker Matter adaptor implements the CDF Matter operations; on
 * RMNeo (and plain RainMaker) the first call throws an internal SDK message, so
 * callers gate on this before entering the flow.
 * @returns `true` when Matter commissioning is available.
 */
export function isMatterCommissioningSupported(): boolean {
  return getFeatures().matterCommissioning;
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
