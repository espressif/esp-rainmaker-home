/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Pressable } from "react-native";
import { Settings } from "lucide-react-native";

import { testProps } from "@shared/utils/testProps";
import { tokens } from "@shared/theme/tokens";

type UserHeaderRightProps = {
  onPress: () => void;
};

/**
 * Renders the user header right UI section.
 */
const UserHeaderRight: React.FC<UserHeaderRightProps> = ({ onPress }) => (
  <Pressable
    {...testProps("button_settings")}
    onPress={onPress}
    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
    style={{ transform: [{ translateX: 8 }] }}
  >
    <Settings size={24} color={tokens.colors.primary} />
  </Pressable>
);

export default UserHeaderRight;
