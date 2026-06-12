/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import { createContext, useContext, useReducer } from "react";
import { useCDF } from "@shared/hooks/useCDF";
import { ESPCDFDevice } from "@store";
import { deepClone, generateRandomId } from "@shared/utils/common";
import {
  createStoreParamLookup,
  sanitizeDeviceActionsMap,
} from "@shared/utils/paramValueValidation";
import { useToast } from "@shared/hooks/useToast";
import { useTranslation } from "react-i18next";
import { SUCESS } from "@shared/utils/constants";
import type {
  ScheduleNode,
  ScheduleState,
  ScheduleAction,
  ScheduleReducerAction,
  ScheduleContextType,
  ScheduleProviderProps,
  ScheduleTrigger,
} from "@src/types/global";

// Initial state
const initialState: ScheduleState = {
  forceUpdateUI: 0,
  scheduleName: "",
  scheduleId: "",
  isEditing: false,
  enabled: false,
  triggers: [],
  prevActions: {},
  actions: {},
  nodes: [],
  nodesRemoved: [],
  nodesEdited: {},
  nodesAdded: {},
  selectedDevice: null,
  validity: null,
  info: null,
  flags: null,
  outOfSyncMeta: {},
  isSyncing: false,
};

// Reducer
function scheduleReducer(
  state: ScheduleState,
  action: ScheduleReducerAction,
): ScheduleState {
  state.forceUpdateUI++;
  switch (action.type) {
    case "SET_SCHEDULE_INFO":
      return {
        ...state,
        scheduleName: action.payload.name,
        scheduleId: action.payload.id,
      };

    case "SET_SCHEDULE_NAME":
      return {
        ...state,
        scheduleName: action.payload,
      };

    case "SET_SCHEDULE_ID":
      return {
        ...state,
        scheduleId: action.payload,
      };

    case "SET_ENABLED":
      return {
        ...state,
        enabled: action.payload,
      };

    case "SET_TRIGGERS":
      return {
        ...state,
        triggers: action.payload,
      };

    case "SET_PREV_ACTIONS":
      return {
        ...state,
        prevActions: action.payload,
      };

    case "SET_SELECTED_DEVICE":
      return {
        ...state,
        selectedDevice: action.payload,
      };

    case "SET_SCHEDULE_ACTIONS":
      return {
        ...state,
        actions: action.payload,
      };

    case "SET_EDITING_MODE":
      return {
        ...state,
        isEditing: action.payload,
      };

    case "SET_VALIDITY":
      return {
        ...state,
        validity: action.payload,
      };

    case "SET_INFO":
      return {
        ...state,
        info: action.payload,
      };

    case "SET_FLAGS":
      return {
        ...state,
        flags: action.payload,
      };

    case "SET_OUT_OF_SYNC_META":
      return {
        ...state,
        outOfSyncMeta: action.payload,
      };

    case "SET_SYNCING":
      return {
        ...state,
        isSyncing: action.payload,
      };

    case "SET_NODES":
      return {
        ...state,
        nodes: action.payload,
      };

    case "ADD_NODE":
      return {
        ...state,
        nodes: [...state.nodes, action.payload],
        nodesAdded: {
          ...state.nodesAdded,
          [action.payload.id]: action.payload,
        },
      };

    case "REMOVE_NODE":
      return {
        ...state,
        nodes: state.nodes.filter((node) => node.id !== action.payload),
        nodesRemoved: [...state.nodesRemoved, action.payload],
      };

    case "EDIT_NODE":
      const { nodeId, updates } = action.payload;
      return {
        ...state,
        nodesEdited: {
          ...state.nodesEdited,
          [nodeId]: {
            ...state.nodes.find((node) => node.id === nodeId),
            ...updates,
          } as ScheduleNode,
        },
      };

    case "RESET_STATE":
      return initialState;

    case "SET_ACTION_VALUE": {
      let actions = state.actions;
      if (!actions) {
        actions = {};
      }
      actions = {
        ...actions,
        [action.payload.nodeId]: {
          ...(actions[action.payload.nodeId] || {}),
          [action.payload.device]: {
            ...((actions[action.payload.nodeId] &&
              actions[action.payload.nodeId][action.payload.device]) ||
              {}),
            [action.payload.param]: action.payload.value,
          },
        },
      };
      return {
        ...state,
        actions: actions,
      };
    }

    case "DELETE_ACTION_VALUE": {
      const actions = state.actions;
      const { nodeId, device, param } = action.payload;
      delete actions[nodeId][device][param];

      if (Object.keys(actions[nodeId][device]).length === 0) {
        delete actions[nodeId][device];
      }
      if (Object.keys(actions[nodeId]).length === 0) {
        delete actions[nodeId];
      }

      return {
        ...state,
        actions: actions,
      };
    }

    case "DELETE_ACTION": {
      const actions = state.actions;
      delete actions[action.payload.nodeId][action.payload.device];
      if (Object.keys(actions[action.payload.nodeId]).length === 0) {
        delete actions[action.payload.nodeId];
      }
      return {
        ...state,
        actions: actions,
      };
    }

    case "DELETE_NODE": {
      const actions = state.actions;
      delete actions[action.payload];
      return {
        ...state,
        actions: actions,
      };
    }

    default:
      return state;
  }
}

