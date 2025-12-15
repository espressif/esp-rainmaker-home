/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMDeviceParam,
  ESPRMNode,
  ESPRMDevice,
} from "@espressif/rainmaker-base-sdk";
import { ESPRM_NAME_PARAM_TYPE } from "@/utils/constants";
import { DEVICE_TYPE_LIST } from "@/config/devices.config";

/**
 * Device images
 */
const deviceImages: Record<string, any> = {
  "light-1": require("@/assets/images/devices/light-1.png"),
  "light-1-online": require("@/assets/images/devices/light-1-online.png"),
  "light-3": require("@/assets/images/devices/light-3.png"),
  "light-3-online": require("@/assets/images/devices/light-3-online.png"),
  socket: require("@/assets/images/devices/socket.png"),
  "socket-online": require("@/assets/images/devices/socket-online.png"),
  switch: require("@/assets/images/devices/switch.png"),
  "switch-online": require("@/assets/images/devices/switch-online.png"),
  fan: require("@/assets/images/devices/fan.png"),
  "fan-online": require("@/assets/images/devices/fan-online.png"),
  temperature: require("@/assets/images/devices/sensor.png"),
  "temperature-online": require("@/assets/images/devices/sensor-online.png"),
  'ai-assistant': require("@/assets/images/devices/ai-assistant.png"),
  'ai-assistant-online': require("@/assets/images/devices/ai-assistant-online.png"),
  // Add more mappings as needed
};

/**
 * Extracts the node type from a node
 * @param node The node to extract the type from
 * @returns The node type
 */
const extractNodeType = (node: ESPRMNode): string => {
  return node.nodeConfig?.info.type || "";
};

/**
 * Extracts the core device type from a full type string
 * @param fullType The complete device type (e.g. "esp.device.lightbulb")
 * @returns The extracted device type (e.g. "lightbulb")
 */
const extractDeviceType = (fullType: string | undefined): string => {
  if (!fullType) return "";

  try {
    // Handle format like "esp.device.lightbulb" → extract "lightbulb"
    if (fullType.includes(".")) {
      const parts = fullType.split(".");
      return parts.length >= 3 ? parts[2].toLowerCase() : "";
    }
    // Handle direct type like "lightbulb"
    return fullType.toLowerCase();
  } catch (error) {
    console.error("Error extracting device type:", error);
    return "";
  }
};

/**
 * Finds a matching device configuration from the device type list
 * @param deviceType The device type to find
 * @returns The matching device configuration or undefined
 */
const findDeviceConfig = (deviceType: string) => {
  if (!deviceType) return undefined;
  return DEVICE_TYPE_LIST.find((item) => item.type.includes(deviceType));
};

/**
 * Gets the appropriate icon name for a device type
 * @param deviceType The device type
 * @param deviceConfig The device configuration
 * @returns The icon name to use
 */
const getIconName = (
  deviceType: string,
  deviceConfig: (typeof DEVICE_TYPE_LIST)[0] | undefined
): string => {
  const DEFAULT_ICON = "light-1";

  if (!deviceConfig) return DEFAULT_ICON;

  // Check if there's a specific icon for this device type
  const hasSpecificIcon = deviceType in (deviceConfig.icon || {});

  if (hasSpecificIcon) {
    return (
      (deviceConfig.icon as any)[deviceType]?.icon || deviceConfig.defaultIcon
    );
  }

  return deviceConfig.defaultIcon;
};

/**
 * Gets the appropriate device image based on device type and connection status
 * @param type The device type identifier (e.g. "esp.device.lightbulb")
 * @param isConnected Whether the device is currently connected
 * @returns The image resource for the device
 */
const getDeviceImage = (type: string | undefined, isConnected: boolean) => {
  const DEFAULT_ICON = "light-1";
  const getDefaultImage = () =>
    deviceImages[isConnected ? `${DEFAULT_ICON}-online` : DEFAULT_ICON];

  try {
    // Process the device type
    const deviceType = extractDeviceType(type);
    if (!deviceType) return getDefaultImage();

    // Find matching device configuration
    const deviceConfig = findDeviceConfig(deviceType);
    if (!deviceConfig) return getDefaultImage();

    // Get the appropriate icon name
    const iconName = getIconName(deviceType, deviceConfig);

    // Construct the full image name with online/offline state
    const fullImageName = isConnected ? `${iconName}-online` : iconName;

    // Return the image or fall back to default if not found
    return deviceImages[fullImageName] || getDefaultImage();
  } catch (error) {
    console.error("Error getting device image:", error);
    return getDefaultImage();
  }
};

