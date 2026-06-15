/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, ScrollView, Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";

import {
  SelectDeviceRoomFooter,
  SelectDeviceRoomOptions,
} from "@features/provision/components";
import {
  selectDeviceRoomScreenWrapperStyle,
  selectDeviceRoomStyles,
} from "@features/provision/theme";
import { useSelectDeviceRoom } from "@features/provision/hooks/useSelectDeviceRoom";
import { Header, ScreenWrapper } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import { globalStyles } from "@shared/theme/globalStyleSheet";

const styles = selectDeviceRoomStyles;

/** Second post-provision step: assign device to a room, then optional guide. */
const SelectDeviceRoom = () => {
  const { t } = useTranslation();
  const {
    rooms,
    selectedRoom,
    handleSelectRoom,
    handleOpenCreateRoom,
    handleFinish,
    handleSkip,
    isLoading,
    provisionedNode,
  } = useSelectDeviceRoom();

  const continueDisabled = isLoading || !selectedRoom;

  return (
    <>
      <Header
        label={t("device.deviceDetails.selectRoomTitle")}
        showBack
        rightSlot={
          provisionedNode ? (
            <Pressable
              {...testProps("button_skip_select_device_room")}
              onPress={handleSkip}
              disabled={isLoading}
              style={globalStyles.agentSettingsEditButtonContainer}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text
                style={[
                  globalStyles.agentSettingsEditButton,
                  isLoading && { opacity: 0.4 },
                ]}
              >
                {t("device.deviceDetails.skip")}
              </Text>
            </Pressable>
          ) : null
        }
        qaId="header_select_device_room"
      />
      <ScreenWrapper
        style={selectDeviceRoomScreenWrapperStyle}
        qaId="screen_wrapper_select_device_room"
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          {...testProps("scroll_view_select_device_room")}
        >
          <View {...testProps("view_select_device_room")} style={styles.content}>
            <SelectDeviceRoomOptions
              rooms={rooms}
              selectedRoom={selectedRoom}
              onSelectRoom={handleSelectRoom}
              onCreateRoom={handleOpenCreateRoom}
            />
          </View>
        </ScrollView>

        <SelectDeviceRoomFooter
          isLoading={isLoading}
          continueDisabled={continueDisabled}
          onContinue={handleFinish}
        />
      </ScreenWrapper>
    </>
  );
};

export default SelectDeviceRoom;
