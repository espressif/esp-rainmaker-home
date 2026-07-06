/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { runInAction } from "mobx";
import type { ESPCDFDeviceParam } from "@store";
import { subscribeMatterDeviceStateChanged } from "@shared/utils/matterDeviceStateEvents";

type MatterParamBinding = {
    power?: ESPCDFDeviceParam;
    brightness?: ESPCDFDeviceParam;
    hue?: ESPCDFDeviceParam;
    saturation?: ESPCDFDeviceParam;
    temperature?: ESPCDFDeviceParam;
    cct?: ESPCDFDeviceParam;
};

/** Subscribes to endpoint-scoped Matter UI sync for shared operational node ids. */
export function useMatterDeviceStateSync(
    matterNodeId: string | undefined,
    allowedEndpoints: number[],
    params: MatterParamBinding,
): void {
    // Stable key so an equal-but-new endpoints array doesn't re-subscribe.
    const endpointsKey = allowedEndpoints.join(",");
    useEffect(() => {
        return subscribeMatterDeviceStateChanged(
            matterNodeId,
            allowedEndpoints,
            params,
            (apply) => runInAction(apply),
        );
        // Intentional: derived endpointsKey + per-param refs avoid re-subscribing
        // on every render (the params object/array identities churn each render).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        matterNodeId,
        endpointsKey,
        params.power,
        params.brightness,
        params.hue,
        params.saturation,
        params.temperature,
        params.cct,
    ]);
}
