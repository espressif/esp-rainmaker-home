/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { runInAction } from "mobx";
import type { ESPCDFDevice, ESPCDFNode } from "@store";
import { mergeParamFields } from "@sdk-adaptors/ESPRMNGBase/utils/mergeParamFields";
import { buildBridgedChildMatterDevices } from "./transformers/buildBridgedChildMatterDevices";
import { isBridgedRmngMatterCdfNode, filterBridgedChildEndpointParams, getBridgedOwnedEndpointIds } from "./rmngMatterBridgeKind";
import {
    isRmngMatterEndpointParamFormat,
    normalizeRmngMatterConfigToCompressed,
} from "../utils/rmngMatterEndpointFormat";
import { mergeRmngMatterEndpointParamsIntoMerged } from "../utils/mergeRmngMatterConfigAndParams";

const BRIDGE_LOG = "[rmngBridge]";

function readDeviceMatterEndpointId(device: ESPCDFDevice): string | undefined {
    const id = (device._raw as { matterEndpointId?: string } | undefined)
        ?.matterEndpointId;
    return id ? id.toLowerCase() : undefined;
}

/** Merges rebuilt bridged-child devices into an existing CDF device list. */
export function mergeRebuiltRmngMatterDevices(
    existingDevices: ESPCDFDevice[],
    rebuiltDevices: ESPCDFDevice[],
): void {
    for (const rebuilt of rebuiltDevices) {
        let existing = existingDevices.find(
            (device) => (device.name ?? "") === (rebuilt.name ?? ""),
        );
        if (!existing) {
            const rebuiltEp = readDeviceMatterEndpointId(rebuilt);
            if (rebuiltEp) {
                existing = existingDevices.find(
                    (device) => readDeviceMatterEndpointId(device) === rebuiltEp,
                );
            }
        }
        if (!existing) {
            existingDevices.push(rebuilt);
            continue;
        }
        if (rebuilt.name && existing.name !== rebuilt.name) {
            existing.name = rebuilt.name;
        }
        if (rebuilt.displayName != null) existing.displayName = rebuilt.displayName;
        if (rebuilt.type) existing.type = rebuilt.type;

        const srcParams = rebuilt.params ?? [];
        if (srcParams.length === 0) continue;

        if (!existing.params?.length) {
            existing.params = srcParams;
            continue;
        }

        for (const srcParam of srcParams) {
            const name = srcParam.name ?? "";
            if (!name) continue;
            const tgtParam = existing.params.find((param) => (param.name ?? "") === name);
            if (!tgtParam) {
                existing.params.push(srcParam);
                continue;
            }
            if (srcParam.value !== undefined) {
                mergeParamFields(
                    tgtParam as unknown as Record<string, unknown>,
                    srcParam.value,
                );
            }
        }
    }
}

/**
 * BLE-Mesh bridged children may receive MQTT endpoint-keyed shadow params before
 * cloud GET builds CDF devices. Seed or merge `ep_*` / Light devices from merged config.
 */
export function ensureBridgedChildCdfDevicesForShadow(
    cdfNode: ESPCDFNode,
    endpointParams: Record<string, unknown>,
): void {
    if (!isBridgedRmngMatterCdfNode(cdfNode)) return;
    if (!isRmngMatterEndpointParamFormat(endpointParams)) return;

    const scopedParams = filterBridgedChildEndpointParams(cdfNode, endpointParams);
    if (Object.keys(scopedParams).length === 0) return;

    const meta = cdfNode.metadata as Record<string, unknown>;
    if (!meta.rmngMatterMergedData) {
        meta.rmngMatterMergedData = { data_model: "matter", endpoints: {} };
    }
    const merged = meta.rmngMatterMergedData as Record<string, unknown>;
    const compressed = normalizeRmngMatterConfigToCompressed({
        data_model: "matter",
        endpoints: scopedParams,
    });
    mergeRmngMatterEndpointParamsIntoMerged(
        merged,
        (compressed.endpoints ?? {}) as Record<string, unknown>,
    );

    const preferredName =
        (merged.info as { name?: string } | undefined)?.name ?? "Light";
    const ownedIds = getBridgedOwnedEndpointIds(cdfNode);
    const rebuiltDevices = buildBridgedChildMatterDevices(
        merged,
        preferredName,
        undefined,
        ownedIds.length > 0 ? ownedIds : undefined,
    );
    if (rebuiltDevices.length === 0) return;

    const existingDevices = cdfNode.devices ?? [];
    if (existingDevices.length === 0) {
        runInAction(() => {
            cdfNode.devices = rebuiltDevices;
        });
        console.log(`${BRIDGE_LOG} seeded bridged child devices from shadow`, {
            nodeId: cdfNode.id,
            deviceNames: rebuiltDevices.map((device) => device.name),
        });
        return;
    }

    runInAction(() => {
        mergeRebuiltRmngMatterDevices(existingDevices, rebuiltDevices);
    });
    console.log(`${BRIDGE_LOG} merged bridged child devices from shadow`, {
        nodeId: cdfNode.id,
        deviceNames: rebuiltDevices.map((device) => device.name),
    });
}
