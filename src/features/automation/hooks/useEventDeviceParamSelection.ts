/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback } from "react";
import type {
  ESPCDFDeviceParam,
  ESPCDFDevice,
  ESPCDFAutomationNodeParamsEvent,
} from "@store";
import { ESPCDFAutomationConditionOperator } from "@store";
import { defaultWritableParamValue, filterExcludedParamTypes } from "@shared/utils/paramUtils";
import { useCDF } from "@shared/hooks/useCDF";
import { useAutomation } from "@context/automation.context";
import { getNodeParamsEventForDevice } from "@features/automation/utils/eventDeviceParamSelection";

export interface UseEventDeviceParamSelectionParams {
  isEditingEvent?: string;
}

export interface UseEventDeviceParamSelectionResult {
  /** Device resolved from context selection */
  selectedDevice: ESPCDFDevice | null;
  /** Params for the list (defaults + value on the row that matches saved trigger, if any) */
  params: ESPCDFDeviceParam[];
  /** Row open in the bottom sheet */
  selectedParam: ESPCDFDeviceParam | null;
  setSelectedParam: React.Dispatch<React.SetStateAction<ESPCDFDeviceParam | null>>;
  paramSheetVisible: boolean;
  setParamSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  /** Saved trigger param name from context; list selection border */
  activeEventParam: string | null;
  /** Draft operator in the sheet */
  draftCondition: string;
  setDraftCondition: React.Dispatch<React.SetStateAction<string>>;
  /** Saved node-params event from context for this device */
  persistedNodeParamsEvent: ESPCDFAutomationNodeParamsEvent | null;
  /** True when user must finish sheet save first or no trigger in context yet */
  disableActionButton: boolean;
  /** Persist draft to context and close sheet */
  handleEventConditionSave: () => void;
  /** Open sheet and seed draft from context or defaults */
  handleParamSelect: (param: ESPCDFDeviceParam) => void;
  /** Dismiss sheet without persisting */
  handleParamSheetClose: () => void;
  /** Draft value change from param control */
  handleParamValueChange: (value: unknown) => void;
  /** Route flag for edit vs create automation */
  isEditing: boolean;
}

/**
 * Event device param flow: bottom sheet holds draft edits; **Save** writes to automation context.
 * `state.events` is the single source of truth for the saved trigger (no duplicate committed React state).
 */
export function useEventDeviceParamSelection(
  params: UseEventDeviceParamSelectionParams,
): UseEventDeviceParamSelectionResult {
  const { isEditingEvent } = params;
  const { store } = useCDF();
  const { state, addEvent, updateEvent, setNodeId } = useAutomation();

  const isEditing = isEditingEvent === "true";

  const [selectedParam, setSelectedParam] = useState<ESPCDFDeviceParam | null>(null);
  const [paramSheetVisible, setParamSheetVisible] = useState(false);
  const [draftCondition, setDraftCondition] = useState<string>(
    ESPCDFAutomationConditionOperator.EQUAL,
  );
  const [draftValue, setDraftValue] = useState<unknown>(null);

  const persistedNodeParamsEvent = useMemo(
    () =>
      getNodeParamsEventForDevice(
        state.events,
        state.selectedEventDevice?.deviceName,
        state.selectedEventDevice?.nodeId,
        state.nodeId,
      ),
    [
      state.events,
      state.selectedEventDevice?.deviceName,
      state.selectedEventDevice?.nodeId,
      state.nodeId,
    ],
  );

  const activeEventParam = persistedNodeParamsEvent?.param ?? null;

  const { selectedDevice = null, params: paramsList = [] } = useMemo(() => {
    const nodeId = state.selectedEventDevice?.nodeId;
    if (!nodeId) return {};
    const node = store.nodeStore.nodesByIDMap?.[nodeId];
    if (!node) return {};
    const device = node.devices?.find(
      (d) => d.name === state.selectedEventDevice?.deviceName,
    );
    if (!device) return {};

    const storedEvent = getNodeParamsEventForDevice(
      state.events,
      device.name,
      nodeId,
      state.nodeId,
    );
    const withStoredOrDefaults = (device.params ?? []).map((param) => ({
      ...param,
      value:
        storedEvent !== null && storedEvent.param === param.name
          ? storedEvent.value
          : defaultWritableParamValue(param),
    }));
    const filtered = filterExcludedParamTypes(
      withStoredOrDefaults as ESPCDFDeviceParam[],
    );

    return { selectedDevice: device, params: filtered ?? [] };
  }, [
    state.selectedEventDevice,
    state.events,
    state.nodeId,
    store.nodeStore.nodesByIDMap,
  ]);

  const disableActionButton =
    !selectedDevice || paramSheetVisible || persistedNodeParamsEvent == null;

  const persistNodeParamsEventToContext = useCallback(
    (automationEvent: ESPCDFAutomationNodeParamsEvent) => {
      if (isEditing && state.events.length > 0) {
        updateEvent(0, automationEvent);
      } else {
        addEvent(automationEvent);
      }
      const nodeId = state.selectedEventDevice?.nodeId;
      if (nodeId) setNodeId(nodeId);
    },
    [
      isEditing,
      state.events.length,
      state.selectedEventDevice?.nodeId,
      addEvent,
      updateEvent,
      setNodeId,
    ],
  );

  const handleParamSelect = useCallback(
    (param: ESPCDFDeviceParam) => {
      const stored = getNodeParamsEventForDevice(
        state.events,
        selectedDevice?.name,
        state.selectedEventDevice?.nodeId,
        state.nodeId,
      );
      if (stored?.param === param.name) {
        setDraftCondition(stored.check);
        setDraftValue(stored.value);
      } else {
        setDraftCondition(ESPCDFAutomationConditionOperator.EQUAL);
        setDraftValue(param.value);
      }
      setSelectedParam(param);
      setParamSheetVisible(true);
    },
    [
      state.events,
      selectedDevice?.name,
      state.selectedEventDevice?.nodeId,
      state.nodeId,
    ],
  );

  const handleParamSheetClose = useCallback(() => {
    setParamSheetVisible(false);
    setSelectedParam(null);
  }, []);

  const handleEventConditionSave = useCallback(() => {
    if (!selectedParam || !selectedDevice || draftValue == null) return;

    persistNodeParamsEventToContext({
      deviceName: selectedDevice.name,
      param: selectedParam.name,
      check: draftCondition as ESPCDFAutomationConditionOperator,
      value: draftValue,
    });

    setParamSheetVisible(false);
    setSelectedParam(null);
  }, [
    selectedParam,
    selectedDevice,
    draftValue,
    draftCondition,
    persistNodeParamsEventToContext,
  ]);

  const handleParamValueChange = useCallback((value: unknown) => {
    setDraftValue(value);
    setSelectedParam((prev) => {
      if (!prev) return null;
      return { ...prev, value } as ESPCDFDeviceParam;
    });
  }, []);

  return {
    selectedDevice,
    params: (paramsList ?? []) as ESPCDFDeviceParam[],
    selectedParam,
    setSelectedParam,
    paramSheetVisible,
    setParamSheetVisible,
    activeEventParam,
    draftCondition,
    setDraftCondition,
    persistedNodeParamsEvent,
    disableActionButton,
    handleParamSelect,
    handleParamSheetClose,
    handleEventConditionSave,
    handleParamValueChange,
    isEditing,
  };
}
