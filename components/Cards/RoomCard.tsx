/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";

// Third Party Imports
import { useTranslation } from "react-i18next";
import { Swipeable } from "react-native-gesture-handler";
import { Edit2, Trash2 } from "lucide-react-native";

// Components
import DeviceCard from "./DeviceCard";
import ConfirmationDialog from "../Modals/ConfirmationDialog";

// SDK Types
import {
  ESPRMGroup,
  ESPRMNode,
  ESPRMDevice,
} from "@espressif/rainmaker-base-sdk";

// Hooks & Utils
import { useCDF } from "@/hooks/useCDF";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Types
interface ExtendedESPRMDevice extends ESPRMDevice {
  node: ESPRMNode;
}

interface RoomCardProps {
  /** Room group data */
  room: ESPRMGroup;
  /** Callback when room is pressed */
  onPressRoom?: (roomId: string) => void;
  /** Callback when room is edited */
  onEditRoom?: (room: ESPRMGroup) => void;
  /** Callback when room is deleted */
  onDeleteRoom?: (room: ESPRMGroup) => void;
  /** Whether to enable swipe actions (default: false) */
  enableSwipeActions?: boolean;
}

/**
 * RoomCard
 *
 * A component for displaying a room with its devices and controls.
 * Features:
 * - Room name and device count display
 * - Toggle switch for all devices
 * - Device list with individual controls
 * - Press interaction for room management
 * - Optional swipe actions for edit and delete (disabled by default)
 */
