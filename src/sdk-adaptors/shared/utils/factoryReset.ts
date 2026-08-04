/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const SYSTEM_SERVICE_TYPE = "esp.service.system";
const FACTORY_RESET_PARAM_TYPE = "esp.param.factory-reset";

/** Minimal shape a raw SDK service param must expose to be factory reset. */
interface ResettableParam {
    type?: string;
    setValue(value: unknown): Promise<unknown>;
}

/** Minimal shape a raw SDK service must expose to be searched for the reset param. */
interface ResettableService {
    type?: string;
    params?: ResettableParam[];
}

/**
 * Best-effort factory reset of a node ahead of cloud unassociation.
 *
 * "Remove device" should also tell the firmware to forget its provisioning so the
 * physical device can be re-onboarded. This is backend-specific (the param lives on
 * the system service, and each SDK exposes its own raw entities), so each adaptor's
 * `delete` operation calls this before unassociating from the cloud.
 *
 * Failures are swallowed by design: an offline or unreachable device must still be
 * removable from the account, so a reset failure must never block the delete.
 */
export async function tryFactoryResetBeforeDelete(
    services: ResettableService[] | undefined,
): Promise<void> {
    const systemService = services?.find(
        (service) => service.type === SYSTEM_SERVICE_TYPE,
    );

    const factoryResetParam = systemService?.params?.find(
        (param) => param.type === FACTORY_RESET_PARAM_TYPE,
    );

    if (!factoryResetParam) return;

    try {
        await factoryResetParam.setValue(true);
    } catch (error) {
        console.warn(
            "[factoryReset] Factory reset before delete failed; proceeding with cloud removal",
            error,
        );
    }
}
