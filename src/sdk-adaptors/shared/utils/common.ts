/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { makeObservable, observable } from "mobx";
import type {
  ESPCDFDevice,
  ESPCDFDeviceParam,
  ESPCDFNode,
  ESPCDFServiceParam,
} from "@store";
import { getDeviceDisplayName } from "@shared/utils/deviceDisplayName";

/**
 * Stores the shown name on one CDF device, for screens that read
 * `displayName` instead of asking {@link getDeviceDisplayName} themselves.
 * @param cdfNode - Parent CDF node
 * @param deviceName - Internal device name on the node
 */
export function syncCdfDeviceDisplayName(
  cdfNode: ESPCDFNode,
  deviceName: string,
): void {
  const cdfDevice = cdfNode.devices?.find((device) => device.name === deviceName);
  if (!cdfDevice) {
    return;
  }

  const resolved = getDeviceDisplayName(cdfDevice, cdfNode);
  if (resolved) {
    cdfDevice.displayName = resolved;
  }
}

/**
 * Stores the shown name on every device of a CDF node.
 * @param cdfNode - CDF node whose devices are named
 */
export function syncCdfNodeDisplayNames(cdfNode: ESPCDFNode): void {
  for (const device of cdfNode.devices ?? []) {
    syncCdfDeviceDisplayName(cdfNode, device.name);
  }
}

/**
 * Keeps the last known value of each param a rebuilt node has no value for.
 *
 * A rebuild from the cloud config carries no live values, and a Neo pure
 * Matter light has no cloud copy of them at all, so after every home sync it
 * showed its setup name ("Light") instead of the name it had reported.
 * Only params that came back with no value are filled; a fresh value wins.
 * @param devices - Devices of the rebuilt node
 * @param previousDevices - Devices of the node it replaces, if any
 */
export function keepLastKnownParamValues(
  devices: ESPCDFDevice[],
  previousDevices: ESPCDFDevice[] | undefined,
): void {
  for (const device of devices) {
    const previous = previousDevices?.find((old) => old.name === device.name);
    for (const param of device.params ?? []) {
      if (param.value !== undefined) {
        continue;
      }
      const lastValue = previous?.params?.find(
        (old) => old.name === param.name,
      )?.value;
      if (lastValue !== undefined) {
        param.value = lastValue;
      }
    }
  }
}

/** The parts of a node {@link makeCdfNodeParamsObservable} instruments. */
interface NodeWithParams {
  id?: string;
  devices?: { name?: string; params?: ESPCDFDeviceParam[] }[];
  services?: { name?: string; params?: ESPCDFServiceParam[] }[];
}

/**
 * Marks each device/service param's `value` field as MobX-observable so
 * in-place mutations from live shadow pushes trigger observer re-renders.
 * Idempotent — safe to call again on a re-transformed node. Also used on the
 * params a device refresh returns: the store swaps them in as they are.
 * @param cdfNode - CDF node to instrument.
 */
export function makeCdfNodeParamsObservable(cdfNode: NodeWithParams): void {
  for (const device of cdfNode.devices ?? []) {
    for (const param of device.params ?? []) {
      try {
        makeObservable(param, { value: observable });
      } catch (error) {
        // Already instrumented.
        console.debug(
          "[makeCdfNodeParamsObservable] Device param already observable",
          { nodeId: cdfNode.id, deviceName: device.name, paramName: param.name, error },
        );
      }
    }
  }
  for (const service of cdfNode.services ?? []) {
    for (const param of service.params ?? []) {
      try {
        makeObservable(param, { value: observable });
      } catch (error) {
        // Already instrumented.
        console.debug(
          "[makeCdfNodeParamsObservable] Service param already observable",
          { nodeId: cdfNode.id, serviceName: service.name, paramName: param.name, error },
        );
      }
    }
  }
}
