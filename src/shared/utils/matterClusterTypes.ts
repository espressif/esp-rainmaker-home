/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shape of the cluster registry the app hands to a Matter SDK.
 *
 * Declared here rather than imported from either SDK: the classic and RMNeo
 * packages each ship their own copy, and one registry object is passed to both.
 * Owning the shape locally keeps this file dependency-free, and `sdk.config.ts`
 * still checks the registry against each SDK's own copy where it hands it over,
 * so a divergence in either fails the build there.
 */

/** One selectable option produced by a cluster param resolver. */
export interface ClusterParamOption {
  value: string;
  label: string;
  rawMode: number;
}

/** Resolver hooks for Matter attribute to UI param conversion. */
export interface ClusterParamResolver {
  decodeOptions: (supportedModes: unknown) => ClusterParamOption[];
  decodeValue: (rawValue: unknown, rawModes?: Record<string, number>) => string;
  encodeValue: (
    uiValue: string,
    rawModes?: Record<string, number>,
  ) => number | Record<string, unknown> | null;
}

/** Component of the XY color pair an XY-backed hue/saturation param renders. */
export type XyColorComponent = "hue" | "saturation";

/** Declarative param definition inside a cluster registry entry. */
export interface ClusterParamDefinition {
  name: string;
  type: string;
  valueAttribute: number;
  optionsAttribute: number;
  uiType: string;
  dataType: string;
  resolver: ClusterParamResolver;
  /** RainMaker param properties; defaults to read+write on server clusters. */
  properties?: string[];
  /** UI control bounds and display hints merged into param `bounds`. */
  meta?: Record<string, unknown>;
  /** When true, setting the param invokes a Matter command instead of writing an attribute. */
  writeAsCommand?: boolean;
  /** Matter command id for one-shot invoke params. */
  matterCommandId?: number;
  /**
   * Marks a Color Control hue/saturation param as XY-capable (Neo SDK ≥ 1.4):
   * on endpoints advertising CurrentX/CurrentY without either HS attribute it
   * compiles XY-backed — value from the pair, writes via `MoveToColor`. The
   * classic SDK ignores the field.
   */
  xyColorComponent?: XyColorComponent;
}

/** Registry entry for a Matter cluster that compiles to UI params. */
export interface ClusterRegistryEntry {
  clusterId: number;
  name: string;
  params: ClusterParamDefinition[];
  /** Used when the options attribute is not yet available in node params. */
  defaultOptions?: ClusterParamOption[];
}

/** App-provided cluster registry keyed by hex cluster id (e.g. `"0x54"`). */
export type ClusterConfigMap = Record<string, ClusterRegistryEntry>;
