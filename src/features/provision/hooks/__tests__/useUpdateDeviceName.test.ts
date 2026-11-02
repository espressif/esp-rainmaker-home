/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from "@testing-library/react-native";
import { queueMatterNameRetry } from "@shared/utils/matterNameRetry";
import { useUpdateDeviceName } from "../useUpdateDeviceName";

const mockToast = { showError: jest.fn(), showSuccess: jest.fn() };
const mockRouter = { push: jest.fn(), dismissTo: jest.fn() };
let mockNode: unknown;

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ nodeId: "node-1" }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@shared/hooks/useCDF", () => ({
  useCDF: () => ({ store: { nodeStore: { nodesList: [mockNode] } } }),
}));
jest.mock("@shared/hooks/useToast", () => ({ useToast: () => mockToast }));
// The real constants module needs the app's region config, absent in tests.
jest.mock("@shared/utils/constants", () => ({
  ESPRM_NAME_PARAM_TYPE: "esp.param.name",
  ESPRM_PARAM_WRITE_PROPERTY: "write",
  MATTER_METADATA_KEY: "Matter",
  MATTER_METADATA_DEVICE_NAME_KEY: "deviceName",
}));
// A RainMaker + Matter device: its name also goes to the Matter name.
jest.mock("@shared/utils/matterBasicInformation", () => ({
  MATTER_NODE_LABEL_MAX_LENGTH: 32,
  isNamedByMatterNodeLabel: () => true,
  canRenameViaMatterNodeLabel: () => false,
  renameViaMatterNodeLabel: jest.fn(),
}));
jest.mock("@shared/utils/matterNameRetry", () => ({
  pauseMatterNameRetry: jest.fn(async () => () => undefined),
  queueMatterNameRetry: jest.fn(),
  dropMatterNameRetry: jest.fn(),
}));

/** 33 characters: one more than a Matter name holds. */
const NAME_33 = "Living Room Light by the Bookcase";

function setUpNode() {
  const setValue = jest.fn().mockResolvedValue(undefined);
  mockNode = {
    id: "node-1",
    metadata: {},
    devices: [
      {
        name: "Light",
        params: [
          {
            name: "Name",
            type: "esp.param.name",
            properties: ["read", "write"],
            value: "Light",
            setValue,
          },
        ],
      },
    ],
  };
  return { setValue };
}

describe("useUpdateDeviceName naming", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("refuses a name too long for the device, writing nothing and staying", async () => {
    const { setValue } = setUpNode();
    const { result } = renderHook(() => useUpdateDeviceName());
    expect(result.current.maxNameLength).toBe(32);

    act(() => result.current.setDeviceName("Light", NAME_33));
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(mockToast.showError).toHaveBeenCalledWith(
      "device.validation.deviceNameTooLong",
    );
    expect(setValue).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("saves a name that fits, then goes on to the room step", async () => {
    const { setValue } = setUpNode();
    const { result } = renderHook(() => useUpdateDeviceName());

    act(() => result.current.setDeviceName("Light", "Desk Lamp"));
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(setValue).toHaveBeenCalledWith("Desk Lamp");
    expect(mockRouter.push).toHaveBeenCalled();
  });

  it("uses the same save as Device Settings, so the device's Matter name follows", async () => {
    setUpNode();
    const { result } = renderHook(() => useUpdateDeviceName());

    act(() => result.current.setDeviceName("Light", "Desk Lamp"));
    await act(async () => {
      await result.current.handleContinue();
    });

    // Off the local network here, so the Matter name is queued for later.
    expect(queueMatterNameRetry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "node-1" }),
      "Light",
      "Desk Lamp",
    );
  });
});
