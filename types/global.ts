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
import type { ReactNode } from "react";
import {
  ESPRMDeviceParam,
  ESPRMNode,
  ESPRMDevice,
  ESPRMNodeConfig,
  ESPRMGroup,
  ESPAutomation,
} from "@espressif/rainmaker-base-sdk";
import { AgentConfig } from "@/utils/agent";

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
  extends Omit<ProvisionStep, "timestamp"> { }

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

export interface UserProps { }

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
  scrollRef: React.RefObject<ScrollView>;
  setter: (value: any) => void;
}

export interface TimePickerScrollHandlerProps {
  event: any;
  items: number[] | TimePeriod[];
  setter: (value: any) => void;
  scrollRef: React.RefObject<ScrollView>;
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

export interface ScheduleActionProps {
  device: ESPRMDevice;
  displayDeviceName: string;
  action: Record<string, any>;
  onActionPress: () => void;
}

export interface ScheduleDeviceSelectionData {
  node: ESPRMNode;
  device: ESPRMDevice;
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
  device: ESPRMDevice;
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
  device: ESPRMDevice;
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

export interface ScheduleNode {
  id: string;
  action: Record<string, any>;
  actionDevices: Record<string, any>;
}

export interface ScheduleActionMap {
  [nodeId: string]: {
    [deviceName: string]: {
      [paramName: string]: any;
    };
  };
}

export interface ScheduleAction {
  nodeId: string;
  action: Record<string, any>;
  device: ESPRMDevice;
  displayDeviceName: string;
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
  node: ESPRMNode;
  device: ESPRMDevice;
  isSelected: boolean;
  isMaxScheduleReached: boolean;
}

export interface ScheduleDaysProps {
  selectedDays: number[];
  onDayPress: (index: number) => void;
}

export interface ScheduleTimeProps {
  minutes?: number;
  onTimePress: () => void;
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
  disabled?: boolean;
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

// ============================================================================
// Automations Types
// ============================================================================
export interface AutomationCardProps {
  /** Automation object from ESPAutomation */
  automation: ESPAutomation;
  /** Callback when automation is pressed */
  onPress?: () => void;
  /** Callback when toggle is changed */
  onToggle?: (enabled: boolean) => void;
  /** Whether the toggle is in loading state */
  toggleLoading?: boolean;
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
  /** Node object from ESPRMNode */
  node: ESPRMNode;
  /** Device object from ESPRMDevice */
  device: ESPRMDevice;
  /** Whether the device is selected */
  isSelected: boolean;
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
  automation: ESPAutomation | null;
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
} from "@/utils/agent/types";
