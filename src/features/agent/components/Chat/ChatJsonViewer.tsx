/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Braces, ChevronDown, ChevronRight } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { getFontSizes } from "@features/agent/utils/chat/fontSizes";
import { formatJsonPayload } from "@features/agent/utils/chat/messageContentParser";

interface ChatJsonViewerProps {
  data: unknown;
  messageId: string;
  title: string;
  fontSize: number;
}

/**
 * Compact collapsible JSON card aligned with the user-dashboard tool message UI.
 * @param props - JSON payload, title, and typography settings.
 * @returns Full-width expandable JSON message row.
 */
export const ChatJsonViewer: React.FC<ChatJsonViewerProps> = ({
  data,
  messageId,
  title,
  fontSize,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const fontSizes = getFontSizes(fontSize);
  const jsonString = formatJsonPayload(data);

  /**
   * Toggles JSON card expansion.
   */
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <View key={messageId} style={globalStyles.chatCollapsibleMessageContainer}>
      <TouchableOpacity
        style={globalStyles.chatCollapsibleMessageHeader}
        onPress={handleToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        <Braces size={16} color={tokens.colors.primary} />
        <Text
          style={[
            globalStyles.chatCollapsibleMessageTitle,
            { fontSize: fontSizes.base * 0.875 },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {isExpanded ? (
          <ChevronDown size={16} color={tokens.colors.text_secondary} />
        ) : (
          <ChevronRight size={16} color={tokens.colors.text_secondary} />
        )}
      </TouchableOpacity>

      {isExpanded && jsonString.length > 0 && (
        <ScrollView
          style={globalStyles.chatCollapsibleMessageCodePanel}
          contentContainerStyle={globalStyles.chatCollapsibleMessageCodeContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <Text
            style={[
              globalStyles.chatCollapsibleMessageCodeText,
              { fontSize: fontSizes.base * 0.75 },
            ]}
            selectable
          >
            {jsonString}
          </Text>
        </ScrollView>
      )}
    </View>
  );
};
