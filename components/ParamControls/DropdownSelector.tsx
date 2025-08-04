/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { View, Text, TouchableOpacity, Modal, FlatList } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { paramControlStyles as styles } from "./lib/styles";

// Icons
import { ChevronDown, Check } from "lucide-react-native";

// Types
import { ParamControlChildProps } from "./lib/types";
import { observer } from "mobx-react-lite";
import { globalStyles } from "@/theme/globalStyleSheet";

interface DropdownOption {
  label: string;
  value: string | number;
}

/**
 * DropdownSelector
 *
 * A dropdown component that allows selecting from a list of options.
 * Supports both string and numeric values, with optional validation bounds.
 *
 * @param param - The parameter object containing value, bounds, and setValue function
 * @param disabled - Optional flag to disable the control
 * @returns JSX component
 */
const DropdownSelector = observer(
  ({ label, value, onValueChange, disabled, meta }: ParamControlChildProps) => {
    // State
    const [isVisible, setIsVisible] = useState(false);

    // Computed values
    const options: DropdownOption[] =
      "validStrings" in meta && Array.isArray(meta.validStrings)
        ? meta.validStrings.map((str: string) => ({ label: str, value: str }))
        : Array.from({ length: meta.max - meta.min + 1 }, (_, i) => ({
            label: String(i + meta.min),
            value: i + meta.min,
          }));

    const selectedOption = options.find((option) => option.value === value);

    // Handlers
    const handleSelect = async (selectedValue: string | number) => {
      if (disabled || !onValueChange) return;
      onValueChange(null, selectedValue);
      setIsVisible(false);
    };

    const handleModalClose = () => {
      setIsVisible(false);
    };

    // Render helpers
    const renderOption = ({ item }: { item: DropdownOption }) => (
      <TouchableOpacity
        style={[
          styles.dropdownItem,
          item.value === value && styles.dropdownItemSelected,
        ]}
        onPress={() => handleSelect(item.value)}
      >
        <Text
          style={[
            styles.dropdownItemText,
            item.value === value && styles.dropdownItemTextSelected,
          ]}
        >
          {item.label}
        </Text>
        {item.value === value && <Check size={20} color={tokens.colors.blue} />}
      </TouchableOpacity>
    );

    // Render
    return (
      <>
        <TouchableOpacity
          style={[styles.container, disabled && styles.disabled]}
          onPress={() => !disabled && setIsVisible(true)}
          disabled={disabled}
        >
          <View style={styles.content}>
            <View style={styles.textContainer}>
              <Text style={styles.title}>{label}</Text>
              <Text style={styles.value}>
                {selectedOption?.label || "Select option"}
              </Text>
            </View>
            <ChevronDown size={20} color={tokens.colors.gray} />
          </View>
        </TouchableOpacity>

        <Modal
          visible={isVisible}
          transparent
          animationType="slide"
          onRequestClose={handleModalClose}
        >
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={handleModalClose}
          >
            <TouchableOpacity
              style={styles.modal}
              activeOpacity={1}
              onPress={() => {}}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{label}</Text>
                <TouchableOpacity onPress={handleModalClose}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={options}
                renderItem={renderOption}
                keyExtractor={(item) => item.value.toString()}
                style={styles.optionsList}
                showsVerticalScrollIndicator={true}
              />
              <View style={globalStyles.bottomSafeArea} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </>
    );
  }
);

export default DropdownSelector;
