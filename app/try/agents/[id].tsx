/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
// Hooks
import { useCDF } from "@/hooks/useCDF";
import { useTranslation } from "react-i18next";
import { useAgent } from "@/hooks/useAgent";
// Utils
import { RAINMAKER_MCP_CONNECTOR_URL } from "@/config/agent.config";
import { ConnectedConnector } from "@/utils/apiHelper";
// Components
import { Header, ScreenWrapper, ConfirmationDialog } from "@/components";

/* ------------------------------ Constants ------------------------------- */

const ROUTES = {
  CONFIGURE: "/(agent)/Configure",
  HOME: "/(group)/Home",
} as const;

/* ------------------------------ Types ------------------------------- */

interface LoadingScreenProps {
  message?: string;
}

/* ------------------------------ Components ------------------------------- */

/**
 * LoadingScreen
 *
 * Reusable component for displaying loading state with activity indicator and message
 *
 * @param props - Component props
 * @param props.message - Optional loading message to display
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({ message }) => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={tokens.colors.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
};

/**
 * Deep Link Redirect Component
 *
 * Handles deep links from https://agents.espressif.com/try/agents/:id
 * Checks required connectors before redirecting to the agent Configure screen.
 *
 * Features:
 * - Waits for app initialization before proceeding
 * - Fetches agent config to get required connectors
 * - Checks connector connection status
 * - Shows connector status screen
 * - Only allows navigation to configure when all connectors are connected
 * - Handles navigation errors gracefully
 * - Includes timeout to prevent infinite loading
 * - Falls back to home screen if navigation fails
 */
