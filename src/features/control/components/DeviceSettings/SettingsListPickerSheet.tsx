/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  type GestureResponderEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, Plus, X } from "lucide-react-native";

import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import type { SettingsPickerOption } from "@features/control/utils/deviceAssignmentHelpers";

export interface SettingsListPickerSheetProps {
  /** Whether the bottom sheet is visible. */
  visible: boolean;
  /** Sheet title (e.g. "Select a room"). */
  title: string;
  /** Optional subtitle (multi-endpoint hint). */
  subtitle?: string;
  /** Options to pick from. */
  options: SettingsPickerOption[];
  /** Currently selected option id, if any. */
  selectedId?: string;
  /** Closes the sheet without applying a change. */
  onClose: () => void;
  /** Called when the user picks an option. */
  onSelect: (optionId: string) => void;
  /** Id of the option currently being saved; other rows stay visible but disabled. */
  loadingId?: string | null;
  /** Label for the create-new row (e.g. "Create new room"). */
  createNewLabel?: string;
  /** Opens the create flow for a new room or control group. */
  onCreateNew?: () => void;
  /** Centered message when there are no selectable options (e.g. ineligible device). */
  emptyStateMessage?: string;
}

/**
 * Bottom-sheet picker for device settings lists (rooms, control groups).
 * Uses chip-style option rows from the shared settings theme.
 * @param props - Sheet visibility, options, and selection handlers
 */
export const SettingsListPickerSheet = ({
  visible,
  title,
  subtitle,
  options,
  selectedId,
  onClose,
  onSelect,
  loadingId = null,
  createNewLabel,
  onCreateNew,
  emptyStateMessage,
}: SettingsListPickerSheetProps) => {
  const { t } = useTranslation();
  const isBusy = Boolean(loadingId);
  const hasExistingOptions = options.length > 0;
  const showCreateRow = Boolean(createNewLabel && onCreateNew);
  const isCreateOnlyEmptyState = !hasExistingOptions && showCreateRow;
  const showCenteredEmptyState = Boolean(
    emptyStateMessage && !hasExistingOptions && !showCreateRow,
  );
  const showHeaderTitle = !isCreateOnlyEmptyState;

  /**
   * Prevents backdrop presses from bubbling through sheet content.
   * @param event - Press event from sheet content
   */
  const handleContentPress = (event: GestureResponderEvent) => {
    event.stopPropagation();
  };

  /**
   * Renders one selectable chip row in the picker list.
   * @param item - Picker option to render
   */
  const renderOption = (item: SettingsPickerOption) => {
    const isThisLoading = loadingId === item.id;
    const isSelected = item.id === selectedId;

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          globalStyles.settingsOptionChip,
          isSelected && globalStyles.settingsOptionChipSelected,
          isBusy && !isThisLoading && globalStyles.settingsOptionChipDisabled,
        ]}
        onPress={() => onSelect(item.id)}
        disabled={isBusy}
      >
        <Text
          style={[
            globalStyles.settingsOptionChipLabel,
            isSelected && globalStyles.settingsOptionChipLabelSelected,
          ]}
        >
          {item.label}
        </Text>
        {isThisLoading ? (
          <ActivityIndicator size="small" color={tokens.colors.primary} />
        ) : isSelected ? (
          <Check size={18} color={tokens.colors.primary} />
        ) : null}
      </TouchableOpacity>
    );
  };

  /**
   * Renders the create-new action as the first row in the picker.
   */
  const renderCreateRow = () => {
    if (!showCreateRow) {
      return null;
    }

    return (
      <Pressable
        style={[
          globalStyles.settingsPickerCreateRow,
          hasExistingOptions && globalStyles.settingsPickerCreateRowBeforeList,
        ]}
        onPress={onCreateNew}
        disabled={isBusy}
      >
        <Plus size={20} color={tokens.colors.primary} />
        <Text style={globalStyles.settingsPickerCreateRowText}>
          {createNewLabel}
        </Text>
        <ChevronRight size={20} color={tokens.colors.text_secondary} />
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={isBusy ? undefined : onClose}
    >
      <Pressable
        style={globalStyles.drawerOverlay}
        onPress={isBusy ? undefined : onClose}
      >
        <Pressable
          style={globalStyles.settingsPickerDrawer}
          onPress={handleContentPress}
        >
          <View style={globalStyles.drawerHandle} />

          <View style={globalStyles.settingsPickerDrawerHeader}>
            {showHeaderTitle ? (
              <View style={globalStyles.settingsPickerDrawerHeaderText}>
                <Text style={globalStyles.settingsPickerDrawerTitle}>{title}</Text>
                {subtitle ? (
                  <Text style={globalStyles.settingsPickerDrawerSubtitle}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={globalStyles.settingsPickerDrawerHeaderText} />
            )}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              disabled={isBusy}
            >
              <X size={20} color={tokens.colors.text_secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={globalStyles.settingsPickerDrawerList}
            contentContainerStyle={
              showCenteredEmptyState
                ? globalStyles.settingsPickerDrawerEmptyState
                : globalStyles.settingsPickerDrawerOptions
            }
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {showCenteredEmptyState ? (
              <Text style={globalStyles.settingsPickerDrawerEmptyStateText}>
                {emptyStateMessage}
              </Text>
            ) : null}

            {!hasExistingOptions && !showCreateRow && !showCenteredEmptyState ? (
              <Text style={globalStyles.settingsOptionEmptyText}>
                {t("device.settings.pickerNoOptions")}
              </Text>
            ) : null}

            {renderCreateRow()}

            {hasExistingOptions ? options.map((item) => renderOption(item)) : null}
          </ScrollView>

          <View style={globalStyles.bottomSafeArea} />
        </Pressable>
      </Pressable>
    </Modal>
  );
};
