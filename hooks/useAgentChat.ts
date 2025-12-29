/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Keyboard, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";
import {
  getAgentConfig,
  getSelectedAgentId,
  getWebSocketUrl,
  getConversationId,
  saveConversationId,
  getMessageDisplayConfig,
  saveMessageDisplayConfig,
  getChatFontSize,
  type WebSocketMessage,
  type MessageDisplayConfig,
} from "@/utils/agent";
import {
  getConnectedConnectors,
  ConnectedConnector,
  getUserProfile,
  listConversations,
  deleteConversationByAgent,
  type ConversationListItem,
} from "@/utils/apiHelper";
import {
  checkRequiredConnectors,
  autoConnectRainmakerMCP,
} from "@/utils/chat/connectorManager";
import { processWebSocketMessage } from "@/utils/chat/messageProcessor";
import { RAINMAKER_MCP_CONNECTOR_URL, DEFAULT_AGENT_ID } from "@/config/agent.config";
import { MAX_MESSAGES_IN_MEMORY } from "@/utils/constants";
import type { ChatMessage } from "@/types/global";

const DEFAULT_CONFIG: MessageDisplayConfig = {
  showUser: true,
  showAssistant: true,
  showThinking: false,
  showToolCallInfo: false,
  showToolResultInfo: false,
  showUsageInfo: false,
  showTransactionEnd: false,
  showHandshakeAck: false,
};

/**
 * Combined hook for managing all chat-related functionality.
 * 
 * @description Provides a comprehensive hook for managing all chat-related functionality, including agent management, configuration, input handling, message management, scrolling, and WebSocket communication.
 * 
 * 
 * @example
 * ```tsx
 * const {
 *   messageHistory,
 *   sendMessage,
 *   isConnected,
 *   initializeAgent,
 *   initializeWebSocket
 * } = useAgentChat(() => {
 *   console.log('Connection timed out');
 * });
 * ```
 */
