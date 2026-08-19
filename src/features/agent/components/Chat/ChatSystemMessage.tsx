/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text } from "react-native";
import { AlertCircle } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { getFontSizes } from "@features/agent/utils/chat/fontSizes";

interface ChatSystemMessageProps {
  text: string;
  fontSize: number;
}

/**
 * Centered system/status chip for connection and quota messages.
 * @param props - System message text and font size.
 * @returns Centered system tag UI.
 */
export const ChatSystemMessage: React.FC<ChatSystemMessageProps> = ({
  text,
  fontSize,
}) => {
  const fontSizes = getFontSizes(fontSize);

  return (
    <View style={globalStyles.chatSystemMessageWrapper}>
      <View style={globalStyles.chatSystemMessageChip}>
        <AlertCircle size={14} color={tokens.colors.text_secondary} />
        <Text
          style={[
            globalStyles.chatSystemMessageText,
            { fontSize: fontSizes.base * 0.85 },
          ]}
        >
          {text}
        </Text>
      </View>
    </View>
  );
};
