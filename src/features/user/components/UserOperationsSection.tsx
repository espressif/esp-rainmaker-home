/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View } from "react-native";

import SettingsSection from "./SettingsSection";
import UserOperationItem from "./UserOperationItem";
import { testProps } from "@shared/utils/testProps";
import { userStyles } from "@features/user/theme/userStyleSheet";
import { UserOperationConfig } from "@src/types/global";

type UserOperationsSectionProps = {
  operations: UserOperationConfig[];
  onOperationPress: (action: string) => void;
};

/**
 * Renders the user operations section UI section.
 */
const UserOperationsSection: React.FC<UserOperationsSectionProps> = ({
  operations,
  onOperationPress,
}) => (
  <View {...testProps("view_user_operations")} style={userStyles.section}>
    <SettingsSection>
      {operations.map((operation, index) => (
        <UserOperationItem
          key={operation.id}
          qaId={`button_user_operation_${operation.id}`}
          icon={operation.icon}
          title={operation.title}
          onPress={() => onOperationPress(operation.action)}
          showBadge={operation.showBadge}
          isDebug={operation.isDebug}
          showSeparator={
            operation.showSeparator !== false && index < operations.length - 1
          }
        />
      ))}
    </SettingsSection>
  </View>
);

export default UserOperationsSection;
