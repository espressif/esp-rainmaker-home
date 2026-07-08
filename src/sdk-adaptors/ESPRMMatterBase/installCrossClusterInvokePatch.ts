/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPRMMatterBase,
    ESPRMMatterDeviceParam,
} from "@espressif/rainmaker-matter-sdk";
import { isCrossClusterInvokeMarker } from "./utils/common";

let crossClusterPatchInstalled = false;

type MatterParamProto = {
    setValue: (value: unknown) => Promise<unknown>;
    resolver?: {
        encodeValue?: (
            value: unknown,
            rawModes?: Record<string, number>,
        ) => unknown;
    };
};

type CrossClusterControlAdapter = {
    invoke: (
        matterNodeId: string,
        endpoint: number,
        clusterId: number,
        commandId: number,
        payload?: Record<string, unknown>,
    ) => Promise<{ success: boolean; error?: string }>;
};

function installCrossClusterPatchForParam(
    ParamClass: { prototype: MatterParamProto },
    getAdapter: () => CrossClusterControlAdapter | null | undefined,
    getMatterNodeId: (self: {
        nodeRef?: { deref: () => { matterNodeId?: string } | undefined };
        _nodeRef?: { deref: () => { matterNodeId?: string } | undefined };
        endpointId?: number;
        value: unknown;
    }) => string | undefined,
): void {
    const proto = ParamClass.prototype;
    const originalSetValue = proto.setValue;
    proto.setValue = async function (value: unknown): Promise<unknown> {
        const self = this as typeof proto & {
            resolver?: MatterParamProto["resolver"];
            rawModes?: Record<string, number>;
            nodeRef?: { deref: () => { matterNodeId?: string } | undefined };
            _nodeRef?: { deref: () => { matterNodeId?: string } | undefined };
            endpointId?: number;
            value: unknown;
        };
        const encoded = self.resolver?.encodeValue?.(value, self.rawModes);
        if (isCrossClusterInvokeMarker(encoded)) {
            const matterNodeId = getMatterNodeId(self);
            if (!matterNodeId) {
                throw new Error(
                    "Cross-cluster invoke skipped: matterNodeId unavailable on node ref.",
                );
            }
            const adapter = getAdapter();
            if (!adapter) {
                throw new Error(
                    "Cross-cluster invoke skipped: Matter control adapter not configured.",
                );
            }
            const result = await adapter.invoke(
                matterNodeId,
                self.endpointId ?? 0,
                encoded.clusterId,
                encoded.commandId,
                encoded.payload,
            );
            if (!result.success) {
                throw new Error(
                    result.error ?? "Matter cross-cluster invoke failed",
                );
            }
            self.value = value;
            return {
                status: "success",
                description: `Matter cross-cluster invoke (cluster=0x${encoded.clusterId.toString(16)} cmd=0x${encoded.commandId.toString(16)})`,
            };
        }
        return originalSetValue.call(this, value);
    };
}

/**
 * Installs a one-shot prototype patch on Matter device params for cross-cluster invokes.
 */
export function installCrossClusterInvokePatch(): void {
    if (crossClusterPatchInstalled) return;

    installCrossClusterPatchForParam(
        ESPRMMatterDeviceParam as unknown as { prototype: MatterParamProto },
        () =>
            ESPRMMatterBase.ESPMatterControlAdapter as CrossClusterControlAdapter | null,
        (self) => self.nodeRef?.deref()?.matterNodeId,
    );

    crossClusterPatchInstalled = true;
}
