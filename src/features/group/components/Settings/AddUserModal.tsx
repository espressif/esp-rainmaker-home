/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
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
import Input from "@shared/components/Form/Input";
import ActionButton from "@shared/components/Form/ActionButton";
import { testProps } from "@shared/utils/testProps";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Types
import { AddUserModalProps } from "@src/types/global";
import { getFeatures } from "@config/features.config";

/**
 * AddUserModal Component
 *
 * Modal dialog for adding new users to share the device.
 * Handles invite identifier and validation.
 *
 * Features:
 * - Username input
 * - Input validation
 * - Loading state
 * - Success/error handling
 * @param props - Component properties for add user modal
 */
const AddUserModal: React.FC<AddUserModalProps> = ({
  visible,
  onClose,
  onAdd,
  email,
  handleInviteChange,
  isLoading,
  inviteValidator,
  isInviteValid,
  makePrimary = false,
  onMakePrimaryChange,
  transfer = false,
  onTransferChange,
  transferAndAssignRole = false,
  onTransferAndAssignRoleChange,
  showRoleOptions = true,
  contentContainerStyle,
}) => {
  const { t } = useTranslation();
  const transferGroupSharingEnabled = getFeatures().transferGroupSharing;

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
      {...testProps("modal_add_user_selection")}
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={globalStyles.modalOverlay} {...testProps("view_overlay_add_user_selection")}>
        <View style={[globalStyles.modalContent, contentContainerStyle]}>
          <Text style={globalStyles.modalTitle} {...testProps("text_title_add_user_selection")} >
            {t("group.settings.addUserModalTitle")}
          </Text>
          <Text {...testProps("text_description_add_user_selection")} style={globalStyles.modalDescription}>
            {t("group.settings.addUserModalDescription")}
          </Text>
          <Input
            qaId="invite_user_sharing"
            icon="mail-open"
            placeholder={t("group.settings.addUserModalUsernamePlaceholder")}
            initialValue={email}
            onFieldChange={handleInviteChange}
            validator={inviteValidator}
            validateOnChange={true}
            debounceDelay={500}
            inputMode="text"
            keyboardType="default"
            style={{ width: "100%" }}
            returnKeyType="done"
            validateOnBlur={true}
            onSubmitEditing={() => {
              if (isInviteValid && !isLoading) {
                void onAdd();
              }
            }}
          />

          {/* Ownership Checkbox — hidden when the share target has no role support (e.g. room shares) */}
          {showRoleOptions && (
          <TouchableOpacity
            {...testProps("button_primary_sharing")}
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
          )}

          {/* Transfer Group Checkbox — SDK / env gated */}
          {showRoleOptions && transferGroupSharingEnabled && (
            <TouchableOpacity
              {...testProps("button_transfer_group_sharing")}
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
                  <Check
                    size={12}
                    color={tokens.colors.white}
                    strokeWidth={3}
                  />
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
          )}

          {/* Transfer Group and Assign New Role Checkbox */}
          {showRoleOptions && transferGroupSharingEnabled && (
            <TouchableOpacity
              {...testProps("button_transfer_group_sharing_assign_new_role")}
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
                  <Check
                    size={12}
                    color={tokens.colors.white}
                    strokeWidth={3}
                  />
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
          )}

          <View style={globalStyles.modalActions} {...testProps("view_action_add_user_sharing")}>
            <ActionButton
              qaId="button_cancel_add_user_sharing"
              onPress={onClose}
              disabled={isLoading}
              variant="secondary"
              style={{ flex: 1, width: "auto" }}
            >
              <Text style={globalStyles.buttonTextSecondary}>
                {t("layout.shared.cancel")}
              </Text>
            </ActionButton>

            <View style={{ width: 10 }} />

            <ActionButton
              qaId="button_confirm_add_user_sharing"
              onPress={onAdd}
              disabled={isLoading || !isInviteValid}
              variant="primary"
              style={{ flex: 1, width: "auto" }}
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
