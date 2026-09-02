/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text } from "react-native";
import { FileText } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import {
  QA_GUIDE_LOAD_FAILED_DESCRIPTION,
  QA_GUIDE_LOAD_FAILED_EMPTY_STATE,
  QA_GUIDE_LOAD_FAILED_TITLE,
} from "@shared/utils/constants";
import { guideScreenStyleSheet } from "@features/control/theme";
import {
  I18N_DEVICE_GUIDE_LOAD_FAILED,
  I18N_DEVICE_GUIDE_LOAD_FAILED_DESCRIPTION,
} from "@features/control/constants";

const GUIDE_LOAD_ERROR_ICON_SIZE = 48;

export interface GuideLoadErrorEmptyStateProps {
  /** When true, reserves space so the pinned Continue button does not overlap copy. */
  hasFooter?: boolean;
}

/**
 * Centered empty state when the device guide markdown cannot be fetched.
 * Matches other screen empty states: icon, title, and supporting description.
 * @param props - Layout flags for the provision-flow footer
 * @returns Icon, title, and description for a failed guide load
 */
const GuideLoadErrorEmptyState: React.FC<GuideLoadErrorEmptyStateProps> = ({
  hasFooter = false,
}) => {
  const { t } = useTranslation();

  return (
    <View
      {...testProps(QA_GUIDE_LOAD_FAILED_EMPTY_STATE)}
      style={[
        globalStyles.emptyStateContainer,
        hasFooter && guideScreenStyleSheet.emptyStateWithFooter,
      ]}
    >
      <View style={globalStyles.emptyStateIconContainer}>
        <FileText
          size={GUIDE_LOAD_ERROR_ICON_SIZE}
          color={tokens.colors.primary}
        />
      </View>
      <Text
        {...testProps(QA_GUIDE_LOAD_FAILED_TITLE)}
        style={globalStyles.emptyStateTitle}
      >
        {t(I18N_DEVICE_GUIDE_LOAD_FAILED)}
      </Text>
      <Text
        {...testProps(QA_GUIDE_LOAD_FAILED_DESCRIPTION)}
        style={globalStyles.emptyStateDescription}
      >
        {t(I18N_DEVICE_GUIDE_LOAD_FAILED_DESCRIPTION)}
      </Text>
    </View>
  );
};

export default GuideLoadErrorEmptyState;
