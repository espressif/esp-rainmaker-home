/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from "@testing-library/react-native";
import { renameViaMatterNodeLabel } from "@shared/utils/matterBasicInformation";
import { useMatterDeviceSetup } from "../useMatterDeviceSetup";

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
  useCDF: () => ({
    store: {
      nodeStore: { nodesList: [mockNode] },
      subscriptionStore: { registeredTransports: {} },
    },
  }),
}));
jest.mock("@shared/hooks/useToast", () => ({ useToast: () => mockToast }));
jest.mock("@shared/utils/deviceIdentify", () => ({
  identifiableDeviceKey: () => "",
}));
jest.mock("@features/provision/utils/selectDeviceRoomHelpers", () => ({
  findProvisionedNodeById: (nodes: { id: string }[], id: string) =>
    nodes.find((node) => node.id === id) ?? null,
}));
// The real constants module needs the app's region config, absent in tests.
jest.mock("@shared/utils/constants", () => ({
  ESPRM_NAME_PARAM_TYPE: "esp.param.name",
  ESPRM_PARAM_WRITE_PROPERTY: "write",
  MATTER_METADATA_KEY: "Matter",
  MATTER_METADATA_DEVICE_NAME_KEY: "deviceName",
  DEFAULT_MATTER_DEVICE_NAME: "Matter Device",
}));
jest.mock("@shared/utils/matterBasicInformation", () => ({
  MATTER_NODE_LABEL_MAX_LENGTH: 32,
  isNamedByMatterNodeLabel: () => true,
  canRenameViaMatterNodeLabel: () => true,
  renameViaMatterNodeLabel: jest.fn(async () => true),
}));
jest.mock("@shared/utils/matterNameRetry", () => ({
  pauseMatterNameRetry: jest.fn(async () => () => undefined),
  queueMatterNameRetry: jest.fn(),
  dropMatterNameRetry: jest.fn(),
}));

/** 33 characters: one more than a Matter name holds. */
const NAME_33 = "Living Room Light by the Bookcase";

describe("useMatterDeviceSetup naming", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("refuses a name too long for the device, writing nothing and staying", async () => {
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
    const { result } = renderHook(() => useMatterDeviceSetup());
    expect(result.current.maxNameLength).toBe(32);

    act(() => result.current.setDeviceName("Light", NAME_33));
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(mockToast.showError).toHaveBeenCalledWith(
      "device.validation.deviceNameTooLong",
    );
    expect(renameViaMatterNodeLabel).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("saves a name that fits, then goes on to the room step", async () => {
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
    const { result } = renderHook(() => useMatterDeviceSetup());

    act(() => result.current.setDeviceName("Light", "Desk Lamp"));
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(setValue).toHaveBeenCalledWith("Desk Lamp");
    expect(mockToast.showError).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalled();
  });
});
