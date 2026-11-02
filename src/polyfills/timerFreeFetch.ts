/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 * SPDX-FileCopyrightText: 2014-2023 GitHub, Inc.
 *
 * SPDX-License-Identifier: Apache-2.0 AND MIT
 */

/*
 * Parts of this file are adapted from whatwg-fetch 3.6.20
 * (https://github.com/github/fetch), used under the MIT License:
 *
 * Copyright (c) 2014-2023 GitHub, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * A `fetch` that settles straight from the request's own callbacks.
 *
 * React Native's built-in `fetch` (the whatwg-fetch package) hands back every
 * answer and every error through `setTimeout(fn, 0)`. JS timers only run when
 * the screen sends the app a frame, and some phones send a hidden app none, so
 * a request that had already finished never reached the caller while Google's
 * Matter commissioning screen covered the app.
 *
 * This is whatwg-fetch 3.6.20's `fetch` (MIT, github.com/github/fetch) with
 * that one wait removed. It builds the same Request, Response and Headers
 * objects, so callers see no difference.
 */

import { Platform } from "react-native";

/** The request internals whatwg-fetch keeps on its Request objects. */
type PolyfillRequest = Request & { _bodyInit?: BodyInit | null };

type FetchWithMarker = typeof fetch & { polyfill?: boolean; settlesWithoutTimers?: boolean };

/** What the fetch is built from; production passes the app's own globals. */
export interface FetchParts {
  XMLHttpRequest: typeof XMLHttpRequest;
  Request: typeof Request;
  Response: typeof Response;
  Headers: typeof Headers;
}

