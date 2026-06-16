/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronRight, Plus } from "lucide-react-native";

import {
  selectDeviceRoomIconColors,
  selectDeviceRoomStyles,
} from "@features/provision/theme";
import { testProps } from "@shared/utils/testProps";
import type { ESPCDFGroup } from "@store";

const styles = selectDeviceRoomStyles;

export interface SelectDeviceRoomOptionsProps {
  /** Rooms the user can assign the device to. */
  rooms: ESPCDFGroup[];
  /** Currently selected room, if any. */
  selectedRoom: ESPCDFGroup | null;
  /** Called when the user picks a room row. */
  onSelectRoom: (room: ESPCDFGroup) => void;
  /** Called when the user chooses “create a new room”. */
  onCreateRoom: () => void;
}

/**
 * “Select a room” section: list of existing rooms, empty hint, and create-room row.
 */
export const SelectDeviceRoomOptions = ({
  rooms,
  selectedRoom,
  onSelectRoom,
  onCreateRoom,
}: SelectDeviceRoomOptionsProps) => {
  const { t } = useTranslation();
  const hasExistingRooms = rooms.length > 0;

  return (
    <>
      <Text style={styles.sectionTitle} {...testProps("text_title_select_a_room")}>
        {t("device.deviceDetails.selectARoom")}
      </Text>
      {!hasExistingRooms && (
        <Text style={styles.emptyHint} {...testProps("text_no_rooms_available")}>
          {t("device.deviceDetails.noRoomsAvailable")}
        </Text>
      )}

      {hasExistingRooms &&
        rooms.map((room: ESPCDFGroup) => (
          <Pressable
            key={room.id}
            {...testProps("button_room_name")}
            style={[
              styles.roomRow,
              selectedRoom?.id === room.id && styles.roomRowSelected,
            ]}
            onPress={() => onSelectRoom(room)}
          >
            <Text
              style={[
                styles.roomRowText,
                selectedRoom?.id === room.id && styles.roomRowTextSelected,
              ]}
              {...testProps("text_room_name")}
            >
              {room.name}
            </Text>
          </Pressable>
        ))}

      <Pressable
        {...testProps("button_create_new_room")}
        style={[
          styles.createRoomRow,
          hasExistingRooms && styles.createRoomRowAfterList,
        ]}
        onPress={onCreateRoom}
      >
        <Plus
          size={20}
          color={selectDeviceRoomIconColors.createRoomPlus}
        />
        <Text style={styles.createRoomRowText} {...testProps("text_create_new_room")} >
          {t("device.deviceDetails.createRoomAction")}
        </Text>
        <ChevronRight
          size={20}
          color={selectDeviceRoomIconColors.chevron}
        />
      </Pressable>
    </>
  );
};
