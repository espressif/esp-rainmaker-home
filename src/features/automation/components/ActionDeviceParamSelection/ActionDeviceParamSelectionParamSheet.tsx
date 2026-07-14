/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Modal, Pressable, View, Text } from "react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ActionButton, ParamWrap } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import type { ESPCDFDeviceParam } from "@store";
import { actionDeviceParamSelectionStyles as styles } from "../../theme/actionDeviceParamSelectionStyles";

export interface ActionDeviceParamSelectionParamSheetProps {
  visible: boolean;
  selectedParam: ESPCDFDeviceParam | null;
  showDeleteButton: boolean;
  saveLabel: string;
  deleteLabel: string;
  onClose: () => void;
  onValueChange: (value: unknown) => void;
  onSave: () => void;
  onDelete: () => void;
  renderParamControl: (param: ESPCDFDeviceParam) => React.ReactNode;
}

/**
 * Renders the action device param selection param sheet UI section.
 */
export const ActionDeviceParamSelectionParamSheet: React.FC<
  ActionDeviceParamSelectionParamSheetProps
> = ({
  visible,
  selectedParam,
  showDeleteButton,
  saveLabel,
  deleteLabel,
  onClose,
  onValueChange,
  onSave,
  onDelete,
  renderParamControl,
}) => {
  return (
    <Modal
      {...testProps("modal_action_device_params_selection")}
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        {...testProps("button_close_action_device_params")}
        style={styles.modalContainer}
        onPress={onClose}
      >
        <Pressable
          {...testProps("content_action_device_params_selection")}
          style={styles.content}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={styles.handle}
            {...testProps("view_action_device_params_selection")}
          />

          <View
            style={styles.paramUIContainer}
            {...testProps("view_action_device_param_ui_selection")}
          >
            {selectedParam && (
              <ParamWrap
                key={`${selectedParam.name}-modal`}
                param={{ ...selectedParam } as ESPCDFDeviceParam}
                disabled={false}
                setUpdating={() => {}}
                onValueChange={(value) => onValueChange(value)}
                qaId={`action_device_param_${selectedParam.name}_selection`}
              >
                {renderParamControl(selectedParam)}
              </ParamWrap>
            )}
          </View>

          <View
            style={styles.actionButtonsContainer}
            {...testProps("view_action_device_params_selection")}
          >
            {showDeleteButton && (
              <ActionButton
                qaId="button_delete_action_device_params_selection"
                onPress={onDelete}
                variant="danger"
                style={styles.actionButton}
              >
                <Text
                  style={[globalStyles.fontMedium, globalStyles.textWhite]}
                  {...testProps("text_delete_action_device_params_selection")}
                >
                  {deleteLabel}
                </Text>
              </ActionButton>
            )}
            <ActionButton
              qaId="button_save_action_device_params_selection"
              onPress={onSave}
              variant="primary"
              style={styles.actionButton}
            >
              <Text
                style={[globalStyles.fontMedium, globalStyles.textWhite]}
                {...testProps("text_save_action_device_params_selection")}
              >
                {saveLabel}
              </Text>
            </ActionButton>
          </View>

          <View
            style={styles.bottomSafeArea}
            {...testProps("view_action_device_params_selection")}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};
