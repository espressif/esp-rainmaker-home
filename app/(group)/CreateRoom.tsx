/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Constants
import { GROUP_TYPE_ROOM } from "@/utils/constants";

// Hooks
import { useCDF } from "@/hooks/useCDF";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";

// Icons
import { ChevronRight, Plus, MinusCircle } from "lucide-react-native";

// Components
import {
  Header,
  ContentWrapper,
  ScreenWrapper,
  Button,
  ConfirmationDialog,
} from "@/components";

// Utils
import { getDeviceName } from "@/utils/device";

// Types
import { DeviceItemProps, Node } from "@/types/global";

/**
 * DeviceItem Component
 *
 * Renders a single device item with plus/minus icons for adding/removing devices
 * @param {DeviceItemProps} props - Component props including device data and handlers
 */
const DeviceItem = ({
  device,
  showPlus = false,
  showMinus = false,
  onPress,
}: DeviceItemProps) => (
  <Pressable style={styles.deviceItem} onPress={() => onPress(device)}>
    {showPlus && <Plus size={20} color={tokens.colors.blue} />}
    {showMinus && <MinusCircle size={20} color={tokens.colors.red} />}
    <Text style={styles.deviceText}>{device.name}</Text>
  </Pressable>
);

/**
 * CreateRoom Component
 *
 * Allows users to create a new room and add devices to it.
 * Features:
 * - Custom room name input
 * - Device selection from available devices
 * - Add/remove devices from room
 * - Save room configuration
 */
