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

// Types
interface SettingsSectionProps {
  /** Child components to render */
  children: React.ReactNode;
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
const SettingsSection: React.FC<SettingsSectionProps> = ({ children }) => {
  return (
    <ContentWrapper
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