const ScheduleContext = createContext<ScheduleContextType | undefined>(
  undefined,
);

/**
 * Wraps schedule create/edit: triggers, actions, validity, and save/delete via schedule store and APIs.
 */
export function ScheduleProvider({ children }: ScheduleProviderProps) {
  const { store } = useCDF();
  const [state, dispatch] = useReducer(scheduleReducer, initialState);
  const toast = useToast();
  const { t } = useTranslation();

  // Initialize schedule
  const initializeSchedule = () => {
    if (!state.isEditing) {
      const id = generateRandomId();
      dispatch({ type: "SET_SCHEDULE_ID", payload: id });
    }
  };

  /**
   * Coerces every action value to the param's wire type (e.g. untouched
   * slider "" → 0) so the firmware never receives values it cannot parse.
   */
  const sanitizeActionsForSave = (
    actions: Record<string, any>,
  ): Record<string, any> =>
    sanitizeDeviceActionsMap(
      actions,
      createStoreParamLookup(store?.nodeStore ?? {}),
    );

  // Handle schedule creation/update
  const handleSaveSchedule = async () => {
    try {
      // Validate required fields
      if (!state.scheduleName || !state.scheduleName.trim()) {
        toast.showError(t("schedule.errors.scheduleCreationFailed"));
        return false;
      }
      if (!state.triggers || state.triggers.length === 0) {
        toast.showError(t("schedule.errors.scheduleCreationFailed"));
        return false;
      }
      if (!state.actions || Object.keys(state.actions).length === 0) {
        toast.showError(t("schedule.errors.scheduleCreationFailed"));
        return false;
      }

      const sanitizedActions = sanitizeActionsForSave(state.actions);

      const scheduleData = {
        id: state.scheduleId,
        name: state.scheduleName.trim(),
        info: state.info || "",
        nodes: Object.keys(sanitizedActions),
        action: sanitizedActions,
        triggers: state.triggers,
        enabled: state.enabled ?? false,
        validity: state.validity,
        flags: state.flags,
      };

      if (state.isEditing) {
        // Update schedule - use existing schedule entity's edit method
        if (!store?.scheduleStore) {
          toast.showError(t("schedule.errors.scheduleCreationFailed"));
          return false;
        }
        const schedule = store.scheduleStore.schedulesByID?.[state.scheduleId];
        if (!schedule) {
          toast.showError(t("schedule.errors.scheduleNotFound"));
          return false;
        }

        let resp = (await schedule.edit({
          name: scheduleData.name,
          action: scheduleData.action,
          triggers: state.triggers,
          info: scheduleData.info,
          flags: scheduleData.flags ?? undefined,
          validity: scheduleData.validity ?? undefined,
          enabled: scheduleData.enabled,
        })) as any;

        resp = Array.isArray(resp) ? resp : resp.data;
        if (resp && resp.some((resp: any) => resp.status !== SUCESS)) {
          toast.showError(t("schedule.schedules.someDevicesFailedUpdate"));
          return false;
        } else {
          toast.showSuccess(
            t("schedule.createSchedule.scheduleUpdatedSuccessfully"),
          );
          return true;
        }
      } else {
        // Create schedule - use group-based creation if home group is available
        if (!store?.groupStore) {
          toast.showError(t("schedule.errors.scheduleCreationFailed"));
          return false;
        }
        const currentHomeId = store.groupStore?.currentHomeId;
        const currentHome = currentHomeId
          ? store.groupStore?.groupsByIDMap?.[currentHomeId]
          : null;

        if (currentHome) {
          // Use group-based schedule creation
          try {
            const schedule = await currentHome.createSchedule(
              scheduleData as any,
            );
            if (schedule) {
              let resp = await schedule.add() as any;
              resp = Array.isArray(resp) ? resp : resp.data;
              if (resp && resp.some((resp: any) => resp.status !== SUCESS)) {
                toast.showError(
                  t("schedule.schedules.someDevicesFailedUpdate"),
                );
                return false;
              }
            } else {
              toast.showError(t("schedule.errors.scheduleCreationFailed"));
              return false;
            }
            toast.showSuccess(
            t("schedule.createSchedule.scheduleCreatedSuccessfully"),
            );
            return true;
          } catch (error) {
            console.error("Error creating schedule:", error);
            toast.showError(t("schedule.errors.scheduleCreationFailed"));
            return false;
          }
        } else {
          toast.showError(t("schedule.errors.scheduleCreationFailed"));
          return false;
        }
      }
    } catch (error) {
      console.error("Error saving schedule:", error);
      toast.showError(t("schedule.errors.scheduleCreationFailed"));
      return false;
    }
  };

  // Handle schedule deletion
  const handleDeleteSchedule = async () => {
    try {
      if (!store?.scheduleStore) {
        toast.showError(t("schedule.errors.scheduleNotFound"));
        return false;
      }
      const schedule = store.scheduleStore.schedulesByID?.[state.scheduleId];
      if (!schedule) {
        toast.showError(t("schedule.errors.scheduleNotFound"));
        return false;
      }

      let resp = await schedule.remove() as any;
      resp = Array.isArray(resp) ? resp : resp.data;
      if (resp && resp.some((resp: any) => resp.status !== SUCESS)) {
        toast.showError(t("schedule.schedules.someDevicesFailedDelete"));
        return false;
      } else {
        toast.showSuccess(
          t("schedule.createSchedule.scheduleDeletedSuccessfully"),
        );
        return true;
      }
    } catch (error) {
      console.error("Error deleting schedule:", error);
      toast.showError(t("schedule.errors.scheduleDeletionFailed"));
      return false;
    }
  };

  // Check if any nodes are offline
  const checkOfflineNodes = () => {
    if (!store?.nodeStore) {
      return false;
    }
    return state.nodes.some(
      (node) =>
        !store.nodeStore.nodesByIDMap[node.id].connectivityStatus?.isConnected,
    );
  };

  // Handle syncing out-of-sync nodes
  const handleScheduleSync = async () => {
    dispatch({ type: "SET_SYNCING", payload: true });
    try {
      const sanitizedActions = sanitizeActionsForSave(state.actions);

      const scheduleData = {
        id: state.scheduleId,
        name: state.scheduleName,
        description: "",
        nodes: state.nodes.map((node) => node.id),
        action: sanitizedActions,
        triggers: state.triggers,
        enabled: state.enabled,
        validity: state.validity,
        info: state.info,
        flags: state.flags,
      };

      if (!store?.scheduleStore) {
        toast.showError(t("schedule.errors.scheduleNotFound"));
        return false;
      }
      const schedule = store.scheduleStore.schedulesByID?.[state.scheduleId];
      if (!schedule) {
        toast.showError(t("schedule.errors.scheduleNotFound"));
        return false;
      }

      const resp = (await schedule.edit({
        name: scheduleData.name,
        action: scheduleData.action,
        triggers: scheduleData.triggers,
        info: scheduleData.info ?? undefined,
        flags: scheduleData.flags ?? undefined,
        validity: scheduleData.validity ?? undefined,
        enabled: scheduleData.enabled,
      })) as any;
      if (resp && resp.some((resp: any) => resp.status !== SUCESS)) {
        toast.showError(t("schedule.schedules.someDevicesFailedUpdate"));
        return false;
      } else {
        toast.showSuccess(
          t("schedule.createSchedule.scheduleSyncSuccessfully"),
        );
        dispatch({ type: "SET_OUT_OF_SYNC_META", payload: {} });
        return true;
      }
    } catch (error) {
      console.error("Error syncing schedule:", error);
      toast.showError(t("schedule.errors.scheduleSyncFailed"));
      return false;
    } finally {
      dispatch({ type: "SET_SYNCING", payload: false });
    }
  };

  // Helper functions to make state updates more convenient
  const setScheduleInfo = (schedule: any) => {
    if (!store?.nodeStore) {
      return;
    }

    const {
      name,
      id,
      actions,
      nodes,
      enabled,
      triggers,
      validity,
      info,
      flags,
      outOfSyncMeta,
    } = deepClone(schedule);

    const scheduleNode = nodes.map((nodeId: string) => {
      const node = store.nodeStore.nodesByIDMap[nodeId];
      return {
        id: node.id,
        action: actions[node.id],
        actionDevices: actions[node.id],
      };
    });

    dispatch({ type: "SET_SCHEDULE_INFO", payload: { name, id } });
    dispatch({ type: "SET_SCHEDULE_ACTIONS", payload: actions });
    dispatch({ type: "SET_PREV_ACTIONS", payload: actions });
    dispatch({ type: "SET_NODES", payload: scheduleNode });
    dispatch({ type: "SET_ENABLED", payload: enabled });
    dispatch({ type: "SET_TRIGGERS", payload: triggers });
    dispatch({ type: "SET_VALIDITY", payload: validity });
    dispatch({ type: "SET_INFO", payload: info });
    dispatch({ type: "SET_FLAGS", payload: flags });
    dispatch({ type: "SET_OUT_OF_SYNC_META", payload: outOfSyncMeta });
    dispatch({ type: "SET_EDITING_MODE", payload: true });
  };

  const setScheduleName = (name: string) => {
    dispatch({ type: "SET_SCHEDULE_NAME", payload: name });
  };

  const setScheduleId = (id: string) => {
    dispatch({ type: "SET_SCHEDULE_ID", payload: id });
  };

  const setScheduleActions = (actions: Record<string, any>) => {
    dispatch({ type: "SET_SCHEDULE_ACTIONS", payload: actions });
  };

  const setEditingMode = (isEditing: boolean) => {
    dispatch({ type: "SET_EDITING_MODE", payload: isEditing });
  };

  const setEnabled = (enabled: boolean) => {
    dispatch({ type: "SET_ENABLED", payload: enabled });
  };

  const setTriggers = (triggers: ScheduleTrigger[]) => {
    dispatch({ type: "SET_TRIGGERS", payload: triggers });
  };

  const addNode = (node: ScheduleNode) => {
    dispatch({ type: "ADD_NODE", payload: node });
  };

  const removeNode = (nodeId: string) => {
    dispatch({ type: "REMOVE_NODE", payload: nodeId });
  };

  const editNode = (nodeId: string, updates: Partial<ScheduleNode>) => {
    dispatch({ type: "EDIT_NODE", payload: { nodeId, updates } });
  };

  const setNodes = (nodes: ScheduleNode[]) => {
    dispatch({ type: "SET_NODES", payload: nodes });
  };

  const resetState = () => {
    dispatch({ type: "RESET_STATE" });
  };

  const setSelectedDevice = (
    device: { nodeId: string; deviceName: string; displayName: string } | null,
  ) => {
    dispatch({ type: "SET_SELECTED_DEVICE", payload: device });
  };

  const setActionValue = (
    nodeId: string,
    device: string,
    param: string,
    value: any,
  ) => {
    dispatch({
      type: "SET_ACTION_VALUE",
      payload: { nodeId, device, param, value },
    });
  };

  const deleteActionValue = (nodeId: string, device: string, param: string) => {
    dispatch({
      type: "DELETE_ACTION_VALUE",
      payload: { nodeId, device, param },
    });
  };

  const deleteAction = (nodeId: string, device: string) => {
    dispatch({ type: "DELETE_ACTION", payload: { nodeId, device } });
  };

  const deleteNode = (nodeId: string) => {
    dispatch({ type: "DELETE_NODE", payload: nodeId });
  };

  // getters
  const getScheduleActions = (): ScheduleAction[] => {
    if (!store?.nodeStore) {
      return [];
    }

    const actions: ScheduleAction[] = [];

    Object.entries(state.actions).forEach(([nodeId, deviceActions]) => {
      const node = store.nodeStore.nodesByIDMap[nodeId];
      const deviceNameMap = (node.devices || []).reduce(
        (acc: Record<string, any>, device: any) => {
          acc[device.name] = device;
          return acc;
        },
        {} as Record<string, any>,
      );

      const scheduleActions = Object.entries(deviceActions)
        .filter(([_, action]) => action !== undefined)
        .map(([deviceName, action]) => {
          return {
            nodeId,
            action: action as Record<string, any>,
            device: deviceNameMap?.[deviceName] as ESPCDFDevice,
            displayDeviceName: deviceNameMap?.[deviceName]?.displayName || "",
          } as ScheduleAction;
        }) as ScheduleAction[];
      actions.push(...scheduleActions);
    });
    return actions;
  };

  const checkActionExists = (
    nodeId: string,
    device?: string,
    param?: string,
  ): {
    exist: boolean;
    value?: any;
  } => {
    if (!device && !param) {
      return {
        exist: Boolean(state.actions?.[nodeId]),
        value: state.actions?.[nodeId],
      };
    }

    if (device && !param) {
      return {
        exist: Boolean(state.actions?.[nodeId]?.[device]),
        value: state.actions?.[nodeId]?.[device],
      };
    }

    if (device && param) {
      return {
        exist: state.actions?.[nodeId]?.[device]?.[param] !== undefined,
        value: state.actions?.[nodeId]?.[device]?.[param],
      };
    }

    return {
      exist: false,
      value: undefined,
    };
  };

  const getActionValue = (nodeId: string, device: string, param: string) => {
    return state.actions?.[nodeId]?.[device]?.[param] ?? null;
  };

  const checkActionExistsInPrevActions = (
    nodeId: string,
    device?: string,
    param?: string,
  ): {
    exist: boolean;
    value?: any;
  } => {
    if (!device && !param) {
      return {
        exist: Boolean(state.prevActions?.[nodeId]),
        value: state.prevActions?.[nodeId],
      };
    }

    if (device && !param) {
      return {
        exist: Boolean(state.prevActions?.[nodeId]?.[device]),
        value: state.prevActions?.[nodeId]?.[device],
      };
    }

    if (device && param) {
      return {
        exist: state.prevActions?.[nodeId]?.[device]?.[param] !== undefined,
        value: state.prevActions?.[nodeId]?.[device]?.[param],
      };
    }

    return {
      exist: false,
      value: undefined,
    };
  };

  const checkDeviceDisabled = (
    nodeId: string,
    deviceName: string | null,
    isConnected: boolean,
    hasReachedMax: boolean,
  ): {
    isDisabled: boolean;
    reason?: "offline" | "max_reached";
  } => {
    if (isConnected === false) {
      return {
        isDisabled: true,
        reason: "offline",
      };
    }

    if (hasReachedMax) {
      const existsInprevActions = checkActionExistsInPrevActions(
        nodeId,
        deviceName || undefined,
      );
      if (!existsInprevActions.exist) {
        return {
          isDisabled: true,
          reason: "max_reached",
        };
      }
    }

    return {
      isDisabled: false,
    };
  };

  /**
   * Checks if a node is out of sync by comparing its current state with outOfSyncMeta
   * @param nodeId - The ID of the node to check
   * @returns Object containing sync status and details
   */
  const checkNodeOutOfSync = (
    nodeId: string,
  ): {
    isOutOfSync: boolean;
    details?: {
      action: Record<string, any>;
      name: string;
      triggers: ScheduleTrigger[];
      flags: number;
    };
  } => {
    // Check if node exists in outOfSyncMeta
    const outOfSyncData = state.outOfSyncMeta[nodeId];
    if (!outOfSyncData) {
      return { isOutOfSync: false };
    }

    // Return out of sync status and details
    return {
      isOutOfSync: true,
      details: {
        ...outOfSyncData,
      },
    };
  };

  const value: ScheduleContextType = {
    state,
    dispatch,
    // Schedule Management
    initializeSchedule,
    handleSaveSchedule,
    handleDeleteSchedule,
    handleScheduleSync,
    checkOfflineNodes,
    // setters
    setScheduleInfo,
    setScheduleName,
    setScheduleId,
    setScheduleActions,
    setEditingMode,
    setEnabled,
    setTriggers,
    addNode,
    removeNode,
    editNode,
    setNodes,
    resetState,
    setSelectedDevice,
    setActionValue,
    // delete
    deleteActionValue,
    deleteAction,
    deleteNode,
    // getters
    getScheduleActions,
    getActionValue,
    checkActionExists,
    checkActionExistsInPrevActions,
    checkDeviceDisabled,
    checkNodeOutOfSync,
  };

  return (
    <ScheduleContext.Provider value={value}>
      {children}
    </ScheduleContext.Provider>
  );
}

/**
 * Schedule editor context value (must be used under `ScheduleProvider`).
 */
export function useSchedule() {
  const context = useContext(ScheduleContext);
  if (context === undefined) {
    throw new Error("useSchedule must be used within a ScheduleProvider");
  }
  return context;
}

export default ScheduleProvider;
