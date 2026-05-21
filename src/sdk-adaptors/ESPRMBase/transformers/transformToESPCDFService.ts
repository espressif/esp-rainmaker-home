/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFService, ESPCDFServiceParam } from "@store";
import { ESPRMService, ESPRMServiceParam } from "@espressif/rainmaker-base-sdk";
import { HEADLESS_ERROR_UNKNOWN } from "@shared/utils/constants";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { transformToESPCDFServiceParam } from "./transformToESPCDFServiceParam";

/** SDK service exposes async param refresh; typings omit it on `ESPRMService`. */
type ESPRMServiceWithParamFetch = ESPRMService & {
    getParams: () => Promise<ESPRMServiceParam[] | undefined>;
};

/**
 * Transforms RM base service into CDF service with resilient param handling.
 * Malformed individual params are skipped so nodes still render when some params
 * are missing or invalid (all missing, device-only, service-only, or partial).
 * @param service - Raw RM base service.
 * @returns CDF service with mapped params and operations.
 */
export function transformToESPCDFService(
    service: ESPRMService,
): ESPCDFService {
    const serviceLabel = service.name || service.type || "unknown-service";

    const mapServiceParams = (rawParams: unknown) =>
        safeTransform<ESPRMServiceParam, ESPCDFServiceParam>(
            rawParams,
            "service.params",
            (param) => transformToESPCDFServiceParam(param),
            ({ index, error }) => {
                const message = error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
                console.warn("Service param transform skipped", {
                    service: serviceLabel,
                    index,
                    reason: message,
                });
            },
            { skipElement: (param) => !param },
        );

    const params = mapServiceParams(service.params);

    const operations = {
        getParams: async () => {
            const latestParams = await (service as ESPRMServiceWithParamFetch).getParams();
            return mapServiceParams(latestParams ?? []);
        },
    };

    return new ESPCDFService({
        name: service.name || "",
        type: service.type || "",
        params,
        operations: operations,
        _raw: service,
    });
}
