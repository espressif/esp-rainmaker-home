/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComponentProps } from "react";
import type { ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import rainmakerClassic from "@assets/images/rainmaker-classic.png";
import rainmakerNeo from "@assets/images/rainmaker-neo.png";

/** Ionicons glyph name (same icon set the auth screens already use). */
export type IoniconName = ComponentProps<typeof Ionicons>["name"];

/**
 * Landing options, in display order:
 * - `classic` / `neo` select a built-in backend (SDK + region cloud config).
 * - `ownDeployment` opens the QR Config Scan (custom deployment).
 */
export type PlatformKind = "classic" | "neo" | "ownDeployment";

export interface PlatformOption {
  kind: PlatformKind;
  /** Fallback glyph, used when the option has no brand `logo`. */
  icon: IoniconName;
  /**
   * Official brand mark for the option: the supplementary lockup, full-color on
   * transparent, drawn directly on the card. Takes precedence over `icon`.
   */
  logo?: ImageSourcePropType;
  /** i18n keys under `landing.<kind>`. */
  titleKey: string;
  subtitleKey?: string;
  /** Brand tints (light theme) — deliberate per-option accents, not tokens. */
  bgColor: string;
  accentColor: string;
  titleColor: string;
  subtitleColor?: string;
  qaId: string;
}

/**
 * Single source of truth for the Landing option cards. The screen renders this
 * array; adding, removing or reordering an option is an edit here only.
 */
export const PLATFORM_OPTIONS: readonly PlatformOption[] = [
  {
    kind: "classic",
    icon: "cloud-outline",
    logo: rainmakerClassic,
    titleKey: "landing.classic.title",
    bgColor: "#E6F1FB",
    accentColor: "#2C5AA0",
    titleColor: "#0C447C",
    qaId: "landing_option_classic",
  },
  {
    kind: "neo",
    icon: "sparkles-outline",
    logo: rainmakerNeo,
    titleKey: "landing.neo.title",
    bgColor: "#E1F5EE",
    accentColor: "#0F6E56",
    titleColor: "#04342C",
    qaId: "landing_option_neo",
  },
  {
    kind: "ownDeployment",
    icon: "qr-code-outline",
    titleKey: "landing.ownDeployment.title",
    subtitleKey: "landing.ownDeployment.subtitle",
    bgColor: "#F1EFE8",
    accentColor: "#5F5E5A",
    titleColor: "#2C2C2A",
    subtitleColor: "#5F5E5A",
    qaId: "landing_option_own_deployment",
  },
] as const;
