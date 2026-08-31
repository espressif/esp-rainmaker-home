/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export { webProvisionManager } from "./provisionManager";

export {
  connectRainMakerDevice,
  disconnectRainMakerDevice,
} from "./deviceConnection";

export {
  clearDeviceRegistry,
  getAllRegisteredDevices,
  getRegisteredDevice,
  registerDevice,
  unregisterDevice,
} from "./utils/deviceRegistry";

export {
  getCapabilitiesFromProtoVer,
  getSecurityFromProtoVer,
  readProtoVer,
} from "./utils/protoVer";

export { buildAdvertisementData } from "./utils/advertisement";
