/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Validates style documents with plain checks, not Joi: they run while the bundle loads, before Joi's URL polyfill is ready.
// Known keys must pass their checks; unknown keys are ignored.

import {
  BRAND_THEME_DARK,
  BRAND_THEME_LIGHT,
  BRAND_URL_PARAM,
  SUPPORTED_BRAND_SCHEMA_VERSIONS,
} from "@shared/utils/constants";

/** Light or dark theme a style may support. */
export type StyleTheme = typeof BRAND_THEME_LIGHT | typeof BRAND_THEME_DARK;

/** Image refs keyed by camelCase name. */
export type StyleImageMap = Record<string, string>;

/** `config.assets.images` groups. */
export interface StyleImages {
  devices?: StyleImageMap;
  agents?: StyleImageMap;
  illustrations?: StyleImageMap;
}

/** Validated `config` block of a style document. Its keys match the JSON file, so do not rename them. */
export interface StyleConfig {
  brandName: string;
  supportedThemes: StyleTheme[];
  brandTagline?: string;
  company?: string;
  brandLogo?: Partial<Record<StyleTheme, string>>;
  ui?: {
    radius?: number;
    logoScale?: number;
    colors?: Partial<Record<StyleTheme, Record<string, string>>>;
  };
  glossary?: Record<string, string>;
  assets?: { images?: StyleImages };
}

/** Style document from the URL `brand` param or a published brand.json. */
export interface StyleDocument {
  schemaVersion: number;
  config: StyleConfig;
  checksum?: string;
  publishedAt?: number;
}

/** Published brand.json after fetch/save (checksum required). */
export interface PublishedStyle extends StyleDocument {
  checksum: string;
}

/** Outcome of validating a runtime style document: the style, or why it cannot be drawn. */
export type StyleValidation<T extends StyleDocument = StyleDocument> =
  | { style: T; error?: undefined }
  | { style?: undefined; error: string };

/** The `brand` parameter found in a page URL, and whether it was in the query or the fragment. */
export interface StyleParam {
  raw: string;
  separator: "?" | "#";
}

/** Checks one value; returns the reason it is invalid, naming its path, or undefined. */
type Check = (value: unknown, path: string) => string | undefined;

/** Where a brand document came from — decides which image references are allowed. */
type StyleSource = "published" | "pageUrl";

const THEMES: readonly unknown[] = [BRAND_THEME_LIGHT, BRAND_THEME_DARK];
const CHECKSUM = /^[0-9a-f]{64}$/;
const CAMEL_KEY = /^[a-z][a-zA-Z0-9]{0,63}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const COLOR =
  /^(#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+|1\.0+)\s*\))$/;
const ARCHIVE_IMAGE = /^brand\/images\/[A-Za-z0-9._-]+\.png$/;
const ARCHIVE_VIDEO = /^brand\/videos\/[A-Za-z0-9._-]+\.mp4$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/;
const DATA_IMAGE = /^data:image\/(png|jpeg|webp|svg\+xml)(;[\w.+-]+=[\w.+-]+)*(;base64)?,\S+$/;
const URL_MAX = 2048;
const BRAND_NAME_MAX = 80;
const TEXT_MAX = 120;
const GLOSSARY_WORD_MAX = 40;
const LOGO_SCALE_MIN = 0.5;
const LOGO_SCALE_MAX = 2;
const RADIUS_MIN = 0;
const RADIUS_MAX = 32;

/**
 * @param value - Unknown JSON value
 * @returns Whether value is a non-null plain object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param path - Path of the parent value, empty at the top level
 * @param key - Key inside it
 * @returns Child path used in error messages
 */
function childPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

/**
 * Object check: listed keys must pass their checks; other keys are ignored.
 * @param shape - Check for each known key
 * @param required - Known keys that must be present
 * @returns The object check
 */
function fields(shape: Record<string, Check>, required: readonly string[] = []): Check {
  return (value, path) => {
    if (!isRecord(value)) return `${path || "brand"} must be an object`;
    const missing = required.find((key) => value[key] === undefined);
    if (missing) return `${childPath(path, missing)} is required`;
    for (const [key, check] of Object.entries(shape)) {
      if (value[key] === undefined) continue;
      const error = check(value[key], childPath(path, key));
      if (error) return error;
    }
    return undefined;
  };
}

/**
 * Map check: every key and value must pass.
 * @param isKey - Predicate every key must satisfy
 * @param keyRule - Human-readable key rule for errors
 * @param check - Check every value must pass
 * @returns The map check
 */
function mapOf(isKey: (key: string) => boolean, keyRule: string, check: Check): Check {
  return (value, path) => {
    if (!isRecord(value)) return `${path} must be an object`;
    for (const [key, item] of Object.entries(value)) {
      if (!isKey(key)) return `${childPath(path, key)}: key must be ${keyRule}`;
      const error = check(item, childPath(path, key));
      if (error) return error;
    }
    return undefined;
  };
}

/**
 * @param key - Object key
 * @returns Whether it is a camelCase name
 */
function isCamelKey(key: string): boolean {
  return CAMEL_KEY.test(key);
}

/**
 * @param key - Object key
 * @returns Whether it names a brand theme
 */
function isThemeKey(key: string): boolean {
  return THEMES.includes(key);
}

/**
 * Plain text: no control characters; length counted in code points.
 * @param min - Shortest allowed length
 * @param max - Longest allowed length
 * @returns The text check
 */
function text(min: number, max: number): Check {
  return (value, path) => {
    if (typeof value !== "string") return `${path} must be text`;
    if (CONTROL_CHARACTER.test(value)) return `${path} must not contain control characters`;
    const length = Array.from(value).length;
    if (length < min || length > max) return `${path} must be ${min} to ${max} characters`;
    return undefined;
  };
}

/**
 * Number in an inclusive range.
 * @param min - Smallest allowed value
 * @param max - Largest allowed value
 * @param integer - Whether the number must be whole
 * @returns The number check
 */
function numberIn(min: number, max: number, integer: boolean): Check {
  return (value, path) => {
    const valid =
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isInteger(value));
    return valid
      ? undefined
      : `${path} must be ${integer ? "an integer" : "a number"} from ${min} to ${max}`;
  };
}

