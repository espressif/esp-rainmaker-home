/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Home screen
export { default as Banner } from "./Home/Banner";
export { default as HomeTooltip } from "./Home/HomeTooltip";
export { default as FloatingChatButton } from "./Home/FloatingChatButton";
export { default as AddYourFirstDeviceBanner } from "./Home/AddYourFirstDeviceBanner";
export {
  HomeDeviceList,
  type HomeDeviceListProps,
} from "./Home/HomeDeviceList";
export {
  HomeGroupControlList,
  type HomeGroupControlListProps,
} from "./Home/HomeGroupControlList";
export {
  HomeEmptyState,
  type HomeEmptyStateProps,
} from "./Home/HomeEmptyState";
export { default as DeviceTypeFilterTabs } from "./Home/DeviceTypeFilterTabs";
export { default as RoomControlSwitch } from "./Home/RoomControlSwitch";
export {
  MigrationPromptModal,
  type MigrationPromptModalProps,
} from "./Home/MigrationPromptModal";

// HomeManagement screen
export {
  HomeItem,
  type HomeItemProps,
} from "./HomeManagement/HomeItem";
export {
  HomeManagementHeader,
  type HomeManagementHeaderProps,
} from "./HomeManagement/HomeManagementHeader";
export {
  HomeManagementListHeader,
  type HomeManagementListHeaderProps,
} from "./HomeManagement/HomeManagementListHeader";
export {
  HomeManagementList,
  HomeManagementSectionList,
  type HomeManagementListProps,
  type HomeManagementSectionListProps,
  type HomeManagementHomeListSection,
} from "./HomeManagement/HomeManagementList";
export {
  HomeManagementAddDialog,
  type HomeManagementAddDialogProps,
} from "./HomeManagement/HomeManagementAddDialog";

// Rooms screen
export {
  RoomsEmptyState,
  type RoomsEmptyStateProps,
} from "./Rooms/RoomsEmptyState";
export { RoomsList, type RoomsListProps } from "./Rooms/RoomsList";
export { default as RoomCard } from "./Rooms/RoomCard";
export {
  default as ControlGroupCard,
  type ControlGroupCardProps,
} from "./Rooms/ControlGroupCard";

// CreateRoom / CreateRoomSuccess screens
export { CreateRoomDeviceItem } from "./CreateRoom/CreateRoomDeviceItem";
export { default as RoomLeave } from "./CreateRoom/RoomLeave";
export {
  CreateRoomNameSection,
  type CreateRoomNameSectionProps,
} from "./CreateRoom/CreateRoomNameSection";
export {
  CreateRoomDeviceSection,
  type CreateRoomDeviceSectionProps,
} from "./CreateRoom/CreateRoomDeviceSection";
export {
  CreateRoomFooter,
  type CreateRoomFooterProps,
} from "./CreateRoom/CreateRoomFooter";
export {
  CreateRoomSuccessContent,
  type CreateRoomSuccessContentProps,
} from "./CreateRoom/CreateRoomSuccessContent";

// CustomizeRoomName screen
export {
  CustomizeRoomNameRoomItem,
  type CustomizeRoomNameRoomItemProps,
} from "./CustomizeRoomName/CustomizeRoomNameRoomItem";
export {
  CustomizeRoomNamePredefinedList,
  type CustomizeRoomNamePredefinedListProps,
} from "./CustomizeRoomName/CustomizeRoomNamePredefinedList";

// Settings screen (home-level settings)
export {
  SettingsRoomSection,
  type SettingsRoomSectionProps,
} from "./Settings/SettingsRoomSection";
export { default as HomeName } from "./Settings/HomeName";
export { default as GroupSharing } from "./Settings/GroupSharing";
export { default as HomeRemove } from "./Settings/HomeRemove";
export { default as AddUserModal } from "./Settings/AddUserModal";
