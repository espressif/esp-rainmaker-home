/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useReducer, ReactNode } from "react";
import { useCDF } from "@/hooks/useCDF";
import { ESPRMDevice } from "@espressif/rainmaker-base-cdf";
import { deepClone } from "@/utils/common";

// Types
interface SceneNode {
  id: string;
  action: Record<string, any>;
  actionDevices: Record<string, any>;
}

interface SceneState {
  forceUpdateUI: number;
  sceneName: string;
  sceneId: string;
  isEditing: boolean;
  prevActions: Record<string, any>;
  actions: Record<string, any>;
  nodes: SceneNode[];
  nodesRemoved: string[];
  nodesAdded: Record<string, SceneNode>;
  nodesEdited: Record<string, SceneNode>;
  selectedDevice: {
    nodeId: string;
    deviceName: string;
    displayName: string;
  } | null;
}

type SceneAction = {
  nodeId: string;
  action: string;
  device: ESPRMDevice;
  displayDeviceName: string;
};

type SceneReducerAction =
  | { type: "SET_SCENE_INFO"; payload: { name: string; id: string } }
  | { type: "SET_EDITING_MODE"; payload: boolean }
  | { type: "SET_NODES"; payload: SceneNode[] }
  | { type: "ADD_NODE"; payload: SceneNode }
  | { type: "REMOVE_NODE"; payload: string }
  | {
      type: "EDIT_NODE";
      payload: { nodeId: string; updates: Partial<SceneNode> };
    }
  | { type: "RESET_STATE" }
  | { type: "SET_SCENE_NAME"; payload: string }
  | { type: "SET_SCENE_ID"; payload: string }
  | { type: "SET_SCENE_ACTIONS"; payload: Record<string, any> }
  | { type: "SET_PREV_ACTIONS"; payload: Record<string, any> }
  | {
      type: "SET_SELECTED_DEVICE";
      payload: {
        nodeId: string;
        deviceName: string;
        displayName: string;
      } | null;
    }
  | {
      type: "SET_ACTION_VALUE";
      payload: { nodeId: string; device: string; param: string; value: any };
    }
  | {
      type: "DELETE_ACTION_VALUE";
      payload: { nodeId: string; device: string; param: string };
    }
  | { type: "DELETE_ACTION"; payload: { nodeId: string; device: string } }
  | { type: "DELETE_NODE"; payload: string };

// Initial state
const initialState: SceneState = {
  forceUpdateUI: 0,
  sceneName: "",
  sceneId: "",
  isEditing: false,
  prevActions: {},
  actions: {},
  nodes: [],
  nodesRemoved: [],
  nodesEdited: {},
  nodesAdded: {},
  selectedDevice: null,
};

