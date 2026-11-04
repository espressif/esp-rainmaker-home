/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Directory, File, Paths } from "expo-file-system";

import {
  BRAND_FETCH_RETRY_MS,
  BRAND_FILE_NAME,
  BRAND_IMAGE_FETCH_CONCURRENCY,
  BRAND_IMAGE_FETCH_TIMEOUT_MS,
  BRAND_IMAGE_MAX_BYTES,
  BRAND_IMAGES_DIR,
  BRAND_JSON_MAX_BYTES,
  BRAND_NOT_PUBLISHED_STATUSES,
  CONFIG_FETCH_TIMEOUT_MS,
} from "@shared/utils/constants";
import { runWithConcurrency } from "@shared/utils/concurrency";
import { listImageUris, mapImageUris } from "./resolve";
import { parsePublished, type StyleDocument, type PublishedStyle } from "./schema";

/**
 * Thrown when a published brand.json downloads but fails validation.
 * A missing brand.json (HTTP 403 or 404) is not an error.
 */
export class UnreadableStyleError extends Error {}

/** A hosted image URL under `/brand/images/`, split into its origin and file name. */
interface HostedImage {
  url: string;
  origin: string;
  name: string;
}

/** Hosted image URL: `https://<host>/…/brand/images/<16 hex digits>.png`. */
const HOSTED_IMAGE = /^(https:\/\/[^/]+)\/.*\/brand\/images\/([0-9a-f]{16}\.png)$/;
const ORIGIN = /^https:\/\/[^/]+/;
const PARTIAL_SUFFIX = ".part";
const ABORT_ERROR = "AbortError";
const LOG_PREFIX = "[RuntimeStyle]";
const WARN_STYLE = "color: #E6A817; font-weight: bold";

/**
 * Logs a coloured warning, in development builds only.
 * @param message - Short warning text
 * @param detail - Optional error or context
 */
function warnDev(message: string, detail?: unknown): void {
  if (!__DEV__) return;
  if (detail !== undefined) {
    console.warn(`%c${LOG_PREFIX} ${message}`, WARN_STYLE, detail);
    return;
  }
  console.warn(`%c${LOG_PREFIX} ${message}`, WARN_STYLE);
}

/**
 * Reads the local style cache (documents/brand.json).
 * @returns The cached style, or null when missing or unreadable
 */
