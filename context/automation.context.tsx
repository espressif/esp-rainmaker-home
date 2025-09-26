/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useCallback,
} from "react";
import { deepClone } from "@/utils/common";
import {
  ESPAutomationEvent,
  ESPAutomationAction,
  ESPAutomationEventOperator,
  ESPAutomationEventType,
  ESPWeatherEvent,
  ESPDaylightEvent,
  ESPWeatherCondition,
  ESPAutomation,
} from "@espressif/rainmaker-base-cdf";

// Hooks
import { useCDF } from "@/hooks/useCDF";
// Types
interface AutomationState {
  forceUpdateUI: number;
  automationName: string;
  automationId: string;
  isEditing: boolean;
  nodeId: string;
  enabled: boolean;
  retrigger: boolean;
  eventType: ESPAutomationEventType;
  eventOperator: ESPAutomationEventOperator;
  // Events (triggers)
  events: (
    | ESPAutomationEvent
    | ESPWeatherEvent
    | ESPWeatherCondition
    | ESPDaylightEvent
  )[];
  // Actions
  prevActions: Record<string, any>;
  actions: Record<string, any>;
  selectedDevice: {
    nodeId: string;
    deviceName: string;
    displayName: string;
  } | null;
  // Event selection
  selectedEventDevice: {
    nodeId: string;
    deviceName: string;
    displayName: string;
  } | null;
}

type AutomationReducerAction =
  | { type: "SET_AUTOMATION_INFO"; payload: { name: string; id: string } }
  | { type: "SET_EDITING_MODE"; payload: boolean }
  | { type: "SET_NODE_ID"; payload: string }
  | { type: "SET_ENABLED"; payload: boolean }
  | { type: "SET_RETRIGGER"; payload: boolean }
  | { type: "SET_EVENT_TYPE"; payload: ESPAutomationEventType }
  | { type: "SET_EVENT_OPERATOR"; payload: ESPAutomationEventOperator }
  | { type: "RESET_STATE" }
  | { type: "SET_AUTOMATION_NAME"; payload: string }
  | { type: "SET_AUTOMATION_ID"; payload: string }
  | { type: "SET_AUTOMATION_ACTIONS"; payload: Record<string, any> }
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
      type: "SET_SELECTED_EVENT_DEVICE";
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
  | {
      type: "ADD_EVENT";
      payload:
        | ESPAutomationEvent
        | ESPWeatherEvent
        | ESPWeatherCondition
        | ESPDaylightEvent;
    }
  | {
      type: "REMOVE_EVENT";
      payload: number; // index of event to remove
    }
  | {
      type: "UPDATE_EVENT";
      payload: {
        index: number;
        event:
          | ESPAutomationEvent
          | ESPWeatherEvent
          | ESPWeatherCondition
          | ESPDaylightEvent;
      };
    };

// Initial state
const initialState: AutomationState = {
  forceUpdateUI: 0,
  automationName: "",
  automationId: "",
  isEditing: false,
  nodeId: "",
  enabled: true,
  retrigger: false,
  eventType: ESPAutomationEventType.NodeParams,
  eventOperator: ESPAutomationEventOperator.AND,
  events: [],
  prevActions: {},
  actions: {},
  selectedDevice: null,
  selectedEventDevice: null,
};

