/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ViewStyle,
  TextStyle,
  TextProps,
  GestureResponderEvent,
  StyleProp as RNStyleProp,
  ImageSourcePropType,
} from "react-native";
import {
  ESPRMDeviceParam,
  ESPRMNode,
  ESPRMDevice,
  ESPRMNodeConfig,
  ESPRMGroup,
} from "@espressif/rainmaker-base-sdk";

// ============================================================================
// Common Types
// ============================================================================
export type ViewStyleProp = RNStyleProp<ViewStyle>;
export type TextStyleProp = RNStyleProp<TextStyle>;

// ============================================================================
// User Management Types
// ============================================================================
export interface UserInfo {
  name?: string;
  email?: string;
  avatar?: string;
}

export interface SharedUser {
  /** User's unique identifier */
  id: string;
  /** User's email address */
  email: string;
  /** User's display name */
  name: string;
  /** User's permission level */
  permissions: "view" | "control" | "admin";
}

export interface PersonalInfoField {
  id: string;
  title: string;
  placeholder: string;
  maxLength: number;
}

// ============================================================================
// Device Control Types
// ============================================================================

export interface DeviceFallbackProps {
  /** The ESP Rainmaker node containing device information */
  node: ESPRMNode;
  device: ESPRMDevice;
}

export type Tab = string;

export interface ControlPanelProps {
  node: ESPRMNode;
  device: ESPRMDevice;
}

export interface ParamControlProps {
  param: ESPRMDeviceParam;
  disabled?: boolean;
  setUpdating: (updating: boolean) => void;
  isMultiParam?: boolean;
  onValueChange?: (value: any) => void;
  children: React.ReactNode;
}

export interface ParamControlChildProps {
  label: string;
  value: any;
  onValueChange: (
    event: GestureResponderEvent | null,
    newValue: any,
    validate?: boolean
  ) => void;
  disabled: boolean;
  meta: any;
}

export interface FooterButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}

export type ProvisionStatus = "pending" | "progress" | "succeed" | "failed";

export interface ProvisionStep {
  description: string;
  status: ProvisionStatus;
  timestamp: number;
}

export interface ProvisioningStepProps
  extends Omit<ProvisionStep, "timestamp"> {}

export interface DeviceTypeProps {
  label: string;
  defaultIcon: string;
  disabled: boolean;
  onPress: () => void;
}

export interface ScannedDeviceProps {
  name: string;
  type: string;
  isConnecting: boolean;
  onPress: () => void;
}

// ============================================================================
// Device Settings Types
// ============================================================================

export interface OTAInfo {
  currentVersion: string;
  newVersion?: string;
  isUpdateAvailable: boolean;
  isUpdating: boolean;
}

// ============================================================================
// Wifi  Types
// ============================================================================
export interface WifiNetwork {
  ssid: string;
  rssi: number;
  secure: boolean;
}

export interface WifiItemProps {
  item: WifiNetwork;
  onSelect: (ssid: string) => void;
  index: number;
}

