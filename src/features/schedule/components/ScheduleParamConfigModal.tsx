/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Modal, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ActionButton, ParamWrap } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import type { ESPCDFDeviceParam } from "@store";
import ParameterControl from "@features/scene/components/ParameterControl";

type ParamWithValue = ESPCDFDeviceParam & { value: any };

interface ScheduleParamConfigModalProps {
  visible: boolean;
  selectedParam: ParamWithValue | null;
  hasActionForParam: (paramName: string) => boolean;
  onClose: () => void;
  onValueChange: (value: any) => void;
  onSave: () => void;
  onDelete: () => void;
}

/**
 * ScheduleParamConfigModal Component
 *
 * Bottom sheet modal for configuring device parameters.
 */
export const ScheduleParamConfigModal = ({
  visible,
  selectedParam,
  hasActionForParam,
  onClose,
  onValueChange,
  onSave,
  onDelete,
}: ScheduleParamConfigModalProps) => {
  const { t } = useTranslation();

  return (
    <Modal
      {...testProps("modal_schedule_device_params_selection")}
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        {...testProps("button_close_schedule_device_params")}
        style={globalStyles.scheduleParamModalContainer}
        onPress={onClose}
      >
        <Pressable
          {...testProps("content_schedule_device_params_selection")}
          style={globalStyles.scheduleParamModalContent}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <View
            style={globalStyles.scheduleParamModalHandle}
            {...testProps("view_schedule_device_params_selection")}
          />

          {/* Parameter UI */}
          <View
            {...testProps("view_schedule_device_param_ui_selection")}
            style={globalStyles.scheduleParamModalUIContainer}
          >
            {selectedParam && (
              <ParamWrap
                key={`${selectedParam.name}-modal`}
                param={selectedParam as any}
                disabled={false}
                setUpdating={() => {}}
                onValueChange={(value) => onValueChange(value)}
                qaId={`schedule_param_${selectedParam.name}_selection`}
              >
                <ParameterControl param={selectedParam as ESPCDFDeviceParam} />
              </ParamWrap>
            )}
          </View>

          {/* Action Buttons */}
          <View
            style={globalStyles.scheduleParamModalActionButtonsContainer}
            {...testProps("view_schedule_device_params_selection")}
          >
            {hasActionForParam(selectedParam?.name || "") && (
              <ActionButton
                onPress={onDelete}
                variant="danger"
                style={globalStyles.scheduleParamModalActionButton}
                qaId="button_delete_schedule_device_params_selection"
              >
                <Text
                  {...testProps("text_delete_schedule_device_params_selection")}
                  style={[globalStyles.fontMedium, globalStyles.textWhite]}
                >
                  {t("layout.shared.delete")}
                </Text>
              </ActionButton>
            )}
            <ActionButton
              onPress={onSave}
              variant="primary"
              style={globalStyles.scheduleParamModalActionButton}
              qaId="button_save_schedule_device_params_selection"
            >
              <Text
                {...testProps("text_save_schedule_device_params_selection")}
                style={[globalStyles.fontMedium, globalStyles.textWhite]}
              >
                {t("layout.shared.save")}
              </Text>
            </ActionButton>
          </View>

          {/* Bottom safe area */}
          <View style={globalStyles.scheduleParamModalBottomSafeArea} />
        </Pressable>
      </Pressable>
    </Modal>
  );
};