/** Non-negative integer check. */
const nonNegativeInteger: Check = (value, path) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? undefined
    : `${path} must be a non-negative integer`;

/** Accepts any plain object; used for keys whose contents are not checked. */
const anyObject: Check = (value, path) => (isRecord(value) ? undefined : `${path} must be an object`);

/** Colour: #RRGGBB, #RRGGBBAA, or rgba(r, g, b, a). */
const color: Check = (value, path) =>
  typeof value === "string" && COLOR.test(value)
    ? undefined
    : `${path} must be a colour: #RRGGBB, #RRGGBBAA or rgba(r, g, b, a)`;

/**
 * @param value - Unknown JSON value
 * @returns Whether value is an https URL within the length limit
 */
function isHttpsUrl(value: unknown): boolean {
  return typeof value === "string" && value.length <= URL_MAX && HTTPS_URL.test(value);
}

/**
 * @param value - Unknown JSON value
 * @returns Whether value is a PNG, JPEG, WebP or SVG data URI
 */
export function isDataImage(value: unknown): value is string {
  return typeof value === "string" && DATA_IMAGE.test(value);
}

/**
 * Image reference check.
 * @param source - `published` allows https only; `pageUrl` also allows archive paths and data URIs
 * @returns The image check
 */
function imageRef(source: StyleSource): Check {
  return (value, path) => {
    if (isHttpsUrl(value)) return undefined;
    if (source === "published") return `${path} must be an https:// URL`;
    if (typeof value === "string" && ARCHIVE_IMAGE.test(value)) return undefined;
    if (isDataImage(value)) return undefined;
    return `${path} must be an https:// URL, brand/images/<name>.png or a data:image/(png|jpeg|webp|svg+xml) URI`;
  };
}

/** Video reference check: an https URL or a `brand/videos/` path. */
const videoRef: Check = (value, path) =>
  isHttpsUrl(value) || (typeof value === "string" && ARCHIVE_VIDEO.test(value))
    ? undefined
    : `${path} must be an https:// URL or brand/videos/<name>.mp4`;

/** `config.supportedThemes`: non-empty list of distinct themes. */
const supportedThemes: Check = (value, path) => {
  if (!Array.isArray(value) || value.length === 0) return `${path} must be a non-empty list`;
  if (!value.every((theme) => THEMES.includes(theme))) return `${path} may only list "light" and "dark"`;
  if (new Set(value).size !== value.length) return `${path} must not repeat a theme`;
  return undefined;
};

/**
 * Full style document check for one source.
 * @param source - Published brand.json requires checksum and https images
 * @returns The document check
 */