const TryAgentsId = () => {
  // Hooks
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isInitialized, store, initUserCustomData } = useCDF();
  const { t } = useTranslation();
  const {
    agentConfig,
    isLoadingConfig,
    configError,
    loadAgentConfig,
    connectors,
    loadConnectors,
    connectToolWithTokensDirect,
  } = useAgent();

  // State
  const [isConnectingConnector, setIsConnectingConnector] = useState(false);
  const [showConnectorWarningDialog, setShowConnectorWarningDialog] =
    useState(false);
  const [connectorWarningResolve, setConnectorWarningResolve] = useState<
    ((value: boolean) => void) | null
  >(null);
  const [isAppReady, setIsAppReady] = useState(false);
  
  // Derived state
  const isLoading = isLoadingConfig;
  const error = configError;

  // Refs
  const hasNavigatedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isInitialized || !router || !store) {
      return;
    }

    setIsAppReady(true);
  }, [isInitialized, router, store?.userStore?.isHydrated]);

  const initAgentConfiguration = useCallback(async () => {
    if (!id || hasNavigatedRef.current) return;
    if (!isAppReady) return;

    await initUserCustomData();

    // Check if user is logged in - if not, redirect to login and do not proceed with routing
    const userInfo = store?.userStore?.userInfo;
    if (!userInfo) {
      router.replace("/(auth)/Login");
      hasNavigatedRef.current = true;
      return;
    }

    // App is initialized and user is logged in, fetch agent config and connectors
    loadAgentData();
  }, [
    id,
    hasNavigatedRef.current,
    isAppReady,
    store,
    router,
    initUserCustomData,
  ]);

  // Effects
  useEffect(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    initAgentConfiguration();
    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [id, isInitialized, store, isAppReady]);

  /**
   * Auto-connects Rainmaker MCP connector
   */
  const autoConnectRainmakerMCP = async (config: any): Promise<boolean> => {
    try {
      setIsConnectingConnector(true);

      // Get OAuth metadata from agent config
      let oauthMetadata:
        | {
            tokenEndpoint?: string;
            clientId?: string;
            resource?: string;
          }
        | undefined;

      // Find Rainmaker MCP tool in tools array
      const rainmakerTool = config?.tools?.find(
        (tool: any) => tool.url === RAINMAKER_MCP_CONNECTOR_URL
      );

      if (rainmakerTool?.oauthMetadata) {
        oauthMetadata = {
          tokenEndpoint: rainmakerTool.oauthMetadata.tokenEndpoint,
          clientId: rainmakerTool.oauthMetadata.clientId,
          resource: rainmakerTool.oauthMetadata.resource,
        };
      }

      // Check if connector with matching connectorId already exists
      await loadConnectors();
      const expectedConnectorId = `${RAINMAKER_MCP_CONNECTOR_URL}::${oauthMetadata?.clientId || ''}`;
      const existingConnector = connectors.find(
        (c: any) => (c as any).connectorId === expectedConnectorId
      );

      // If connector exists in array, it's already connected
      if (existingConnector) {
        setIsConnectingConnector(false);
        return true;
      }

      // Use hook's connectToolWithTokensDirect
      await connectToolWithTokensDirect(
        RAINMAKER_MCP_CONNECTOR_URL,
        oauthMetadata
      );

      // Reload connectors after successful connection
      await loadConnectors();
      setIsConnectingConnector(false);
      return true;
    } catch (error: any) {
      setIsConnectingConnector(false);
      return false;
    }
  };

  /**
   * Shows connector warning dialog
   */
  const showConnectorWarning = (): Promise<boolean> => {
    return new Promise((resolve) => {
      setConnectorWarningResolve(() => resolve);
      setShowConnectorWarningDialog(true);
    });
  };

  /**
   * Handles connector warning retry
   */
  const handleConnectorWarningRetry = async () => {
    setShowConnectorWarningDialog(false);
    if (!agentConfig) {
      return;
    }
    // Reload connectors first to get latest state
    await loadConnectors();
    const success = await autoConnectRainmakerMCP(agentConfig);
    if (success) {
      connectorWarningResolve?.(true);
      setConnectorWarningResolve(null);
      // Proceed to configure screen
      handleNavigation();
    } else {
      // Show warning again if retry fails
      const continueAnyway = await showConnectorWarning();
      connectorWarningResolve?.(continueAnyway);
      setConnectorWarningResolve(null);
      if (continueAnyway) {
        handleNavigation();
      } else {
        handleFallbackNavigation();
      }
    }
  };

  /**
   * Handles connector warning continue
   */
  const handleConnectorWarningContinue = () => {
    setShowConnectorWarningDialog(false);
    connectorWarningResolve?.(true);
    setConnectorWarningResolve(null);
    // Proceed to configure screen
    handleNavigation();
  };

  /**
   * Checks if Rainmaker MCP is required and connected
   */
  const checkRainmakerMCPConnector = async (
    config: any,
    connectedConnectors: ConnectedConnector[]
  ): Promise<boolean> => {

    // Check tools array (new API structure)
    const tools = config?.tools || [];
    
    if (tools.length === 0) {
      return true; // No tools, proceed
    }

    // Check if Rainmaker MCP is required in tools array
    const rainmakerToolRequired = tools.some(
      (tool: any) => tool.url === RAINMAKER_MCP_CONNECTOR_URL
    );

    if (!rainmakerToolRequired) {
      return true; // Rainmaker MCP not required, proceed
    }

    // Find the Rainmaker MCP tool to get clientId
    const rainmakerTool = tools.find(
      (tool: any) => tool.url === RAINMAKER_MCP_CONNECTOR_URL
    );

    // Check if Rainmaker MCP is connected by connectorId
    let connector: ConnectedConnector | undefined;
    if (rainmakerTool?.oauthMetadata?.clientId) {
      const expectedConnectorId = `${RAINMAKER_MCP_CONNECTOR_URL}::${rainmakerTool.oauthMetadata.clientId}`;
      connector = connectedConnectors.find(
        (c: any) => c.connectorId === expectedConnectorId
      );
    }

    // If connector exists in array, it's connected
    const isConnected = !!connector;

    return !!isConnected;
  };

  /**
   * Loads agent config and checks Rainmaker MCP connector
   */
  const loadAgentData = async () => {
    if (!id) {
      return;
    }

    try {
      // Fetch agent config using hook
      const config = await loadAgentConfig(id);

      // Fetch connected connectors using hook
      await loadConnectors();

      // Check if Rainmaker MCP is required and connected
      const isRainmakerMCPConnected = await checkRainmakerMCPConnector(
        config,
        connectors
      );

      if (isRainmakerMCPConnected) {
        // Rainmaker MCP is connected or not required, proceed to configure
        handleNavigation();
        return;
      }

      // Rainmaker MCP is required but not connected, try auto-connect
      const connected = await autoConnectRainmakerMCP(config);

      if (!connected) {
        // Auto-connect failed, show warning dialog
        const shouldContinue = await showConnectorWarning();
        if (shouldContinue) {
          handleNavigation();
        } else {
          handleFallbackNavigation();
        }
      } else {
        // Auto-connect succeeded, proceed to configure
        handleNavigation();
      }
    } catch (err: any) {
      console.error("Failed to load agent data:", err);
      // Error is already set by the hook via configError
    }
  };

  /**
   * Handles navigation to Configure screen with agent ID
   */
  const handleNavigation = () => {
    if (hasNavigatedRef.current || !id) {
      return;
    }

    // Check if user is logged in - if not, redirect to login and do not proceed
    const userInfo = store?.userStore?.userInfo;
    if (!userInfo) {
      router.replace("/(auth)/Login");
      hasNavigatedRef.current = true;
      return;
    }

    try {
      hasNavigatedRef.current = true;
      router.replace({
        pathname: ROUTES.CONFIGURE,
        params: { id },
      } as any);
    } catch (error: any) {
      console.error("Deep link navigation error:", error);
      handleFallbackNavigation();
    }
  };

  /**
   * Handles fallback navigation to home screen
   */
  const handleFallbackNavigation = () => {
    try {
      if (!hasNavigatedRef.current) {
        router.replace(ROUTES.HOME);
        hasNavigatedRef.current = true;
      }
    } catch (fallbackError: any) {
      console.error("Failed to navigate to home as fallback:", fallbackError);
    }
  };

  // Show loading screen
  if (isLoading) {
    return (
      <>
        <View style={styles.mainContainer}>
          <LoadingScreen
            message={
              isConnectingConnector
                ? t("chat.connectingConnector") || "Connecting Rainmaker MCP..."
                : t("agent.try.loading") || "Loading agent configuration..."
            }
          />
        </View>
        {/* Connector Warning Dialog */}
        <ConfirmationDialog
          open={showConnectorWarningDialog}
          title={
            t("chat.rainmakerMCPNotConnected") || "Rainmaker MCP Not Connected"
          }
          description={
            t("chat.rainmakerMCPWarning") ||
            "Rainmaker MCP connector is not connected. Do you want to continue or retry?"
          }
          confirmText={t("chat.retry") || "Retry"}
          cancelText={t("chat.continue") || "Continue"}
          onConfirm={handleConnectorWarningRetry}
          onCancel={handleConnectorWarningContinue}
          confirmColor={tokens.colors.primary}
        />
      </>
    );
  }

  // Show error screen
  if (error) {
    return (
      <>
        <Header
          label={t("agent.try.title") || "Agent Setup"}
          showBack={true}
          customBackUrl="/(group)/Home"
        />
        <View style={styles.mainContainer}>
          <ScreenWrapper style={globalStyles.agentSettingsContainer}>
            <View style={styles.errorContainer}>
              <Text
                style={[
                  globalStyles.fontMd,
                  globalStyles.textPrimary,
                  globalStyles.textCenter,
                ]}
              >
                {error}
              </Text>
            </View>
          </ScreenWrapper>
        </View>

        {/* Connector Warning Dialog */}
        <ConfirmationDialog
          open={showConnectorWarningDialog}
          title={
            t("chat.rainmakerMCPNotConnected") || "Rainmaker MCP Not Connected"
          }
          description={
            t("chat.rainmakerMCPWarning") ||
            "Rainmaker MCP connector is not connected. Do you want to continue or retry?"
          }
          confirmText={t("chat.retry") || "Retry"}
          cancelText={t("chat.continue") || "Continue"}
          onConfirm={handleConnectorWarningRetry}
          onCancel={handleConnectorWarningContinue}
          confirmColor={tokens.colors.primary}
        />
      </>
    );
  }

  // Default loading screen (should not reach here, but just in case)
  return (
    <>
      <View style={styles.mainContainer}>
        <LoadingScreen
          message={t("chat.identifying") || "Identifying agent..."}
        />
      </View>

      {/* Connector Warning Dialog */}
      <ConfirmationDialog
        open={showConnectorWarningDialog}
        title={
          t("chat.rainmakerMCPNotConnected") || "Rainmaker MCP Not Connected"
        }
        description={
          t("chat.rainmakerMCPWarning") ||
          "Rainmaker MCP connector is not connected. Do you want to continue or retry?"
        }
        confirmText={t("chat.retry") || "Retry"}
        cancelText={t("chat.continue") || "Continue"}
        onConfirm={handleConnectorWarningRetry}
        onCancel={handleConnectorWarningContinue}
        confirmColor={tokens.colors.primary}
      />
    </>
  );
};

export default TryAgentsId;

/* ------------------------------ Styles ------------------------------- */

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tokens.colors.white,
    gap: tokens.spacing._15,
  },
  message: {
    ...globalStyles.fontMd,
    ...globalStyles.textPrimary,
    ...globalStyles.textCenter,
    marginTop: tokens.spacing._15,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing._20,
  },
});