const RoomCard: React.FC<RoomCardProps> = React.memo(({
  room,
  onPressRoom,
  onEditRoom,
  onDeleteRoom,
  enableSwipeActions = false,
}) => {
  // Hooks
  const { t } = useTranslation();
  const { store } = useCDF();
  const swipeableRef = useRef<Swipeable>(null);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const devices = useMemo(() => {
    const nodes =
      store?.nodeStore?.nodeList?.filter((node) =>
        room.nodes?.includes(node.id)
      ) || [];

    if (nodes) {
      const roomDevices = nodes.reduce((acc, node) => {
        const nodeDevices = node.nodeConfig?.devices || [];
        const devicesWithNode = nodeDevices.map((device) => ({
          ...device,
          node: node,
        })) as ExtendedESPRMDevice[];
        return [...acc, ...devicesWithNode];
      }, [] as ExtendedESPRMDevice[]);
      return roomDevices;
    }
    return [];
  }, [room.nodes, store?.nodeStore?.nodeList]);

  const handlePress = () => {
    onPressRoom?.(room.id);
  };

  /**
   * Handles the edit event
   * Closes the swipeable and opens the edit dialog
   */
  const handleEdit = () => {
    swipeableRef.current?.close();
    onEditRoom?.(room);
  };

  /**
   * Handles the delete event
   * Closes the swipeable and shows the delete dialog
   */
  const handleDelete = () => {
    setIsLoading(true);
    swipeableRef.current?.close();
    onDeleteRoom?.(room);
    setShowDeleteDialog(false);
  };

  /**
   * Handles the delete press event
   * Opens the delete dialog
   */
  const handleDeletePress = () => {
    setShowDeleteDialog(true);
  };

  /**
   * Handles the cancel delete event
   * Closes the delete dialog
   */
  const handleCancelDelete = () => {
    setShowDeleteDialog(false);
    setIsLoading(false);
  };

    /**
   * Renders the right actions for the room card
   * Shows the edit and delete buttons
   * @param _progress - The progress of the swipe (unused)
   * @param dragX - The drag x value
   * @returns The right actions component
   */
const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: "clamp",
    });

    const opacity = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [1, 0.5, 0],
      extrapolate: "clamp",
    });

    return (
      <View style={styles.rightActions}>
        {/* Edit button */}
        <Animated.View style={[styles.actionButtonWrapper, { opacity }]}>
          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={handleEdit}
          >
            <Animated.View
              style={{ transform: [{ scale }], alignItems: "center" }}
            >
              <Edit2 size={22} color={tokens.colors.white} />
              <Text style={styles.actionText}>{t("layout.shared.edit")}</Text>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[styles.actionButtonWrapper, { opacity }]}>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleDeletePress}
          >
            <Animated.View
              style={{ transform: [{ scale }], alignItems: "center" }}
            >
              <Trash2 size={22} color={tokens.colors.white} />
              <Text style={styles.actionText}>{t("layout.shared.delete")}</Text>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  const cardContent = (
    <TouchableOpacity 
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[
        styles.roomHeader,
        devices?.length > 0 && styles.roomHeaderBottom,
      ]}>
        <View style={styles.titleContainer}>
          <View>
            <Text style={styles.name}>{room.name}</Text>
            <Text style={styles.subtitle}>
              {devices?.length}{" "}
              {devices?.length > 1
                ? t("group.rooms.multipleDeviceCountPostfix")
                : t("group.rooms.singleDeviceCountPostfix")}
            </Text>
          </View>
        </View>
      </View>

      {devices?.length > 0 && (
        <View style={styles.devicesList}>
          {devices.map((device, index) => (
            <DeviceCard
              key={`${device.node.id}-${device.name}-${index}`}
              device={device}
              node={device.node}
              compact={true}
            />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <>
      {enableSwipeActions ? (
        <Swipeable
          ref={swipeableRef}
          renderRightActions={renderRightActions}
          rightThreshold={40}
          friction={2}
          overshootRight={false}
          containerStyle={styles.swipeContainer}
        >
          {cardContent}
        </Swipeable>
      ) : (
        cardContent
      )}
      {/* Confirmation dialog for delete */}
      {enableSwipeActions && (
        <ConfirmationDialog
          open={showDeleteDialog}
          title={t("group.rooms.deleteModalTitle")}
          description={t("group.rooms.deleteModalDescription")}
          confirmText={t("group.rooms.deleteModalConfirmButton")}
          cancelText={t("group.rooms.deleteModalCancelButton")}
          onConfirm={handleDelete}
          onCancel={handleCancelDelete}
          confirmColor={tokens.colors.red}
          isLoading={isLoading}
        />
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  return (
    prevProps.room.id === nextProps.room.id &&
    prevProps.room.name === nextProps.room.name &&
    prevProps.room.nodes?.length === nextProps.room.nodes?.length &&
    prevProps.enableSwipeActions === nextProps.enableSwipeActions &&
    prevProps.onPressRoom === nextProps.onPressRoom &&
    prevProps.onEditRoom === nextProps.onEditRoom &&
    prevProps.onDeleteRoom === nextProps.onDeleteRoom
  );
});

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  swipeContainer: {
    backgroundColor: "transparent",
  },
  card: {
    marginBottom: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    ...globalStyles.shadowElevationForLightTheme,
    padding: tokens.spacing._10,
  },
  roomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomColor: tokens.colors.bg1,
  },
  roomHeaderBottom: {
    paddingBottom: tokens.spacing._10,
    borderBottomWidth: 1,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    ...globalStyles.fontRegular,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
    fontSize: tokens.fontSize.sm,
  },
  subtitle: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.bg3,
    fontFamily: tokens.fonts.regular,
    marginTop: 2,
  },
  devicesList: {
    marginTop: tokens.spacing._10,
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: tokens.spacing._10,
    justifyContent: "flex-start",
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: tokens.spacing._10,
    marginRight: tokens.spacing._10,
  },
  actionButtonWrapper: {
    marginLeft: tokens.spacing._5,
  },
  actionButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 70,
    height: "100%",
    borderRadius: tokens.radius.sm,
  },
  actionText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.xs,
    marginTop: tokens.spacing._5,
    fontFamily: tokens.fonts.regular,
  },
  editButton: {
    backgroundColor: tokens.colors.primary,
  },
  deleteButton: {
    backgroundColor: tokens.colors.red,
  },
});

export default RoomCard;
