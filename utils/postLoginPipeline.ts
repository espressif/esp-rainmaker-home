/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "expo-router";
import { pipelineTask, PipelineStep } from "./pipelineTask";
import { createPlatformEndpoint } from "./notifications";
import { setUserTimeZone } from "./timezone";
import { RAINMAKER_MCP_CONNECTOR_ID, updateRefreshTokensForAllAIDevices } from "./agent";
import { getUserProfile, getAgentConfig, getConnectedConnectors } from "./apiHelper";
import { getSelectedAgentId } from "./agent/storage";
import { connectToolWithTokens } from "./agent/oauth";
import { DEFAULT_AGENT_ID, RAINMAKER_MCP_CONNECTOR_URL } from "@/config/agent.config";
import { CDFConfig } from "@/rainmaker.config";

export interface PostLoginPipelineOptions {
  store: any;
  router: Router;
  refreshESPRMUser: () => Promise<void>;
  fetchNodesAndGroups: (shouldFetchFirstPage?: boolean) => Promise<any>;
  initUserCustomData: () => Promise<void>;
  shouldFetchFirstPage?: boolean;
  skipNodesFetch?: boolean;
  onProgress?: (stepName: string, state: { completed: number; total: number; lastFinished: string }) => void;
  onStepStart?: (stepName: string) => void;
  onStepComplete?: (stepName: string) => void;
}

/**
 * Executes the post-login pipeline with all necessary steps
 * This pipeline handles:
 * - Refreshing ESPRM user
 * - Setting user timezone
 * - Creating platform endpoint for notifications
 * - Fetching nodes and groups
 * - Updating refresh tokens for AI devices
 * - Initializing user custom data
 *
 * @param options - Configuration options for the pipeline
 */
export async function executePostLoginPipeline(
  options: PostLoginPipelineOptions
): Promise<void> {
  const {
    store,
    router,
    refreshESPRMUser,
    fetchNodesAndGroups,
    initUserCustomData,
    shouldFetchFirstPage = !CDFConfig.autoSync,
    skipNodesFetch = false,
    onProgress,
    onStepStart,
    onStepComplete,
  } = options;

  const postLoginSteps: PipelineStep[] = [
    {
      name: "refreshESPRMUser",
      run: refreshESPRMUser,
    },
    {
      name: "setUserTimeZone",
      dependsOn: ["refreshESPRMUser"],
      optional: true,
      background: true,
      run: () => setUserTimeZone(store.userStore.user),
    },
    {
      name: "createPlatformEndpoint",
      dependsOn: ["refreshESPRMUser"],
      optional: true,
      background: true,
      run: () => createPlatformEndpoint(store),
    },
  ];

  // Conditionally add fetchNodesAndGroups and dependent steps
  if (!skipNodesFetch) {
    postLoginSteps.push(
      {
        name: "fetchNodesAndGroups",
        dependsOn: ["refreshESPRMUser"],
        run: async () => {
          await fetchNodesAndGroups(shouldFetchFirstPage);
        },
      },
      {
        name: "updateRefreshTokensForAllAIDevices",
        dependsOn: ["fetchNodesAndGroups"],
        optional: true,
        background: true,
        run: () =>
          updateRefreshTokensForAllAIDevices(store.nodeStore.nodeList || []),
      },
      {
        name: "initUserCustomData",
        dependsOn: ["fetchNodesAndGroups"],
        run: initUserCustomData,
      }
    );
  } else {
    postLoginSteps.push({
      name: "initUserCustomData",
      dependsOn: ["refreshESPRMUser"],
      run: initUserCustomData,
    });
  }

  // Auto-connect MCP RainMaker connector for default agent
  postLoginSteps.push({
    name: "autoConnectMCPConnector",
    dependsOn: ["initUserCustomData"],
    optional: true,
    background: true,
    run: async () => {
      try {
        // Check if default agent is selected
        const selectedAgentId = await getSelectedAgentId(store.userStore);
        if (selectedAgentId !== DEFAULT_AGENT_ID) {
          return;
        }

        // Get default agent config
        const agentConfig = await getAgentConfig(DEFAULT_AGENT_ID);
        if (!agentConfig?.tools) {
          return;
        }

        // Find MCP RainMaker tool
        const mcpTool = agentConfig.tools.find(
          (tool: any) => tool.url === RAINMAKER_MCP_CONNECTOR_URL
        );

        if (!mcpTool) {
          return;
        }

        // Check if already connected (match by specific connectorId or connectorUrl)
        const connectedConnectors = await getConnectedConnectors();
        const isConnected = connectedConnectors.some(
          (connector) => {
            // Match by specific connectorId
            if (connector.connectorId === RAINMAKER_MCP_CONNECTOR_ID) {
              return true;
            }
            // Fallback: match by connectorUrl
            return connector.connectorUrl === RAINMAKER_MCP_CONNECTOR_URL;
          }
        );

        if (isConnected) {
          return;
        }

        // Auto-connect using tokens
        const oauthMetadata = mcpTool.oauthMetadata
          ? {
              tokenEndpoint: mcpTool.oauthMetadata.tokenEndpoint,
              clientId: mcpTool.oauthMetadata.clientId,
              resource: mcpTool.oauthMetadata.resource,
            }
          : undefined;

        await connectToolWithTokens(store, RAINMAKER_MCP_CONNECTOR_URL, oauthMetadata);
      } catch (error: any) {
        // Silent error - don't block login flow
        console.error("[Post-Login] Failed to auto-connect MCP connector:", error?.message);
      }
    },
  });

  // Add the final routing step
  postLoginSteps.push({
    name: "getUserProfileAndRoute",
    dependsOn: ["initUserCustomData"],
    run: async () => {
      try {
        await getUserProfile();
        router.replace("/(group)/Home");
      } catch (error: any) {
        // Always route to Home, profile setup will be shown when needed
        router.replace("/(group)/Home");
      }
    },
  });

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