export const useAgentChat = (onTimeout?: () => void) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { store } = useCDF();
  const toast = useToast();

  // ==================== Agent State ====================
  const [isInitializing, setIsInitializing] = useState(true);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentConfigNotFound, setIsAgentConfigNotFound] = useState(false);
  const [isProfileNotFound, setIsProfileNotFound] = useState(false);
  const [isConnectingConnector, setIsConnectingConnector] = useState(false);
  const [isDefaultAgent, setIsDefaultAgent] = useState(false);
  const [showConnectorWarningDialog, setShowConnectorWarningDialog] = useState(false);
  const [connectorWarningConfig, setConnectorWarningConfig] = useState<any>(null);
  const connectorWarningResolveRef = useRef<((value: boolean) => void) | null>(null);

  // ==================== Config State ====================
  const [messageDisplayConfig, setMessageDisplayConfig] = useState<MessageDisplayConfig>(DEFAULT_CONFIG);
  const [fontSize, setFontSize] = useState<number>(2);

  // ==================== Input State ====================
  const [inputText, setInputText] = useState("");
  const [inputHeight, setInputHeight] = useState(44);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // ==================== Messages State ====================
  const [messageHistory, setMessageHistory] = useState<ChatMessage[]>([]);
  const [expandedJsonMessages, setExpandedJsonMessages] = useState<Set<string>>(new Set());
  const [thinkingMessages, setThinkingMessages] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isConversationDone, setIsConversationDone] = useState(false);

  // ==================== Conversations State ====================
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // ==================== WebSocket State ====================
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // ==================== Scroll State ====================
  const flatListRef = useRef<FlatList>(null);
  const isUserScrollingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);

  // ==================== Refs for stable callback dependencies ====================
  const messageDisplayConfigRef = useRef<MessageDisplayConfig>(DEFAULT_CONFIG);
  const thinkingMessagesRef = useRef<string[]>([]);
  const onTimeoutRef = useRef(onTimeout);

  // ==================== Keyboard Listeners ====================
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener("keyboardDidShow", () => {
      setIsKeyboardVisible(true);
    });
    const keyboardDidHideListener = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // ==================== Auto-scroll Effect ====================
  useEffect(() => {
    if (
      messageHistory.length > 0 &&
      shouldAutoScrollRef.current &&
      flatListRef.current
    ) {
      const scrollTimeout = setTimeout(() => {
        if (shouldAutoScrollRef.current && flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 150);

      return () => clearTimeout(scrollTimeout);
    }
  }, [messageHistory.length]);

  // ==================== Agent Functions ====================
  /**
   * Loads the agent configuration from storage.
   *
   * @description Fetches the selected agent ID from storage and retrieves its configuration.
   * Sets error states if the agent is not found or if there's an error loading the config.
   *
   * @returns {Promise<any>} The agent configuration object.
   * @throws {Error} Throws an error if store is not available, agent ID is missing, or agent config is not found.
   *
   * @example
   * ```tsx
   * try {
   *   const config = await loadAgentConfig();
   *   console.log('Agent config loaded:', config);
   * } catch (error) {
   *   console.error('Failed to load agent config:', error);
   * }
   * ```
   */
  const loadAgentConfig = useCallback(async () => {
    try {
      if (!store?.userStore) {
        throw new Error("Store not available");
      }

      const agentId = await getSelectedAgentId(store.userStore);
      if (!agentId || agentId.trim() === "") {
        throw new Error("Agent ID not found or is empty");
      }

      const trimmedAgentId = agentId.trim();
      setIsDefaultAgent(trimmedAgentId === DEFAULT_AGENT_ID);
      const config = await getAgentConfig(trimmedAgentId, store.userStore);
      return config;
    } catch (err: any) {
      let errorMessage = "Agent does not exist or something went wrong";

      if (err?.status === 404) {
        setIsAgentConfigNotFound(true);
        if (store?.userStore) {
          const agentId = await getSelectedAgentId(store.userStore);
          errorMessage = `Agent configuration not found for ID: ${agentId}`;
        }
      } else {
        setIsAgentConfigNotFound(false);
        if (err?.message) {
          errorMessage = err.message;
        }
      }

      setAgentError(errorMessage);
      throw err;
    }
  }, [store]);

  /**
   * Loads all connected connectors.
   *
   * @description Fetches the list of currently connected connectors from the API.
   * Returns an empty array if the request fails.
   *
   * @returns {Promise<ConnectedConnector[]>} Array of connected connector objects. Returns empty array on error.
   *
   * @example
   * ```tsx
   * const connectors = await loadConnectors();
   * console.log(`Found ${connectors.length} connected connectors`);
   * ```
   */
  const loadConnectors = useCallback(async (): Promise<ConnectedConnector[]> => {
    try {
      const connectedConnectors = await getConnectedConnectors();
      return connectedConnectors;
    } catch (err: any) {
      return [];
    }
  }, []);

  /**
   * Shows a connector warning dialog and returns a promise that resolves when user makes a choice.
   *
   * @description Displays a warning dialog when required connectors are not connected.
   * Returns a promise that resolves to true if user chooses to continue, false otherwise.
   *
   * @param {any} config - The agent configuration object containing connector information.
   * @returns {Promise<boolean>} Promise that resolves to true if user chooses to continue, false if they cancel.
   *
   * @example
   * ```tsx
   * const shouldContinue = await showConnectorWarning(agentConfig);
   * if (shouldContinue) {
   *   // Proceed with initialization
   * }
   * ```
   */
  const showConnectorWarning = useCallback(
    (config: any): Promise<boolean> => {
      return new Promise((resolve) => {
        setConnectorWarningConfig(config);
        connectorWarningResolveRef.current = resolve;
        setShowConnectorWarningDialog(true);
      });
    },
    []
  );

  /**
   * Handles retry action for connector warning dialog.
   *
   * @description Attempts to automatically connect the Rainmaker MCP connector.
   * If successful, resolves the warning. If failed, shows the warning dialog again.
   *
   * @returns {Promise<void>} Promise that resolves when the retry operation completes.
   *
   * @example
   * ```tsx
   * await handleConnectorWarningRetry();
   * ```
   */
  const handleConnectorWarningRetry = useCallback(async () => {
    if (!connectorWarningConfig) return;

    setShowConnectorWarningDialog(false);
    const success = await autoConnectRainmakerMCP(
      store,
      connectorWarningConfig,
      loadConnectors,
      setIsConnectingConnector
    );
    if (success) {
      connectorWarningResolveRef.current?.(true);
      connectorWarningResolveRef.current = null;
      setConnectorWarningConfig(null);
    } else {
      const continueAnyway = await showConnectorWarning(connectorWarningConfig);
      connectorWarningResolveRef.current?.(continueAnyway);
      connectorWarningResolveRef.current = null;
      setConnectorWarningConfig(null);
    }
  }, [connectorWarningConfig, store, loadConnectors, showConnectorWarning]);

  /**
   * Handles continue action for connector warning dialog.
   *
   * @description Closes the warning dialog and resolves the promise with true,
   * allowing the user to continue without the required connector.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * handleConnectorWarningContinue();
   * ```
   */
  const handleConnectorWarningContinue = useCallback(() => {
    setShowConnectorWarningDialog(false);
    connectorWarningResolveRef.current?.(true);
    connectorWarningResolveRef.current = null;
    setConnectorWarningConfig(null);
  }, []);

  /**
   * Initializes the agent by loading configuration and checking connectors.
   *
   * @description Performs a multi-step initialization process:
   * 1. Checks if user profile exists
   * 2. Loads agent configuration
   * 3. Loads connected connectors
   * 4. Checks if required connectors are connected
   * 5. Attempts auto-connection for missing connectors if possible
   * 6. Calls the onConnectorsReady callback when ready
   *
   * @param {() => Promise<void>} onConnectorsReady - Callback function to execute when connectors are ready.
   * @returns {Promise<void>} Promise that resolves when initialization completes or fails.
   *
   * @example
   * ```tsx
   * await initializeAgent(async () => {
   *   await initializeWebSocket();
   * });
   * ```
   */
  const initializeAgent = useCallback(
    async (onConnectorsReady: () => Promise<void>): Promise<void> => {
      setIsInitializing(true);
      setAgentError(null);
      setIsAgentConfigNotFound(false);
      setIsProfileNotFound(false);

      try {
        // Step 0: Check if user profile exists
        try {
          await getUserProfile();
        } catch (error: any) {
          if (error?.status === 404) {
            setIsProfileNotFound(true);
            setAgentError("User profile not found. Please complete your profile setup.");
            setIsInitializing(false);
            return;
          }
          console.warn("Failed to verify user profile:", error);
        }

        // Step 1: Load agent config
        const config = await loadAgentConfig();

        // Step 2: Load connected connectors
        const connectedConnectors = await loadConnectors();

        // Step 3: Check if required connectors are connected
        const { allConnected, missingConnectors } = checkRequiredConnectors(
          config,
          connectedConnectors
        );

        // Step 4: Handle missing connectors
        if (!allConnected) {
          const rainmakerMCPMissing = missingConnectors.includes(RAINMAKER_MCP_CONNECTOR_URL);

          if (rainmakerMCPMissing) {
            const rainmakerTool = config?.tools?.find(
              (tool: any) => tool.url === RAINMAKER_MCP_CONNECTOR_URL
            );

            if (rainmakerTool?.oauthMetadata?.clientId) {
              const connected = await autoConnectRainmakerMCP(
                store,
                config,
                loadConnectors,
                setIsConnectingConnector
              );

              if (!connected) {
                const shouldContinue = await showConnectorWarning(config);
                if (!shouldContinue) {
                  setIsInitializing(false);
                  return;
                }
              } else {
                const updatedConnectors = await loadConnectors();
                checkRequiredConnectors(
                  config,
                  updatedConnectors
                );
              }
            } else {
              const shouldContinue = await showConnectorWarning(config);
              if (!shouldContinue) {
                setIsInitializing(false);
                return;
              }
            }
          }
        }

        // Step 5: Call callback when connectors are ready
        await onConnectorsReady();
      } catch (error: any) {
        setAgentError(error.message || "Agent does not exist or something went wrong");
      } finally {
        setIsInitializing(false);
      }
    },
    [loadAgentConfig, loadConnectors, store, showConnectorWarning]
  );

  // ==================== Config Functions ====================
  /**
   * Loads the message display configuration from storage.
   *
   * @description Retrieves the saved message display configuration from persistent storage.
   * Falls back to default configuration if loading fails or no config exists.
   *
   * @returns {Promise<void>} Promise that resolves when the config is loaded.
   *
   * @example
   * ```tsx
   * await loadMessageDisplayConfig();
   * // messageDisplayConfig is now updated with loaded values
   * ```
   */
  const loadMessageDisplayConfig = useCallback(async () => {
    try {
      const config = await getMessageDisplayConfig();
      messageDisplayConfigRef.current = config;
      setMessageDisplayConfig(config);
    } catch (error) {
      messageDisplayConfigRef.current = DEFAULT_CONFIG;
      setMessageDisplayConfig(DEFAULT_CONFIG);
    }
  }, []);

  /**
   * Loads the chat font size setting from storage.
   *
   * @description Retrieves the saved font size preference from persistent storage.
   * Falls back to default size (2) if loading fails or no setting exists.
   *
   * @returns {Promise<void>} Promise that resolves when the font size is loaded.
   *
   * @example
   * ```tsx
   * await loadFontSize();
   * // fontSize is now updated with loaded value
   * ```
   */
  const loadFontSize = useCallback(async () => {
    try {
      const size = await getChatFontSize();
      setFontSize(size);
    } catch (error) {
      setFontSize(2);
    }
  }, []);

  // ==================== Load Config on Mount ====================
  useEffect(() => {
    loadMessageDisplayConfig();
    loadFontSize();
  }, [loadMessageDisplayConfig, loadFontSize]);

  /**
   * Saves the message display configuration to storage.
   *
   * @description Persists the message display configuration to storage and updates the state.
   * Shows an error toast if saving fails.
   *
   * @param {MessageDisplayConfig} config - The message display configuration to save.
   * @returns {Promise<void>} Promise that resolves when the config is saved.
   *
   * @example
   * ```tsx
   * await saveConfig({
   *   showUser: true,
   *   showAssistant: true,
   *   showThinking: false,
   *   // ... other config options
   * });
   * ```
   */
  const saveConfig = useCallback(
    async (config: MessageDisplayConfig) => {
      try {
        await saveMessageDisplayConfig(config);
        messageDisplayConfigRef.current = config;
        setMessageDisplayConfig(config);
      } catch (error) {
        toast.showError(
          t("layout.shared.errorHeader") || "Error",
          t("chat.messageDisplayConfig.saveFailed") || "Failed to save settings"
        );
      }
    },
    [t, toast]
  );

  // ==================== Input Functions ====================
  /**
   * Resets the input field to its default state.
   *
   * @description Clears the input text and resets the input height to the default value (44px).
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * resetInput();
   * // inputText is now "" and inputHeight is 44
   * ```
   */
  const resetInput = useCallback(() => {
    setInputText("");
    setInputHeight(44);
  }, []);

  // ==================== Messages Functions ====================
  /**
   * Adds a new chat message to the message history.
   *
   * @description Creates a new chat message with a unique ID and timestamp, then adds it to the message history.
   * Automatically trims the message history if it exceeds MAX_MESSAGES_IN_MEMORY limit.
   *
   * @param {string} text - The message text content.
   * @param {boolean} isUser - Whether the message is from the user (true) or assistant (false).
   * @param {string} [messageType="unknown"] - The type of message (e.g., "user", "assistant", "thinking", "timeout").
   * @param {string} [toolName] - Optional name of the tool associated with the message.
   * @param {any} [jsonData] - Optional JSON data to attach to the message.
   * @returns {void}
   *
   * @example
   * ```tsx
   * addChatMessage("Hello, how can I help?", false, "assistant");
   * addChatMessage("Turn on the lights", true, "user");
   * addChatMessage("", false, "tool_call_info", "get_node_details", { nodeId: "123" });
   * ```
   */
  const addChatMessage = useCallback(
    (
      text: string,
      isUser: boolean,
      messageType: string = "unknown",
      toolName?: string,
      jsonData?: any
    ) => {
      const messageId = `${Date.now()}-${Math.random()}`;
      const newMessage: ChatMessage = {
        id: messageId,
        text,
        isUser,
        timestamp: new Date(),
        messageType,
        toolName,
        jsonData,
        isJsonExpanded: false,
      };

      setMessageHistory((prev) => {
        const updated = [...prev, newMessage];
        if (updated.length > MAX_MESSAGES_IN_MEMORY) {
          return updated.slice(-MAX_MESSAGES_IN_MEMORY);
        }
        return updated;
      });
    },
    []
  );

  /**
   * Adds a thinking message to the thinking messages array.
   *
   * @description Appends a thinking message to the internal thinking messages array.
   * These messages are typically combined and displayed later when the thinking process completes.
   *
   * @param {string} text - The thinking message text to add.
   * @returns {void}
   *
   * @example
   * ```tsx
   * addThinkingMessage("Analyzing request...");
   * addThinkingMessage("Checking device status...");
   * ```
   */
  const addThinkingMessage = useCallback((text: string) => {
    setThinkingMessages((prev) => {
      const updated = [...prev, text];
      thinkingMessagesRef.current = updated;
      return updated;
    });
  }, []);

  /**
   * Flushes and combines all thinking messages into a single string.
   *
   * @description Combines all accumulated thinking messages into a single string,
   * clears the thinking messages array, and returns the combined text.
   *
   * @returns {string} The combined thinking messages as a single string, or empty string if no messages.
   *
   * @example
   * ```tsx
   * addThinkingMessage("Step 1");
   * addThinkingMessage("Step 2");
   * const combined = flushThinkingMessages(); // Returns "Step 1 Step 2"
   * ```
   */
  const flushThinkingMessages = useCallback(() => {
    let combined = "";
    setThinkingMessages((prev) => {
      combined = prev.join(" ");
      thinkingMessagesRef.current = [];
      return [];
    });
    return combined;
  }, []);

  /**
   * Clears all thinking messages.
   *
   * @description Removes all accumulated thinking messages from the array.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * clearThinkingMessages();
   * // thinkingMessages is now []
   * ```
   */
  const clearThinkingMessages = useCallback(() => {
    thinkingMessagesRef.current = [];
    setThinkingMessages([]);
  }, []);

  /**
   * Toggles the JSON expansion state for a specific message.
   *
   * @description Expands or collapses the JSON data display for a message.
   * Updates both the expanded messages set and the message's isJsonExpanded property.
   *
   * @param {string} messageId - The unique ID of the message to toggle.
   * @returns {void}
   *
   * @example
   * ```tsx
   * toggleJsonExpansion("message-123");
   * // Message with ID "message-123" JSON is now expanded/collapsed
   * ```
   */
  const toggleJsonExpansion = useCallback((messageId: string) => {
    setExpandedJsonMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });

    setMessageHistory((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, isJsonExpanded: !msg.isJsonExpanded }
          : msg
      )
    );
  }, []);

  /**
   * Clears all messages and resets message-related state.
   *
   * @description Removes all messages from history, clears expanded JSON messages,
   * and clears thinking messages. Resets the chat to an empty state.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * clearMessages();
   * // messageHistory, expandedJsonMessages, and thinkingMessages are now cleared
   * ```
   */
  const clearMessages = useCallback(() => {
    setMessageHistory([]);
    setExpandedJsonMessages(new Set());
    thinkingMessagesRef.current = [];
    setThinkingMessages([]);
  }, []);

  // ==================== Update refs when state changes ====================
  useEffect(() => {
    messageDisplayConfigRef.current = messageDisplayConfig;
  }, [messageDisplayConfig]);

  useEffect(() => {
    thinkingMessagesRef.current = thinkingMessages;
  }, [thinkingMessages]);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // ==================== WebSocket Functions ====================
  /**
   * Handles incoming WebSocket messages and processes them accordingly.
   *
   * @description Processes WebSocket messages based on their type and action.
   * Handles different message types: timeout, handshake_ack, update_state, add, and skip.
   * Updates UI state, adds messages to history, and manages connection state.
   *
   * @param {WebSocketMessage} message - The WebSocket message to process.
   * @returns {void}
   *
   * @example
   * ```tsx
   * // This is typically called internally by the WebSocket onmessage handler
   * handleWebSocketMessage({
   *   type: "assistant",
   *   content_type: "text",
   *   content: "Hello, how can I help?"
   * });
   * ```
   */
  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      const processed = processWebSocketMessage(
        message,
        messageDisplayConfigRef.current,
        thinkingMessagesRef.current
      );

      switch (processed.action) {
        case "timeout":
          if (processed.text) {
            addChatMessage(processed.text, false, "timeout");
          }
          if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
          }
          setIsConnected(false);
          setIsConnecting(false);
          if (onTimeoutRef.current) {
            onTimeoutRef.current();
          } else {
            setTimeout(() => {
              router.back();
            }, 2000);
          }
          break;

        case "handshake_ack":
          if (processed.conversationId && store?.userStore) {
            saveConversationId(processed.conversationId, store.userStore).catch(
              (err) => {
                console.error("Failed to store conversation ID:", err);
              }
            );
          }
          if (messageDisplayConfigRef.current.showHandshakeAck && processed.jsonData) {
            addChatMessage("", false, "handshake_ack", undefined, processed.jsonData);
          }
          break;

        case "update_state":
          if (processed.shouldSetConversationDone) {
            setIsConversationDone(true);
          }
          if (processed.shouldSetThinking !== undefined) {
            setIsThinking(processed.shouldSetThinking);
          }
          if (processed.shouldFlushThinking) {
            const combined = flushThinkingMessages();
            if (combined) {
              addChatMessage(combined, false, "thinking");
            }
          }
          break;

        case "add":
          if (processed.shouldSetThinking !== undefined) {
            setIsThinking(processed.shouldSetThinking);
          }
          if (processed.shouldFlushThinking) {
            const combined = flushThinkingMessages();
            if (combined) {
              addChatMessage(combined, false, "thinking");
            }
          }
          if (processed.text !== undefined) {
            addChatMessage(
              processed.text,
              processed.isUser || false,
              processed.messageType,
              processed.toolName,
              processed.jsonData
            );
          }
          break;

        case "skip":
          if (processed.messageType === "thinking") {
            if (processed.text) {
              addThinkingMessage(processed.text);
            }
            setIsThinking(true);
          }
          break;
      }
    },
    [
      addChatMessage,
      addThinkingMessage,
      flushThinkingMessages,
      setIsThinking,
      setIsConversationDone,
      store,
      router,
    ]
  );

  /**
   * Connects to the WebSocket server at the specified URL.
   *
   * @description Establishes a WebSocket connection, sets up event handlers,
   * and sends a handshake message with conversation ID if available.
   * Shows error toast if connection fails.
   *
   * @param {string} url - The WebSocket server URL to connect to.
   * @returns {Promise<void>} Promise that resolves when connection is established or fails.
   *
   * @example
   * ```tsx
   * await connectWebSocket("wss://example.com/chat");
   * ```
   */
  const connectWebSocket = useCallback(
    async (url: string) => {
      setIsConnecting(true);
      try {
        wsRef.current = new WebSocket(url);

        wsRef.current.onopen = async () => {
          setIsConnected(true);
          setIsConnecting(false);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const storedConversationId = store?.userStore
              ? await getConversationId(store.userStore)
              : null;

            const handshakeMessage = {
              type: "handshake",
              content_type: "json",
              content: storedConversationId
                ? {
                    conversationId: storedConversationId,
                    conversationType: "text",
                  }
                : {
                    conversationType: "text",
                  },
            };
            wsRef.current.send(JSON.stringify(handshakeMessage));
          }
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data: WebSocketMessage = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch (error) {
            console.error("Failed to parse message:", error);
            const text = event.data;
            if (
              text &&
              text.toLowerCase().trim() !== "**done**" &&
              text.toLowerCase().trim() !== "done"
            ) {
              addChatMessage(text, false, "unknown");
            }
          }
        };

        wsRef.current.onerror = (error) => {
          console.error("WebSocket error:", error);
          setIsConnecting(false);
        };

        wsRef.current.onclose = () => {
          setIsConnected(false);
          setIsConnecting(false);
        };
      } catch (error) {
        console.error("Failed to connect WebSocket:", error);
        setIsConnecting(false);
        toast.showError(
          t("chat.connectionError") || "Connection Error",
          t("chat.connectionErrorMessage") || "Failed to connect to chat server"
        );
      }
    },
    [store, handleWebSocketMessage, addChatMessage, t, toast]
  );

  /**
   * Initializes the WebSocket connection by getting the URL and connecting.
   *
   * @description Retrieves the WebSocket URL from storage and establishes a connection.
   * Silently handles errors during initialization.
   *
   * @returns {Promise<void>} Promise that resolves when initialization completes or fails.
   *
   * @example
   * ```tsx
   * await initializeWebSocket();
   * // WebSocket connection is now established if successful
   * ```
   */
  const initializeWebSocket = useCallback(async () => {
    try {
      const url = await getWebSocketUrl(store);
      if (url) {
        await connectWebSocket(url);
      }
    } catch (error) {
      // Silent error handling
    }
  }, [store, connectWebSocket]);

  /**
   * Sends a message through the WebSocket connection.
   *
   * @description Sends a user message to the server via WebSocket if connected.
   * Does nothing if message is empty, not connected, or WebSocket is not ready.
   *
   * @param {string} message - The message text to send.
   * @returns {void}
   *
   * @example
   * ```tsx
   * sendMessage("Turn on the living room lights");
   * ```
   */
  const sendMessage = useCallback(
    (message: string) => {
      if (!message || !isConnected || !wsRef.current) return;

      if (wsRef.current.readyState === WebSocket.OPEN) {
        try {
          const messageData: WebSocketMessage = {
            type: "user",
            content_type: "text",
            content: message,
          };
          wsRef.current.send(JSON.stringify(messageData));
        } catch (error) {
          // Silent error handling
        }
      }
    },
    [isConnected]
  );

  /**
   * Disconnects the WebSocket connection.
   *
   * @description Closes the WebSocket connection and resets connection state.
   * Cleans up the WebSocket reference.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * disconnect();
   * // WebSocket is now closed and connection state is reset
   * ```
   */
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // ==================== Scroll Functions ====================
  /**
   * Enables auto-scroll functionality for the message list.
   *
   * @description Allows the message list to automatically scroll to the bottom
   * when new messages are added. Resets the user scrolling flag.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * enableAutoScroll();
   * // Messages will now auto-scroll to bottom
   * ```
   */
  const enableAutoScroll = useCallback(() => {
    shouldAutoScrollRef.current = true;
    isUserScrollingRef.current = false;
  }, []);

  /**
   * Disables auto-scroll functionality for the message list.
   *
   * @description Prevents the message list from automatically scrolling to the bottom.
   * Sets the user scrolling flag to indicate manual scrolling is in progress.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * disableAutoScroll();
   * // Messages will no longer auto-scroll
   * ```
   */
  const disableAutoScroll = useCallback(() => {
    shouldAutoScrollRef.current = false;
    isUserScrollingRef.current = true;
  }, []);

  /**
   * Scrolls the message list to the end (bottom).
   *
   * @description Programmatically scrolls the FlatList to show the last message.
   * Does nothing if the FlatList reference is not available.
   *
   * @param {boolean} [animated=true] - Whether to animate the scroll transition.
   * @returns {void}
   *
   * @example
   * ```tsx
   * scrollToEnd(true);  // Scroll with animation
   * scrollToEnd(false); // Scroll without animation
   * ```
   */
  const scrollToEnd = useCallback((animated: boolean = true) => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated });
    }
  }, []);

  /**
   * Handles the scroll begin drag event.
   *
   * @description Called when the user starts manually scrolling the message list.
   * Disables auto-scroll and marks that the user is actively scrolling.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * <FlatList
   *   onScrollBeginDrag={handleScrollBeginDrag}
   *   // ... other props
   * />
   * ```
   */
  const handleScrollBeginDrag = useCallback(() => {
    isUserScrollingRef.current = true;
    shouldAutoScrollRef.current = false;
  }, []);

  /**
   * Handles the scroll end drag event.
   *
   * @description Called when the user finishes dragging the message list.
   * Resets the user scrolling flag after a delay to allow momentum scrolling to complete.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * <FlatList
   *   onScrollEndDrag={handleScrollEndDrag}
   *   // ... other props
   * />
   * ```
   */
  const handleScrollEndDrag = useCallback(() => {
    setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 1000);
  }, []);

  /**
   * Handles the momentum scroll end event.
   *
   * @description Called when momentum scrolling completes.
   * Resets the user scrolling flag immediately.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * <FlatList
   *   onMomentumScrollEnd={handleMomentumScrollEnd}
   *   // ... other props
   * />
   * ```
   */
  const handleMomentumScrollEnd = useCallback(() => {
    isUserScrollingRef.current = false;
  }, []);

  const messageHistoryLengthRef = useRef(0);
  
  useEffect(() => {
    messageHistoryLengthRef.current = messageHistory.length;
  }, [messageHistory.length]);

  /**
   * Handles the content size change event for the message list.
   *
   * @description Called when the content size of the FlatList changes (e.g., new message added).
   * Automatically scrolls to the end if auto-scroll is enabled and there are messages.
   *
   * @returns {void}
   *
   * @example
   * ```tsx
   * <FlatList
   *   onContentSizeChange={handleContentSizeChange}
   *   // ... other props
   * />
   * ```
   */
  const handleContentSizeChange = useCallback(() => {
    if (
      shouldAutoScrollRef.current &&
      messageHistoryLengthRef.current > 0 &&
      flatListRef.current
    ) {
      setTimeout(() => {
        if (shouldAutoScrollRef.current && flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 50);
    }
  }, []);

  // ==================== Conversations Functions ====================
  /**
   * Loads conversations for the given agent.
   *
   * @description Fetches the list of conversations for the specified agent ID.
   * Updates internal state and returns the list. On error, returns an empty array.
   *
   * @param {string} agentId - The agent ID to load conversations for.
   * @returns {Promise<ConversationListItem[]>} Promise that resolves with the list of conversations.
   */
  const loadConversationsForAgent = useCallback(
    async (agentId: string): Promise<ConversationListItem[]> => {
      if (!agentId) {
        return [];
      }
      try {
        setIsLoadingConversations(true);
        const items = await listConversations(agentId);
        setConversations(items);
        return items;
      } catch (error) {
        console.error("Failed to load conversations for agent:", error);
        return [];
      } finally {
        setIsLoadingConversations(false);
      }
    },
    []
  );

  /**
   * Deletes a conversation for the given agent.
   *
   * @param {string} agentId - The agent ID.
   * @param {string} conversationId - The conversation ID to delete.
   * @returns {Promise<void>} Promise that resolves when deletion completes.
   */
  const deleteConversationForAgent = useCallback(
    async (agentId: string, conversationId: string): Promise<void> => {
      if (!agentId || !conversationId) {
        return;
      }
      try {
        await deleteConversationByAgent(agentId, conversationId);
        setConversations((prev) =>
          prev.filter((c) => c.conversationId !== conversationId)
        );
      } catch (error) {
        console.error("Failed to delete conversation:", error);
        throw error;
      }
    },
    []
  );

  return {
    // Agent state
    isInitializing,
    agentError,
    isAgentConfigNotFound,
    isProfileNotFound,
    isConnectingConnector,
    isDefaultAgent,
    showConnectorWarningDialog,
    initializeAgent,
    handleConnectorWarningRetry,
    handleConnectorWarningContinue,

    // Config state
    messageDisplayConfig,
    fontSize,
    setMessageDisplayConfig,
    setFontSize,
    saveConfig,
    loadMessageDisplayConfig,
    loadFontSize,

    // Input state
    inputText,
    setInputText,
    inputHeight,
    setInputHeight,
    isKeyboardVisible,
    resetInput,

    // Messages state
    messageHistory,
    setMessageHistory,
    expandedJsonMessages,
    thinkingMessages,
    isThinking,
    isConversationDone,
    setIsThinking,
    setIsConversationDone,
    addChatMessage,
    addThinkingMessage,
    flushThinkingMessages,
    clearThinkingMessages,
    toggleJsonExpansion,
    clearMessages,

    // WebSocket state
    isConnected,
    isConnecting,
    initializeWebSocket,
    sendMessage,
    disconnect,

    // Scroll state
    flatListRef,
    enableAutoScroll,
    disableAutoScroll,
    scrollToEnd,
    handleScrollBeginDrag,
    handleScrollEndDrag,
    handleMomentumScrollEnd,
    handleContentSizeChange,

    // Conversations state
    conversations,
    isLoadingConversations,
    loadConversationsForAgent,
    deleteConversationForAgent,
  };
};
