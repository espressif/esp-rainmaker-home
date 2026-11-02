/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Make this device show itself" — blink an LED, chirp, whatever the device does.
 *
 * Both stacks reach it the same way: a writable `identify` param taking seconds.
 * Firmware declares one on RainMaker devices, and the Matter cluster registry
 * compiles one from cluster `0x0003`, so transport choice belongs to the SDK and
 * this module only has to find the param and write it.
 */

import type { ESPCDFDevice, ESPCDFDeviceParam, ESPCDFNode } from "@store";
import { ESPRM_IDENTIFY_PARAM_TYPE } from "./constants";

/** How long a device identifies itself for, in seconds. */
export const DEVICE_IDENTIFY_SECONDS = 5;

/** Bare name the param arrives under when firmware declares no `type`. */
const IDENTIFY_PARAM_NAME = "identify";

/**
 * Whether a param is the device's identify control, on either stack.
 *
 * Matches the declared type and the bare name, because an undeclared param reaches
 * us with its name in the type slot, and a registry-compiled Matter param arrives
 * as `type: "server:0x3"` so only `name` (mapped from the SDK param id) marks it.
 * @param param - Device param
 * @returns True for the identify param, writable or not
 */
export const isIdentifyParam = (param: ESPCDFDeviceParam): boolean => {
  const declaredType = (param.type ?? "").trim();
  return (
    declaredType === ESPRM_IDENTIFY_PARAM_TYPE ||
    declaredType.toLowerCase() === IDENTIFY_PARAM_NAME ||
    (param.name ?? "").trim().toLowerCase() === IDENTIFY_PARAM_NAME
  );
};

/**
 * Finds the writable identify param on a device.
 * @param device - CDF sub-device
 * @returns The identify param, or undefined when the device exposes none
 */
const findIdentifyParam = (
  device: ESPCDFDevice | undefined,
): ESPCDFDeviceParam | undefined =>
  device?.params?.find(
    (param) => isIdentifyParam(param) && param.properties?.includes("write"),
  ) as ESPCDFDeviceParam | undefined;

/**
 * Whether asking this device to identify itself would do anything.
 * @param device - Target sub-device
 * @returns True when the device exposes a writable identify param
 */
export const canIdentifyDevice = (device: ESPCDFDevice | undefined): boolean =>
  Boolean(findIdentifyParam(device));

/**
 * Stable key naming the devices on a node that can identify right now, so a
 * screen can watch it for a Matter transport attaching late.
 * @param node - CDF node
 * @returns Sorted device names, joined; empty when none can identify
 */
export const identifiableDeviceKey = (node: ESPCDFNode | undefined): string =>
  (node?.devices ?? [])
    .filter((device) => canIdentifyDevice(device))
    .map((device) => device.name)
    .sort()
    .join("\n");

/**
 * Asks the device to identify itself for a few seconds.
 *
 * Momentary by nature: the device counts the value down and stops on its own, so
 * there is no off state to track and zero stops one already running.
 * @param device - Target sub-device
 * @param seconds - How long to identify for; 0 stops one already running
 * @returns True when the write was accepted
 */
export const identifyDevice = async (
  device: ESPCDFDevice | undefined,
  seconds: number = DEVICE_IDENTIFY_SECONDS,
): Promise<boolean> => {
  const identifyParam = findIdentifyParam(device);
  if (!identifyParam) {
    return false;
  }
  try {
    await identifyParam.setValue(seconds);
    return true;
  } catch {
    return false;
  }
};
