/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Hooks
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

// Icons
import { Circle, Check } from "lucide-react-native";

// Components
import { Header, ContentWrapper, ScreenWrapper, Input } from "@/components";

// Types
import { RoomType } from "@/types/global";

/**
 * CustomizeRoomName Component
 *
 * Allows users to select a predefined room name or create a custom one.
 * Features:
 * - List of predefined room names
 * - Custom room name input
 * - Selection indicator for chosen room
 * - Confirmation button to save selection
 */
const CustomizeRoomName = () => {
  // Hooks
  const { t } = useTranslation();
  const router = useRouter();
  const { currentRoomName, id, roomId } = useLocalSearchParams();

  // State
  const [selectedRoom, setSelectedRoom] = useState("");
  const [roomName, setRoomName] = useState("");

  const getSelectionIcon = (isSelected: boolean) => {
    if (isSelected) {
      return <Check size={20} color={tokens.colors.blue} strokeWidth={3} />;
    } else {
      return <Circle size={20} color={tokens.colors.primary} fill="transparent" />;
    }
  };

  // Constants
  const predefinedRooms: RoomType[] = [
    { key: "bedroom", label: t("group.customizeRoomName.roomNames.bedroom") },
    {
      key: "livingRoom",
      label: t("group.customizeRoomName.roomNames.livingRoom"),
    },
    {
      key: "readingRoom",
      label: t("group.customizeRoomName.roomNames.readingRoom"),
    },
    {
      key: "frontYard",
      label: t("group.customizeRoomName.roomNames.frontYard"),
    },
    { key: "backYard", label: t("group.customizeRoomName.roomNames.backYard") },
    {
      key: "familyRoom",
      label: t("group.customizeRoomName.roomNames.familyRoom"),
    },
    {
      key: "diningRoom",
      label: t("group.customizeRoomName.roomNames.diningRoom"),
    },
    { key: "basement", label: t("group.customizeRoomName.roomNames.basement") },
    { key: "lounge", label: t("group.customizeRoomName.roomNames.lounge") },
    {
      key: "christmasLights",
      label: t("group.customizeRoomName.roomNames.christmasLights"),
    },
    {
      key: "outdoorLights",
      label: t("group.customizeRoomName.roomNames.outdoorLights"),
    },
    { key: "kitchen", label: t("group.customizeRoomName.roomNames.kitchen") },
    { key: "toilet", label: t("group.customizeRoomName.roomNames.toilet") },
  ];

  // Effects
  /**
   * Effect to update the room name and selected room when the current room name changes
   */
  useEffect(() => {
    if (currentRoomName) {
      // Check if it matches a predefined room
      const roomNameStr = Array.isArray(currentRoomName)
        ? currentRoomName[0]
        : currentRoomName;
      const isPredefined = predefinedRooms.find(
        (room) => room.label === roomNameStr
      );
      if (isPredefined) {
        setSelectedRoom(roomNameStr);
      } else {
        // Set as custom room name
        setRoomName(roomNameStr);
      }
    }
  }, [currentRoomName]);

  // Handlers
  /**
   * Handles the confirmation of the selected room name
   */
  const handleConfirm = () => {
    // Send back the selected room name or custom name
    // Priority: custom room name if entered, otherwise selected room
    const finalRoomName = roomName.trim() || selectedRoom;
    if (finalRoomName) {
      // Replace current screen with CreateRoom and parameters
      router.dismissTo({
        pathname: "/(group)/CreateRoom",
        params: { roomName: finalRoomName, id: id, roomId: roomId },
      });
    } else {
      router.back();
    }
  };

  /**
   * Handles the change of the custom room name
   * @param value - The new value of the custom room name
   */
  const handleCustomRoomNameChange = (value: string) => {
    setRoomName(value);
    if (value.trim()) {
      setSelectedRoom("");
    }
  };

  /**
   * Handles the selection of the predefined room name
   * @param roomLabel - The label of the predefined room name
   */
  const handleRoomSelection = (roomLabel: string) => {
    setSelectedRoom(roomLabel);
    setRoomName("");
  };

  /**
   * Renders the list of predefined room names
   * @returns The list of predefined room names
   */
  const renderRoomNameList = () => {
    return (
      <ScrollView style={styles.scrollView}>
        {predefinedRooms.map((room, index) => (
          <Pressable
            key={`room-${room.key}-${index}`}
            style={[
              styles.roomItem,
              {
                borderBottomWidth:
                  index === predefinedRooms?.length - 1 ? 0 : 1,
              },
            ]}
            onPress={() => handleRoomSelection(room.label)}
          >
            <Text style={styles.roomText}>{room.label}</Text>
            {getSelectionIcon(selectedRoom === room.label)}
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  // Render
  return (
    <>
      <Header label={t("group.customizeRoomName.nameList")} showBack={true} />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
      >
        <View style={styles.customRoomButton}>
          <ContentWrapper title={t("group.customizeRoomName.addOwnRoomName")}>
            <Input
              placeholder={t("group.customizeRoomName.roomNamePlaceholder")}
              initialValue={roomName}
              onFieldChange={(value) => handleCustomRoomNameChange(value)}
              border={false}
              paddingHorizontal={false}
              marginBottom={false}
              style={styles.roomNameInput}
            />
          </ContentWrapper>
        </View>
        <View style={styles.predefinedRoomNameContainer}>
          <ContentWrapper
            title={t("group.customizeRoomName.selectExitingRoomName")}
            style={styles.scrollView}
            scrollContent={true}
          >
            {renderRoomNameList()}
          </ContentWrapper>
        </View>

        {/* Confirm Button */}
        <View style={styles.buttonContainer}>
          <Pressable
            style={[
              globalStyles.btn,
              globalStyles.bgBlue,
              !(selectedRoom || roomName.trim()) && styles.buttonDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!(selectedRoom || roomName.trim())}
          >
            <Text style={[globalStyles.fontMedium, globalStyles.textWhite]}>
              {t("group.customizeRoomName.confirmBtn")}
            </Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    </>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  predefinedRoomNameContainer: {
    ...globalStyles.shadowElevationForLightTheme,
    backgroundColor: tokens.colors.white,
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  roomItem: {
    ...globalStyles.flex,
    ...globalStyles.alignCenter,
    ...globalStyles.justifyBetween,
    paddingVertical: tokens.spacing._10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderColor,
  },
  roomText: {
    ...globalStyles.fontRegular,
    color: tokens.colors.black,
  },
  roomNameInput: {
    fontSize: tokens.fontSize.xs,
    paddingBottom: tokens.spacing._5,
  },
  customRoomButton: {
    marginBottom: tokens.spacing._15,
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonContainer: {
    paddingVertical: tokens.spacing._15,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.5,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
});

export default CustomizeRoomName;