/**
 * Gets the best display name for a device
 * @param node The ESPRMNode object
 * @returns A human-readable name for the device
 */
const getDeviceName = (node: ESPRMNode): string => {
  const device = node.nodeConfig?.devices[0];
  const nameParam: ESPRMDeviceParam | null =
    device?.params?.find((param) => param.type === ESPRM_NAME_PARAM_TYPE) ||
    null;
  if (nameParam) {
    return nameParam.value;
  } else {
    // Fallback to device config name based on device type
    const deviceType = extractDeviceType(device?.type);
    const deviceConfig = findDeviceConfig(deviceType);
    return deviceConfig?.name || "Light";
  }
};

/**
 * Determines the device category based on device type and configuration
 * @param deviceConfig The device configuration from DEVICE_TYPE_LIST
 * @returns The device category for UI rendering
 */
const getDeviceCategory = (
  deviceConfig: (typeof DEVICE_TYPE_LIST)[0] | undefined
): string => {
  if (!deviceConfig) return "unknown";

  // Return the label which represents the category
  return deviceConfig.label.toLowerCase();
};

/**
 * Checks if a device is of a specific category
 * @param deviceType The extracted device type
 * @param category The category to check against (e.g., "lighting", "socket", "switch")
 * @returns Boolean indicating if the device matches the category
 */
const isDeviceCategory = (deviceType: string, category: string): boolean => {
  const deviceConfig = findDeviceConfig(deviceType);
  if (!deviceConfig) return false;

  return deviceConfig.label.toLowerCase() === category.toLowerCase();
};

/**
 * Transforms an array of ESP RainMaker nodes into a flattened array of devices with their associated node information.
 *
 * This function performs the following operations:
 * 1. Takes an array of ESPRMNode objects
 * 2. Extracts devices from each node's configuration
 * 3. Attaches the parent node reference as WeakRef to each device
 * 4. Flattens the resulting array of devices
 *
 * Uses WeakRef to allow garbage collection of nodes when they're no longer referenced elsewhere.
 *
 * @param {ESPRMNode[]} nodes - Array of ESP RainMaker nodes to transform
 * @returns {Array<ESPRMDevice & { node: WeakRef<ESPRMNode> }>} Flattened array of devices with weak node references
 *
 * @example
 * const nodes = [
 *   { nodeConfig: { devices: [{ id: 1 }, { id: 2 }] } },
 *   { nodeConfig: { devices: [{ id: 3 }] } }
 * ];
 * const devices = transformNodesToDevices(nodes);
 * // Result: [{ id: 1, node: WeakRef({...}) }, { id: 2, node: WeakRef({...}) }, { id: 3, node: WeakRef({...}) }]
 */
const transformNodesToDevices = (
  nodes: ESPRMNode[]
): Array<ESPRMDevice & { node: WeakRef<ESPRMNode> }> => {
  // Reduce nodes array into a flattened array of devices with weak node references
  return nodes.reduce((accumulator, currentNode) => {
    // Extract devices array from node config, default to empty array if undefined
    const nodeDevices = currentNode.nodeConfig?.devices || [];

    // Map each device to include its parent node as WeakRef
    const devicesWithNodeRef = nodeDevices.map((device) => ({
      ...device,
      node: new WeakRef(currentNode),
    })) as Array<ESPRMDevice & { node: WeakRef<ESPRMNode> }>;

    // Concatenate with accumulated devices
    return [...accumulator, ...devicesWithNodeRef];
  }, [] as Array<ESPRMDevice & { node: WeakRef<ESPRMNode> }>);
};

// Type definition for a device configuration
export type DeviceConfig = (typeof DEVICE_TYPE_LIST)[0];

/**
 * Determines the error type based on BLE scan error message content
 * 
 * @param errorMessage - The error message to analyze
 * @param errorCode - Optional error code from React Native rejection
 * @returns The categorized error type: "permission" | "noDevices" | "scanFailed" | "bluetoothDisabled" | "generic"
 * 
 * @example
 * const errorType = getBleScanErrorType("BLE scanning failed");
 * // Returns: "scanFailed"
 * 
 * @example
 * const errorType = getBleScanErrorType("Error message", "BLUETOOTH_DISABLED");
 * // Returns: "bluetoothDisabled"
 */
