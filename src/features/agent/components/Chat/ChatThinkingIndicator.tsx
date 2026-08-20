/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { getFontSizes } from "@features/agent/utils/chat/fontSizes";

const THINKING_MESSAGES_INITIAL = [
  "Thinking...",
  "Thinking deeply...",
  "Working on it...",
  "Planning...",
  "Planning next moves...",
  "Wondering...",
] as const;

const THINKING_MESSAGES = [
  ...THINKING_MESSAGES_INITIAL,
  "Thinking longer...",
  "Reflecting on the action...",
  "Thinking of a better response...",
  "Running simulations...",
  "Analyzing the data...",
  "Processing the information...",
  "Preparing an informed response...",
  "Reviewing the details carefully...",
  "Considering the best next step...",
  "Evaluating possible approaches...",
  "Refining the answer for clarity...",
  "Connecting the dots...",
  "Double-checking the logic...",
  "Exploring alternatives...",
  "Synthesizing the information...",
  "Distilling the insights...",
  "Searching for the most meaningful answer...",
  "Working through the nuance...",
  "Pulling the right threads together...",
  "Optimizing the response behind the scenes...",
  "Fine-tuning the recommendation...",
  "Clarifying the moving parts...",
  "Checking the model twice...",
  "Running a precise analysis...",
  "Activating deeper reasoning...",
  "Processing this with elevated context...",
  "Enhancing the answer with relevant insights...",
  "Refining the response for clarity...",
  "Connecting the dots for a coherent answer...",
  "Double-checking the logic for accuracy...",
] as const;

interface ChatThinkingIndicatorProps {
  isVisible: boolean;
  fontSize: number;
}

/**
 * Animated in-flight thinking indicator shown while waiting for a response.
 * Mirrors user-dashboard ThinkingIndicator with rotating status copy and pulse.
 * @param props - Visibility and font size props.
 * @returns Thinking shimmer text or null when hidden.
 */
export const ChatThinkingIndicator: React.FC<ChatThinkingIndicatorProps> = ({
  isVisible,
  fontSize,
}) => {
  const [currentMessage, setCurrentMessage] = useState("");
  const opacity = useRef(new Animated.Value(1)).current;
  const fontSizes = getFontSizes(fontSize);

  useEffect(() => {
    if (!isVisible) {
      setCurrentMessage("");
      opacity.setValue(1);
      return;
    }

    const firstMessage =
      THINKING_MESSAGES_INITIAL[
        Math.floor(Math.random() * THINKING_MESSAGES_INITIAL.length)
      ];
    setCurrentMessage(firstMessage);

    const messageInterval = setInterval(() => {
      const randomMessage =
        THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
      setCurrentMessage(randomMessage);
    }, 5000);

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => {
      clearInterval(messageInterval);
      pulse.stop();
    };
  }, [isVisible, opacity]);

  if (!isVisible) {
    return null;
  }

  return (
    <Animated.Text
      style={[
        globalStyles.chatThinkingIndicatorText,
        { fontSize: fontSizes.base, opacity },
      ]}
    >
      {currentMessage}
    </Animated.Text>
  );
};
