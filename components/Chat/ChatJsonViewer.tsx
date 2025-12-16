/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { getFontSizes } from "@/utils/chat/fontSizes";

interface ChatJsonViewerProps {
  data: any;
  messageId: string;
  fontSize: number;
  isExpanded: boolean;
  onToggle: (messageId: string) => void;
}

/**
 * JSON Viewer component with expand/collapse functionality
 */
export const ChatJsonViewer: React.FC<ChatJsonViewerProps> = ({
  data,
  messageId,
  fontSize,
  isExpanded,
  onToggle,
}) => {
  const jsonString = JSON.stringify(data, null, 2);
  const preview =
    jsonString.substring(0, 150) + (jsonString.length > 150 ? "..." : "");
  const fontSizes = getFontSizes(fontSize);

  return (
    <View style={globalStyles.chatJsonContainer}>
      {isExpanded ? (
        <View style={globalStyles.chatJsonExpandedWrapper}>
          <TouchableOpacity
            style={globalStyles.chatJsonExpandedHeader}
            onPress={() => onToggle(messageId)}
            activeOpacity={0.8}
          >
            <ChevronUp size={18} color={tokens.colors.text_secondary} />
          </TouchableOpacity>
          <ScrollView
            style={globalStyles.chatJsonContent}
            contentContainerStyle={globalStyles.chatJsonContentContainer}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            <TouchableOpacity
              onPress={() => onToggle(messageId)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  globalStyles.chatJsonText,
                  { fontSize: fontSizes.base },
                ]}
                selectable
              >
                {jsonString}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : (
        <TouchableOpacity
          style={globalStyles.chatJsonCollapsedWrapper}
          onPress={() => onToggle(messageId)}
          activeOpacity={0.8}
        >
          <Text
            style={[
              globalStyles.chatJsonPreview,
              { fontSize: fontSizes.base },
            ]}
            numberOfLines={3}
          >
            {preview}
          </Text>
          <View style={globalStyles.chatJsonCollapsedIcon}>
            <ChevronDown size={18} color={tokens.colors.text_secondary} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

