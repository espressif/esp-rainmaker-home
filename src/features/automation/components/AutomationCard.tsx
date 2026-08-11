/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Switch } from "tamagui";
import { Trash2 } from "lucide-react-native";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Types
import { AutomationCardProps } from "@src/types/global";

// Mobx observer
import { observer } from "mobx-react-lite";

// Utils
import { testProps, stateTestProps } from "@shared/utils/testProps";
import AutomationWhenSetSummary from "./AutomationWhenSetSummary";

/**
 * AutomationCard
 *
 * Displays automation name, event/action summary, and enable toggle.
 * In edit mode, toggle is replaced by delete (same as ScheduleCard).
 */
const AutomationCard: React.FC<AutomationCardProps & { qaId?: string }> = ({
  automation,
  onPress,
  onToggle,
  toggleLoading = false,
  isEditing = false,
  onDelete,
  deleteLoading = false,
  qaId,
}) => {
  const automationName = automation.name || "Unnamed Automation";
  const isEnabled = automation.enabled || false;

  /**
   * Forwards toggle changes when not already loading.
   * @param value - Next enabled state
   */
  const handleToggle = (value: boolean) => {
    if (onToggle && !toggleLoading) {
      onToggle(value);
    }
  };

  return (
    <Pressable
      {...(qaId ? testProps(`${qaId}_${automationName}`) : {})}
      style={[styles.card, toggleLoading && styles.cardLoading]}
      onPress={onPress}
      disabled={isEditing || toggleLoading}
    >
      {/* Header with name and toggle / delete */}
      <View style={styles.header}>
        <Text
          {...testProps(`text_automation_name`)}
          style={styles.automationName}
          numberOfLines={1}
        >
          {automationName}
        </Text>
        {!isEditing ? (
          <Switch
            {...testProps("switch_automation_enabled")}
            size="$2.5"
            borderColor={tokens.colors.bg1}
            borderWidth={0}
            checked={isEnabled}
            disabled={toggleLoading}
            style={globalStyles.switch}
            onCheckedChange={(value) => handleToggle(value)}
          >
            <Switch.Thumb
              {...stateTestProps(
                "automation_card",
                isEnabled,
                "enabled",
                "disabled",
              )}
              animation="quicker"
              style={
                isEnabled
                  ? globalStyles.switchThumbActive
                  : globalStyles.switchThumb
              }
            />
          </Switch>
        ) : (
          <TouchableOpacity
            {...testProps("button_delete_automation")}
            style={styles.deleteButton}
            onPress={onDelete}
            disabled={deleteLoading}
          >
            {deleteLoading ? (
              <ActivityIndicator size="small" color={tokens.colors.red} />
            ) : (
              <Trash2 size={18} color={tokens.colors.red} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <AutomationWhenSetSummary automation={automation} qaId="card" />
    </Pressable>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._15,
    marginBottom: tokens.spacing._10,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    shadowColor: tokens.colors.text_secondary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardLoading: {
    opacity: 0.6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: tokens.spacing._10,
  },
  automationName: {
    flex: 1,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginRight: tokens.spacing._10,
  },
  deleteButton: {
    padding: tokens.spacing._5,
  },
});

export default observer(AutomationCard);
