/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { View } from 'react-native';

// Components
import ContentWrapper from '../Layout/ContentWrapper';

// Styles
import { globalStyles } from '@/theme/globalStyleSheet';
import { tokens } from "@/theme/tokens";

import { testProps } from "../../utils/testProps";
// Types
interface SettingsSectionProps {
  /** Child components to render */
  children: React.ReactNode;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * SettingsSection
 *
 * A container component for grouping settings items.
 * Features:
 * - Consistent padding and spacing
 * - Content wrapping
 * - Section grouping
 */
const SettingsSection: React.FC<SettingsSectionProps> = ({ children,
  qaId}) => {
  return (
    <ContentWrapper
      qaId={qaId}
      style={{
        ...globalStyles.shadowElevationForLightTheme,
        backgroundColor: tokens.colors.white,
      }}
    >
      <View style={globalStyles.settingsSection}>{children}</View>
    </ContentWrapper>
  );
};

export default SettingsSection; 