export interface NetworkListModalProps {
  visible: boolean;
  onClose: () => void;
  wifiList: WifiNetwork[];
  onSelect: (ssid: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
}


// ============================================================================
// Home Types
// ============================================================================
export interface HomeData {
  roomTabs: RoomTab[];
  rooms: ESPRMGroup[];
  devices: (ESPRMDevice & { node: WeakRef<ESPRMNode> })[];
} 

// ============================================================================
// Room Types
// ============================================================================

// Types
export interface Node {
  id: string;
  name: string;
  node?: ESPRMNode | null; // Make node optional and nullable
}

export interface DeviceItemProps {
  device: Node;
  showPlus?: boolean;
  showMinus?: boolean;
  onPress: (device: Node) => void;
}

export interface RoomType {
  key: string;
  label: string;
}

export interface RoomTab {
  label: string;
  id: string;
}

export interface HomeUpdateResponse {
  status: string;
  description?: string;
}

export type RoomParams = {
  param: ESPRMDeviceParam;
  deviceName: string;
  nodeId: string;
  isConnected: boolean;
};

// ============================================================================
// Voice assistant Types
// ============================================================================

// Type Definitions
export interface GuideStep {
  icon1: string;
  icon2: string;
  title: string;
}

export interface VoiceAssistantProps {
  isAlexa: boolean;
}

// ============================================================================
// Notification Types
// ============================================================================
export interface SharingItem {
  id: number;
  request_id: string;
  type: "node" | "group";
  primaryUsername: string;
  timestamp: number;
  status: "pending" | "accepted" | "declined";
  loading?: boolean;
  acceptLoading?: boolean;
  declineLoading?: boolean;
}

// ============================================================================
// UI Component Types
// ============================================================================
export interface TabProps {
  label: string;
  value: string | number;
  isActive?: boolean;
  onPress?: () => void;
}

export interface DialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export interface InputDialogProps extends DialogProps {
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  validate?: (value: string) => boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================
export const clampValue = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const safeValueToString = (value: any): string => {
  if (value === null || value === undefined) return "";
  return String(value);
};

export const getParamBounds = (param: ESPRMDeviceParam) => {
  return {
    ...param?.bounds,
  };
};

// ============================================================================
// Personal Info Types
// ============================================================================

export interface PersonalInfoField {
  id: string;
  title: string;
  placeholder: string;
  maxLength: number;
}

// ============================================================================
// User Settings Types
// ============================================================================

export interface SettingItemConfig {
  id: string;
  icon: React.ReactNode;
  title: string;
  type: "navigation" | "toggle";
  action: string;
  showSeparator?: boolean;
}

export type ActionHandler = (() => void) | ((checked: boolean) => void);

export interface ActionHandlers {
  [key: string]: ActionHandler | undefined;
}

export interface UserProps {}

export interface DebugInfo {
  isDevelopment: boolean;
  debugTapCount: number;
}

export interface UserOperationConfig {
  id: string;
  icon: React.ReactNode;
  title: string;
  action: any;
  showBadge?: boolean;
  isDebug?: boolean;
  showSeparator?: boolean;
}

export interface IntegrationConfig {
  id: string;
  title: string;
  icon: ImageSourcePropType;
  action: any;
}

export type ScreenWrapperProps = {
  style?: ViewStyle;
  children: React.ReactNode;
  bg?: string;
};

export type ModalWrapperProps = {
  style?: ViewStyle;
  children: React.ReactNode;
};

export type TypoProps = {
  size?: number;
  color?: string;
  fontWeight?: TextStyle["fontWeight"];
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  textProps?: TextProps;
  onPress?: () => void;
  variant?: "h1" | "h2" | "h3" | "subtitle" | "body" | "small";
  bold?: boolean;
  addNewLine?: boolean;
};

// Define types for the props
export interface HeaderProps {
  label?: string;
  showBack?: boolean;
  customBackUrl?: string;
  rightSlot?: React.ReactNode;
  containerStyle?: ViewStyle;
  titleStyle?: TextStyle;
}

// ============================================================================
// Circular Progress
// ============================================================================

export interface CircularProgressProps {
  /** Whether the loading state is active */
  isLoading: boolean;
  /** The size of the progress circle (outer circle) */
  size?: number;
  /** The width of the progress stroke */
  strokeWidth?: number;
  /** The color of the progress indicator */
  color?: string;
  /** The background color of the progress track */
  trackColor?: string;
  /** Children to render inside the progress circle */
  children: React.ReactNode;
  /** Optional style for the container */
  style?: any;
}

// ============================================================================
// Scenes
// ============================================================================

export interface Scene {
  id: string;
  name: string;
  nodes: string[];
  devices: string[];
  action: Record<string, any>;
}

export interface DeviceParam {
  param: ESPRMDeviceParam;
  device: string;
  node: string;
}

export interface DeviceParamGroup {
  paramConfig: DeviceParam;
  label: string;
  value: any;
  disabled: boolean;
  meta: any;
  uiType: string;
  control: {
    types: string[];
    control: React.ComponentType<ParamControlChildProps> | null;
    roomLabel?: string;
  };
  isSelected: boolean;
}

export interface DeviceActionParams {
  node: ESPRMNode;
  device: ESPRMDevice;
  paramsMap: Record<string, DeviceParamGroup>;
  isMaxSceneReached: boolean;
}

// Types
export interface LoadingState {
  save: boolean;
  delete: boolean;
}

export interface SceneActionsProps {
  device: ESPRMDevice;
  displayDeviceName: string;
  action: Record<string, any>;
  onActionPress: (device: string) => void;
}

export interface SceneItemProps {
  /** Scene name to display */
  name: string;
  /** Number of devices in the scene */
  deviceCount: number;
  /** Devices in the scene */
  devices: string[];
  /** Icon component to display */
  icon: React.ReactNode;
  /** Whether the scene is active */
  isActive?: boolean;
  /** Callback when toggle changes */
  onToggle?: (value: boolean) => void;
  /** Whether to show bottom separator */
  showSeparator?: boolean;
  /** Callback when scene is pressed */
  onPress?: () => void;
}

// ============================================================================
// Home Setting Types
// ============================================================================

export interface GroupSharedUser {
  id?: string;
  username: string;
  metadata?: Record<string, any>;
  requestId?: string;
  timestamp?: number;
  remainingDays?: number;
  expirationMessage?: string | null;
}

export interface HomeNameProps {
  homeName: string;
  setHomeName: (name: string) => void;
  onSave: () => void;
  isSaving: boolean;
  isPrimary: boolean;
  disabled: boolean;
}

export interface HomeRemoveProps {
  onRemove: () => void;
  isLoading: boolean;
  showDelete: boolean;
  setShowDelete: (show: boolean) => void;
  isPrimary: boolean;
}

export interface HomeSharingProps {
  sharedUsers: GroupSharedUser[];
  pendingUsers?: GroupSharedUser[];
  sharedByUser: GroupSharedUser | null;
  onRemoveUser: (userId: string) => void;
  onRemovePendingUser?: (userId: string) => void;
  onAddUser: () => void;
  isPrimaryUser: boolean | undefined;
  isLoading: boolean;
}

// ============================================================================
// Device Settings Types
// ============================================================================

export interface AddUserModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: () => void;
  email: string;
  handleEmailChange: (email: string) => void;
  isLoading: boolean;
  validateEmail: (email: string) => boolean;
  makePrimary?: boolean;
  onMakePrimaryChange?: (makePrimary: boolean) => void;
  transfer?: boolean;
  onTransferChange?: (transfer: boolean) => void;
  transferAndAssignRole?: boolean;
  onTransferAndAssignRoleChange?: (transferAndAssignRole: boolean) => void;
}

export interface DeviceInfoProps {
  node: ESPRMNode | undefined;
  nodeConfig: ESPRMNodeConfig | undefined;
  device: any;
  otaInfo: OTAInfo;
}

export interface DeviceNameProps {
  initialDeviceName: string;
  deviceName: string;
  setDeviceName: (name: string) => void;
  isEditingName: boolean;
  setIsEditingName: (editing: boolean) => void;
  onSave: () => void;
  isSaving: boolean;
  isConnected: boolean;
  disabled: boolean;
}

export interface OTAProps {
  otaInfo: OTAInfo;
  onCheckUpdates: () => void;
  onStartUpdate: () => void;
  isChecking: boolean;
}

export interface SharingProps {
  sharedUsers: SharedUser[];
  onRemoveUser: (userId: string) => void;
  onAddUser: () => void;
  isPrimary: boolean;
}
