/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from "@testing-library/react-native";
import { useSettings } from "../useSettings";

const mockToast = {
  showSuccess: jest.fn(),
  showError: jest.fn(),
  showWarning: jest.fn(),
};
const mockNavigation = { dispatch: jest.fn() };
/** Latest `usePreventRemove` call: whether leaving is blocked, and its handler. */
const mockLeaveGuard: {
  blocked: boolean;
  onBlocked?: (event: { data: { action: unknown } }) => void;
} = { blocked: false };
let mockStore: unknown;
let mockIsNamedByMatterNodeLabel = false;

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  usePreventRemove: (
    blocked: boolean,
    onBlocked: (event: { data: { action: unknown } }) => void,
  ) => {
    mockLeaveGuard.blocked = blocked;
    mockLeaveGuard.onBlocked = onBlocked;
  },
}));
jest.mock("expo-router", () => ({
  router: { dismissTo: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: "node-1", device: "Light" }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("lucide-react-native", () => ({ List: () => null, RefreshCw: () => null }));
jest.mock("@config/features.config", () => ({
  getFeatures: () => ({ ota: false }),
}));
jest.mock("@shared/hooks/useCDF", () => ({
  useCDF: () => ({ store: mockStore }),
}));
jest.mock("@shared/hooks/useToast", () => ({ useToast: () => mockToast }));
jest.mock("@shared/hooks/useIdentifyAction", () => ({
  useIdentifyAction: () => ({ isIdentifying: false, identify: jest.fn() }),
}));
jest.mock("@shared/utils/device", () => ({ hasActiveControlPath: () => true }));
jest.mock("@shared/utils/deviceIdentify", () => ({
  canIdentifyDevice: () => false,
  identifyDevice: jest.fn(),
}));
jest.mock("@shared/utils/matterController", () => ({
  getMatterControllerConfig: () => ({ canUpdateDeviceList: false }),
  updateMatterControllerDeviceList: jest.fn(),
}));
jest.mock("@shared/utils/userAuthServiceHelper", () => ({
  updateRmakerUserAuthForNode: jest.fn(),
  getNodeRmakerUserAuthConfig: () => ({ canUpdate: false }),
}));
jest.mock("@features/group/utils/controlGroupHelpers", () => ({
  getPrimaryHomogeneousDeviceType: () => undefined,
}));
// The real constants module needs the app's region config, absent in tests.
jest.mock("@shared/utils/constants", () => ({
  ESPRM_NAME_PARAM_TYPE: "esp.param.name",
  ESPRM_PARAM_WRITE_PROPERTY: "write",
  MATTER_METADATA_KEY: "Matter",
  MATTER_METADATA_DEVICE_NAME_KEY: "deviceName",
  RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_REFRESH_TOKEN: "skipped",
  RMAKER_USER_AUTH_UPDATE_RESULT_UPDATED: "updated",
  SUCESS: "success",
}));
jest.mock("@shared/utils/matterBasicInformation", () => ({
  MATTER_NODE_LABEL_MAX_LENGTH: 32,
  isNamedByMatterNodeLabel: () => mockIsNamedByMatterNodeLabel,
  canRenameViaMatterNodeLabel: () => false,
  renameViaMatterNodeLabel: jest.fn(),
}));
jest.mock("@shared/utils/matterNameRetry", () => ({
  pauseMatterNameRetry: jest.fn(async () => () => undefined),
  queueMatterNameRetry: jest.fn(),
  dropMatterNameRetry: jest.fn(),
}));

const BACK = { type: "GO_BACK" };
/** 33 characters: one more than a Matter name holds. */
const NAME_33 = "Living Room Light by the Bookcase";

/** A primary user's node with one device whose name lives in the cloud param. */
function setUpDevice() {
  const setValue = jest.fn().mockResolvedValue(undefined);
  const nameParam = {
    name: "Name",
    type: "esp.param.name",
    properties: ["read", "write"],
    value: "Living Room Light",
    setValue,
  };
  const device = { name: "Light", params: [nameParam] };
  const node = {
    id: "node-1",
    isPrimaryUser: true,
    devices: [device],
    metadata: {},
    nodeConfig: { info: { name: "Light" } },
  };
  mockStore = {
    nodeStore: { nodesByIDMap: { "node-1": node } },
    subscriptionStore: { registeredTransports: {} },
  };
  return { setValue, nameParam };
}

function renderSettings() {
  return renderHook(() => useSettings());
}

/** Types a name the way the field does. */
function typeName(
  result: ReturnType<typeof renderSettings>["result"],
  name: string,
) {
  act(() => result.current.handleDeviceNameChange(name));
}

/** Starts leaving the screen (back button, swipe, hardware back). */
function leave() {
  act(() => mockLeaveGuard.onBlocked?.({ data: { action: BACK } }));
}

describe("useSettings device name", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLeaveGuard.blocked = false;
    mockLeaveGuard.onBlocked = undefined;
    mockIsNamedByMatterNodeLabel = false;
  });

  describe("names that break a rule are never written", () => {
    it("too long for a device whose name also goes to its Matter name", async () => {
      mockIsNamedByMatterNodeLabel = true;
      const { setValue, nameParam } = setUpDevice();
      const { result } = renderSettings();
      expect(result.current.maxNameLength).toBe(32);

      typeName(result, NAME_33);
      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.handleSaveDeviceName();
      });

      expect(saved).toBe(false);
      expect(setValue).not.toHaveBeenCalled();
      expect(nameParam.value).toBe("Living Room Light");
      expect(mockToast.showError).toHaveBeenCalledWith(
        "device.validation.deviceNameTooLong",
      );
      expect(mockToast.showSuccess).not.toHaveBeenCalled();
    });

    it("blank", async () => {
      const { setValue } = setUpDevice();
      const { result } = renderSettings();

      typeName(result, "   ");
      await act(async () => {
        await result.current.handleSaveDeviceName();
      });

      expect(setValue).not.toHaveBeenCalled();
      expect(mockToast.showError).toHaveBeenCalledWith(
        "device.validation.deviceNameCannotBeEmpty",
      );
    });
  });

  describe("leaving with an unsaved name", () => {
    it("does not ask when the name was not edited", () => {
      setUpDevice();
      const { result } = renderSettings();

      expect(mockLeaveGuard.blocked).toBe(false);
      expect(result.current.isLeaveDialogOpen).toBe(false);
    });

    it("does not ask when the name was typed back to what it was", () => {
      setUpDevice();
      const { result } = renderSettings();

      typeName(result, "Living Room Lig");
      typeName(result, "Living Room Light");

      expect(mockLeaveGuard.blocked).toBe(false);
    });

    it("asks, and never saves just because the user left", () => {
      const { setValue } = setUpDevice();
      const { result } = renderSettings();

      typeName(result, "Living Room Lig");
      expect(mockLeaveGuard.blocked).toBe(true);
      leave();

      expect(result.current.isLeaveDialogOpen).toBe(true);
      expect(setValue).not.toHaveBeenCalled();
      expect(mockNavigation.dispatch).not.toHaveBeenCalled();
    });

    it("Save: saves the name, then leaves", async () => {
      const { setValue } = setUpDevice();
      const { result } = renderSettings();

      typeName(result, "Desk Lamp");
      leave();
      await act(async () => {
        await result.current.saveNameAndLeave();
      });

      expect(setValue).toHaveBeenCalledWith("Desk Lamp");
      expect(result.current.isLeaveDialogOpen).toBe(false);
      expect(mockLeaveGuard.blocked).toBe(false);
      expect(mockNavigation.dispatch).toHaveBeenCalledWith(BACK);
    });

    it("Save with a name that breaks a rule: shows the error and stays", async () => {
      mockIsNamedByMatterNodeLabel = true;
      const { setValue } = setUpDevice();
      const { result } = renderSettings();

      typeName(result, NAME_33);
      leave();
      await act(async () => {
        await result.current.saveNameAndLeave();
      });

      expect(setValue).not.toHaveBeenCalled();
      expect(mockToast.showError).toHaveBeenCalledWith(
        "device.validation.deviceNameTooLong",
      );
      expect(result.current.isLeaveDialogOpen).toBe(false);
      expect(mockNavigation.dispatch).not.toHaveBeenCalled();
      expect(mockLeaveGuard.blocked).toBe(true);
    });

    it("Save when the cloud write fails: stays with the edit kept", async () => {
      const { setValue } = setUpDevice();
      setValue.mockRejectedValue(new Error("Node unreachable"));
      const { result } = renderSettings();

      typeName(result, "Desk Lamp");
      leave();
      await act(async () => {
        await result.current.saveNameAndLeave();
      });

      expect(mockToast.showError).toHaveBeenCalledWith(
        "device.errors.failedToUpdateDeviceName",
      );
      expect(mockNavigation.dispatch).not.toHaveBeenCalled();
      expect(result.current.deviceName).toBe("Desk Lamp");
    });

    it("Discard: leaves without saving", () => {
      const { setValue, nameParam } = setUpDevice();
      const { result } = renderSettings();

      typeName(result, "Living Room Lig");
      leave();
      act(() => result.current.discardNameAndLeave());

      expect(setValue).not.toHaveBeenCalled();
      expect(nameParam.value).toBe("Living Room Light");
      expect(mockLeaveGuard.blocked).toBe(false);
      expect(mockNavigation.dispatch).toHaveBeenCalledWith(BACK);
    });

    it("dismissing the question stays on the screen with the edit kept", () => {
      const { setValue } = setUpDevice();
      const { result } = renderSettings();

      typeName(result, "Living Room Lig");
      leave();
      act(() => result.current.stayOnSettings());

      expect(result.current.isLeaveDialogOpen).toBe(false);
      expect(result.current.deviceName).toBe("Living Room Lig");
      expect(setValue).not.toHaveBeenCalled();
      expect(mockNavigation.dispatch).not.toHaveBeenCalled();
      expect(mockLeaveGuard.blocked).toBe(true);
    });
  });
});
