/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
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

// Icons
import { X, AlertCircle } from "lucide-react-native";

// Components
import { Input } from "@/components";

// Utils
import { getAgentConfig } from "@/utils/agent";

// Types
import type { AgentConfig } from "@/types/global";

interface AddAgentBottomSheetProps {
  /** Whether the bottom sheet is visible */
  visible: boolean;
  /** Callback when bottom sheet is closed */
  onClose: () => void;
  /** Callback when agent is saved */
  onSave: (name: string, agentId: string) => void;
  /** Optional initial agent ID to pre-fill */
  initialAgentId?: string;
  /** Optional initial agent name to pre-fill */
  initialAgentName?: string;
  /** List of existing agents to check for duplicates */
  existingAgents?: AgentConfig[];
}

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
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoidingView}
        >
          <Pressable style={styles.content} onPress={handleContentPress}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{t("aiSettings.addNewAgent")}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={tokens.colors.text_secondary} />
              </TouchableOpacity>
            </View>

            {/* Error Banner */}
            {hasValidatedAgentId && agentIdError && (
              <View style={styles.errorBanner}>
                <AlertCircle size={20} color={tokens.colors.red} />
                <Text style={styles.errorBannerText}>{agentIdError}</Text>
              </View>
            )}

            {/* Form */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formContainer} key={formKey}>
                <View
                  style={styles.inputContainer}
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
                  style={styles.inputContainer}
                  pointerEvents={initialAgentId ? "none" : "auto"}
                >
                  {isValidatingAgentId && (
                    <View style={styles.loadingContainer}>
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
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.saveButton,
                  isSaveDisabled && styles.saveButtonDisabled,
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
                      styles.saveButtonText,
                      isSaveDisabled && styles.saveButtonTextDisabled,
                    ]}
                  >
                    {t("common.save")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Bottom safe area */}
            <View style={styles.bottomSafeArea} />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: "80%",
    minHeight: 300,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.bg1,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: tokens.spacing._10,
    borderRadius: tokens.radius.sm,
    borderLeftWidth: 4,
    borderLeftColor: tokens.colors.red,
    gap: tokens.spacing._10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.red,
  },
  title: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    maxHeight: 400,
  },
  scrollContent: {
    paddingTop: 10,
  },
  formContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  inputContainer: {
    marginBottom: tokens.spacing._10,
    position: "relative",
  },
  loadingContainer: {
    position: "absolute",
    right: tokens.spacing._15,
    top: tokens.spacing._15,
    zIndex: 10,
  },
  label: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: 8,
  },
  buttonContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: tokens.spacing._10,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  button: {
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 100,
  },
  cancelButton: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: tokens.colors.bg3,
  },
  cancelButtonText: {
    color: tokens.colors.text_primary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: tokens.colors.primary,
    borderWidth: 1.5,
    borderColor: tokens.colors.primary,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonDisabled: {
    backgroundColor: tokens.colors.bg3,
    borderColor: tokens.colors.bg3,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.6,
  },
  saveButtonText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
  },
  saveButtonTextDisabled: {
    color: tokens.colors.text_secondary,
  },
  bottomSafeArea: {
    height: 34, // Safe area for devices with home indicator
  },
});

export default AddAgentBottomSheet;
