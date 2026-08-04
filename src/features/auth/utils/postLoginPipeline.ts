/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { useRouter } from "expo-router";
import { pipelineTask, PipelineStep } from "@shared/utils/pipelineTask";
import { registerForNotification } from "@shared/utils/notifications";
import { setUserTimeZone } from "@shared/utils/timezone";
import { RAINMAKER_MCP_CONNECTOR_ID } from "@features/agent/utils";
import {
  getUserProfile,
  getAgentConfig,
  getConnectedConnectors,
} from "@features/agent/utils/apiHelper";
import { getSelectedAgentId } from "@features/agent/utils/storage";
import { connectToolWithTokens } from "@features/agent/utils/oauth";
import {
  DEFAULT_AGENT_ID,
  RAINMAKER_MCP_CONNECTOR_URL,
} from "@/config/agent.config";
import { CDFConfig } from "@config/sdk.config";
import { ESPCDF } from "@store";
import { startNodeLocalDiscovery } from "@features/group/utils/localDiscovery";
import { startMatterLocalDiscovery } from "@features/matter/utils/matterLocalDiscovery";

type AppRouter = ReturnType<typeof useRouter>;

export type PostLoginPipelineProgressState = {
  completed: number;
  total: number;
  lastFinished: string;
};

export interface PostLoginPipelineHooks {
  onProgress?: (
    stepName: string,
    state: PostLoginPipelineProgressState
  ) => void;
  onStepStart?: (stepName: string) => void;
  onStepComplete?: (stepName: string) => void;
}

export interface PostLoginPipelineBaseOptions {
  syncHomeWithNodes: (shouldFetchFirstPage?: boolean) => Promise<void>;
  initUserCustomData: () => Promise<void>;
  shouldFetchFirstPage?: boolean;
  skipNodesFetch?: boolean;
  store: ESPCDF;
}

export type PostLoginPipelineOptions = PostLoginPipelineBaseOptions &
  PostLoginPipelineHooks;

/**
 * Enters Home immediately after auth — does not wait on CDF hydration.
 *
 * Uses `dismissTo` so we never pop through the Index splash (whose focus
 * effect used to delay navigation by 2s via `dismissAll` + replace).
 * @param router - Expo Router instance
 */
export function navigateToHomeAfterAuth(router: AppRouter): void {
  router.dismissTo("/(group)/Home");
}

/**
 * Composes shared post-login pipeline options with caller-provided lifecycle hooks.
 * @param baseOptions Base dependencies required for the post-login pipeline.
 * @param hooks Optional lifecycle hooks from the caller context.
 * @returns Complete options object ready for pipeline execution.
 */
export function withPostLoginPipelineHooks(
  baseOptions: PostLoginPipelineBaseOptions,
  hooks: PostLoginPipelineHooks = {}
): PostLoginPipelineOptions {
  return {
    ...baseOptions,
    ...hooks,
  };
}

/**
 * Background post-login hydration (custom data, homes/nodes, discovery, MCP).
 * Does **not** navigate — callers must {@link navigateToHomeAfterAuth} first
 * (or in parallel) so Login/Index never wait on sync to leave the auth screen.
 * @param options - Configuration options for the pipeline
 */
export async function executePostLoginPipeline(
  options: PostLoginPipelineOptions
): Promise<void> {
  const {
    store,
    syncHomeWithNodes,
    initUserCustomData,
    shouldFetchFirstPage = CDFConfig.autoSync,
    skipNodesFetch = false,
    onProgress,
    onStepStart,
    onStepComplete,
  } = options;

  const postLoginSteps: PipelineStep[] = [
    {
      name: "setUserTimeZone",
      optional: true,
      background: true,
      run: async () => {
        const user = store?.userStore.user;
        if (!user) {
          return;
        }
        await setUserTimeZone(user);
      },
    },
    {
      name: "registerForNotification",
      optional: true,
      background: true,
      run: () => registerForNotification(store),
    },
    {
      // Single background hydrate: custom data then homes/nodes. Must not be a
      // blocking step — callers (and OAuth overlay) must not await sync locks.
      name: "syncHomeWithNodes",
      optional: true,
      background: true,
      run: async () => {
        await initUserCustomData();
        await syncHomeWithNodes(shouldFetchFirstPage);
        try {
          startNodeLocalDiscovery(store);
          startMatterLocalDiscovery(store);
        } catch (error) {
          console.warn(
            "[Post-Login] startLocalDiscovery failed (non-blocking):",
            error
          );
        }
      },
    },
    {
      name: "getUserProfile",
      optional: true,
      background: true,
      run: async () => {
        try {
          getUserProfile();
        } catch {
          // Profile setup is shown when needed; never block hydration.
        }
      },
    },
    {
      name: "autoConnectMCPConnector",
      optional: true,
      background: true,
      run: async () => {
        try {
          // Custom data may still be in flight via syncHomeWithNodes; MCP is
          // best-effort and must not serialize behind a blocking await.
          await initUserCustomData();
          const user = store?.userStore.user;
          if (!user) {
            return;
          }
          const selectedAgentId = await getSelectedAgentId(user);
          if (selectedAgentId !== DEFAULT_AGENT_ID) {
            return;
          }

          const agentConfig = await getAgentConfig(DEFAULT_AGENT_ID);
          if (!agentConfig?.tools) {
            return;
          }

          const mcpTool = agentConfig.tools.find(
            (tool: { url?: string }) => tool.url === RAINMAKER_MCP_CONNECTOR_URL
          );

          if (!mcpTool) {
            return;
          }

          const connectedConnectors = await getConnectedConnectors();
          const isConnected = connectedConnectors.some((connector) => {
            const hasConnectorId =
              connector.connectorId === RAINMAKER_MCP_CONNECTOR_ID;
            const hasConnectorUrl =
              connector.connectorUrl === RAINMAKER_MCP_CONNECTOR_URL;
            const hasToken = connector.hasToken || false;
            const isExpired = connector.isExpired || false;
            return (
              (hasConnectorId || hasConnectorUrl) && hasToken && !isExpired
            );
          });

          if (isConnected) {
            return;
          }

          const oauthMetadata = mcpTool.oauthMetadata
            ? {
                tokenEndpoint: mcpTool.oauthMetadata.tokenEndpoint,
                clientId: mcpTool.oauthMetadata.clientId,
                resource: mcpTool.oauthMetadata.resource,
              }
            : undefined;

          await connectToolWithTokens(
            store,
            RAINMAKER_MCP_CONNECTOR_URL,
            oauthMetadata
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(
            "[Post-Login] Failed to auto-connect MCP connector:",
            message
          );
        }
      },
    },
  ];

  // Legacy flag retained for callers; nodes load via background sync + Home.
  void skipNodesFetch;

  // All steps are background — resolve as soon as they are kicked off.
  await pipelineTask(postLoginSteps, {
    onStart: (stepName) => {
      console.log(`[post-login pipeline] start: ${stepName}`);
      onStepStart?.(stepName);
    },
    onComplete: (stepName) => {
      console.log(`[post-login pipeline] complete: ${stepName}`);
      onStepComplete?.(stepName);
    },
    onError: (stepName, error) => {
      console.warn(`[post-login pipeline] step "${stepName}" failed:`, error);
    },
    onBackground: (stepName) => {
      console.log(`[post-login pipeline] background step started: ${stepName}`);
    },
    onProgress: (state) => {
      console.log(
        `[post-login pipeline] progress ${state.completed}/${state.total} (last: ${state.lastFinished})`
      );
      onProgress?.(state.lastFinished, state);
    },
  });
}
