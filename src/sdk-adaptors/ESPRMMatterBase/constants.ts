/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Constants owned by the classic RainMaker Matter adaptor: its own identifier and
 * the Matter controller setup service it drives.
 *
 * Protocol-level cluster and device type tokens are not here — they are shared and
 * live in `@config/matter.identifiers`.
 */

export { ESPRMMatterBaseAdaptorIdentifier } from "@config/sdk.identifiers";

/** Thrown from Matter group ops when the home must be converted before `getFabricDetails`. */
export const MATTER_NEEDS_FABRIC_CONVERSION = "MATTER_NEEDS_FABRIC_CONVERSION";

export const MATTER_CTL_SETUP_PARAM_MT_DEVICES = "esp.param.matter-devices";
export const MATTER_CTL_SETUP_SERVICE_TYPE = "esp.service.matter-controller-setup";
export const MATTER_CTL_SETUP_PARAM_RMAKER_GROUP_ID = "esp.param.rmaker-group-id";

/** RainMaker notification shadow keys for Matter controller setup (not CDF param types). */
export const MATTER_CTL_SETUP_NOTIFICATION_KEY = "MatterCTLSetup";
export const MATTER_CTL_SETUP_PARAM_MT_DEVICES_NOTIFICATION_KEY = "MTDevices";

/** Nested keys inside `MatterCTLSetup.MTDevices.*` attribute reports. */
export const MATTER_CTL_SETUP_PAYLOAD_CLUSTERS_KEY = "clusters";
export const MATTER_CTL_SETUP_PAYLOAD_CLUSTER_SERVERS_KEY = "servers";
export const MATTER_CTL_SETUP_PAYLOAD_ATTRIBUTES_KEY = "attributes";

/** `ESPNodeUpdateData.source` for matter subscription and controller fan-out. */
export const MATTER_NODE_UPDATE_SOURCE = "matter";