const getBleScanErrorType = (
  errorMessage: string,
  errorCode?: string
): "permission" | "noDevices" | "scanFailed" | "bluetoothDisabled" | "generic" => {
  const normalizedMessage = errorMessage.toLowerCase();
  const normalizedCode = errorCode?.toLowerCase() || "";
  
  // Check error codes first (Android-specific)
  if (
    normalizedCode === "scan_failed" ||
    normalizedCode === "scan_error"
  ) {
    return "scanFailed";
  }
  
  if (normalizedCode === "bluetooth_disabled") {
    return "bluetoothDisabled";
  }
  
  if (normalizedCode === "location_disabled") {
    return "permission";
  }
  
  // Check for no devices found FIRST (before generic bluetooth checks)
  // This prevents "No bluetooth device found" from being misclassified as permission error
  if (
    normalizedMessage.includes("no bluetooth device found") ||
    normalizedMessage.includes("no bluetooth device found with given prefix")
  ) {
    return "noDevices";
  }
  
  // Check for Bluetooth/permission related errors in message
  if (
    normalizedMessage.includes("bluetooth_scan") ||
    normalizedMessage.includes("bluetooth") ||
    normalizedMessage.includes("location") ||
    normalizedMessage.includes("permission")
  ) {
    // Check if it's Bluetooth disabled vs permission
    if (
      normalizedMessage.includes("disabled") ||
      normalizedMessage.includes("not enabled") ||
      normalizedMessage.includes("turn on") ||
      normalizedMessage.includes("enable bluetooth") ||
      normalizedMessage.includes("bluetooth is required") ||
      normalizedMessage.includes("user needs to enable bluetooth")
    ) {
      return "bluetoothDisabled";
    } else {
      return "permission";
    }
  }
  
  // Check for scan failures
  if (
    normalizedMessage.includes("ble scanning failed") ||
    normalizedMessage.includes("scan could not be started") ||
    normalizedMessage.includes("error during ble scan") ||
    normalizedMessage.includes("scan failed") ||
    normalizedMessage.includes("search is not supported")
  ) {
    return "scanFailed";
  }
  
  return "generic";
};

/**
 * Determines which permission is missing based on BLE and Location permission status
 * 
 * @param bleGranted - Whether BLE permission is granted (null means unknown/checking)
 * @param locationGranted - Whether Location permission is granted (null means unknown/checking)
 * @returns The missing permission type: "ble" | "location" | "both" | "none"
 * 
 * @example
 * const missing = getMissingPermission(false, true);
 * // Returns: "ble"
 */
const getMissingPermission = (
  bleGranted: boolean | null,
  locationGranted: boolean | null
): "ble" | "location" | "both" | "none" => {
  if (bleGranted === false && locationGranted === false) return "both";
  if (bleGranted === false) return "ble";
  if (locationGranted === false) return "location";
  return "none";
};

/**
 * Determines the error type based on QR scan error message content
 * 
 * @param errorMessage - The error message to analyze
 * @returns The categorized error type: "permission" | "bluetoothDisabled" | "connection" | "session" | "generic"
 * 
 * @example
 * const errorType = getQRScanErrorType("Bluetooth is not enabled");
 * // Returns: "bluetoothDisabled"
 * 
 * @example
 * const errorType = getQRScanErrorType("DEVICE_NOT_FOUND");
 * // Returns: "connection"
 */
const getQRScanErrorType = (
  errorMessage: string
): "permission" | "bluetoothDisabled" | "connection" | "session" | "generic" => {
  const normalizedMessage = errorMessage.toLowerCase();

  // Check for Bluetooth/permission related errors
  if (
    normalizedMessage.includes("bluetooth_scan") ||
    normalizedMessage.includes("bluetooth") ||
    normalizedMessage.includes("ble") ||
    normalizedMessage.includes("permission")
  ) {
    // Check if it's a permission issue or BLE disabled
    if (
      normalizedMessage.includes("disabled") ||
      normalizedMessage.includes("not enabled") ||
      normalizedMessage.includes("turn on")
    ) {
      return "bluetoothDisabled";
    } else {
      return "permission";
    }
  }

  // Check for connection errors
  if (
    normalizedMessage.includes("device_not_found") ||
    normalizedMessage.includes("connection")
  ) {
    return "connection";
  }

  // Check for session errors
  if (
    normalizedMessage.includes("session")
  ) {
    return "session";
  }

  // Default to generic error
  return "generic";
};

// Export constants and utility functions
export { DEVICE_TYPE_LIST, deviceImages };

// Export utility functions
export {
  extractNodeType,
  extractDeviceType,
  findDeviceConfig,
  getIconName,
  getDeviceImage,
  getDeviceName,
  getDeviceCategory,
  isDeviceCategory,
  transformNodesToDevices,
  getBleScanErrorType,
  getMissingPermission,
  getQRScanErrorType,
};
