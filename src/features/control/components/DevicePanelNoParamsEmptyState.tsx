/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import { Package } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import {
  I18N_DEVICE_CONTROL_FALLBACK_NO_PARAMS,
} from "@features/control/constants";
import { QA_DEVICE_PANEL_NO_PARAMS_EMPTY_STATE } from "@shared/utils/constants";

const DEVICE_PANEL_NO_PARAMS_ICON_SIZE = 60;
const DEVICE_PANEL_NO_PARAMS_ICON_STROKE = 1.25;

/**
 * DevicePanelNoParamsEmptyState
 *
 * Centered empty state for device control panels when the device has no
 * parameters yet (shared layout and copy across Fallback, Light, Switch, Temperature).
 * @returns Full-area wrapper with icon and translated message
 */
const DevicePanelNoParamsEmptyState: React.FC = () => {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <EmptyState
        icon={
          <Package
            size={DEVICE_PANEL_NO_PARAMS_ICON_SIZE}
            color={tokens.colors.bg2}
            strokeWidth={DEVICE_PANEL_NO_PARAMS_ICON_STROKE}
          />
        }
        message={t(I18N_DEVICE_CONTROL_FALLBACK_NO_PARAMS)}
        qaId={QA_DEVICE_PANEL_NO_PARAMS_EMPTY_STATE}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default DevicePanelNoParamsEmptyState;