/** Same check as whatwg-fetch: header names may only use these characters. */
const INVALID_HEADER_NAME = /[^a-z0-9\-#$%&'*+.^_`|~!]/i;

/**
 * Checks a header name and lower-cases it.
 * @param name - Header name from the caller.
 * @returns The lower-case name.
 */
function normalizeName(name: unknown): string {
  const text = typeof name === "string" ? name : String(name);
  if (INVALID_HEADER_NAME.test(text) || text === "") {
    throw new TypeError(`Invalid character in header field name: "${text}"`);
  }
  return text.toLowerCase();
}

/**
 * Turns a header value into text.
 * @param value - Header value from the caller.
 * @returns The value as a string.
 */
function normalizeValue(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

/**
 * Turns the raw response header block into a Headers object (whatwg-fetch rules).
 * @param rawHeaders - Header block as the request reports it.
 * @param HeadersClass - Headers class to build.
 * @returns The parsed headers.
 */
function parseHeaders(rawHeaders: string, HeadersClass: typeof Headers): Headers {
  const headers = new HeadersClass();
  // Folded header lines (newline then space or tab) join the line before.
  const unfolded = rawHeaders.replace(/\r?\n[\t ]+/g, " ");
  unfolded
    .split("\r")
    .map((line) => (line.indexOf("\n") === 0 ? line.substring(1) : line))
    .forEach((line) => {
      const parts = line.split(":");
      const key = (parts.shift() ?? "").trim();
      if (key) {
        const value = parts.join(":").trim();
        try {
          headers.append(key, value);
        } catch (error) {
          console.warn(`Response ${(error as Error).message}`);
        }
      }
    });
  return headers;
}

/**
 * The error a cancelled request rejects with, named "AbortError" like the browser's.
 * @returns The abort error.
 */
function abortError(): Error {
  const DOMExceptionClass = (globalThis as { DOMException?: new (message: string, name: string) => Error })
    .DOMException;
  if (typeof DOMExceptionClass === "function") {
    try {
      return new DOMExceptionClass("Aborted", "AbortError");
    } catch {
      // Fall through to a plain error with the same name.
    }
  }
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Response bodies come back as Blobs when the platform can read them (whatwg-fetch rule).
 * @returns True when Blob responses can be read.
 */
function canUseBlobResponses(): boolean {
  if (typeof FileReader === "undefined" || typeof Blob === "undefined") {
    return false;
  }
  try {
    new Blob();
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a fetch from the given parts.
 * @param parts - XMLHttpRequest plus the Request/Response/Headers classes to use.
 * @returns A fetch with whatwg-fetch behaviour that never waits on a JS timer.
 */
export function createTimerFreeFetch(parts: FetchParts): typeof fetch {
  const timerFreeFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    new Promise<Response>((resolve, reject) => {
      const request = new parts.Request(input as RequestInfo, init) as PolyfillRequest;

      if (request.signal && request.signal.aborted) {
        reject(abortError());
        return;
      }

      const xhr = new parts.XMLHttpRequest();
      const abortXhr = () => xhr.abort();

      xhr.onload = () => {
        const headers = parseHeaders(xhr.getAllResponseHeaders() || "", parts.Headers);
        // A local file read reports status 0; treat it as success, as whatwg-fetch does.
        const status =
          request.url.indexOf("file://") === 0 && (xhr.status < 200 || xhr.status > 599)
            ? 200
            : xhr.status;
        const options = {
          status,
          statusText: xhr.statusText,
          headers,
          url: "responseURL" in xhr ? xhr.responseURL : headers.get("X-Request-URL"),
        };
        const body = "response" in xhr ? xhr.response : (xhr as XMLHttpRequest).responseText;
        // Response throws on a status it does not accept (e.g. 0, a RangeError);
        // reject then, or the caller would wait forever.
        try {
          resolve(new parts.Response(body, options as ResponseInit));
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => reject(new TypeError("Network request failed"));
      xhr.ontimeout = () => reject(new TypeError("Network request timed out"));
      xhr.onabort = () => reject(abortError());

      xhr.open(request.method, request.url, true);

      if (request.credentials === "include") {
        xhr.withCredentials = true;
      } else if (request.credentials === "omit") {
        xhr.withCredentials = false;
      }

      if ("responseType" in xhr) {
        if (canUseBlobResponses()) {
          xhr.responseType = "blob";
        } else if (typeof ArrayBuffer !== "undefined") {
          xhr.responseType = "arraybuffer";
        }
      }

      // A plain-object headers init keeps the caller's spelling of each name.
      const initHeaders = init?.headers;
      if (initHeaders && typeof initHeaders === "object" && !(initHeaders instanceof parts.Headers)) {
        const names: string[] = [];
        Object.getOwnPropertyNames(initHeaders).forEach((name) => {
          names.push(normalizeName(name));
          xhr.setRequestHeader(name, normalizeValue((initHeaders as Record<string, unknown>)[name]));
        });
        request.headers.forEach((value, name) => {
          if (names.indexOf(name) === -1) {
            xhr.setRequestHeader(name, value);
          }
        });
      } else {
        request.headers.forEach((value, name) => xhr.setRequestHeader(name, value));
      }

      if (request.signal) {
        request.signal.addEventListener("abort", abortXhr);
        xhr.onreadystatechange = () => {
          // DONE, whether it worked or not.
          if (xhr.readyState === 4) {
            request.signal.removeEventListener("abort", abortXhr);
          }
        };
      }

      xhr.send(typeof request._bodyInit === "undefined" ? null : (request._bodyInit as XMLHttpRequestBodyInit));
    });

  const marked = timerFreeFetch as FetchWithMarker;
  marked.polyfill = true;
  marked.settlesWithoutTimers = true;
  return marked;
}

/**
 * Replaces React Native's fetch with the timer-free one, once, at startup.
 * Android only: that is where headless tasks run while the app is hidden. Only
 * swaps the whatwg-fetch polyfill: a platform that ships its own fetch is left
 * alone.
 * @param platformOS - The running platform; tests pass one in.
 * @returns True when the app's fetch is now the timer-free one.
 */
export function installTimerFreeFetch(platformOS: string = Platform.OS): boolean {
  if (platformOS !== "android") {
    return false;
  }
  const current = globalThis.fetch as FetchWithMarker | undefined;
  if (current?.settlesWithoutTimers) {
    return true;
  }
  if (
    !current?.polyfill ||
    typeof globalThis.XMLHttpRequest !== "function" ||
    typeof globalThis.Request !== "function" ||
    typeof globalThis.Response !== "function" ||
    typeof globalThis.Headers !== "function"
  ) {
    return false;
  }
  globalThis.fetch = createTimerFreeFetch({
    XMLHttpRequest: globalThis.XMLHttpRequest,
    Request: globalThis.Request,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
  });
  return true;
}
