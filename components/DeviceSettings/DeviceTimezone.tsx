/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TextInput,
} from "react-native";
import { ChevronDown, Search } from "lucide-react-native";
import { useTranslation } from "react-i18next";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import { ESPRMNode } from "@espressif/rainmaker-base-sdk";

// Utils
import { TIMEZONE_LIST, getNodeTimezoneConfig } from "@/utils/timezone";

// Hooks
import { useToast } from "@/hooks/useToast";

interface DeviceTimezoneProps {
  node: ESPRMNode;
  disabled?: boolean;
}

/**
 * DeviceTimezone Component
 *
 * Displays and manages the device timezone setting as a row in device info.
 * Shows a dropdown modal with searchable timezone list.
 * Only renders if the node has esp.service.time service with esp.param.tz parameter
 * that has both read and write permissions.
 *
 * Features:
 * - Timezone selection via searchable dropdown modal
 * - Displays current timezone
 * - Updates timezone on device
 * - Loading state during update
 * - Cached and filtered timezone list
 *
 * @param props - Component properties for timezone management
 */
const DeviceTimezone: React.FC<DeviceTimezoneProps> = ({ node, disabled }) => {
  const { t } = useTranslation();
  const toast = useToast();

  // State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentTimezone, setCurrentTimezone] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Memoize timezone configuration to avoid recalculating on every render
  const { timeService, timezoneParam, hasWritePermission } = useMemo(
    () => getNodeTimezoneConfig(node),
    [node]
  );

  // Don't render if service or param doesn't exist or doesn't have read permission
  if (!timeService || !timezoneParam) {
    return null;
  }

  // Memoize whether timezone is editable to avoid unnecessary recalculations
  const isEditable = useMemo(
    () => hasWritePermission && !disabled,
    [hasWritePermission, disabled]
  );

  // Initialize current timezone from param value
  useEffect(() => {
    if (timezoneParam?.value) {
      setCurrentTimezone(timezoneParam.value as string);
    }
  }, [timezoneParam?.value]);

  /**
   * Handles modal close and resets search
   */
  const handleModalClose = () => {
    setIsModalVisible(false);
    setSearchQuery("");
  };

  /**
   * Handles timezone selection and updates the device
   */
  const handleTimezoneSelect = async (timezone: string) => {
    if (!isEditable || !timeService || !timezoneParam) return;

    // Optimization: Skip API call if the selected timezone is already the current one
    if (timezone === currentTimezone) {
      handleModalClose();
      return;
    }

    setIsUpdating(true);
    handleModalClose();

    try {
      await node?.setTimeZone(timezone);
      timezoneParam.value = timezone;
      setCurrentTimezone(timezone);
      toast.showSuccess(t("device.settings.timezoneUpdatedSuccess"));
    } catch (error) {
      toast.showError(t("device.errors.failedToUpdateTimezone"));
    } finally {
      setIsUpdating(false);
    }
  };

  /**
   * Cache and filter timezone list based on search query
   * useMemo ensures the filtered list is only recalculated when searchQuery changes
   */
  const filteredTimezones = useMemo(() => {
    if (!searchQuery.trim()) {
      return TIMEZONE_LIST;
    }
    const query = searchQuery.toLowerCase();
    return TIMEZONE_LIST.filter((tz) => tz.toLowerCase().includes(query));
  }, [searchQuery]);

  /**
   * Renders individual timezone option in dropdown
   */
  const renderTimezoneOption = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[
        globalStyles.dropdownItem,
        item === currentTimezone && globalStyles.dropdownItemSelected,
      ]}
      onPress={() => handleTimezoneSelect(item)}
    >
      <Text
        style={[
          globalStyles.dropdownItemText,
          item === currentTimezone && globalStyles.dropdownItemTextSelected,
        ]}
      >
        {item}
      </Text>
    </TouchableOpacity>
  );

  // If read-only (no write permission), display as static text
  if (!hasWritePermission && currentTimezone) {
    return (
      <View style={globalStyles.infoRow}>
        <Text style={globalStyles.infoLabel}>
          {t("device.settings.timezoneTitle")}:
        </Text>
        <Text style={styles.timezoneValue}>{currentTimezone}</Text>
      </View>
    );
  }

  // If writable, show editable dropdown
  return (
    <>
      <View style={globalStyles.infoRow}>
        <Text style={globalStyles.infoLabel}>
          {t("device.settings.timezoneTitle")}:
        </Text>
        <TouchableOpacity
          style={[
            styles.timezoneValueContainer,
            (!isEditable || isUpdating) && styles.disabled,
          ]}
          onPress={() => isEditable && !isUpdating && setIsModalVisible(true)}
          disabled={!isEditable || isUpdating}
        >
          <Text style={styles.timezoneValue}>
            {currentTimezone || t("device.settings.selectTimezone")}
          </Text>
          {isUpdating ? (
            <ActivityIndicator size="small" color={tokens.colors.primary} />
          ) : (
            <ChevronDown size={16} color={tokens.colors.text_secondary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Timezone Selection Modal */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleModalClose}
      >
        <TouchableOpacity
          style={globalStyles.dropdownOverlay}
          activeOpacity={1}
          onPress={handleModalClose}
        >
          <TouchableOpacity
            style={globalStyles.dropdownModal}
            activeOpacity={1}
            onPress={() => {}}
          >
            {/* Search Input */}
            <View style={globalStyles.dropdownSearchContainer}>
              <Search size={20} color={tokens.colors.text_secondary} />
              <TextInput
                style={globalStyles.dropdownSearchInput}
                placeholder={t("device.settings.searchTimezone")}
                placeholderTextColor={tokens.colors.text_secondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Text style={globalStyles.dropdownClearButton}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Timezone List */}
            <FlatList
              data={filteredTimezones}
              renderItem={renderTimezoneOption}
              keyExtractor={(item) => item}
              style={globalStyles.dropdownList}
              showsVerticalScrollIndicator={true}
              ListEmptyComponent={
                <View style={globalStyles.dropdownEmptyState}>
                  <Text style={globalStyles.dropdownEmptyStateText}>
                    {t("device.settings.noTimezonesFound")}
                  </Text>
                </View>
              }
            />
            <View style={globalStyles.bottomSafeArea} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  timezoneValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
  },
  timezoneValue: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.black,
    fontFamily: tokens.fonts.medium,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default DeviceTimezone;
