/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Reads colours, sizes and image references from a validated StyleConfig. Imports nothing from React Native.

import {
  BRAND_DRAWABLE_IMAGE_PREFIXES,
  BRAND_ONLINE_ICON_SUFFIX,
  BRAND_THEME_DARK,
  BRAND_THEME_LIGHT,
} from "@shared/utils/constants";
import {
  AGENT_IMAGE_KEYS,
  DEVICE_ICON_NAMES,
  ILLUSTRATION_NAMES,
  type IllustrationName,
} from "./keys";
import { isDataImage, type StyleConfig, type StyleImageMap, type StyleImages, type StyleTheme } from "./schema";

/** The theme colour tokens a brand palette may set. */
const THEME_COLOR_TOKENS = [
  "white",
  "black",
  "bluetooth",
  "gray",
  "lightGray",
  "red",
  "orange",
  "blue",
  "green",
  "yellow",
  "lightBlue",
  "bg",
  "bg1",
  "bg2",
  "bg3",
  "bg4",
  "bg5",
  "borderColor",
  "darkBorderColor",
  "primary",
  "text_primary",
  "text_primary_light",
  "text_primary_dark",
  "text_secondary",
  "text_secondary_light",
  "text_secondary_dark",
  "warn",
  "error",
  "success",
  "warnBg",
  "errorBg",
  "successBg",
  "qrCodeScanLoader",
] as const;

export type ColorToken = (typeof THEME_COLOR_TOKENS)[number];

const THEME_COLOR_TOKEN_SET: ReadonlySet<string> = new Set(THEME_COLOR_TOKENS);

/** The brand's camelCase colour roles whose theme tokens are snake_case. */
const SNAKE_CASE_COLOR_ROLES: Readonly<Record<string, ColorToken>> = {
  textPrimary: "text_primary",
  textPrimaryLight: "text_primary_light",
  textPrimaryDark: "text_primary_dark",
  textSecondary: "text_secondary",
  textSecondaryLight: "text_secondary_light",
  textSecondaryDark: "text_secondary_dark",
};

/** Fallback medium corner radius when the style sets none. */
const DEFAULT_RADIUS = 16;
/** Fallback logo scale when the style sets none. */
const DEFAULT_LOGO_SCALE = 1;

type StyleImageGroup = keyof StyleImages;

/** Image groups the app reads from `config.assets.images`. */
const IMAGE_GROUPS = ["devices", "agents", "illustrations"] as const satisfies readonly StyleImageGroup[];

const AGENT_IMAGE_KEY_SET: ReadonlySet<string> = new Set(AGENT_IMAGE_KEYS);

/**
 * Reads only a map's own keys, so a name like `constructor` never reaches Object's prototype.
 * @param map - A map from the brand, if any
 * @param key - The key to read
 * @returns The value under that key, if the map has one
 */
