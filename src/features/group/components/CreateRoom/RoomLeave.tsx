/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

// Components
import { DangerButton, ConfirmationDialog } from "@shared/components";

// Styles
import { tokens } from "@shared/theme/tokens";
import { RoomLeaveProps } from "@src/types/global";

/**
 * RoomLeave Component
 *
 * Lets a room-shared (subgroup-access) user leave the room, with a
 * confirmation dialog. Shown only to subgroup-only viewers — primary and
 * secondary users manage rooms via delete instead of leave.
 * @param props - Component properties for the leave-room action
 */
const RoomLeave: React.FC<RoomLeaveProps> = ({
  onLeave,
  isLoading,
  showLeave,
  setShowLeave,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <DangerButton
        icon={
          <Ionicons
            name="exit-outline"
            size={20}
            color={tokens.colors.red}
          />
        }
        title={t("group.createRoom.leaveRoomButton")}
        onPress={() => setShowLeave(true)}
        qaId="leave_room"
      />

      <ConfirmationDialog
        open={showLeave}
        title={t("group.createRoom.confirmLeaveRoomTitle")}
        description={t("group.createRoom.confirmLeaveRoomMessage")}
        confirmText={t("layout.shared.leave")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={onLeave}
        onCancel={() => {
          setShowLeave(false);
        }}
        confirmColor={tokens.colors.red}
        isLoading={isLoading}
        qaId="leave_room"
      />
    </>
  );
};

export default RoomLeave;
