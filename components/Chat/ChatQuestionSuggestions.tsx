/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

interface ChatQuestionSuggestionsProps {
  questions?: string[];
  onQuestionPress: (question: string) => void;
}

const DEFAULT_QUESTIONS = [
  "Can you show all my devices?",
  "Please turn on the Bedroom Fan",
  "Please set a schedule to turn on all my lights at 6pm everyday",
];

/**
 * Question suggestions component for default agent
 */
export const ChatQuestionSuggestions: React.FC<
  ChatQuestionSuggestionsProps
> = ({ questions = DEFAULT_QUESTIONS, onQuestionPress }) => {
  return (
    <View style={styles.questionSuggestionsContainer}>
      {questions.map((question, index) => (
        <TouchableOpacity
          key={index}
          style={styles.questionSuggestionButton}
          onPress={() => onQuestionPress(question)}
          activeOpacity={0.7}
        >
          <Text style={styles.questionSuggestionText}>{question}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  questionSuggestionsContainer: {
    paddingHorizontal: tokens.spacing._15,
    paddingTop: tokens.spacing._10,
    paddingBottom: tokens.spacing._15,
    gap: tokens.spacing._10,
  },
  questionSuggestionButton: {
    backgroundColor: tokens.colors.bg2,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.bg3,
  },
  questionSuggestionText: {
    ...globalStyles.fontMd,
    ...globalStyles.textPrimary,
    fontSize: 14,
  },
});

