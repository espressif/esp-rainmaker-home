/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
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
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Edit3, Save, X } from "lucide-react-native";
import { useToast } from "@/hooks/useToast";
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";
import { paramControlStyles as styles } from "@/components/ParamControls/lib/styles";
import { ChartHeaderProps } from "@/types/global";

/**
 * ChartHeader component
 *
 * - Shows only the parameter label and edit icon (no current value displayed)
 * - Handles value update logic internally with loading state
 * - Converts numeric values appropriately before calling param.setValue
 */
const ChartHeader = ({
  label,
  param,
  isWriteable = false,
  disabled = false,
}: ChartHeaderProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();

  // Computed values
  const canEdit = !!param && isWriteable && !disabled;

  /**
   * Handles edit button press - opens modal with current value
   */
  const handleEditPress = () => {
    if (!canEdit) return;

    const currentValue =
      param && param.value !== undefined && param.value !== null
        ? String(param.value)
        : "";

    setTempValue(currentValue);
    setIsEditing(true);
  };

  /**
   * Handles cancel action - closes modal and resets temp value
   */
  const handleCancel = () => {
    setIsEditing(false);
    setTempValue("");
  };

  /**
   * Handles save action - converts value to appropriate type and updates parameter
   * @throws {Error} If value conversion fails or update fails
   */
  const handleSave = async () => {
    if (!param || !isWriteable) {
      toast.showError(
        t("device.chart.failedToUpdateValue"),
        t("device.chart.updateError")
      );
      return;
    }

    setIsSaving(true);
    try {
      // Convert string to appropriate type based on param type
      let convertedValue: any = tempValue;
      if (typeof param.value === "number") {
        convertedValue = parseFloat(tempValue);
        if (isNaN(convertedValue)) {
          throw new Error("Invalid number format");
        }
      }

      await (param as any).setValue(convertedValue);
      toast.showSuccess(
        t("device.chart.valueUpdated"),
        t("device.chart.valueUpdatedSuccessfully")
      );
      setIsEditing(false);
    } catch (error: any) {
      toast.showError(
        t("device.chart.failedToUpdateValue"),
        error?.message || t("device.chart.updateError")
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={globalStyles.selectedPointContainer}
        onPress={handleEditPress}
        disabled={!canEdit}
        activeOpacity={canEdit ? 0.7 : 1}
      >
        <View style={globalStyles.selectedPointContent}>
          <Text style={globalStyles.selectedPointLabel}>{label}</Text>
          {canEdit && (
            <Edit3 size={tokens.fontSize.md} color={tokens.colors.gray} />
          )}
        </View>
      </TouchableOpacity>

      <Modal
        visible={isEditing}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <Pressable style={styles.overlay} onPress={handleCancel}>
          <Pressable
            style={[
              globalStyles.selectedPointModal,
              { paddingBottom: Math.max(insets.bottom, tokens.spacing._20) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={globalStyles.selectedPointModalContent}>
              <View style={globalStyles.selectedPointModalBody}>
                <Text style={styles.modalTitle}>{label}</Text>

                <RNTextInput
                  style={styles.textInput}
                  value={tempValue}
                  onChangeText={setTempValue}
                  placeholder={t(
                    "device.chart.chartHeader.enterValue"
                  )}
                  autoFocus
                  selectTextOnFocus
                  editable={!isSaving}
                />
              </View>

              <View style={globalStyles.selectedPointModalButtonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleCancel}
                  disabled={isSaving}
                >
                  <X size={20} color={tokens.colors.gray} />
                  <Text style={styles.cancelButtonText}>
                    {t("device.chart.chartHeader.cancel")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator
                      size="small"
                      color={tokens.colors.white}
                    />
                  ) : (
                    <Save size={20} color={tokens.colors.white} />
                  )}
                  <Text style={styles.saveButtonText}>
                    {isSaving
                      ? t("device.chart.chartHeader.saving")
                      : t("device.chart.chartHeader.save")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

export default ChartHeader;