// Reducer
function sceneReducer(
  state: SceneState,
  action: SceneReducerAction
): SceneState {
  state.forceUpdateUI++;
  switch (action.type) {
    case "SET_SCENE_INFO":
      return {
        ...state,
        sceneName: action.payload.name,
        sceneId: action.payload.id,
      };

    case "SET_SCENE_NAME":
      return {
        ...state,
        sceneName: action.payload,
      };

    case "SET_SCENE_ID":
      return {
        ...state,
        sceneId: action.payload,
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

    case "SET_SCENE_ACTIONS":
      return {
        ...state,
        actions: action.payload,
      };

    case "SET_EDITING_MODE":
      return {
        ...state,
        isEditing: action.payload,
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
          } as SceneNode,
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
      // delete action value
      delete actions[nodeId][device][param];

      // delete device if no actions left
      if (Object.keys(actions[nodeId][device]).length === 0) {
        delete actions[nodeId][device];
      }
      // delete node if no devices left
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
      // delete node if no devices left
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

// Context
interface SceneContextType {
  state: SceneState;
  dispatch: React.Dispatch<SceneReducerAction>;
  // Helper functions
  setSceneInfo: (scene: any) => void;
  setSceneName: (name: string) => void;
  setSceneId: (id: string) => void;
  setSceneActions: (actions: Record<string, any>) => void;
  setEditingMode: (isEditing: boolean) => void;
  setActionValue: (
    nodeId: string,
    device: string,
    param: string,
    value: any
  ) => void;
  addNode: (node: SceneNode) => void;
  removeNode: (nodeId: string) => void;
  editNode: (nodeId: string, updates: Partial<SceneNode>) => void;
  setNodes: (nodes: SceneNode[]) => void;
  resetState: () => void;
  setSelectedDevice: (
    device: { nodeId: string; deviceName: string; displayName: string } | null
  ) => void;
  // getters
  getSceneActions: () => SceneAction[];
  getActionValue: (nodeId: string, device: string, param: string) => any;
  checkActionExists: (
    nodeId: string,
    device?: string,
    param?: string
  ) => { exist: boolean; value?: any };
  checkActionExistsInPrevActions: (
    nodeId: string,
    device?: string,
    param?: string
  ) => { exist: boolean; value?: any };
  checkDeviceDisabled: (
    nodeId: string,
    deviceName: string | null,
    isConnected: boolean,
    hasReachedMax: boolean
  ) => {
    isDisabled: boolean;
    reason?: "offline" | "max_reached";
  };
  // delete
  deleteActionValue: (nodeId: string, device: string, param: string) => void;
  deleteAction: (nodeId: string, device: string) => void;
  deleteNode: (nodeId: string) => void;
}

const SceneContext = createContext<SceneContextType | undefined>(undefined);

// Provider Component
interface SceneProviderProps {
  children: ReactNode;
}

export function SceneProvider({ children }: SceneProviderProps) {
  const {
    store: { nodeStore },
  } = useCDF();
  const [state, dispatch] = useReducer(sceneReducer, initialState);

  // Helper functions to make state updates more convenient
  const setSceneInfo = (scene: any) => {
    const { name, id, actions, nodes } = deepClone(scene);

    const sceneNode = nodes.map((nodeId: string) => {
      const node = nodeStore.nodesByID[nodeId];
      return {
        id: node.id,
        action: actions[node.id],
        actionDevices: actions[node.id],
      };
    });

    dispatch({ type: "SET_SCENE_INFO", payload: { name, id } });
    dispatch({ type: "SET_SCENE_ACTIONS", payload: actions });
    dispatch({ type: "SET_PREV_ACTIONS", payload: actions });
    dispatch({ type: "SET_NODES", payload: sceneNode });
    dispatch({ type: "SET_EDITING_MODE", payload: true });
  };
  const setSceneName = (name: string) => {
    dispatch({ type: "SET_SCENE_NAME", payload: name });
  };
  const setSceneId = (id: string) => {
    dispatch({ type: "SET_SCENE_ID", payload: id });
  };
  const setSceneActions = (actions: Record<string, any>) => {
    dispatch({ type: "SET_SCENE_ACTIONS", payload: actions });
  };
  const setEditingMode = (isEditing: boolean) => {
    dispatch({ type: "SET_EDITING_MODE", payload: isEditing });
  };
  const addNode = (node: SceneNode) => {
    dispatch({ type: "ADD_NODE", payload: node });
  };
  const removeNode = (nodeId: string) => {
    dispatch({ type: "REMOVE_NODE", payload: nodeId });
  };
  const editNode = (nodeId: string, updates: Partial<SceneNode>) => {
    dispatch({ type: "EDIT_NODE", payload: { nodeId, updates } });
  };
  const setNodes = (nodes: SceneNode[]) => {
    dispatch({ type: "SET_NODES", payload: nodes });
  };
  const resetState = () => {
    dispatch({ type: "RESET_STATE" });
  };
  const setSelectedDevice = (
    device: { nodeId: string; deviceName: string; displayName: string } | null
  ) => {
    dispatch({ type: "SET_SELECTED_DEVICE", payload: device });
  };
  const setActionValue = (
    nodeId: string,
    device: string,
    param: string,
    value: any
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
  const getSceneActions = (): SceneAction[] => {
    const actions: SceneAction[] = [];

    Object.entries(state.actions).forEach(([nodeId, deviceActions]) => {
      const node = nodeStore.nodesByID[nodeId];
      const deviceNameMap = node.nodeConfig?.devices.reduce((acc, device) => {
        acc[device.name] = device;
        return acc;
      }, {} as Record<string, ESPRMDevice>);

      const sceneActions = Object.entries(deviceActions)
        .filter(([deviceName, action]) => action !== undefined)
        .map(([deviceName, action]) => {
          return {
            nodeId,
            action: action,
            device: deviceNameMap?.[deviceName],
            displayDeviceName: deviceNameMap?.[deviceName]?.displayName,
          };
        }) as SceneAction[];
      actions.push(...sceneActions);
    });
    return actions;
  };

  const checkActionExists = (
    nodeId: string,
    device?: string,
    param?: string
  ): {
    exist: boolean;
    value?: any;
  } => {
    // Check only nodeId
    if (!device && !param) {
      return {
        exist: Boolean(state.actions?.[nodeId]),
        value: state.actions?.[nodeId],
      };
    }

    // Check nodeId and device
    if (device && !param) {
      return {
        exist: Boolean(state.actions?.[nodeId]?.[device]),
        value: state.actions?.[nodeId]?.[device],
      };
    }

    // Check nodeId, device and param
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
    param?: string
  ): {
    exist: boolean;
    value?: any;
  } => {
    // Check only nodeId
    if (!device && !param) {
      return {
        exist: Boolean(state.prevActions?.[nodeId]),
        value: state.prevActions?.[nodeId],
      };
    }

    // Check nodeId and device
    if (device && !param) {
      return {
        exist: Boolean(state.prevActions?.[nodeId]?.[device]),
        value: state.prevActions?.[nodeId]?.[device],
      };
    }

    // Check nodeId, device and param
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

  /**
   * Checks if a device should be disabled based on its status and previous actions
   * @param nodeId - The node ID
   * @param deviceName - The device name
   * @param isConnected - Device connectivity status
   * @param hasReachedMax - Whether device has reached max actions
   * @returns Object containing disabled state and reason
   */
  const checkDeviceDisabled = (
    nodeId: string,
    deviceName: string | null,
    isConnected: boolean,
    hasReachedMax: boolean
  ): {
    isDisabled: boolean;
    reason?: "offline" | "max_reached";
  } => {
    // If device is offline, it's always disabled
    if (isConnected === false) {
      return {
        isDisabled: true,
        reason: "offline",
      };
    }

    // If device has reached max but exists in prev actions, it's not disabled
    if (hasReachedMax) {
      const existsInprevActions = checkActionExistsInPrevActions(
        nodeId,
        deviceName || undefined
      );
      if (!existsInprevActions.exist) {
        return {
          isDisabled: true,
          reason: "max_reached",
        };
      }
    }

    // Device is enabled
    return {
      isDisabled: false,
    };
  };

  const value = {
    state,
    dispatch,
    // setters
    setSceneInfo,
    setSceneName,
    setSceneId,
    setSceneActions,
    setEditingMode,
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
    getSceneActions,
    getActionValue,
    checkActionExists,
    checkActionExistsInPrevActions,
    checkDeviceDisabled,
  };

  return (
    <SceneContext.Provider value={value}>{children}</SceneContext.Provider>
  );
}

// Custom hook for using the Scene context
export function useScene() {
  const context = useContext(SceneContext);
  if (context === undefined) {
    throw new Error("useScene must be used within a SceneProvider");
  }
  return context;
}

export default SceneProvider;
