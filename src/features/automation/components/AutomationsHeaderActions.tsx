/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { TouchableOpacity, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

interface AutomationsHeaderActionsProps {
  hasAutomations: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
}

/**
 * Automations header actions: Edit/Done when automations exist
 * (same pattern as Schedules / Scenes for list delete mode).
 * @param props - List presence, edit mode, and edit toggle
 * @returns Header right-slot content, or null when the list is empty
 */
export const AutomationsHeaderActions = ({
  hasAutomations,
  isEditing,
  onEditToggle,
}: AutomationsHeaderActionsProps) => {
  const { t } = useTranslation();

  if (!hasAutomations) {
    return null;
  }

  return (
    <TouchableOpacity
      {...testProps("button_edit_automations")}
      onPress={onEditToggle}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text
        {...testProps("text_edit_automations")}
        style={globalStyles.schedulesEditButton}
      >
        {isEditing
          ? t("automation.automations.done")
          : t("automation.automations.edit")}
      </Text>
    </TouchableOpacity>
  );
};
