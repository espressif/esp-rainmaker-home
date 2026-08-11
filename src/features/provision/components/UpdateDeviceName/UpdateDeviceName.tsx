/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useRef } from "react";
import { View, Image, Pressable, TextInput } from "react-native";
import { Edit3 } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { updateDeviceNameStyles } from "@features/provision/theme";
import { getDeviceImage } from "@shared/utils/device";
import { Input } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import type { ESPCDFDevice } from "@store";

type Styles = typeof updateDeviceNameStyles;

export interface UpdateDeviceNameSectionProps {
  /** Style sheet from `updateDeviceNameStyles`. */
  styles: Styles;
  devices: ESPCDFDevice[];
  provisionedNodeId: string | undefined;
  getDeviceName: (deviceNameKey: string) => string;
  setDeviceName: (deviceNameKey: string, name: string) => void;
}

/**
 * Editable device name(s): one row per device in `devices` (single- or multi-device nodes).
 * Placeholder copy comes from `device.deviceDetails.enterName` (i18n).
 */
export const UpdateDeviceNameSection: React.FC<UpdateDeviceNameSectionProps> = ({
  styles,
  devices,
  provisionedNodeId,
  getDeviceName,
  setDeviceName,
}) => {
  const { t } = useTranslation();

  // One TextInput handle per row, keyed by device name, so the row's pencil
  // knows which field to focus. Callback refs clear themselves to null on
  // unmount, so removed devices leave nothing stale behind.
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const focusDeviceNameInput = useCallback((deviceNameKey: string) => {
    inputRefs.current[deviceNameKey]?.focus();
  }, []);

  return (
    <View style={styles.nameSection} {...testProps("view_name_section")}>
      {devices.map((d, index) => {
        const isLast = index === devices.length - 1;
        return (
          <View
            key={d.name}
            style={[styles.inputRow, isLast && styles.inputRowLast]}
            {...testProps("row_device_name_name")}
          >
            <Image
              {...testProps("image_device_name")}
              source={getDeviceImage(d.type, true)}
              style={styles.rowDeviceImage}
              resizeMode="contain"
            />
            <View style={styles.inputInRow}>
              <View style={styles.nameInputRow}>
                <View style={styles.nameInputWrapper}>
                  <Input
                    key={`${provisionedNodeId ?? "node"}-${d.name}`}
                    ref={(node) => {
                      inputRefs.current[d.name] = node;
                    }}
                    value={getDeviceName(d.name)}
                    placeholder={t("device.deviceDetails.enterName")}
                    onFieldChange={(val) => setDeviceName(d.name, val)}
                    border={false}
                    marginBottom={false}
                    qaId="device_name"
                  />
                </View>
                <Pressable
                  style={styles.nameEditIcon}
                  onPress={() => focusDeviceNameInput(d.name)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("layout.shared.edit")}
                  {...testProps("icon_edit_device_name")}
                >
                  <Edit3 size={20} color={tokens.colors.text_secondary} />
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};
