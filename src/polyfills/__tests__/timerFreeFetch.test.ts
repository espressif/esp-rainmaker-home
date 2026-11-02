/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";
import { createTimerFreeFetch, installTimerFreeFetch, FetchParts } from "../timerFreeFetch";

// The same Request/Response/Headers classes React Native's fetch uses.
const polyfill = jest.requireActual<{
  Request: typeof Request;
  Response: typeof Response;
  Headers: typeof Headers;
}>("whatwg-fetch");

/** A request stand-in the test finishes by hand, like the native side would. */
class FakeRequest {
  static last: FakeRequest | null = null;

  method = "";
  url = "";
  sentBody: unknown = undefined;
  requestHeaders: Record<string, string> = {};
  withCredentials = false;
  responseType = "";
  readyState = 0;
  status = 0;
  statusText = "";
  responseURL = "";
  response: unknown = null;
  responseText = "";
  rawHeaders = "";
  aborted = false;

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;

  constructor() {
    FakeRequest.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name] = value;
  }

  getAllResponseHeaders() {
    return this.rawHeaders;
  }

  send(body: unknown) {
    this.sentBody = body;
  }

  abort() {
    this.aborted = true;
    this.finish();
    this.onabort?.();
  }

  /** Answers the request the way a finished native request does. */
  answer(status: number, body: string, rawHeaders = "") {
    this.status = status;
    this.statusText = status === 200 ? "OK" : "Error";
    this.response = body;
    this.responseText = body;
    this.rawHeaders = rawHeaders;
    this.responseURL = this.url;
    this.finish();
    this.onload?.();
  }

  finish() {
    this.readyState = 4;
    this.onreadystatechange?.();
  }
}

const parts: FetchParts = {
  XMLHttpRequest: FakeRequest as unknown as typeof XMLHttpRequest,
  Request: polyfill.Request,
  Response: polyfill.Response,
  Headers: polyfill.Headers,
};

function lastRequest(): FakeRequest {
  if (!FakeRequest.last) {
    throw new Error("no request was made");
  }
  return FakeRequest.last;
}

describe("timer-free fetch", () => {
  beforeEach(() => {
    FakeRequest.last = null;
    // Timers never move in these tests: a fetch that needs one cannot settle.
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("settles a finished request without any timer running", async () => {
    const fetchNow = createTimerFreeFetch(parts);
    const pending = fetchNow("https://api.example.test/v1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "sig" },
      body: JSON.stringify({ a: 1 }),
    });

    const request = lastRequest();
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://api.example.test/v1/verify");
    // The caller's spelling of plain-object header names is kept.
    expect(request.requestHeaders).toEqual({
      "Content-Type": "application/json",
      Authorization: "sig",
    });
    expect(request.sentBody).toBe(JSON.stringify({ a: 1 }));

    request.answer(200, '{"noc":"abc"}', "content-type: application/json\r\nx-amz-id: 42\r\n");

    const response = await pending;
    expect(jest.getTimerCount()).toBe(0);
    expect(response).toBeInstanceOf(polyfill.Response);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-amz-id")).toBe("42");
    expect(response.url).toBe("https://api.example.test/v1/verify");
    await expect(response.json()).resolves.toEqual({ noc: "abc" });
  });

  it("rejects when the answer cannot become a Response (status 0)", async () => {
    const pending = createTimerFreeFetch(parts)("https://api.example.test/x");
    lastRequest().answer(0, "");
    await expect(pending).rejects.toBeInstanceOf(RangeError);
  });

  it("passes an error status through as a normal response", async () => {
    const pending = createTimerFreeFetch(parts)("https://api.example.test/x");
    lastRequest().answer(403, '{"message":"denied"}');
    const response = await pending;
    expect(response.ok).toBe(false);
    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe('{"message":"denied"}');
  });

  it("rejects a network failure without any timer running", async () => {
    const pending = createTimerFreeFetch(parts)("https://api.example.test/x");
    lastRequest().onerror?.();
    await expect(pending).rejects.toThrow(new TypeError("Network request failed"));
  });

  it("rejects a timed-out request without any timer running", async () => {
    const pending = createTimerFreeFetch(parts)("https://api.example.test/x");
    lastRequest().ontimeout?.();
    await expect(pending).rejects.toThrow(new TypeError("Network request timed out"));
  });

  it("rejects with AbortError when the caller cancels", async () => {
    const controller = new AbortController();
    const pending = createTimerFreeFetch(parts)("https://api.example.test/x", {
      signal: controller.signal,
    });
    controller.abort();
    expect(lastRequest().aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects at once when the signal was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createTimerFreeFetch(parts)("https://api.example.test/x", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeRequest.last).toBeNull();
  });
});

describe("whatwg-fetch version", () => {
  it("is still 3.6.20, the version timerFreeFetch was copied from", () => {
    // React Native accepts any whatwg-fetch ^3.0.0. A different version may
    // change fetch; compare it with timerFreeFetch.ts, then update both.
    const reactNativeDir = require.resolve("react-native/package.json").replace(/package\.json$/, "");
    const manifestPath = require.resolve("whatwg-fetch/package.json", { paths: [reactNativeDir] });
    const { version } = jest.requireActual<{ version: string }>(manifestPath);
    expect(version).toBe("3.6.20");
  });
});

describe("installTimerFreeFetch", () => {
  const savedFetch = globalThis.fetch;
  const savedRequest = globalThis.XMLHttpRequest;

  afterEach(() => {
    globalThis.fetch = savedFetch;
    globalThis.XMLHttpRequest = savedRequest;
  });

  it("replaces the whatwg-fetch polyfill once", () => {
    const polyfillFetch = Object.assign(jest.fn(), { polyfill: true });
    globalThis.fetch = polyfillFetch as unknown as typeof fetch;
    globalThis.XMLHttpRequest = FakeRequest as unknown as typeof XMLHttpRequest;

    expect(installTimerFreeFetch("android")).toBe(true);
    const installed = globalThis.fetch;
    expect(installed).not.toBe(polyfillFetch);
    expect(installTimerFreeFetch("android")).toBe(true);
    expect(globalThis.fetch).toBe(installed);
  });

  it.each(["ios", "web"])("is not installed on %s", (platformOS) => {
    const polyfillFetch = Object.assign(jest.fn(), { polyfill: true });
    globalThis.fetch = polyfillFetch as unknown as typeof fetch;
    globalThis.XMLHttpRequest = FakeRequest as unknown as typeof XMLHttpRequest;

    expect(installTimerFreeFetch(platformOS)).toBe(false);
    expect(globalThis.fetch).toBe(polyfillFetch);
  });

  it("reads the running platform when none is passed", () => {
    const polyfillFetch = Object.assign(jest.fn(), { polyfill: true });
    globalThis.fetch = polyfillFetch as unknown as typeof fetch;
    globalThis.XMLHttpRequest = FakeRequest as unknown as typeof XMLHttpRequest;

    expect(installTimerFreeFetch()).toBe(Platform.OS === "android");
  });

  it("leaves a platform's own fetch alone", () => {
    const platformFetch = jest.fn() as unknown as typeof fetch;
    globalThis.fetch = platformFetch;
    globalThis.XMLHttpRequest = FakeRequest as unknown as typeof XMLHttpRequest;

    expect(installTimerFreeFetch("android")).toBe(false);
    expect(globalThis.fetch).toBe(platformFetch);
  });
});
