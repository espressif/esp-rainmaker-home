/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput as RNTextInput,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { paramControlStyles as styles } from "./lib/styles";

// Icons
import { Edit3, Save, X } from "lucide-react-native";

// Types
import { ParamControlChildProps } from "./lib/types";
import { observer } from "mobx-react-lite";

/**
 * TextInput
 *
 * A text input component with modal editing interface.
 * Allows users to view and edit text values with character limit support.
 *
 * @param param - The parameter object containing value, bounds, and setValue function
 * @param disabled - Optional flag to disable the control
 * @returns JSX component
 */
const TextInput = observer(
  ({ label, value, onValueChange, disabled, meta }: ParamControlChildProps) => {
    // State
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(String(value || ""));

    // Computed values
    const maxLength = meta?.maxLength ?? 50;

    // Handlers
    const handleEdit = () => {
      if (disabled) return;
      setTempValue(String(value || ""));
      setIsEditing(true);
    };

    const handleSave = async () => {
      onValueChange?.(null, tempValue);
      setIsEditing(false);
    };

    const handleCancel = () => {
      setTempValue(String(value || ""));
      setIsEditing(false);
    };

    // Render
    return (
      <>
        <TouchableOpacity
          style={[styles.container, disabled && styles.disabled]}
          onPress={handleEdit}
          disabled={disabled}
        >
          <View style={styles.content}>
            <View style={styles.textContainer}>
              <Text style={styles.title}>{label}</Text>
              <Text style={styles.value} numberOfLines={1}>
                {value || "Enter text"}
              </Text>
            </View>
            <Edit3 size={20} color={tokens.colors.gray} />
          </View>
        </TouchableOpacity>

        <Modal
          visible={isEditing}
          transparent
          animationType="fade"
          onRequestClose={handleCancel}
        >
          <View style={styles.overlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{label}</Text>

              <RNTextInput
                style={styles.textInput}
                value={tempValue}
                onChangeText={setTempValue}
                placeholder="Enter text"
                maxLength={maxLength}
                autoFocus
                selectTextOnFocus
              />

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleCancel}
                >
                  <X size={20} color={tokens.colors.gray} />
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={handleSave}
                >
                  <Save size={20} color={tokens.colors.white} />
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }
);

export default TextInput;
