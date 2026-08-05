/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFService, ESPCDFServiceParam } from "@store";
import { ESPRMNeoService, ESPRMNeoServiceParam } from "@espressif/rainmaker-neo-base-sdk";
import { HEADLESS_ERROR_UNKNOWN } from "@shared/utils/constants";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { transformToESPCDFServiceParam } from "./transformToESPCDFServiceParam";
import {
  ESPRMNEO_TRANSFORM_CONTEXT_SERVICE_PARAMS,
  ESPRMNEO_TRANSFORM_LOG_SERVICE_PARAM_SKIPPED,
  ESPRMNEO_TRANSFORM_UNKNOWN_SERVICE_LABEL,
} from "../utils/constants";
import { Logger } from "../utils/logger";

/**
 * Transforms RMNeo base service into CDF service with resilient param handling.
 * Malformed individual params are skipped so nodes still render when some params
 * are missing or invalid (all missing, device-only, service-only, or partial).
 * @param service - Raw RMNeo base service.
 * @returns CDF service with mapped params and operations.
 */
export function transformToESPCDFService(
  service: ESPRMNeoService,
): ESPCDFService {
  const serviceLabel =
    service.name || service.type || ESPRMNEO_TRANSFORM_UNKNOWN_SERVICE_LABEL;

  /**
   * Maps raw service params to CDF params and skips malformed entries so
   * partially valid services are still usable in the UI.
   * @param rawParams - Raw SDK params (or unknown payload from `getParams`).
   * @returns Successfully mapped CDF service params.
   */
  const mapServiceParams = (rawParams: unknown): ESPCDFServiceParam[] =>
    safeTransform<ESPRMNeoServiceParam, ESPCDFServiceParam>(
      rawParams,
      ESPRMNEO_TRANSFORM_CONTEXT_SERVICE_PARAMS,
      (param) => transformToESPCDFServiceParam(param),
      ({ index, error }) => {
        const message =
          error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
        Logger.warn(ESPRMNEO_TRANSFORM_LOG_SERVICE_PARAM_SKIPPED, {
          service: serviceLabel,
          index,
          reason: message,
        });
      },
      { skipElement: (param) => !param },
    );

  const params = mapServiceParams(service.params);

  /**
   * Service-level operations exposed to CDF consumers.
   */
  const operations = {
    /**
     * Fetches live service param values from the SDK and remaps them to CDF.
     * @returns Fresh CDF service params.
     */
    getParams: async (): Promise<ESPCDFServiceParam[]> => {
      const latestParams = await service.getParams();
      return mapServiceParams(latestParams ?? []);
    },
  };

  return new ESPCDFService({
    name: service.name || "",
    type: service.type || "",
    params,
    operations,
    _raw: service,
  });
}
