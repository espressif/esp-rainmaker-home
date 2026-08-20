/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useToast } from "@shared/hooks/useToast";
import {
  ESPRM_AGENT_AUTH_SERVICE,
  ESPRM_REFRESH_TOKEN_PARAM_TYPE,
  ESPRM_RMAKER_USER_AUTH_SERVICE,
} from "@shared/utils/constants";
import { setUserAuthForNode, TOKEN_STORAGE_KEYS } from "@features/agent/utils";
import type { ESPCDFNode, ESPCDFService, ESPCDFServiceParam } from "@store";

/** Services on a node, tolerating both the live and cached config shapes. */
function getNodeServices(node: ESPCDFNode | undefined): ESPCDFService[] {
  return (
    node?.services ||
    ((node as { nodeConfig?: { services?: ESPCDFService[] } })?.nodeConfig
      ?.services ??
      [])
  );
}

/**
 * Whether a node exposes an authentication service whose token can be
 * (re)pushed from the app: either the agent-auth service (refresh-token param)
 * or the RainMaker user-auth service (`rmaker-user-auth`).
 * @param node - CDF node to inspect.
 * @returns True when a refreshable auth service is present.
 */
export function nodeHasAuthService(node: ESPCDFNode | undefined): boolean {
  return getNodeServices(node).some(
    (service) =>
      service.type === ESPRM_AGENT_AUTH_SERVICE ||
      service.type === ESPRM_RMAKER_USER_AUTH_SERVICE,
  );
}

export interface UseDeviceAuthRefreshResult {
  /** True when the node has a refreshable auth service (controls visibility). */
  hasAuthService: boolean;
  /** True while a push is in flight. */
  refreshing: boolean;
  /** Pushes the current RainMaker refresh token to the node's auth service. */
  refresh: () => Promise<void>;
}

/**
 * Pushes the signed-in user's current RainMaker refresh token to a device's
 * authentication service on demand. Mirrors the native app's "Update RainMaker"
 * flow (`ControllerLoginActivity.sendRefreshToken`): the device firmware uses
 * the refresh token to mint its own access tokens.
 *
 * Handles both auth service variants:
 * - `esp.service.agent-auth` → writes the refresh-token param directly.
 * - `esp.service.rmaker-user-auth` → delegates to `setUserAuthForNode`
 *   (writes user-token + base-url).
 * @param node - CDF node whose auth service should receive the token.
 * @returns Visibility flag, in-flight state, and the `refresh` action.
 */
export function useDeviceAuthRefresh(
  node: ESPCDFNode | undefined,
): UseDeviceAuthRefreshResult {
  const { t } = useTranslation();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const hasAuthService = useMemo(() => nodeHasAuthService(node), [node]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      let agentAuthService: ESPCDFService | undefined;
      let userAuthService: ESPCDFService | undefined;

      for (const service of getNodeServices(node)) {
        switch (service.type) {
          case ESPRM_AGENT_AUTH_SERVICE:
            agentAuthService = service;
            break;
          case ESPRM_RMAKER_USER_AUTH_SERVICE:
            userAuthService = service;
            break;
        }
      }

      if (agentAuthService) {
        const refreshTokenParam: ESPCDFServiceParam | undefined =
          agentAuthService.params?.find(
            (param) => param.type === ESPRM_REFRESH_TOKEN_PARAM_TYPE,
          );

        if (!refreshTokenParam) {
          throw new Error(t("device.control.authServiceNotFound"));
        }

        const refreshToken = await AsyncStorage.getItem(
          TOKEN_STORAGE_KEYS.REFRESH_TOKEN,
        );

        await node?.setMultipleParams({
          [agentAuthService.name]: [
            {
              [refreshTokenParam.name]: refreshToken,
            },
          ],
        });
      } else if (userAuthService) {
        await setUserAuthForNode(node as ESPCDFNode);
      } else {
        throw new Error(t("device.control.authServiceNotFound"));
      }

      toast.showSuccess(t("device.control.tokenRefreshed"));
    } catch (error) {
      console.error("Error refreshing device token:", error);
      toast.showError(
        t("layout.shared.errorHeader"),
        t("device.control.tokenRefreshFailed"),
      );
    } finally {
      setRefreshing(false);
    }
  }, [node, t, toast]);

  return { hasAuthService, refreshing, refresh };
}
