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
import type { EventConditionOption } from "@features/automation/utils/eventDeviceParamSelection";
import { eventDeviceParamSelectionStyles as styles } from "../../theme/eventDeviceParamSelectionStyles";

export interface EventDeviceParamSelectionParamSheetProps {
  visible: boolean;
  selectedParam: ESPCDFDeviceParam | null;
  eventCondition: string;
  conditionOptions: EventConditionOption[];
  showConditionSelector: boolean;
  conditionLabel: string;
  saveLabel: string;
  onClose: () => void;
  onValueChange: (value: unknown) => void;
  onConditionChange: (value: string) => void;
  onSave: () => void;
  renderParamControl: (param: ESPCDFDeviceParam) => React.ReactNode;
}

/**
 * Renders the event device param selection param sheet UI section.
 */
export const EventDeviceParamSelectionParamSheet: React.FC<
  EventDeviceParamSelectionParamSheetProps
> = ({
  visible,
  selectedParam,
  eventCondition,
  conditionOptions,
  showConditionSelector,
  conditionLabel,
  saveLabel,
  onClose,
  onValueChange,
  onConditionChange,
  onSave,
  renderParamControl,
}) => {
  const visibleConditions = conditionOptions.filter(
    (c) => c.isVisible === true,
  );

  return (
    <Modal
      {...testProps("modal_event_device_param_selection")}
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        {...testProps("button_event_device_param_selection")}
        style={styles.modalContainer}
        onPress={onClose}
      >
        <Pressable
          {...testProps("content_event_device_param_selection")}
          style={styles.content}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <View
            {...testProps("view_event_device_param_selection")}
            style={styles.paramUIContainer}
          >
            {selectedParam && (
              <ParamWrap
                key={`${selectedParam.name}-modal`}
                param={{ ...selectedParam } as ESPCDFDeviceParam}
                disabled={false}
                setUpdating={() => {}}
                onValueChange={(value) => onValueChange(value)}
                qaId={`event_device_param_${selectedParam.name}_selection`}
              >
                {renderParamControl(selectedParam)}
              </ParamWrap>
            )}
          </View>

          {showConditionSelector && (
            <View style={styles.conditionContainer}>
              <Text style={styles.conditionLabel}>{conditionLabel}</Text>
              <View style={styles.conditionButtons}>
                {visibleConditions.map((condition) => (
                  <Pressable
                    key={condition.value}
                    {...testProps(`button_event_condition_${condition.value}`)}
                    style={[
                      styles.conditionButton,
                      eventCondition === condition.value &&
                        styles.conditionButtonActive,
                    ]}
                    onPress={() => onConditionChange(condition.value)}
                  >
                    <Text
                      style={[
                        styles.conditionButtonText,
                        eventCondition === condition.value &&
                          styles.conditionButtonTextActive,
                      ]}
                    >
                      {condition.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.actionButtonsContainer}>
            <ActionButton
              qaId="button_save_event_device_param_selection"
              onPress={onSave}
              variant="primary"
              style={styles.actionButton}
            >
              <Text
                {...testProps("text_save_event_device_param_selection")}
                style={[globalStyles.fontMedium, globalStyles.textWhite]}
              >
                {saveLabel}
              </Text>
            </ActionButton>
          </View>

          <View style={styles.bottomSafeArea} />
        </Pressable>
      </Pressable>
    </Modal>
  );
};
