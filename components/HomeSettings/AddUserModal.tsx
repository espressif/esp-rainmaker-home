/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react-native";

// Components
import Input from "@/components/Form/Input";
import ActionButton from "@/components/Form/ActionButton";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
import { AddUserModalProps } from "@/types/global";

/**
 * AddUserModal Component
 *
 * Modal dialog for adding new users to share the device.
 * Handles email input and validation.
 *
 * Features:
 * - Email input
 * - Input validation
 * - Loading state
 * - Success/error handling
 *
 * @param props - Component properties for add user modal
 */
const AddUserModal: React.FC<AddUserModalProps> = ({
  visible,
  onClose,
  onAdd,
  email,
  handleEmailChange,
  isLoading,
  validateEmail,
  makePrimary = false,
  onMakePrimaryChange,
  transfer = false,
  onTransferChange,
  transferAndAssignRole = false,
  onTransferAndAssignRoleChange,
}) => {
  const { t } = useTranslation();

  /**
   * Email validator for use with Input component - adapts the parent's validateEmail function
   */
  const emailValidator = (
    emailInput: string
  ): { isValid: boolean; error?: string } => {
    if (!emailInput.trim()) {
      return { isValid: false };
    }
    const isValid = validateEmail(emailInput);
    if (!isValid) {
      return {
        isValid: false,
        error: t("group.validation.pleaseEnterValidEmail"),
      };
    }
    return { isValid: true };
  };

  /**
   * Email field change handler - adapts to work with new Input component
   */
  const handleFieldChange = (value: string) => {
    handleEmailChange(value);
  };

  /**
   * Handle make primary checkbox change
   * When selected, clear transfer checkboxes
   */
  const handleMakePrimaryChange = (value: boolean) => {
    onMakePrimaryChange?.(value);
    if (value) {
      onTransferChange?.(false);
      onTransferAndAssignRoleChange?.(false);
    }
  };

  /**
   * Handle transfer checkbox change
   * When selected, clear other checkboxes
   */
  const handleTransferChange = (value: boolean) => {
    onTransferChange?.(value);
    if (value) {
      onMakePrimaryChange?.(false);
      onTransferAndAssignRoleChange?.(false);
    }
  };

  /**
   * Handle transfer and assign role checkbox change
   * When selected, auto-select make primary and clear transfer
   */
  const handleTransferAndAssignRoleChange = (value: boolean) => {
    onTransferAndAssignRoleChange?.(value);
    if (value) {
      // Auto-select "make primary" and clear "transfer only"
      onMakePrimaryChange?.(true);
      onTransferChange?.(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={globalStyles.modalOverlay}>
        <View style={globalStyles.modalContent}>
          <Text style={globalStyles.modalTitle}>
            {t("group.settings.addUserModalTitle")}
          </Text>
          <Text style={globalStyles.modalDescription}>
            {t("group.settings.addUserModalDescription")}
          </Text>
          <Input
            icon="mail-open"
            placeholder={t("group.settings.addUserModalEmailPlaceholder")}
            initialValue={email}
            onFieldChange={handleFieldChange}
            validator={emailValidator}
            validateOnChange={true}
            debounceDelay={500}
            inputMode="email"
            style={{ width: "100%" }}
          />

          {/* Ownership Checkbox */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 5,
              marginBottom: 10,
            }}
            onPress={() => handleMakePrimaryChange(!makePrimary)}
            disabled={isLoading}
          >
            <View
              style={[
                globalStyles.checkbox,
                {
                  backgroundColor: makePrimary
                    ? tokens.colors.primary
                    : "transparent",
                  borderColor: makePrimary
                    ? tokens.colors.primary
                    : tokens.colors.bg2,
                  marginRight: 12,
                },
              ]}
            >
              {makePrimary && (
                <Check size={12} color={tokens.colors.white} strokeWidth={3} />
              )}
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                color: tokens.colors.black,
                lineHeight: 20,
              }}
            >
              {t("group.settings.grantOwnershipDescription")}
            </Text>
          </TouchableOpacity>

          {/* Transfer Group Checkbox */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 5,
              marginBottom: 10,
            }}
            onPress={() => handleTransferChange(!transfer)}
            disabled={isLoading}
          >
            <View
              style={[
                globalStyles.checkbox,
                {
                  backgroundColor: transfer
                    ? tokens.colors.primary
                    : "transparent",
                  borderColor: transfer
                    ? tokens.colors.primary
                    : tokens.colors.bg2,
                  marginRight: 12,
                },
              ]}
            >
              {transfer && (
                <Check size={12} color={tokens.colors.white} strokeWidth={3} />
              )}
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                color: tokens.colors.black,
                lineHeight: 20,
              }}
            >
              {t("group.settings.transferGroupDescription")}
            </Text>
          </TouchableOpacity>

          {/* Transfer Group and Assign New Role Checkbox */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 5,
              marginBottom: 10,
            }}
            onPress={() =>
              handleTransferAndAssignRoleChange(!transferAndAssignRole)
            }
            disabled={isLoading}
          >
            <View
              style={[
                globalStyles.checkbox,
                {
                  backgroundColor: transferAndAssignRole
                    ? tokens.colors.primary
                    : "transparent",
                  borderColor: transferAndAssignRole
                    ? tokens.colors.primary
                    : tokens.colors.bg2,
                  marginRight: 12,
                },
              ]}
            >
              {transferAndAssignRole && (
                <Check size={12} color={tokens.colors.white} strokeWidth={3} />
              )}
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                color: tokens.colors.black,
                lineHeight: 20,
              }}
            >
              {t("group.settings.transferAndAssignRoleDescription")}
            </Text>
          </TouchableOpacity>

          <View style={globalStyles.modalActions}>
            <ActionButton
              onPress={onClose}
              disabled={isLoading}
              variant="secondary"
              style={{ flex: 1 }}
            >
              <Text style={globalStyles.buttonTextSecondary}>
                {t("layout.shared.cancel")}
              </Text>
            </ActionButton>

            <View style={{ width: 10 }} />

            <ActionButton
              onPress={onAdd}
              disabled={isLoading}
              variant="primary"
              style={{ flex: 1 }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={tokens.colors.white} />
              ) : (
                <Text style={globalStyles.buttonTextPrimary}>
                  {t("layout.shared.confirm")}
                </Text>
              )}
            </ActionButton>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default AddUserModal;
