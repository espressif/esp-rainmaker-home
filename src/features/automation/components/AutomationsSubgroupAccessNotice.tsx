/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ShieldOff } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

export interface AutomationsSubgroupAccessNoticeProps {
  /** Primary heading (i18n string from caller) */
  title: string;
  /** Supporting copy (i18n string from caller) */
  description: string;
}

/**
 * Full-screen-style notice when the current home is shared with subgroup-only access
 * and automations are not supported (RMNG). Shown from {@link AutomationsScreen} instead of the list.
 */
export const AutomationsSubgroupAccessNotice: React.FC<
  AutomationsSubgroupAccessNoticeProps
> = ({ title, description }) => {
  return (
    <View
      {...testProps("view_automations_subgroup_access_notice")}
      style={styles.wrap}
    >
      <View style={globalStyles.automationEmptyStateIconContainerTop}>
        <ShieldOff size={40} color={tokens.colors.text_secondary} />
      </View>
      <Text
        {...testProps("text_subgroup_notice_title")}
        style={[globalStyles.emptyStateTitle, styles.titleSpacing]}
      >
        {title}
      </Text>
      <Text
        {...testProps("text_subgroup_notice_description")}
        style={globalStyles.emptyStateDescription}
      >
        {description}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: tokens.spacing._20,
    paddingTop: tokens.spacing._30,
    alignItems: "center",
  },
  titleSpacing: {
    marginTop: tokens.spacing._10,
  },
});
