/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFUser } from "@store";
import { ESPCDF } from "@store";
import {
  ESPRMNGBaseAdaptorIdentifier,
  ESPRMNGMatterBaseAdaptorIdentifier,
} from "@config/sdk.identifiers";

/** Resolves the logged-in CDF user for either RMNG stack adaptor id. */
export function getRmngStackAuthorizationUser(
  root: ESPCDF | null | undefined = ESPCDF.instance,
): ESPCDFUser | undefined {
  if (!root?.userStore) {
    return undefined;
  }
  return (
    root.userStore.getAuthorizationEntityForAdaptor(
      ESPRMNGMatterBaseAdaptorIdentifier,
    ) ??
    root.userStore.getAuthorizationEntityForAdaptor(ESPRMNGBaseAdaptorIdentifier)
  );
}