const CreateRoom = () => {
  // Hooks
  const { t } = useTranslation();
  const toast = useToast();

  const { store } = useCDF();
  const router = useRouter();
  const {
    roomName: paramRoomName,
    id,
    roomId,
  } = useLocalSearchParams<{
    roomName?: string;
    id?: string;
    roomId?: string;
  }>();

  // State
  const [roomName, setRoomName] = useState(paramRoomName || "");
  const [selectedNodesIds, setSelectedNodesIds] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState({
    delete: false,
    save: false,
    update: false,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Get the home and room from the store
  const home = useMemo(
    () => store?.groupStore?.groupList?.find((home) => home.id === id),
    [id]
  );
  const room = useMemo(
    () => home?.subGroups?.find((room) => room.id === roomId),
    [roomId]
  );
  const nodes = useMemo(
    () =>
      store.nodeStore.nodeList.filter((node) => home?.nodes?.includes(node.id)),
    [home]
  );

  const selectedNodes: Node[] = useMemo(
    () =>
      nodes
        .filter((node) => selectedNodesIds.includes(node.id))
        .map((node: any) => ({
          id: node.id,
          name: node.nodeConfig?.devices
            .map((device: any) => device.displayName)
            .join(", "),
          node: node,
        })),
    [nodes, selectedNodesIds]
  );
  const availableNodes: Node[] = useMemo(
    () =>
      nodes
        .filter((node) => !selectedNodesIds.includes(node.id))
        .map((node: any) => ({
          id: node.id,
          name: node.nodeConfig?.devices
            .map((device: any) => device.displayName)
            .join(", "),
          node: node,
        })),
    [nodes, selectedNodesIds]
  );

  /**
   * Effect to update the room name and selected devices when the room changes
   * @param room - The room to update
   */
  useEffect(() => {
    if (room) {
      if (room.name !== paramRoomName) {
        setRoomName(paramRoomName || room.name);
      }
      if (room.nodes && room.nodes.length > 0) {
        setSelectedNodesIds(room.nodes);
      }
    }
  }, [room]);

  // Effects
  /**
   * Effect to update the room name when the param room name changes
   * @param paramRoomName - The new room name
   */
  useEffect(() => {
    if (paramRoomName) {
      setRoomName(paramRoomName);
    }
  }, [paramRoomName]);

  /**
   * Handles custom room name navigation
   */
  const handleCustomRoomName = () => {
    router.push({
      pathname: "/(group)/CustomizeRoomName",
      params: { currentRoomName: roomName, id: id, roomId: roomId },
    } as any);
  };

  /**
   * Handles adding a device to the selected devices list
   */
  const handleAddDevice = (node: Node) => {
    setSelectedNodesIds((prev) => [...prev, node.id]);
  };

  /**
   * Handles removing a device from the selected devices list
   */
  const handleRemoveDevice = (node: Node) => {
    setSelectedNodesIds((prev) => prev.filter((id) => id !== node.id));
  };

  /**
   * Handles saving the room configuration
   *
   * This function:
   * 1. Creates a new subgroup (room) in the current home
   * 2. Assigns selected devices to the room
   * 3. Sets room properties (name, type, etc.)
   * 4. Shows success/error toast messages
   * 5. Redirects to success page on completion
   *
   * SDK function used:
   * - ESPRMGroup.createSubGroup
   *
   */
  const handleSave = () => {
    setIsLoading((prev) => ({
      ...prev,
      save: true,
    }));
    home
      ?.createSubGroup({
        name: roomName,
        nodeIds: selectedNodesIds || [],
        customData: {},
        type: GROUP_TYPE_ROOM,
        mutuallyExclusive: true,
      })
      .then(async (group) => {
        if (group) {
          toast.showSuccess(t("group.createRoom.roomCreatedSuccessfully"));
          await new Promise((resolve) => setTimeout(resolve, 500));
          router.replace({
            pathname: "/(group)/CreateRoomSuccess",
            params: { id: id },
          } as any);
        }
      })
      .catch((error) => {
        toast.showError(error.description);
        console.error("Error creating group:", error);
      })
      .finally(() => {
        setIsLoading((prev) => ({
          ...prev,
          save: false,
        }));
      });
  };

  /**
   * Handles updating the room configuration
   *
   * This function:
   * 1. Updates the room name
   * 2. Adds/removes nodes to/from the room
   * 3. Shows success/error toast messages
   * 4. Redirects to success page on completion
   *
   * SDK function used:
   * - ESPRMGroup.updateGroupInfo
   * - ESPRMGroup.addNodes
   * - ESPRMGroup.removeNodes
   */

  const handleUpdate = async () => {
    try {
      const existingNodes = room?.nodes;
      const newNodes = selectedNodesIds;
      const nodesToRemove = existingNodes?.filter((node) => !newNodes.includes(node)) || [];
      const nodesToAdd = newNodes.filter((node) => !existingNodes?.includes(node)) || [];
      // Update
      await Promise.allSettled([
        room?.updateGroupInfo({
          groupName: roomName,
        }),
        nodesToAdd.length > 0 && room?.addNodes(nodesToAdd || []),
        nodesToRemove.length > 0 && room?.removeNodes(nodesToRemove || []),
      ]);

      toast.showSuccess(t("group.createRoom.roomUpdatedSuccessfully"));

      router.replace({
        pathname: "/(group)/CreateRoomSuccess",
        params: { id: id, updated: true },
      } as any);

    } catch (error: any) {
      toast.showError(error.description);
      console.error("Error updating room:", error);
    }
  };

  /**
   * Handles the deletion confirmation modal visibility
   */
  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  /**
   * Handles the deletion of the room
   *
   * SDK function used:
   * - ESPRMGroup.delete
   */
  const confirmDelete = async () => {
    setIsLoading((prev) => ({
      ...prev,
      delete: true,
    }));

    try {
      await room?.delete();
      toast.showSuccess(t("group.createRoom.roomRemovedSuccessfully"));
      router.dismissTo({
        pathname: "/(group)/Rooms",
        params: { id: id },
      } as any);
    } catch (error: any) {
      toast.showError(error.description);
      console.error("Error deleting room:", error);
    } finally {
      setIsLoading((prev) => ({
        ...prev,
        delete: false,
      }));
    }
  };

  // Render
  return (
    <>
      <Header
        label={
          room
            ? t("group.createRoom.editRoom")
            : t("group.createRoom.createRoom")
        }
        showBack={true}
      />
      <ScreenWrapper
        style={{ ...globalStyles.container, ...styles.screenContainer }}
      >
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Room Name Section */}
          <View style={styles.section}>
            <Pressable
              style={[
                globalStyles.flex,
                globalStyles.alignCenter,
                globalStyles.justifyBetween,
                { paddingVertical: tokens.spacing._5 },
              ]}
              onPress={handleCustomRoomName}
            >
              <Text style={styles.roomNameTitle}>
                {t("group.createRoom.roomName")}
              </Text>
              <View style={[globalStyles.flex, globalStyles.alignCenter]}>
                <Text style={styles.customizeText}>
                  {roomName
                    ? roomName
                    : t("group.createRoom.addCustomizedRoom")}
                </Text>
                <ChevronRight size={20} color={tokens.colors.primary} />
              </View>
            </Pressable>
          </View>

          {/* Existing Device Section */}
          <View style={styles.section}>
            <ContentWrapper
              title={t("group.createRoom.existingDevice")}
              style={styles.contentWrapperOverride}
            >
              <View style={styles.deviceList}>
                {selectedNodes.map((device, index) => (
                  <DeviceItem
                    key={`selected-${device.id}-${index}`}
                    device={device}
                    showMinus={true}
                    onPress={handleRemoveDevice}
                  />
                ))}

                {!selectedNodes?.length && (
                  <Text style={styles.placeholderText}>
                    {t("group.createRoom.pleaseSelectDevices")}
                  </Text>
                )}
              </View>
            </ContentWrapper>
          </View>

          {/* Add Device Section */}
          <View style={styles.section}>
            <ContentWrapper
              title={t("group.createRoom.addDevice")}
              style={styles.contentWrapperOverride}
            >
              <View style={styles.deviceList}>
                {availableNodes?.length > 0 ? (
                  availableNodes.map((device, index) => (
                    <DeviceItem
                      key={`available-${device.id}-${index}`}
                      device={device}
                      showPlus={true}
                      onPress={handleAddDevice}
                    />
                  ))
                ) : (
                  <Text style={styles.placeholderText}>
                    {t("group.createRoom.noMoreDevicesAvailable")}
                  </Text>
                )}
              </View>
            </ContentWrapper>
          </View>

          {/* Save Button */}
          <View style={styles.footer}>
            <Button
              label={t("layout.shared.save")}
              disabled={isLoading.save || !roomName}
              onPress={room ? handleUpdate : handleSave}
              style={{ ...globalStyles.btn, ...globalStyles.bgBlue }}
              isLoading={isLoading.save}
            />
            {room && (
              <Button
                label={t("layout.shared.delete")}
                disabled={isLoading.delete}
                isLoading={isLoading.delete}
                onPress={handleDelete}
                style={{ ...globalStyles.btn, ...globalStyles.buttonDanger }}
              />
            )}
          </View>
        </ScrollView>
      </ScreenWrapper>

      <ConfirmationDialog
        open={showDeleteDialog}
        title={t("group.createRoom.confirmRemoveRoom")}
        description={t("group.createRoom.confirmRemoveRoomMessage")}
        confirmText={t("layout.shared.remove")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
        confirmColor={tokens.colors.red}
        isLoading={isLoading.delete}
      />
    </>
  );
};

// Styles
const styles = StyleSheet.create({
  screenContainer: {
    backgroundColor: tokens.colors.bg5,
    flex: 1,
  },
  section: {
    marginTop: tokens.spacing._15,
    padding: tokens.spacing._10,
    backgroundColor: tokens.colors.white,
    ...globalStyles.shadowElevationForLightTheme,
  },
  roomNameTitle: {
    ...globalStyles.fontRegular,
    color: tokens.colors.text_primary,
    fontSize: tokens.fontSize.xs,
  },
  customizeText: {
    ...globalStyles.fontRegular,
    color: tokens.colors.text_secondary,
    marginRight: tokens.spacing._5,
  },
  placeholderText: {
    ...globalStyles.fontRegular,
    color: tokens.colors.text_secondary,
    paddingVertical: tokens.spacing._15,
    textAlign: "center",
    backgroundColor: tokens.colors.white,
  },
  deviceItem: {
    ...globalStyles.flex,
    ...globalStyles.alignCenter,
    padding: tokens.spacing._10,
  },
  deviceText: {
    ...globalStyles.fontRegular,
    marginLeft: tokens.spacing._10,
    flex: 1,
    flexWrap: "wrap",
    flexShrink: 1,
    color: tokens.colors.text_primary,
    fontWeight: "500",
  },
  deviceList: {
    marginBottom: tokens.spacing._10,
  },
  footer: {
    marginTop: "auto",
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._15,
    marginBottom: tokens.spacing._5,
  },
  contentWrapperOverride: {
    backgroundColor: "transparent",
    padding:0,
    paddingTop: tokens.spacing._10
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: tokens.spacing._20,
  },
});

export default CreateRoom;