function own<T>(map: Partial<Record<string, T>> | undefined, key: string): T | undefined {
  return map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/**
 * Picks the theme the app shows: a brand's only theme, else the device's setting when the
 * brand supports both. The app's default look is light.
 * @param supportedThemes - The brand's `config.supportedThemes`, or undefined without a brand
 * @param deviceScheme - The device or browser setting, `light`, `dark` or unknown
 * @returns The theme to show
 */
export function chooseTheme(
  supportedThemes: readonly StyleTheme[] | undefined,
  deviceScheme: string | null | undefined,
): StyleTheme {
  if (!supportedThemes?.length) return BRAND_THEME_LIGHT;
  if (supportedThemes.length === 1) return supportedThemes[0] ?? BRAND_THEME_LIGHT;
  return deviceScheme === BRAND_THEME_DARK ? BRAND_THEME_DARK : BRAND_THEME_LIGHT;
}

/**
 * Maps a camelCase brand colour role to the theme token the app uses.
 * @param role - A camelCase colour role from a brand palette
 * @returns The theme token it sets, or undefined for a role the app does not know
 */
export function toColorToken(role: string): ColorToken | undefined {
  const token = own(SNAKE_CASE_COLOR_ROLES, role) ?? role;
  return THEME_COLOR_TOKEN_SET.has(token) ? (token as ColorToken) : undefined;
}

/**
 * Reads the brand palette for one theme into theme colour tokens.
 * @param config - The brand config, if any
 * @param theme - The theme whose palette to read
 * @returns The theme tokens the brand's palette for that theme sets
 */
export function getColors(
  config: StyleConfig | null | undefined,
  theme: StyleTheme,
): Partial<Record<ColorToken, string>> {
  const tokens: Partial<Record<ColorToken, string>> = {};
  for (const [role, value] of Object.entries(config?.ui?.colors?.[theme] ?? {})) {
    if (typeof value !== "string") continue;
    const token = toColorToken(role);
    if (token) tokens[token] = value;
  }
  return tokens;
}

/**
 * Medium corner radius from the style, or the app default.
 * @param config - The brand config, if any
 * @returns The medium corner radius in points
 */
export function getRadius(config: StyleConfig | null | undefined): number {
  return config?.ui?.radius ?? DEFAULT_RADIUS;
}

/**
 * Logo scale from the style, or the app default.
 * @param config - The brand config, if any
 * @returns The logo size relative to the default
 */
export function getLogoScale(config: StyleConfig | null | undefined): number {
  return config?.ui?.logoScale ?? DEFAULT_LOGO_SCALE;
}

/**
 * Keeps an image reference the app can load: an https, file or data URI (data URIs only pass
 * validation in a page URL style). Archive paths return undefined, so the bundled image stays.
 * @param ref - An image reference
 * @returns The reference when the app can draw it
 */
function drawable(ref: string | undefined): string | undefined {
  return typeof ref === "string" &&
    (BRAND_DRAWABLE_IMAGE_PREFIXES.some((prefix) => ref.startsWith(prefix)) || isDataImage(ref))
    ? ref
    : undefined;
}

/**
 * Logo URI for the active theme, falling back to the other theme when needed.
 * @param config - The brand config, if any
 * @param theme - The theme the app shows
 * @returns The logo for that theme, else the other theme's, or undefined to keep the bundled logo
 */
export function getLogoUri(config: StyleConfig | null | undefined, theme: StyleTheme): string | undefined {
  const other = theme === BRAND_THEME_DARK ? BRAND_THEME_LIGHT : BRAND_THEME_DARK;
  return drawable(config?.brandLogo?.[theme]) ?? drawable(config?.brandLogo?.[other]);
}

/**
 * Converts a kebab-case app image key to the camelCase name used in brand image maps.
 * @param key - An app image key in kebab-case, e.g. `light-1-online`
 * @returns Its name in a brand image group, e.g. `light1Online`
 */
export function toImageKey(key: string): string {
  return key.replace(/-([a-z0-9])/gi, (_, next: string) => next.toUpperCase());
}

/**
 * @param key - An app image key
 * @returns The key without its online suffix, or undefined when it has none
 */
function offlineKey(key: string): string | undefined {
  return key.endsWith(BRAND_ONLINE_ICON_SUFFIX) ? key.slice(0, -BRAND_ONLINE_ICON_SUFFIX.length) : undefined;
}

/**
 * @param key - An app image key, optionally with the online suffix
 * @param group - The group the key belongs to unless it is an agent's
 * @returns The brand image group holding the key
 */
function imageGroup(key: string, group: StyleImageGroup): StyleImageGroup {
  return AGENT_IMAGE_KEY_SET.has(offlineKey(key) ?? key) ? "agents" : group;
}

/**
 * @param config - The brand config, if any
 * @param group - The brand image group
 * @param key - The app image key
 * @returns The brand's drawable image for the key, or undefined
 */
function groupImage(
  config: StyleConfig | null | undefined,
  group: StyleImageGroup,
  key: string,
): string | undefined {
  const images = config?.assets?.images?.[group];
  return images ? drawable(own(images, toImageKey(key))) : undefined;
}

/**
 * The brand's image for a device icon key; an online key falls back to the offline icon.
 * @param config - The brand config, if any
 * @param key - Icon key from devices.config.ts, optionally with the online suffix
 * @returns The image reference, or undefined to keep the bundled icon
 */
export function getDeviceIconUri(config: StyleConfig | null | undefined, key: string): string | undefined {
  const group = imageGroup(key, "devices");
  const offline = offlineKey(key);
  return groupImage(config, group, key) ?? (offline ? groupImage(config, group, offline) : undefined);
}

/**
 * Illustration URI from the style, or undefined to keep the bundled asset.
 * @param config - The brand config, if any
 * @param name - Illustration name
 * @returns The brand's image for it, or undefined to keep the bundled one
 */
export function getIllustrationUri(config: StyleConfig | null | undefined, name: IllustrationName): string | undefined {
  return groupImage(config, imageGroup(name, "illustrations"), name);
}

/** The image names the app draws, per group. */
const KNOWN_IMAGES: Record<StyleImageGroup, ReadonlySet<string>> = (() => {
  const known: Record<StyleImageGroup, Set<string>> = {
    devices: new Set(),
    agents: new Set(),
    illustrations: new Set(),
  };
  for (const icon of DEVICE_ICON_NAMES) {
    for (const key of [icon, `${icon}${BRAND_ONLINE_ICON_SUFFIX}`]) {
      known[imageGroup(key, "devices")].add(toImageKey(key));
    }
  }
  for (const name of ILLUSTRATION_NAMES) {
    known[imageGroup(name, "illustrations")].add(toImageKey(name));
  }
  return known;
})();

/**
 * Lists every image reference the app may draw (logos and images under known names), without duplicates.
 * @param config - The brand config
 * @returns Unique image references the app may draw
 */
export function listImageUris(config: StyleConfig): string[] {
  const images = config.assets?.images;
  const refs: string[] = [];

  for (const ref of Object.values(config.brandLogo ?? {})) {
    if (typeof ref === "string") refs.push(ref);
  }

  for (const group of IMAGE_GROUPS) {
    const groupRefs = images?.[group];
    if (!groupRefs) continue;
    for (const [name, ref] of Object.entries(groupRefs)) {
      if (KNOWN_IMAGES[group].has(name) && typeof ref === "string") refs.push(ref);
    }
  }

  return [...new Set(refs)];
}

/**
 * Applies `map` to each own string entry in a partial record.
 * @param refs - Image references by name
 * @param map - Replacement for each reference
 * @returns The references, each replaced
 */
function mapRefs<T extends Partial<Record<string, string>>>(refs: T, map: (ref: string) => string): T {
  return Object.fromEntries(
    Object.entries(refs).map(([name, ref]) => [name, typeof ref === "string" ? map(ref) : ref]),
  ) as T;
}

/**
 * Applies `map` only to known image names in a group; unknown keys are left unchanged.
 * @param refs - Image map for one group
 * @param group - Which known-name set to use
 * @param map - Replacement for each known reference
 * @returns A new map with known refs rewritten
 */
function mapKnownGroupRefs(
  refs: StyleImageMap,
  group: StyleImageGroup,
  map: (ref: string) => string,
): StyleImageMap {
  const next: StyleImageMap = { ...refs };
  for (const name of Object.keys(refs)) {
    if (!KNOWN_IMAGES[group].has(name)) continue;
    const ref = own(refs, name);
    if (typeof ref === "string") next[name] = map(ref);
  }
  return next;
}

/**
 * Replaces the logos and the images under known names using `map`, e.g. an https URL with its
 * saved file URI. Images under other names are left as they are.
 * @param config - The brand config
 * @param map - Replacement for each image reference
 * @returns The config with its logos and known group images replaced
 */
export function mapImageUris(config: StyleConfig, map: (ref: string) => string): StyleConfig {
  const mapped: StyleConfig = { ...config };
  if (config.brandLogo) mapped.brandLogo = mapRefs(config.brandLogo, map);

  const images = config.assets?.images;
  if (!images) return mapped;

  const next: StyleImages = { ...images };
  let changed = false;
  for (const group of IMAGE_GROUPS) {
    const refs = images[group];
    if (!refs) continue;
    next[group] = mapKnownGroupRefs(refs, group, map);
    changed = true;
  }
  if (changed) mapped.assets = { ...config.assets, images: next };
  return mapped;
}
