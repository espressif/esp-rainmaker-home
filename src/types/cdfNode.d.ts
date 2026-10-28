/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import "@espressif/rainmaker-base-cdf/dist/entities/ESPCDFNode";

declare module "@espressif/rainmaker-base-cdf/dist/entities/ESPCDFNode" {
  interface ESPCDFNode {
    /**
     * Set by the adaptor when every device shows the node's saved Matter name
     * (classic pure Matter, as the reference apps do).
     */
    sharesNodeName?: boolean;
  }
}
