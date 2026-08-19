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
  ScrollView,
} from "react-native";
import { MediaStream } from "react-native-webrtc";
import type { ReactNode } from "react";
import { AgentConfig } from "@features/agent/utils";
import { ESPCDFDevice, ESPCDFGroup, ESPCDFNode, ESPCDFDeviceParam, ESPCDFNodeConfig, ESPCDFAutomation, ESPCDFGroupSharingRequest } from "@store";
import type { UseHomeViewModelResult } from "@features/group/hooks";
import type { MatterCommissioningPhase } from "@features/matter/constants";

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
  node: ESPCDFNode;
  device: ESPCDFDevice;
  /**
   * When the panel is embedded in Control's scroll surface, disables parent
   * scroll while a param gesture (slider, etc.) is active.
   */
  setScrollEnabled?: (enabled: boolean) => void;
}

export type Tab = string;

export interface ControlPanelProps {
  node: ESPCDFNode;
  device: ESPCDFDevice;
  /**
   * When the panel is embedded in Control's scroll surface, disables parent
   * scroll while a param gesture (slider, etc.) is active.
   */
  setScrollEnabled?: (enabled: boolean) => void;
}

export interface ParamControlProps {
  param: ESPCDFDeviceParam;
  disabled?: boolean;
  setUpdating: (updating: boolean) => void;
  isMultiParam?: boolean;
  onValueChange?: (value: any) => void;
  children: React.ReactNode;
}

export interface ParamControlChildProps {
  label?: string;
  value?: any;
  onValueChange?: (
    event: GestureResponderEvent | null,
    newValue: any,
    validate?: boolean
  ) => void;
  disabled?: boolean;
  meta?: any;
  onOpenChart?: (() => void) | null;
}