function styleDocumentCheck(source: StyleSource): Check {
  const published = source === "published";
  const image = imageRef(source);
  const images = mapOf(isCamelKey, "camelCase", image);
  const config = fields(
    {
      brandName: text(1, BRAND_NAME_MAX),
      supportedThemes,
      brandTagline: text(0, TEXT_MAX),
      company: text(0, TEXT_MAX),
      brandLogo: (value, path) =>
        isRecord(value) && Object.keys(value).length === 0
          ? `${path} must name at least one theme`
          : mapOf(isThemeKey, "light or dark", image)(value, path),
      ui: fields({
        radius: numberIn(RADIUS_MIN, RADIUS_MAX, true),
        logoScale: numberIn(LOGO_SCALE_MIN, LOGO_SCALE_MAX, false),
        colors: mapOf(isThemeKey, "light or dark", mapOf(isCamelKey, "camelCase", color)),
        fonts: anyObject,
        border: anyObject,
      }),
      glossary: mapOf(isCamelKey, "camelCase", text(1, GLOSSARY_WORD_MAX)),
      assets: fields({
        images: (value, path) => {
          const known = fields({ devices: images, agents: images, illustrations: images })(value, path);
          return known ?? mapOf(() => true, "", anyObject)(value, path);
        },
        videos: mapOf(() => true, "", mapOf(isCamelKey, "camelCase", videoRef)),
      }),
    },
    ["brandName", "supportedThemes"],
  );
  return fields(
    {
      schemaVersion: (value, path) => {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
          return `${path} must be an integer of 1 or more`;
        }
        return SUPPORTED_BRAND_SCHEMA_VERSIONS.includes(value)
          ? undefined
          : `${path} ${value} is not supported (supported: ${SUPPORTED_BRAND_SCHEMA_VERSIONS.join(", ")})`;
      },
      checksum: (value, path) =>
        typeof value === "string" && CHECKSUM.test(value)
          ? undefined
          : `${path} must be 64 lower-case hex digits`,
      publishedAt: nonNegativeInteger,
      config,
    },
    published ? ["schemaVersion", "checksum", "config"] : ["schemaVersion", "config"],
  );
}

const PUBLISHED_CHECK = styleDocumentCheck("published");
const PAGE_URL_CHECK = styleDocumentCheck("pageUrl");

/**
 * Validates a style document from the page URL `brand` parameter. Image references may also be
 * archive paths or data URIs.
 * @param value - Decoded parameter JSON
 * @returns The style, or why it cannot be drawn
 */
export function parseUrlStyle(value: unknown): StyleValidation {
  const error = PAGE_URL_CHECK(value, "");
  return error ? { error } : { style: value as StyleDocument };
}

/**
 * Parses and validates a published brand.json body (checksum + https images).
 * @param text - Body as published or as saved on disk
 * @returns The style, or why it cannot be drawn
 */
export function parsePublished(text: string): StyleValidation<PublishedStyle> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: "brand.json is not valid JSON" };
  }
  const error = PUBLISHED_CHECK(value, "");
  return error ? { error } : { style: value as PublishedStyle };
}

/**
 * Reads the `brand` parameter from a page URL (query first, then fragment).
 * @param location - Page `search` and `hash`
 * @returns Encoded value and separator, or null when absent
 */
export function readUrlParam(location: { search?: string; hash?: string }): StyleParam | null {
  const fromSearch = location.search
    ? new URLSearchParams(location.search).get(BRAND_URL_PARAM)
    : null;
  if (fromSearch) return { raw: fromSearch, separator: "?" };

  const fromHash = location.hash
    ? new URLSearchParams(location.hash.replace(/^#/, "")).get(BRAND_URL_PARAM)
    : null;
  return fromHash ? { raw: fromHash, separator: "#" } : null;
}

/**
 * Decodes a `brand` URL parameter (base64url of UTF-8 JSON).
 * @param raw - Parameter value
 * @returns Parsed JSON, or undefined when decode fails
 */
export function decodeUrlStyle(raw: string): unknown {
  try {
    const g = globalThis as { atob?: (data: string) => string; TextDecoder?: typeof TextDecoder };
    if (typeof g.atob !== "function") return undefined;
    const bytes = g.atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const json =
      typeof g.TextDecoder === "function"
        ? new g.TextDecoder().decode(Uint8Array.from(bytes, (c) => c.charCodeAt(0)))
        : bytes;
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