function readCache(): PublishedStyle | null {
  try {
    const file = new File(Paths.document, BRAND_FILE_NAME);
    return file.exists ? (parsePublished(file.textSync()).style ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Saved style read once when the module loads; this launch draws it.
 * {@link syncSaved} may change the file on disk, but this value does not change.
 */
const bootCache = readCache();

let latestCall = 0;

/**
 * @param value - Brand image reference
 * @returns Hosted image metadata, or null for external links
 */
function hostedImage(value: string): HostedImage | null {
  const match = HOSTED_IMAGE.exec(value);
  return match ? { url: match[0], origin: match[1], name: match[2] } : null;
}

/**
 * Replaces hosted image URLs with local file URIs where a saved copy exists.
 * Only the returned copy changes; the brand.json on disk keeps the remote URLs.
 * @param brand - Cached brand
 * @returns Brand with local image URIs where available
 */
function withLocalImages(brand: PublishedStyle): StyleDocument {
  const dir = new Directory(Paths.document, BRAND_IMAGES_DIR, brand.checksum);
  return {
    ...brand,
    config: mapImageUris(brand.config, (ref) => {
      const image = hostedImage(ref);
      const file = image ? new File(dir, image.name) : null;
      return file?.exists ? file.uri : ref;
    }),
  };
}

/**
 * Returns the style this launch draws, read at start-up.
 * A style synced later is drawn after the next start-up.
 * @returns Boot cache with local image URIs, or null when none was cached
 */
export function readSaved(): StyleDocument | null {
  return bootCache ? withLocalImages(bootCache) : null;
}

/**
 * Fetches a URL and rejects bodies larger than `maxBytes`.
 * Aborts when `timeoutMs` elapses and/or when `signal` aborts.
 * @param url - Resource URL
 * @param maxBytes - Maximum accepted body size
 * @param options - Timeout and/or external abort signal
 * @returns Response and body bytes
 */
async function fetchBytes(
  url: string,
  maxBytes: number,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ res: Response; bytes: Uint8Array }> {
  const { timeoutMs = CONFIG_FETCH_TIMEOUT_MS, signal } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("Response body is too large");
    return { res, bytes };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Checks whether a fetch failed because it was aborted. Callers pass no signal of
 * their own, so an abort here means the timeout fired.
 * @param error - Caught fetch failure
 * @returns Whether the request was aborted
 */
function isTimeoutAbort(error: unknown): boolean {
  return error instanceof Error && error.name === ABORT_ERROR;
}

/**
 * Downloads brand.json with one retry on network failure (timeouts are not retried).
 * @param brandUrl - Deployment brand.json URL
 * @returns HTTP response and body bytes
 */
async function fetchPublishedBytes(
  brandUrl: string,
): Promise<{ res: Response; bytes: Uint8Array }> {
  const options = { timeoutMs: CONFIG_FETCH_TIMEOUT_MS };
  try {
    return await fetchBytes(brandUrl, BRAND_JSON_MAX_BYTES, options);
  } catch (error) {
    if (isTimeoutAbort(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, BRAND_FETCH_RETRY_MS));
    return fetchBytes(brandUrl, BRAND_JSON_MAX_BYTES, options);
  }
}

/**
 * Fetches and validates the deployment's published style.
 * @param brandUrl - Deployment brand.json URL
 * @returns Parsed style and raw body, or null when none is published (403/404)
 */
async function fetchPublished(
  brandUrl: string,
): Promise<{ style: PublishedStyle; text: string } | null> {
  const { res, bytes } = await fetchPublishedBytes(brandUrl);
  if (BRAND_NOT_PUBLISHED_STATUSES.includes(res.status)) return null;
  if (!res.ok) throw new Error(`Brand fetch failed: HTTP ${res.status}`);

  const text = new TextDecoder().decode(bytes);
  const { style, error } = parsePublished(text);
  if (!style) {
    throw new UnreadableStyleError(`The published style is not one this app can draw: ${error}`);
  }
  return { style, text };
}

/**
 * Fetches and validates a published style without saving it to disk.
 * @param brandUrl - Deployment brand.json URL
 * @returns The style, or null when none is published, it is invalid, or the fetch fails
 */
export async function previewPublished(brandUrl: string): Promise<PublishedStyle | null> {
  try {
    return (await fetchPublished(brandUrl))?.style ?? null;
  } catch (error) {
    warnDev("Could not preview published style", error);
    return null;
  }
}

/**
 * Downloads one hosted image into `dir` unless it is already there. Writes a `.part` file
 * first and renames it, so a half-written file is never used.
 * @param dir - Brand image folder
 * @param image - Image to save
 * @param signal - Aborts the download when its time limit passes
 */
async function downloadImage(
  dir: Directory,
  image: HostedImage,
  signal: AbortSignal,
): Promise<void> {
  const file = new File(dir, image.name);
  if (file.exists) return;

  const { res, bytes } = await fetchBytes(image.url, BRAND_IMAGE_MAX_BYTES, {
    timeoutMs: BRAND_IMAGE_FETCH_TIMEOUT_MS,
    signal,
  });
  if (!res.ok) throw new Error(`Brand image fetch failed: HTTP ${res.status}`);

  const partial = new File(dir, `${image.name}${PARTIAL_SUFFIX}`);
  partial.write(bytes);
  partial.move(file);
}

/**
 * Downloads the style's images hosted on `origin` that are not saved yet, a few at a time, each
 * within {@link BRAND_IMAGE_FETCH_TIMEOUT_MS}. A failed image is drawn from its URL and tried next launch.
 * @param brand - Brand to download images for
 * @param origin - Origin of the deployment brand.json
 */
async function cacheImagesFor(brand: PublishedStyle, origin: string): Promise<void> {
  const dir = new Directory(Paths.document, BRAND_IMAGES_DIR, brand.checksum);
  dir.create({ intermediates: true, idempotent: true });

  const pending = listImageUris(brand.config)
    .map(hostedImage)
    .filter((image): image is HostedImage =>
      Boolean(image && image.origin === origin && !new File(dir, image.name).exists),
    );

  await runWithConcurrency(
    pending,
    BRAND_IMAGE_FETCH_CONCURRENCY,
    async (image, _index, signal) => {
      try {
        await downloadImage(dir, image, signal);
      } catch (error) {
        warnDev(`Could not cache style image (drawing from URL): ${image.url}`, error);
      }
    },
    BRAND_IMAGE_FETCH_TIMEOUT_MS,
  );
}

/**
 * Deletes brand image folders not listed in `keep`.
 * @param keep - Checksums whose folders stay
 */
function pruneImages(keep: (string | undefined)[]): void {
  try {
    const root = new Directory(Paths.document, BRAND_IMAGES_DIR);
    if (!root.exists) return;
    for (const entry of root.list()) {
      if (!keep.includes(entry.name)) entry.delete();
    }
  } catch (error) {
    warnDev("Could not prune old style image folders", error);
  }
}

/**
 * Saves the published style to disk, or deletes the saved file when there is none, and removes
 * unused image folders. Only the latest call writes. Images are downloaded by {@link syncOnLaunch}.
 * @param brandUrl - Deployment brand.json URL, or undefined when none
 * @returns Whether the disk cache now differs from what this launch draws
 */
export async function syncSaved(brandUrl?: string): Promise<boolean> {
  const call = ++latestCall;
  const next = brandUrl ? await fetchPublished(brandUrl) : null;
  if (call !== latestCall) return false;

  const cached = readCache();
  pruneImages([bootCache?.checksum, cached?.checksum, next?.style.checksum]);

  if (next && next.style.checksum !== cached?.checksum) {
    new File(Paths.document, BRAND_FILE_NAME).write(next.text);
  } else if (!next) {
    const file = new File(Paths.document, BRAND_FILE_NAME);
    if (file.exists) file.delete();
  }

  return (next?.style.checksum ?? null) !== (bootCache?.checksum ?? null);
}

/**
 * Runs at launch without waiting: syncs the saved style, then downloads its missing images.
 * Failures are logged and tried again next launch.
 * @param brandUrl - Active deployment brand.json URL, if any
 */
export function syncOnLaunch(brandUrl?: string): void {
  void syncSaved(brandUrl)
    .then(async () => {
      if (!brandUrl) return;
      const cached = readCache();
      const origin = ORIGIN.exec(brandUrl)?.[0];
      if (cached && origin) await cacheImagesFor(cached, origin);
    })
    .catch((error: unknown) => {
      warnDev("Launch style sync failed", error);
      // Delete the saved style when the published one is invalid; keep it on other failures.
      if (error instanceof UnreadableStyleError) return syncSaved();
    });
}