export interface DeviceParamsRendererProps {
  /** Array of parameters to render */
  params: ESPCDFDeviceParam[];
  /** All device parameters (for derived meta processing) */
  allParams: ESPCDFDeviceParam[];
  /** Whether the device is connected */
  isConnected: boolean;
  /** Callback when updating state changes */
  onSetUpdating: (updating: boolean) => void;
  /** Optional custom params map (if not provided, will be built) */
  paramsMap?: Record<string, any>;
  /** Optional custom style for each parameter wrapper */
  paramWrapperStyle?: ViewStyle;
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

export type ProvisioningStepProps = Omit<ProvisionStep, "timestamp">;

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

export interface BLEPermissionScreenProps {
  status: "requesting" | "denied";
  missingPermission: "ble" | "location" | "both" | "none";
  testIdPrefix?: string;
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
  lastUsedSsid?: string;
  onSelect: (ssid: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

// ============================================================================
// Home Types
// ============================================================================
export interface HomeData {
  roomTabs: RoomTab[];
  rooms: ESPCDFGroup[];
  devices: (ESPCDFDevice & { node: WeakRef<ESPCDFNode> })[];
}

// ============================================================================
// Room Types
// ============================================================================

// Types
export interface Node {
  id: string;
  name: string;
  node?: ESPCDFNode | null; // Make node optional and nullable
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

/** Single device entry that has a power parameter. */
export interface RoomPowerEntry {
  node: NonNullable<
    ReturnType<UseHomeViewModelResult["roomDevices"][number]["node"]["deref"]>
  >;
  device: UseHomeViewModelResult["roomDevices"][number];
  powerParam: ESPCDFDeviceParam;
}

/** Props for RoomControlSwitch. */
export interface RoomControlSwitchProps {
  filteredDevices: UseHomeViewModelResult["roomDevices"];
  roomGroup: ESPCDFGroup | undefined;
}

/** A single tab in the device-type filter bar. */
export interface DeviceTypeFilterTab {
  id: string;
  label: string;
}

/** Props for DeviceTypeFilterTabs. */
export interface DeviceTypeFilterTabsProps {
  roomDevices: UseHomeViewModelResult["roomDevices"];
  activeFilter: string;
  onSelectFilter: (filterId: string) => void;
}

export interface HomeUpdateResponse {
  status: string;
  description?: string;
}

export type RoomParams = {
  param: ESPCDFDeviceParam;
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
export type SharingItem = {
  type: "group";
  /** Matches `ESPCDFGroupSharingRequest.id` (stable across re-fetches) */
  id: string;
  /** Underlying CDF request entity */
  request: ESPCDFGroupSharingRequest;
  /** First group id is used by the notification flow to set current home */
  groupIds: string[];
  primaryUsername: string;
  timestamp: number;
  status: "pending" | "accepted" | "declined";
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  // Loading fields are optional and used only by the UI.
  loading?: boolean;
  acceptLoading?: boolean;
  declineLoading?: boolean;
};

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
/**
 * Clamp value between a minimum and maximum
 * @param value - The value to clamp
 * @param min - The minimum value
 * @param max - The maximum value
 * @returns The clamped value
 */
export const clampValue = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Safe value to string
 * @param value - The value to convert to string
 * @returns The string value
 */
export const safeValueToString = (value: any): string => {
  if (value === null || value === undefined) return "";
  return String(value);
};

/**
 * Get parameter bounds
 * @param param - The parameter to get bounds for
 * @returns The parameter bounds (spread from `param.bounds` when present)
 */
export const getParamBounds = (param: ESPCDFDeviceParam) => {
  return {
    ...param?.bounds,
  };
};

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

// ============================================================================
// Time Picker Types
// ============================================================================

export type TimePeriod = "AM" | "PM";

export interface TimePickerProps {
  /** Whether the time picker is visible */
  visible: boolean;
  /** Callback when the time picker is closed */
  onClose: () => void;
  /** Callback when a time is selected */
  onTimeSelected: (hours: number, minutes: number, period: TimePeriod) => void;
  /** Initial hour value (1-12) */
  initialHour?: number;
  /** Initial minute value (0-59) */
  initialMinute?: number;
  /** Initial period value (AM/PM) */
  initialPeriod?: TimePeriod;
}

export interface TimePickerScrollProps {
  items: number[] | TimePeriod[];
  selected: number | TimePeriod;
  paddingZero?: boolean;
  scrollRef: React.RefObject<ScrollView | null>;
  setter: (value: any) => void;
}

export interface TimePickerScrollHandlerProps {
  event: any;
  items: number[] | TimePeriod[];
  setter: (value: any) => void;
  scrollRef: React.RefObject<ScrollView | null>;
}

// ============================================================================
// Schedule Types
// ============================================================================

// Schedule Component Props
export interface ScheduleDaysProps {
  selectedDays: number[];
  onDayPress: (index: number) => void;
}

export interface ScheduleTimeProps {
  minutes?: number;
  onTimePress: () => void;
}

export interface ScheduleCardProps {
  name: string;
  triggers: ScheduleTrigger[];
  deviceCount: number;
  enabled: boolean;
  isEditing?: boolean;
  onPress?: () => void;
  onDelete?: () => void;
  onToggle?: (value: boolean) => void;
  deleteLoading?: boolean;
  toggleLoading?: boolean;
}

export interface ScheduleDeviceSelectionData {
  node: ESPCDFNode;
  device: ESPCDFDevice;
  isSelected: boolean;
  isMaxScheduleReached: boolean;
}

// Schedule Context Types
export interface ScheduleContextType {
  state: ScheduleState;
  dispatch: React.Dispatch<ScheduleReducerAction>;
  // Schedule Management
  initializeSchedule: () => void;
  handleSaveSchedule: () => Promise<boolean>;
  handleDeleteSchedule: () => Promise<boolean>;
  handleScheduleSync: () => Promise<boolean>;
  checkOfflineNodes: () => boolean;
  // Helper functions
  setScheduleInfo: (schedule: any) => void;
  setScheduleName: (name: string) => void;
  setScheduleId: (id: string) => void;
  setScheduleActions: (actions: Record<string, any>) => void;
  setEditingMode: (isEditing: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  setTriggers: (triggers: ScheduleTrigger[]) => void;
  setActionValue: (nodeId: string, device: string, param: string, value: any) => void;
  addNode: (node: ScheduleNode) => void;
  removeNode: (nodeId: string) => void;
  editNode: (nodeId: string, updates: Partial<ScheduleNode>) => void;
  setNodes: (nodes: ScheduleNode[]) => void;
  resetState: () => void;
  setSelectedDevice: (device: { nodeId: string; deviceName: string; displayName: string; } | null) => void;
  // getters
  getScheduleActions: () => ScheduleAction[];
  getActionValue: (nodeId: string, device: string, param: string) => any;
  checkActionExists: (nodeId: string, device?: string, param?: string) => { exist: boolean; value?: any };
  checkActionExistsInPrevActions: (nodeId: string, device?: string, param?: string) => { exist: boolean; value?: any };
  checkDeviceDisabled: (nodeId: string, deviceName: string | null, isConnected: boolean, hasReachedMax: boolean) => {
    isDisabled: boolean;
    reason?: "offline" | "max_reached";
  };
  // Node sync status
  checkNodeOutOfSync: (nodeId: string) => {
    isOutOfSync: boolean;
    details?: {
      action: Record<string, any>;
      name: string;
      triggers: ScheduleTrigger[];
      flags: number;
    };
  };
  // delete
  deleteActionValue: (nodeId: string, device: string, param: string) => void;
  deleteAction: (nodeId: string, device: string) => void;
  deleteNode: (nodeId: string) => void;
}

export interface ScheduleProviderProps {
  children: ReactNode;
}

export type ScheduleReducerAction =
  | { type: "SET_SCHEDULE_INFO"; payload: { name: string; id: string } }
  | { type: "SET_EDITING_MODE"; payload: boolean }
  | { type: "SET_ENABLED"; payload: boolean }
  | { type: "SET_TRIGGERS"; payload: ScheduleTrigger[] }
  | { type: "SET_NODES"; payload: ScheduleNode[] }
  | { type: "ADD_NODE"; payload: ScheduleNode }
  | { type: "REMOVE_NODE"; payload: string }
  | { type: "EDIT_NODE"; payload: { nodeId: string; updates: Partial<ScheduleNode> } }
  | { type: "RESET_STATE" }
  | { type: "SET_SCHEDULE_NAME"; payload: string }
  | { type: "SET_SCHEDULE_ID"; payload: string }
  | { type: "SET_SCHEDULE_ACTIONS"; payload: Record<string, any> }
  | { type: "SET_PREV_ACTIONS"; payload: Record<string, any> }
  | { type: "SET_VALIDITY"; payload: { start: number; end: number } | null }
  | { type: "SET_INFO"; payload: string | null }
  | { type: "SET_FLAGS"; payload: number | null }
  | { type: "SET_OUT_OF_SYNC_META"; payload: Record<string, any> }
  | { type: "SET_SYNCING"; payload: boolean }
  | { type: "SET_SELECTED_DEVICE"; payload: { nodeId: string; deviceName: string; displayName: string } | null }
  | { type: "SET_ACTION_VALUE"; payload: { nodeId: string; device: string; param: string; value: any } }
  | { type: "DELETE_ACTION_VALUE"; payload: { nodeId: string; device: string; param: string } }
  | { type: "DELETE_ACTION"; payload: { nodeId: string; device: string } }
  | { type: "DELETE_NODE"; payload: string };

export interface ScheduleNode {
  id: string;
  action: Record<string, any>;
  actionDevices: Record<string, any>;
}

export interface ScheduleAction {
  nodeId: string;
  action: Record<string, any>;
  device: ESPCDFDevice;
  displayDeviceName: string;
}

// Schedule Data Types
export interface ScheduleData {
  id: string;
  name: string;
  description: string;
  nodes: string[];
  actions: Record<string, any>;
  enabled: boolean;
  triggers: ScheduleTrigger[];
  validity?: {
    start: number;
    end: number;
  };
  info?: string;
  flags?: number;
  outOfSyncMeta?: Record<string, any>;
  devicesCount?: number;
}

export interface ScheduleTrigger {
  m?: number;
  d?: number;
  dd?: number;
  mm?: number;
  yy?: number;
  r?: boolean;
  rsec?: number;
}

export interface ScheduleActionProps {
  device: ESPCDFDevice;
  displayDeviceName: string;
  action: Record<string, any>;
  onActionPress: () => void;
  nodeId: string;
}

export interface ScheduleState {
  forceUpdateUI: number;
  scheduleName: string;
  scheduleId: string;
  isEditing: boolean;
  enabled: boolean;
  triggers: ScheduleTrigger[];
  prevActions: Record<string, any>;
  actions: ScheduleActionMap;
  nodes: ScheduleNode[];
  nodesRemoved: string[];
  nodesAdded: Record<string, ScheduleNode>;
  nodesEdited: Record<string, ScheduleNode>;
  selectedDevice: {
    nodeId: string;
    deviceName: string;
    displayName: string;
  } | null;
  validity: {
    start: number;
    end: number;
  } | null;
  info: string | null;
  flags: number | null;
  outOfSyncMeta: Record<string, any>;
  isSyncing: boolean;
}

export interface ScheduleActionMap {
  [nodeId: string]: {
    [deviceName: string]: {
      [paramName: string]: any;
    };
  };
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

export interface ScheduleActionsHeaderProps {
  onAddPress: () => void;
  onSyncPress?: () => void;
  isSyncing?: boolean;
}

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
  param: ESPCDFDeviceParam;
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
  };
  isSelected: boolean;
}

export interface DeviceActionParams {
  node: ESPCDFNode;
  device: ESPCDFDevice;
  paramsMap: Record<string, DeviceParamGroup>;
  isMaxSceneReached: boolean;
}

// Types
export interface LoadingState {
  save: boolean;
  delete: boolean;
}

export interface SceneActionsProps {
  device: ESPCDFDevice;
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

export type SceneAction = "activate" | "edit" | "delete";

export type SceneLoadingState = Record<string, SceneAction | undefined>;

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

export interface RoomLeaveProps {
  onLeave: () => void;
  isLoading: boolean;
  showLeave: boolean;
  setShowLeave: (show: boolean) => void;
}

export interface GroupSharingProps {
  sharedUsers: GroupSharedUser[];
  pendingUsers?: GroupSharedUser[];
  sharedByUser: GroupSharedUser | null;
  onRemoveUser: (username: string) => void | Promise<void>;
  onRemovePendingUser?: (username: string) => void | Promise<void>;
  onAddUser: () => void;
  isPrimaryUser: boolean | undefined;
  isLoading: boolean;
  /** Merged with the card wrapper (e.g. margins on create-room scroll) */
  containerStyle?: ViewStyleProp;
}

// ============================================================================
// Device Settings Types
// ============================================================================

export interface AddUserModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: () => void;
  email: string;
  handleInviteChange: (value: string, isValid: boolean) => void;
  isLoading: boolean;
  inviteValidator: (value: string) => { isValid: boolean; error?: string };
  isInviteValid: boolean;
  makePrimary?: boolean;
  onMakePrimaryChange?: (makePrimary: boolean) => void;
  transfer?: boolean;
  onTransferChange?: (transfer: boolean) => void;
  transferAndAssignRole?: boolean;
  onTransferAndAssignRoleChange?: (transferAndAssignRole: boolean) => void;
  /**
   * Show the ownership/transfer role checkboxes (default true). Pass false when the
   * share target has no role support — e.g. room shares always grant room-scoped
   * access and any requested role is ignored.
   */
  showRoleOptions?: boolean;
  /** Merged with the modal card container (e.g. horizontal inset on small screens) */
  contentContainerStyle?: ViewStyleProp;
}

export interface DeviceInfoProps {
  node: ESPCDFNode | undefined;
  nodeConfig: ESPCDFNodeConfig | undefined;
  device: any;
  otaInfo: OTAInfo;
  disabled?: boolean;
}

export interface DeviceNameProps {
  initialDeviceName: string;
  deviceName: string;
  setDeviceName: (name: string) => void;
  setIsEditingName: (editing: boolean) => void;
  onSave: () => void | Promise<boolean>;
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

// ============================================================================
// Automations Types
// ============================================================================
export interface AutomationCardProps {
  /** Automation object from ESPCDFAutomation */
  automation: ESPCDFAutomation;
  /** Callback when automation is pressed */
  onPress?: () => void;
  /** Callback when toggle is changed */
  onToggle?: (enabled: boolean) => void;
  /** Whether the toggle is in loading state */
  toggleLoading?: boolean;
  /** When true, shows delete instead of enable toggle */
  isEditing?: boolean;
  /** Callback when delete is pressed in edit mode */
  onDelete?: () => void;
  /** Whether delete is in progress */
  deleteLoading?: boolean;
}

export interface AutomationDeviceCardProps {
  /** Device object with type and name */
  device: { type: string; name: string };
  /** Display device name */
  displayDeviceName: string;
  /** Type of automation component (event or action) */
  type: "event" | "action";
  /** Action object (for action type) */
  actions?: Record<string, any>;
  /** Event conditions object (for event type) */
  eventConditions?: Record<string, { condition: string; value: any }>;
  /** Callback when device card is pressed */
  onPress: () => void;
}

export interface DeviceSelectionData {
  /** Node object from ESPCDFNode */
  node: ESPCDFNode;
  /** Device object from ESPCDFDevice */
  device: ESPCDFDevice;
  /** Whether the device is selected */
  isSelected: boolean;
  /** Whether max scenes are reached for this device */
  isMaxSceneReached: boolean;
}

// Types
export interface AutomationMenuOption {
  /** Option ID */
  id: string;
  /** Option label */
  label: string;
  /** Option icon */
  icon: React.ReactNode;
  /** Option onPress */
  onPress: () => void;
  /** Whether the option is in loading state */
  loading?: boolean;
  /** Whether the option is destructive */
  destructive?: boolean;
}

export interface AutomationMenuBottomSheetProps {
  /** Automation object from ESPAutomation */
  automation: ESPCDFAutomation | null;
  /** Whether the bottom sheet is visible */
  visible: boolean;
  /** Automation name to display in header */
  automationName: string;
  /** Menu options to display */
  options: AutomationMenuOption[];
  /** Callback when bottom sheet is closed */
  onClose: () => void;
  /** Warning message to display */
  warning?: string;
}

// ============================================================================
// Config Scan Types
// ============================================================================

export type ConfigScanPhase =
  | "info"
  | "scanning"
  | "fetching"
  | "applying"
  | "success"
  | "error";

// ============================================================================
// Chat Types
// ============================================================================

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  messageType?: string;
  isCollapsed?: boolean;
  toolName?: string; // For tool_call_info and tool_result_info
  jsonData?: any; // For JSON messages
  isJsonExpanded?: boolean; // For JSON expandable state
}

// ============================================================================
// Polling Types
// ============================================================================

export interface PollOptions {
  /** Maximum number of attempts (default: 5) */
  maxAttempts?: number;
  /** Interval between attempts in milliseconds (default: 2000) */
  intervalMs?: number;
  /** Optional label for logging purposes */
  label?: string;
  /** Whether to log progress (default: true) */
  enableLogging?: boolean;
}

export interface PollResult<T> {
  /** Whether the polling succeeded */
  success: boolean;
  /** The result data if successful */
  data: T | null;
  /** Number of attempts made */
  attempts: number;
  /** Error message if failed */
  error?: string;
}


// ============================================================================
// Matter commissioning types
// ============================================================================

/** Localized error strings supplied by the commissioning hook (i18n). */
export interface MatterCommissioningErrorMessages {
  fabricIdMismatch: string;
  missingFabricCredentials: string;
}

/** Optional hooks for long-running fabric preparation steps (UI status only). */
export interface MatterCommissioningProgressCallbacks {
  /** Invoked immediately before `issueUserNoC` when credentials are not yet stored. */
  onIssuingCertificate?: () => void;
}

/** Outcome when deciding how to start commissioning for the active home. */
export type FabricCommissioningBootstrap =
  | { kind: "needs_conversion" }
  | { kind: "ready"; fabric: ESPCDFGroup };

/**
 * Input for {@link useCommissioning}, usually from `/(matter)/Commissioning` route params.
 *
 * Commissioning always targets the **current home** in the CDF store—there is no fabric or
 * home picker in this flow.
 * @example
 * ```tsx
 * router.push({
 *   pathname: "/(matter)/Commissioning",
 *   params: {
 *     qrData: matterQrPayload,
 *     fabricConversionConsentRequired: "false",
 *   },
 * });
 * ```
 */
export interface UseCommissioningParams {
  /** Matter onboarding payload from the scanned QR code (typically starts with `MT:`). */
  qrData: string;
  /**
   * When `true`, pause at `needs_conversion` and show fabric conversion consent UI.
   * When `false`, call `convertToMatterFabric` automatically and continue commissioning.
   */
  fabricConversionConsentRequired?: boolean;
}

/**
 * State and callbacks exposed to the Matter commissioning screen.
 *
 * Map `phase` to UI blocks (spinner, consent, error). On `error`, show `errorMessage` plus
 * the scan-again hint; the user goes back via the header to scan a new QR code.
 * @example
 * ```tsx
 * const { phase, statusMessage, errorMessage, onConfirmConvert, onDeclineConvert } =
 *   useCommissioning({ qrData, fabricConversionConsentRequired: true });
 *
 * if (phase === MATTER_COMMISSIONING_PHASE_ERROR) {
 *   return (
 *     <>
 *       <Text>{errorMessage}</Text>
 *       <Text>{t("device.matter.commissioning.scanAgainHint")}</Text>
 *     </>
 *   );
 * }
 * ```
 */
export interface UseCommissioningResult {
  /** Current commissioning step; drives which UI block is shown. */
  phase: MatterCommissioningPhase;
  /** Localized or native progress text shown under the spinner. */
  statusMessage: string;
  /** User-visible error when `phase` is `error`; otherwise `null`. */
  errorMessage: string | null;
  /**
   * The active stack has no Matter support, so `errorMessage` explains that
   * rather than reporting a failure. Rescanning cannot help.
   */
  matterUnsupported: boolean;
  /** Display name of the active home (updated after fabric conversion). */
  activeHomeName: string;
  /** User accepted converting the active home to a Matter fabric. */
  onConfirmConvert: () => void;
  /** User declined conversion; navigates back. */
  onDeclineConvert: () => void;
}

// ============================================================================
// Device Challenge Response Types
// ============================================================================
export interface DeviceChallengeResponse {
  /** Whether the challenge response succeeded */
  success: boolean;
  /** The node ID if successful */
  nodeId?: string;
  /** The signed challenge if successful */
  signedChallenge?: string;
  /** The error message if failed */
  error?: string;
}
/**
 * Result type for checking agent existence and action
 */
export interface AgentExistenceCheckResult {
  /** Whether the agent exists in the list */
  exists: boolean;
  /** The agent if found, null otherwise */
  agent: AgentConfig | null;
  /** Whether the agent should be activated (exists and not already selected) */
  shouldActivate: boolean;
  /** Whether the add modal should be shown (agent doesn't exist) */
  shouldShowModal: boolean;
}

/**
 * Result type for sanitizing agentId
 */
export interface SanitizeAgentIdResult {
  /** Whether the agentId should be processed */
  shouldProcess: boolean;
  /** The trimmed agentId */
  trimmedAgentId: string;
  /** The next processed ID value to store (caller should update ref) */
  nextProcessedId: string | null;
}
// Re-export all agent-related types from utils/agent/types
export type {
  AgentConfig,
  AgentConfigResponse,
  ToolConnectionStatus,
  AIDeviceData,
  AgentSelectionBottomSheetProps,
  AgentConversationsBottomSheetProps,
  Agent,
  UserProfile,
  ConnectedConnector,
  UsageQuota,
  UsageLogEntry,
  UsageHistory,
  UsageByAgent,
  ConversationMessage,
  Conversation,
  ConversationListItem,
  AggregatedAgent,
  AgentValidationResult,
  AgentSource,
  AgentSelectionItemProps,
  AgentCardProps,
  AgentInfoSectionProps,
  AddAgentBottomSheetProps,
  AgentTermsBottomSheetProps,
  OAuthMetadata,
  OAuthState,
  ConversationData,
  MessageDisplayConfig,
  WebSocketMessage,
  FontSizeLevel,
  AgentTermsBottomSheetStyles, AgentConversationsSheetStyles
} from "@features/agent/utils/types";
// Time Series Chart Types
// ============================================================================

/**
 * Chart tab granularity: one calendar bucket size per tab (Daily / Weekly / Monthly).
 */
export type ChartGranularity = "daily" | "weekly" | "monthly";

/**
 * High-level state of the chart view
 */
export type ChartState = "loading" | "error" | "unsupported" | "empty" | "ready";

/**
 * Boundaries of a single chart bucket (one bar slot), before data is loaded.
 */
export interface TimeSeriesBucketBoundary {
  /** Bucket start (inclusive), Unix milliseconds */
  start: number;
  /** Bucket end (exclusive), Unix milliseconds */
  end: number;
  /** Short x-axis label for the bucket (e.g. "12 Jul", "07-13 Jul", "Jul'26"); also the tooltip's period line */
  label: string;
}

/**
 * A chart bucket with its aggregated value (null when the bucket has no data).
 */
export interface TimeSeriesBucket extends TimeSeriesBucketBoundary {
  /** Aggregated value for the bucket, or null when no data was reported */
  value: number | null;
}

/**
 * How the window summary value relates to the buckets.
 */
export type TimeSeriesSummaryKind = "average" | "total";

/**
 * Summary of the visible chart window (the big number above the chart).
 */
export interface TimeSeriesSummary {
  /** Summary value across non-empty buckets, or null when the window is empty */
  value: number | null;
  /** Whether the value is an average or a total of the window */
  kind: TimeSeriesSummaryKind;
}

/**
 * Props for ChartMessage component
 */
export interface ChartMessageProps {
  /** Message text to display in the chart area */
  text: string;
}

/**
 * Props for GranularityTabs component
 */
export interface GranularityTabsProps {
  /** Currently selected granularity */
  selected: ChartGranularity;
  /** Disables tab presses (e.g. while loading) */
  disabled?: boolean;
  /** Handler called with the granularity of the pressed tab */
  onSelect: (granularity: ChartGranularity) => void;
}

/**
 * Props for ChartSummaryHeader component
 */
export interface ChartSummaryHeaderProps {
  /** Formatted summary value with unit (e.g. "76.4 kWh"), or a placeholder */
  valueLabel: string;
  /** Formatted window range label (e.g. "07-Jun-26 to 25-Jul-26") */
  rangeLabel: string;
  /** Whether paging forward (towards now) is possible */
  canGoNext: boolean;
  /** Disables both pagers (e.g. while loading) */
  disabled?: boolean;
  /** Handler for paging one window back in time */
  onPrevious: () => void;
  /** Handler for paging one window forward in time */
  onNext: () => void;
}

/**
 * Props for TimeSeriesBarChart component
 */
export interface TimeSeriesBarChartProps {
  /** The buckets of the visible window, one bar per bucket */
  buckets: TimeSeriesBucket[];
  /** Unit suffix appended to the tooltip value (e.g. "°"), may be empty */
  unit: string;
  /** Index of the selected (highlighted) bucket, or null for no selection */
  selectedIndex: number | null;
  /** Handler called with the tapped bucket index */
  onSelectBar: (index: number) => void;
  /** Render an x-axis label only every Nth bucket (1 = every bucket) */
  labelEveryNth?: number;
}

/**
 * Return type for the useTimeSeriesChart hook
 */
export interface UseTimeSeriesChartResult {
  /** Title for the screen header (param name) */
  title: string;
  /** Currently selected granularity tab */
  granularity: ChartGranularity;
  /** Buckets of the visible window (empty while loading/unsupported) */
  buckets: TimeSeriesBucket[];
  /** Window summary shown above the chart */
  summary: TimeSeriesSummary;
  /** Unit suffix for values (may be empty) */
  unit: string;
  /** Formatted range label for the visible window */
  rangeLabel: string;
  /** Overall view state driving chart vs message rendering */
  chartState: ChartState;
  /** Localized message for every non-ready chart state */
  chartStateLabelMap: Record<Exclude<ChartState, "ready">, string>;
  /** Whether a data request is in flight */
  loading: boolean;
  /** Whether paging forward (towards now) is possible */
  canGoNext: boolean;
  /** Index of the selected bar, or null */
  selectedIndex: number | null;
  /** X-axis label density for the current granularity (1 = label every bucket) */
  labelEveryNth: number;
  /** Selects a granularity tab (resets paging and selection) */
  onSelectGranularity: (granularity: ChartGranularity) => void;
  /** Pages one window back in time */
  onPreviousWindow: () => void;
  /** Pages one window forward in time */
  onNextWindow: () => void;
  /** Selects (highlights) a bar by bucket index */
  onSelectBar: (index: number) => void;
}

// ============================================================================
// Video Player Types
// ============================================================================

/**
 * Connection state types for video player
 */
export enum ConnectionState {
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  LIVE = "live",
  ERROR = "error",
}

/**
 * Props for VideoPlayer component
 */
export interface VideoPlayerProps {
  /** Whether the video is currently playing */
  isPlaying: boolean;
  /** Callback when play button is pressed */
  onPlayPress: () => void;
  /** Callback when fullscreen button is pressed */
  onFullscreenPress: () => void;
  /** Whether the player is in fullscreen mode */
  isFullscreen: boolean;
  /** The video stream source (will be used when WebRTC is connected) */
  videoStream?: MediaStream | null;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: string | null;
  /** Connection state from useCameraWebRTC hook */
  connectionState?: "connected" | "disconnected" | "live" | "error";
  /** Video statistics from useCameraWebRTC hook */
  stats?: VideoStats | null;
  /** Function to enable/disable stats updates from useCameraWebRTC hook */
  setStatsUpdatesEnabled?: (enabled: boolean, isPlaying: boolean) => void;
  /** Whether controls are disabled */
  disabled?: boolean;
  /** Stops the stream (in-video stop-square button) */
  onStop?: () => void;
  /** Whether the mic (audio send) is on */
  isMicEnabled?: boolean;
  /** Toggles the mic */
  onMicToggle?: () => void;
  /** Whether incoming device audio is muted */
  isSpeakerMuted?: boolean;
  /** Toggles incoming-audio mute */
  onSpeakerToggle?: () => void;
}

/**
 * Props for ConnectionStateBadge component
 */
export interface ConnectionStateBadgeProps {
  /** Current connection state */
  state: ConnectionState;
  /** Optional custom test ID */
  testId?: string;
}

/**
 * Props for Controls component
 */
export interface ControlsProps {
  /** Whether the video is currently playing */
  isPlaying: boolean;
  /** Whether the player is in fullscreen mode */
  isFullscreen: boolean;
  /** Whether video stream exists */
  hasVideoStream: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Connection state from useCameraWebRTC hook */
  connectionState: "connected" | "disconnected" | "live" | "error";
  /** Whether controls are disabled */
  disabled?: boolean;
  /** Callback when play button is pressed */
  onPlayPress: () => void;
  /** Callback when fullscreen button is pressed */
  onFullscreenPress: () => void;
  /** Callback when long press is detected (for showing stats) */
  onLongPress?: () => void;
  /** Callback when stats info button is pressed */
  onStatsPress?: () => void;
  /** Safe-area insets, used to keep fullscreen controls clear of the notch/nav bar in landscape */
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
}

/**
 * Video statistics data structure
 */
export interface VideoStats {
  resolution: string;
  currentFps: string;
  receivedFps: string;
  droppedFps: string;
  framesDropped: string;
  codec: string;
  bitrate: string;
  totalData: string;
  packetsRx: string;
  packetsLost: string;
  lossPercent: string;
  jitter: string;
}

/**
 * Props for Stats component
 */
export interface StatsProps {
  /** Whether stats overlay should be visible */
  isVisible: boolean;
  /** Whether the player is in fullscreen mode */
  isFullscreen: boolean;
  /** Whether the video is currently playing */
  isPlaying: boolean;
  /** Video statistics from useCameraWebRTC hook */
  stats: VideoStats | null;
  /** Function to enable/disable stats updates from useCameraWebRTC hook */
  setStatsUpdatesEnabled?: (enabled: boolean, isPlaying: boolean) => void;
  /** Callback when stats overlay should be dismissed */
  onDismiss: () => void;
  /** Whether fullscreen is in landscape mode (rotated) */
  isLandscape?: boolean;
}
