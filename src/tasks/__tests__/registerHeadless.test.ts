/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRegistry } from "react-native";
import {
  ESPRM_BASE_SDK_ID,
  ESPRMMatter_BASE_SDK_ID,
  ESPRMNeo_BASE_SDK_ID,
  ESPRMNeoMatter_BASE_SDK_ID,
} from "@config/sdk.identifiers";

const ISSUE_TASK = "issueNocTask";
const CONFIRM_TASK = "confirmCommissionTask";

// The real constants module needs the app's region config, absent in tests.
jest.mock("@shared/utils/constants", () => ({
  HEADLESS_JS_TASK_MATTER_ISSUE_NOC: "issueNocTask",
  HEADLESS_JS_TASK_MATTER_CONFIRM_COMMISSION: "confirmCommissionTask",
  HEADLESS_ERROR_SDK_CANNOT_ADD_MATTER: "Active SDK cannot add Matter devices",
}));

let mockActiveSdk: string = ESPRMMatter_BASE_SDK_ID;
let mockSavedSdk: string | null = null;
const mockLoadFromStorage = jest.fn(async () => {});

jest.mock("@config/sdk.config", () => ({
  getResolvedActiveSdk: () => mockActiveSdk,
}));
jest.mock("@config/runtime.config", () => ({
  runtimeConfigManager: {
    get activeSdk() {
      return mockSavedSdk;
    },
    loadFromStorage: () => mockLoadFromStorage(),
  },
}));

const mockClassicIssue = jest.fn(async (_taskData: unknown) => {});
const mockClassicConfirm = jest.fn(async (_taskData: unknown) => {});
const mockNeoIssue = jest.fn(async (_taskData: unknown) => {});
const mockNeoConfirm = jest.fn(async (_taskData: unknown) => {});
jest.mock("@src/tasks/matterCommissioningTask", () => ({
  MatterIssueNocTask: (data: unknown) => mockClassicIssue(data),
  MatterConfirmCommissionTask: (data: unknown) => mockClassicConfirm(data),
}));
jest.mock("@src/tasks/matterCommissioningTask.neo", () => ({
  neoMatterIssueNocTask: (data: unknown) => mockNeoIssue(data),
  neoMatterConfirmCommissionTask: (data: unknown) => mockNeoConfirm(data),
}));

type HeadlessHandler = (taskData: unknown) => Promise<void>;
const handlers = new Map<string, HeadlessHandler>();

beforeAll(() => {
  jest
    .spyOn(AppRegistry, "registerHeadlessTask")
    .mockImplementation((name, provider) => {
      handlers.set(name, provider() as unknown as HeadlessHandler);
    });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../registerHeadless").registerHeadlessTasks();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSavedSdk = null;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

const runTask = (name: string) => handlers.get(name)!({ nodeId: "node" });

describe("registerHeadlessTasks", () => {
  it("runs the Neo flow only for the Neo Matter SDK", async () => {
    mockActiveSdk = ESPRMNeoMatter_BASE_SDK_ID;
    await runTask(ISSUE_TASK);
    await runTask(CONFIRM_TASK);

    expect(mockNeoIssue).toHaveBeenCalledTimes(1);
    expect(mockNeoConfirm).toHaveBeenCalledTimes(1);
    expect(mockClassicIssue).not.toHaveBeenCalled();
    expect(mockClassicConfirm).not.toHaveBeenCalled();
  });

  it("runs the classic flow for the classic Matter SDK", async () => {
    mockActiveSdk = ESPRMMatter_BASE_SDK_ID;
    await runTask(ISSUE_TASK);

    expect(mockClassicIssue).toHaveBeenCalledTimes(1);
    expect(mockNeoIssue).not.toHaveBeenCalled();
  });

  it.each([ESPRMNeo_BASE_SDK_ID, ESPRM_BASE_SDK_ID])(
    "refuses SDKs that cannot add Matter devices (%s)",
    async (sdk) => {
      mockActiveSdk = sdk;
      await expect(runTask(ISSUE_TASK)).rejects.toThrow();
      await expect(
        runTask(CONFIRM_TASK),
      ).rejects.toThrow();

      expect(mockNeoIssue).not.toHaveBeenCalled();
      expect(mockClassicIssue).not.toHaveBeenCalled();
    },
  );

  it("reads the saved deployment before choosing, but only when none is loaded", async () => {
    mockActiveSdk = ESPRMNeoMatter_BASE_SDK_ID;
    await runTask(ISSUE_TASK);
    expect(mockLoadFromStorage).toHaveBeenCalledTimes(1);

    mockSavedSdk = ESPRMNeoMatter_BASE_SDK_ID;
    await runTask(ISSUE_TASK);
    expect(mockLoadFromStorage).toHaveBeenCalledTimes(1);
  });
});
