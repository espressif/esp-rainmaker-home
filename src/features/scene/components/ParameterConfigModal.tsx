/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import { useCallback, useRef } from "react";
import { View, Modal, Pressable, StyleSheet } from "react-native";
import { ParamWrap } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import type { ESPCDFDeviceParam } from "@store";
import ParameterControl from "./ParameterControl";
import ParameterModalActions from "./ParameterModalActions";
import BottomSheetHandle from "./BottomSheetHandle";

type ParameterConfigModalProps = {
  visible: boolean;
  param: ESPCDFDeviceParam | null;
  showDelete: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onValueChange: (value: any) => void;
};

/**
 * ParameterConfigModal Component
 *
 * Reusable bottom sheet modal for configuring device parameters
 * Used in scene, automation, and schedule parameter selection screens
 * @param visible - Whether the modal is visible
 * @param param - The parameter being configured
 * @param showDelete - Whether to show the delete button
 * @param onClose - Handler for closing the modal
 * @param onSave - Handler for saving the parameter value
 * @param onDelete - Handler for deleting the parameter value
 * @param onValueChange - Handler for parameter value changes
 */
export default function ParameterConfigModal({
  visible,
  param,
  showDelete,
  onClose,
  onSave,
  onDelete,
  onValueChange,
}: ParameterConfigModalProps) {
  // Prevent multiple rapid presses
  const isProcessingRef = useRef(false);

  const handleBackdropPress = useCallback(() => {
    if (!isProcessingRef.current) {
      isProcessingRef.current = true;
      onClose();
      // Reset after animation completes
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 300);
    }
  }, [onClose]);

  const handleContentPress = useCallback((e: any) => {
    e.stopPropagation();
  }, []);

  const handleSave = useCallback(() => {
    if (!isProcessingRef.current) {
      isProcessingRef.current = true;
      onSave();
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 300);
    }
  }, [onSave]);

  const handleDelete = useCallback(() => {
    if (!isProcessingRef.current) {
      isProcessingRef.current = true;
      onDelete();
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 300);
    }
  }, [onDelete]);

  const handleValueChange = useCallback(
    (value: any) => {
      onValueChange(value);
    },
    [onValueChange],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleBackdropPress}
      {...testProps("modal_device_params_selection")}
    >
      <Pressable
        style={styles.modalContainer}
        {...testProps("button_close_device_params")}
        onPress={handleBackdropPress}
      >
        <Pressable
          {...testProps("content_device_params_selection")}
          style={styles.content}
          onPress={handleContentPress}
        >
          <BottomSheetHandle />

          {/* Parameter UI */}
          <View
            {...testProps("view_device_param_ui_selection")}
            style={styles.paramUIContainer}
          >
            {param && (
              <ParamWrap
                key={`${param.name}-modal`}
                param={{ ...param } as ESPCDFDeviceParam}
                disabled={false}
                setUpdating={() => {}}
                onValueChange={handleValueChange}
                qaId={`device_param_${param.name}_selection`}
              >
                <ParameterControl param={param} />
              </ParamWrap>
            )}
          </View>

          {/* Action Buttons */}
          <ParameterModalActions
            showDelete={showDelete}
            onSave={handleSave}
            onDelete={handleDelete}
          />

          {/* Bottom safe area */}
          <View
            style={styles.bottomSafeArea}
            {...testProps("view_device_params_selection")}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: "80%",
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
  paramUIContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  bottomSafeArea: {
    height: 34,
  },
});