// Reducer
function automationReducer(
  state: AutomationState,
  action: AutomationReducerAction
): AutomationState {
  state.forceUpdateUI++;
  switch (action.type) {
    case "SET_AUTOMATION_NAME":
      return {
        ...state,
        automationName: action.payload,
      };

    case "SET_AUTOMATION_ID":
      return {
        ...state,
        automationId: action.payload,
      };

    case "SET_NODE_ID":
      return {
        ...state,
        nodeId: action.payload,
      };

    case "SET_ENABLED":
      return {
        ...state,
        enabled: action.payload,
      };

    case "SET_RETRIGGER":
      return {
        ...state,
        retrigger: action.payload,
      };

    case "SET_EVENT_TYPE":
      return {
        ...state,
        eventType: action.payload,
      };

    case "SET_EVENT_OPERATOR":
      return {
        ...state,
        eventOperator: action.payload,
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

    case "SET_SELECTED_EVENT_DEVICE":
      return {
        ...state,
        selectedEventDevice: action.payload,
      };

    case "SET_AUTOMATION_ACTIONS":
      return {
        ...state,
        actions: action.payload,
      };

    case "SET_EDITING_MODE":
      return {
        ...state,
        isEditing: action.payload,
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

    case "ADD_EVENT":
      return {
        ...state,
        events: [action.payload],
      };

    case "REMOVE_EVENT":
      return {
        ...state,
        events: state.events.filter((_, index) => index !== action.payload),
      };

    case "UPDATE_EVENT":
      const updatedEvents = [...state.events];
      updatedEvents[action.payload.index] = action.payload.event;
      return {
        ...state,
        events: updatedEvents,
      };

    default:
      return state;
  }
}

// Context
interface AutomationContextType {
  state: AutomationState;
  dispatch: React.Dispatch<AutomationReducerAction>;
  // Helper functions
  setAutomationInfo: (automation: ESPAutomation) => void;
  setAutomationName: (name: string) => void;
  setAutomationId: (id: string) => void;
  setAutomationActions: (actions: Record<string, any>) => void;
  setPrevActions: (actions: Record<string, any>) => void;
  setEditingMode: (isEditing: boolean) => void;
  setNodeId: (nodeId: string) => void;
  setEnabled: (enabled: boolean) => void;
  setRetrigger: (retrigger: boolean) => void;
  setEventType: (eventType: ESPAutomationEventType) => void;
  setEventOperator: (operator: ESPAutomationEventOperator) => void;
  setActionValue: (
    nodeId: string,
    device: string,
    param: string,
    value: any
  ) => void;
  resetState: () => void;
  setSelectedDevice: (
    device: { nodeId: string; deviceName: string; displayName: string } | null
  ) => void;
  setSelectedEventDevice: (
    device: { nodeId: string; deviceName: string; displayName: string } | null
  ) => void;
  // Event management
  addEvent: (
    event:
      | ESPAutomationEvent
      | ESPWeatherEvent
      | ESPWeatherCondition
      | ESPDaylightEvent
  ) => void;
  removeEvent: (index: number) => void;
  updateEvent: (
    index: number,
    event:
      | ESPAutomationEvent
      | ESPWeatherEvent
      | ESPWeatherCondition
      | ESPDaylightEvent
  ) => void;
  // getters
  getAutomationActions: () => ESPAutomationAction[];
  getNodeAutomationEvent: () => ESPAutomationEvent[];
  getActionValue: (nodeId: string, device: string, param: string) => any;
  checkActionExists: (
    nodeId: string,
    device?: string,
    param?: string
  ) => { exist: boolean; value?: any };
  checkDeviceDisabled: (isConnected: boolean) => {
    isDisabled: boolean;
    reason?: "offline";
  };
  // delete
  deleteActionValue: (nodeId: string, device: string, param: string) => void;
  deleteAction: (nodeId: string, device: string) => void;
  // Automation management
  updateAutomation: () => Promise<void>;
  deleteAutomation: () => Promise<void>;
  createAutomation: () => Promise<void>;
}

const AutomationContext = createContext<AutomationContextType | undefined>(
  undefined
);

// Provider Component
interface AutomationProviderProps {
  children: ReactNode;
}

export function AutomationProvider({ children }: AutomationProviderProps) {
  const [state, dispatch] = useReducer(automationReducer, initialState);
  const {
    store: { automationStore, nodeStore },
  } = useCDF();
  // Helper functions to make state updates more convenient
  const setAutomationInfo = useCallback((automation: ESPAutomation) => {
    const {
      automationName,
      automationId,
      actions,
      events,
      enabled,
      retrigger,
      eventType,
      eventOperator,
      nodeId,
    } = deepClone(automation);

    // Convert ESPAutomationAction[] to nested object format
    // ESPAutomationAction has: { nodeId, deviceName, param, value }
    // We need: { [nodeId]: { [deviceName]: { [param]: value } } }
    const convertedActions: Record<
      string,
      Record<string, Record<string, any>>
    > = {};

    if (actions && Array.isArray(actions)) {
      actions.forEach((action: ESPAutomationAction) => {
        const { nodeId, deviceName, param, value } = action;

        // Initialize nested structure if it doesn't exist
        if (!convertedActions[nodeId]) {
          convertedActions[nodeId] = {};
        }
        if (!convertedActions[nodeId][deviceName]) {
          convertedActions[nodeId][deviceName] = {};
        }

        // Set the parameter value
        convertedActions[nodeId][deviceName][param] = value;
      });
    }

    setAutomationName(automationName ?? "");
    setAutomationId(automationId ?? "");
    setAutomationActions(convertedActions);
    setPrevActions(deepClone(convertedActions));
    setEnabled(enabled ?? false);
    setRetrigger(retrigger ?? false);
    setEventType(eventType || ESPAutomationEventType.NodeParams);
    setEventOperator(eventOperator || ESPAutomationEventOperator.AND);
    setEditingMode(true);
    setNodeId(nodeId ?? "");
    // Set events if available
    if (events && events.length > 0) {
      events.forEach(
        (
          event:
            | ESPAutomationEvent
            | ESPWeatherEvent
            | ESPWeatherCondition
            | ESPDaylightEvent
        ) => {
          addEvent(event);
        }
      );
    }
  }, []);

  const setAutomationName = useCallback((name: string) => {
    dispatch({ type: "SET_AUTOMATION_NAME", payload: name });
  }, []);

  const setAutomationId = useCallback((id: string) => {
    dispatch({ type: "SET_AUTOMATION_ID", payload: id });
  }, []);

  const setAutomationActions = (actions: Record<string, any>) => {
    dispatch({ type: "SET_AUTOMATION_ACTIONS", payload: actions });
  };

  const setPrevActions = (actions: Record<string, any>) => {
    dispatch({ type: "SET_PREV_ACTIONS", payload: actions });
  };

  const setEditingMode = (isEditing: boolean) => {
    dispatch({ type: "SET_EDITING_MODE", payload: isEditing });
  };

  const setNodeId = (nodeId: string) => {
    dispatch({ type: "SET_NODE_ID", payload: nodeId });
  };

  const setEnabled = (enabled: boolean) => {
    dispatch({ type: "SET_ENABLED", payload: enabled });
  };

  const setRetrigger = useCallback((retrigger: boolean) => {
    dispatch({ type: "SET_RETRIGGER", payload: retrigger });
  }, []);

  const setEventType = (eventType: ESPAutomationEventType) => {
    dispatch({ type: "SET_EVENT_TYPE", payload: eventType });
  };

  const setEventOperator = (operator: ESPAutomationEventOperator) => {
    dispatch({ type: "SET_EVENT_OPERATOR", payload: operator });
  };

  const resetState = useCallback(() => {
    dispatch({ type: "RESET_STATE" });
  }, []);

  const setSelectedDevice = (
    device: { nodeId: string; deviceName: string; displayName: string } | null
  ) => {
    dispatch({ type: "SET_SELECTED_DEVICE", payload: device });
  };

  const setSelectedEventDevice = (
    device: { nodeId: string; deviceName: string; displayName: string } | null
  ) => {
    dispatch({ type: "SET_SELECTED_EVENT_DEVICE", payload: device });
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

  // Event management
  const addEvent = (
    event:
      | ESPAutomationEvent
      | ESPWeatherEvent
      | ESPWeatherCondition
      | ESPDaylightEvent
  ) => {
    dispatch({ type: "ADD_EVENT", payload: event });
  };

  const removeEvent = (index: number) => {
    dispatch({ type: "REMOVE_EVENT", payload: index });
  };

  const updateEvent = (
    index: number,
    event:
      | ESPAutomationEvent
      | ESPWeatherEvent
      | ESPWeatherCondition
      | ESPDaylightEvent
  ) => {
    dispatch({ type: "UPDATE_EVENT", payload: { index, event } });
  };

  // getters
  const getAutomationActions = (): ESPAutomationAction[] => {
    const actions: ESPAutomationAction[] = [];

    Object.entries(state.actions).forEach(([nodeId, deviceActions]) => {
      // Iterate through each device and its parameters to create individual actions
      Object.entries(deviceActions).forEach(([deviceName, deviceParams]) => {
        if (deviceParams && typeof deviceParams === "object") {
          // Create separate action for each parameter-value pair
          Object.entries(deviceParams as Record<string, any>).forEach(
            ([paramName, value]) => {
              actions.push({
                nodeId,
                deviceName,
                param: paramName,
                value: value,
              });
            }
          );
        }
      });
    });
    return actions;
  };

  const getNodeAutomationEvent = () => {
    // Filter and validate events to ensure they are ESPAutomationEvent type
    return state.events.filter((event) => {
      return (
        typeof event === "object" &&
        event !== null &&
        "deviceName" in event &&
        "param" in event &&
        "check" in event &&
        "value" in event
      );
    }) as ESPAutomationEvent[];
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

  /**
   * Checks if a device should be disabled based on its status
   * @param isConnected - Device connectivity status
   * @returns Object containing disabled state and reason
   */
  const checkDeviceDisabled = (
    isConnected: boolean
  ): {
    isDisabled: boolean;
    reason?: "offline";
  } => {
    // If device is offline, it's always disabled
    if (isConnected === false) {
      return {
        isDisabled: true,
        reason: "offline",
      };
    }

    // Device is enabled
    return {
      isDisabled: false,
    };
  };
  // Automation management
  const updateAutomation = async () => {
    // automation payload for update operation
    const automationPayload = {
      name: state.automationName,
      enabled: state.enabled,
      retrigger: state.retrigger,
      nodeId: state.nodeId,
      events: getNodeAutomationEvent(),
      actions: getAutomationActions(),
    };

    // Update existing automation using payload
    const automation = automationStore.getAutomationById(state.automationId);
    if (automation) {
      await automation.update(automationPayload);
    }
  };

  const deleteAutomation = async () => {
    const automation = automationStore.getAutomationById(state.automationId);
    if (automation) {
      await automation.delete();
    }
  };

  const createAutomation = async () => {
    const automationDetails = {
      name: state.automationName,
      retrigger: state.retrigger,
      eventOperator: state.eventOperator,
      events: getNodeAutomationEvent(),
      actions: getAutomationActions(),
    };

    // Get the node to call addAutomation (node of the event) using memoized details
    const eventNodeId = state.nodeId;
    const node = nodeStore.nodesByID[eventNodeId!];

    // Call the addAutomation API
    await node.addAutomation(automationDetails);
  };

  const value = {
    state,
    dispatch,
    // setters
    setAutomationInfo,
    setAutomationName,
    setAutomationId,
    setAutomationActions,
    setPrevActions,
    setEditingMode,
    setNodeId,
    setEnabled,
    setRetrigger,
    setEventType,
    setEventOperator,
    resetState,
    setSelectedDevice,
    setSelectedEventDevice,
    setActionValue,
    // Event management
    addEvent,
    removeEvent,
    updateEvent,
    // delete
    deleteActionValue,
    deleteAction,
    // getters
    getAutomationActions,
    getNodeAutomationEvent,
    getActionValue,
    checkActionExists,
    checkDeviceDisabled,
    // Automation management
    updateAutomation,
    deleteAutomation,
    createAutomation,
  };

  return (
    <AutomationContext.Provider value={value}>
      {children}
    </AutomationContext.Provider>
  );
}

// Custom hook for using the Automation context
export function useAutomation() {
  const context = useContext(AutomationContext);
  if (context === undefined) {
    throw new Error("useAutomation must be used within an AutomationProvider");
  }
  return context;
}

export default AutomationProvider;
