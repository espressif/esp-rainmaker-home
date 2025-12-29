/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";

import { useTranslation } from "react-i18next";
// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Icons
import { X, AlertCircle } from "lucide-react-native";

// Components
import { Input } from "@/components";

// Utils
import { getAgentConfig } from "@/utils/agent";

// Types
import type { AddAgentBottomSheetProps } from "@/types/global";

/**
 * AddAgentBottomSheet
 *
 * A bottom sheet component for adding a new agent.
 * Features:
 * - Slides up from bottom with animation
 * - Input fields for agent name and ID
 * - Save button
 * - Backdrop press to close
 */
const AddAgentBottomSheet: React.FC<AddAgentBottomSheetProps> = ({
  visible,
  onClose,
  onSave,
  initialAgentId,
  initialAgentName,
  existingAgents = [],
}) => {
  const { t } = useTranslation();
  const [agentName, setAgentName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [isNameValid, setIsNameValid] = useState(false);
  const [isValidatingAgentId, setIsValidatingAgentId] = useState(false);
  const [agentIdError, setAgentIdError] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);
  const [hasValidatedAgentId, setHasValidatedAgentId] = useState(false);

  useEffect(() => {
    if (!visible) {
      // Reset form when modal closes
      setAgentName("");
      setAgentId("");
      setIsNameValid(false);
      setIsValidatingAgentId(false);
      setAgentIdError(undefined);
      setHasValidatedAgentId(false);
      setFormKey((prev) => prev + 1); // Force Input components to reset
    } else {
      // Pre-fill agent ID when modal opens with initialAgentId
      if (initialAgentId) {
        setAgentId(initialAgentId);
      }
      // Pre-fill agent name when modal opens with initialAgentName
      if (initialAgentName) {
        setAgentName(initialAgentName);
        setIsNameValid(initialAgentName.trim().length > 0);
      }
    }
  }, [visible, initialAgentId, initialAgentName]);


  const handleBackdropPress = () => {
    onClose();
  };

  const handleContentPress = (e: any) => {
    // Prevent closing when pressing on the content
    e.stopPropagation();
  };

  const handleNameChange = (
    value: string,
    _isValid: boolean,
    _error: string
  ) => {
    setAgentName(value);
    setIsNameValid(value.trim().length > 0);
  };

  const handleIdChange = (
    value: string,
    _isValid: boolean,
    _error: string
  ) => {
    setAgentId(value);
    const trimmedValue = value.trim();
    
    if (!trimmedValue) {
      setAgentIdError(undefined);
      setHasValidatedAgentId(false);
      return;
    }

    // Check if agent already exists
    const agentExists = existingAgents.some(
      (agent) => agent.agentId.trim().toLowerCase() === trimmedValue.toLowerCase()
    );

    if (agentExists) {
      setAgentIdError(
        t("aiSettings.errors.agentAlreadyExists") || "Agent already exists"
      );
      setHasValidatedAgentId(true);
      return;
    }

    // Clear error banner and validation state if user starts typing again after validation
    if (hasValidatedAgentId && agentIdError) {
      setAgentIdError(undefined);
      setHasValidatedAgentId(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = agentName.trim();
    const trimmedId = agentId.trim();

    // Validate name
    if (!trimmedName) {
      setIsNameValid(false);
      return;
    }

    // Validate agent ID exists
    if (!trimmedId) {
      setAgentIdError(t("aiSettings.errors.fillAllFields"));
      setHasValidatedAgentId(true);
      return;
    }

    // Check if agent already exists
    const agentExists = existingAgents.some(
      (agent) => agent.agentId.trim().toLowerCase() === trimmedId.toLowerCase()
    );

    if (agentExists) {
      setAgentIdError(
        t("aiSettings.errors.agentAlreadyExists") || "Agent already exists"
      );
      setHasValidatedAgentId(true);
      return;
    }

    // Validate agent ID via API
    setIsValidatingAgentId(true);
    setAgentIdError(undefined);

    try {
      await getAgentConfig(trimmedId);
      setAgentIdError(undefined);
      setHasValidatedAgentId(true);
      
      // Only save if validation passes
      onSave(trimmedName, trimmedId);
      onClose();
    } catch (error: any) {
      setAgentIdError(
        t("aiSettings.errors.invalidAgentId") || "Invalid agent ID"
      );
      setHasValidatedAgentId(true);
    } finally {
      setIsValidatingAgentId(false);
    }
  };

  const isSaveDisabled = !isNameValid || !agentId.trim() || isValidatingAgentId || (hasValidatedAgentId && !!agentIdError);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={globalStyles.bottomSheetBackdrop} onPress={handleBackdropPress}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={globalStyles.bottomSheetKeyboardAvoidingView}
        >
          <Pressable style={globalStyles.bottomSheetContent} onPress={handleContentPress}>
            {/* Handle */}
            <View style={globalStyles.bottomSheetHandle} />

            {/* Header */}
            <View style={globalStyles.bottomSheetHeader}>
              <Text style={globalStyles.bottomSheetTitle}>{t("aiSettings.addNewAgent")}</Text>
              <TouchableOpacity
                style={globalStyles.bottomSheetCloseButton}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={tokens.colors.text_secondary} />
              </TouchableOpacity>
            </View>

            {/* Error Banner */}
            {hasValidatedAgentId && agentIdError && (
              <View style={globalStyles.errorBanner}>
                <AlertCircle size={20} color={tokens.colors.red} />
                <Text style={globalStyles.errorBannerText}>{agentIdError}</Text>
              </View>
            )}

            {/* Form */}
            <ScrollView
              style={globalStyles.bottomSheetScrollView}
              contentContainerStyle={globalStyles.bottomSheetScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={globalStyles.bottomSheetFormContainer} key={formKey}>
                <View
                  style={globalStyles.bottomSheetInputContainer}
                  pointerEvents={initialAgentName ? "none" : "auto"}
                >
                  <Input
                    key={`name-${formKey}`}
                    placeholder={t("aiSettings.agentNamePlaceholder")}
                    initialValue={initialAgentName || ""}
                    onFieldChange={handleNameChange}
                    validateOnChange={false}
                    validateOnBlur={true}
                    border={true}
                    paddingHorizontal={true}
                    marginBottom={true}
                    validator={(value) => ({
                      isValid: value.trim().length > 0,
                      error:
                        value.trim().length === 0
                          ? t("aiSettings.errors.fillAllFields")
                          : undefined,
                    })}
                  />
                </View>

                <View
                  style={globalStyles.bottomSheetInputContainer}
                  pointerEvents={initialAgentId ? "none" : "auto"}
                >
                  {isValidatingAgentId && (
                    <View style={globalStyles.bottomSheetLoadingContainer}>
                      <ActivityIndicator
                        size="small"
                        color={tokens.colors.primary}
                      />
                    </View>
                  )}
                  <Input
                    key={`id-${formKey}-${
                      hasValidatedAgentId ? "validated" : "not-validated"
                    }-${agentIdError ? "error" : "no-error"}`}
                    placeholder={t("aiSettings.agentIdPlaceholder")}
                    initialValue={agentId || initialAgentId || ""}
                    onFieldChange={handleIdChange}
                    validateOnChange={hasValidatedAgentId}
                    validateOnBlur={true}
                    debounceDelay={0}
                    border={true}
                    paddingHorizontal={true}
                    marginBottom={true}
                    validator={(value) => {
                      if (!value.trim()) {
                        return {
                          isValid: false,
                          error: t("aiSettings.errors.fillAllFields"),
                        };
                      }

                      // Check if agent already exists
                      const trimmedValue = value.trim();
                      const agentExists = existingAgents.some(
                        (agent) =>
                          agent.agentId.trim().toLowerCase() ===
                          trimmedValue.toLowerCase()
                      );

                      if (agentExists) {
                        return {
                          isValid: false,
                          error:
                            t("aiSettings.errors.agentAlreadyExists") ||
                            "Agent already exists",
                        };
                      }

                      if (hasValidatedAgentId && agentIdError) {
                        return {
                          isValid: false,
                          error: agentIdError,
                        };
                      }
                      return {
                        isValid: true,
                        error: undefined,
                      };
                    }}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Buttons */}
            <View style={globalStyles.bottomSheetButtonContainer}>
              <TouchableOpacity
                style={[globalStyles.bottomSheetButton, globalStyles.bottomSheetCancelButton]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={globalStyles.bottomSheetCancelButtonText}>
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  globalStyles.bottomSheetButton,
                  globalStyles.bottomSheetSaveButton,
                  isSaveDisabled && globalStyles.bottomSheetSaveButtonDisabled,
                ]}
                onPress={handleSave}
                disabled={isSaveDisabled}
                activeOpacity={0.7}
              >
                {isValidatingAgentId ? (
                  <ActivityIndicator size="small" color={tokens.colors.white} />
                ) : (
                  <Text
                    style={[
                      globalStyles.bottomSheetSaveButtonText,
                      isSaveDisabled && globalStyles.bottomSheetSaveButtonTextDisabled,
                    ]}
                  >
                    {t("common.save")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Bottom safe area */}
            <View style={globalStyles.bottomSheetBottomSafeArea} />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};


export default AddAgentBottomSheet;
