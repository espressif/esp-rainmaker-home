/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BarcodeScanningResult } from "expo-camera";
import { Platform } from "react-native";
import {
  PLATFORM_IOS,
  QR_SCANNER_GUIDE_WIDTH_RATIO,
} from "@shared/utils/constants";

/** Frame around the detected QR in CameraView / overlay coordinates. */
export type DetectedQrBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Centered square matching the idle scan guide (window-width based).
 * Used when the OS omits QR geometry but the UI still needs a lock box.
 * @param overlayWidth - Measured overlay width
 * @param overlayHeight - Measured overlay height
 * @param windowWidth - Window width used for guide size (defaults to overlay width)
 * @returns Guide-frame rect in overlay coordinates
 */
export const getCenteredGuideBounds = (
  overlayWidth: number,
  overlayHeight: number,
  windowWidth: number = overlayWidth,
): DetectedQrBounds => {
  const size = windowWidth * QR_SCANNER_GUIDE_WIDTH_RATIO;
  return {
    x: (overlayWidth - size) / 2,
    y: (overlayHeight - size) / 2,
    width: size,
    height: size,
  };
};

type Point = { x: number; y: number };

/** Extra padding outside the QR AABB (tighter on iOS for a closer lock). */
const QR_BORDER_PADDING_DEFAULT = 10;
const QR_BORDER_PADDING_IOS = 6;

/** Values at or below this are treated as 0–1 normalized fractions. */
const NORMALIZED_COORD_MAX = 1.05;

const IS_IOS = Platform.OS === PLATFORM_IOS;

/**
 * Builds an axis-aligned box from a set of points.
 * @param points - Corner or edge points in one coordinate space
 * @returns AABB or null when geometry is empty / invalid
 */
const aabbFromPoints = (points: Point[]): DetectedQrBounds | null => {
  if (points.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { x: minX, y: minY, width, height };
};

/**
 * Collects raw QR geometry points from an expo-camera scan result.
 * @param result - Barcode scan payload
 * @returns Corner points, or the four corners of `bounds` when corners are missing
 */
const extractRawPoints = (result: BarcodeScanningResult): Point[] => {
  const corners = result.cornerPoints;
  if (corners && corners.length > 0) {
    return corners.map((point) => ({ x: point.x, y: point.y }));
  }

  const { bounds } = result;
  if (
    bounds?.size &&
    bounds.size.width > 0 &&
    bounds.size.height > 0 &&
    bounds.origin
  ) {
    const { x, y } = bounds.origin;
    const { width, height } = bounds.size;
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }

  return [];
};

/**
 * True when barcode geometry looks like 0–1 normalized fractions (seen on some iOS builds).
 * @param points - Raw scan points
 * @returns Whether every coordinate sits in the normalized range
 */
const isNormalizedGeometry = (points: Point[]): boolean => {
  if (points.length === 0) {
    return false;
  }
  return points.every(
    (point) =>
      point.x >= -0.05 &&
      point.x <= NORMALIZED_COORD_MAX &&
      point.y >= -0.05 &&
      point.y <= NORMALIZED_COORD_MAX,
  );
};

/**
 * Maps a point into overlay pixel space.
 * @param point - Raw point from the scanner
 * @param overlayWidth - Overlay width in px
 * @param overlayHeight - Overlay height in px
 * @param normalized - Scale 0–1 fractions by overlay size
 * @param swapAxes - Swap x/y (iOS portrait quirk on some builds)
 * @returns Mapped point in overlay coordinates
 */
const mapPointToOverlay = (
  point: Point,
  overlayWidth: number,
  overlayHeight: number,
  normalized: boolean,
  swapAxes: boolean,
): Point => {
  const rawX = swapAxes ? point.y : point.x;
  const rawY = swapAxes ? point.x : point.y;
  if (normalized) {
    return { x: rawX * overlayWidth, y: rawY * overlayHeight };
  }
  return { x: rawX, y: rawY };
};

/**
 * Scores how well a candidate box fits the live overlay (inside + plausible QR size).
 * @param box - Candidate AABB in overlay space
 * @param overlayWidth - Overlay width
 * @param overlayHeight - Overlay height
 * @returns Higher is better; negative when unusable
 */
const scoreOverlayFit = (
  box: DetectedQrBounds,
  overlayWidth: number,
  overlayHeight: number,
): number => {
  if (overlayWidth <= 0 || overlayHeight <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  const minSide = Math.min(overlayWidth, overlayHeight);
  const maxSide = Math.max(box.width, box.height);
  const minBox = Math.min(box.width, box.height);

  // Reject degenerate or huge frames.
  if (minBox < 8 || maxSide > minSide * 1.15) {
    return Number.NEGATIVE_INFINITY;
  }

  const pad = 24;
  const fullyInside =
    box.x >= -pad &&
    box.y >= -pad &&
    box.x + box.width <= overlayWidth + pad &&
    box.y + box.height <= overlayHeight + pad;

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const centerPenalty =
    Math.abs(centerX - overlayWidth / 2) / overlayWidth +
    Math.abs(centerY - overlayHeight / 2) / overlayHeight;

  // Prefer near-square QR codes (typical for RainMaker / Matter).
  const aspect = box.width / box.height;
  const squarePenalty = Math.abs(1 - aspect);

  let score = fullyInside ? 3 : 0;
  // Prefer boxes that cover a meaningful portion of the guide area.
  const coverage = (box.width * box.height) / (overlayWidth * overlayHeight);
  if (coverage >= 0.01 && coverage <= 0.55) {
    score += 2;
  }
  score -= centerPenalty;
  score -= squarePenalty;
  return score;
};

/**
 * Pads and clamps a QR AABB so corner markers stay on-screen.
 * @param box - Mapped AABB
 * @param overlayWidth - Overlay width
 * @param overlayHeight - Overlay height
 * @param padding - Extra inset around the QR
 * @returns Padded, clamped bounds
 */
const padAndClamp = (
  box: DetectedQrBounds,
  overlayWidth: number,
  overlayHeight: number,
  padding: number,
): DetectedQrBounds => {
  let x = box.x - padding;
  let y = box.y - padding;
  let width = box.width + padding * 2;
  let height = box.height + padding * 2;

  if (overlayWidth > 0 && overlayHeight > 0) {
    x = Math.max(0, Math.min(x, overlayWidth - 8));
    y = Math.max(0, Math.min(y, overlayHeight - 8));
    width = Math.max(8, Math.min(width, overlayWidth - x));
    height = Math.max(8, Math.min(height, overlayHeight - y));
  }

  return { x, y, width, height };
};

/**
 * Maps expo-camera barcode geometry into the scanner overlay's pixel space.
 *
 * iOS quirks handled:
 * - 0–1 normalized corners/bounds (scale by overlay size)
 * - Occasional x/y axis swap in portrait
 * - Picks the candidate (raw / normalized / swapped) with the best overlay fit
 * @param result - Expo camera barcode scan payload
 * @param overlayWidth - Measured overlay width (CameraView sibling)
 * @param overlayHeight - Measured overlay height
 * @returns Frame rect for the QR border, or null when geometry is missing
 */
export const mapBarcodeToOverlayBounds = (
  result: BarcodeScanningResult,
  overlayWidth: number,
  overlayHeight: number,
): DetectedQrBounds | null => {
  const rawPoints = extractRawPoints(result);
  if (rawPoints.length === 0 || overlayWidth <= 0 || overlayHeight <= 0) {
    return null;
  }

  const normalized = isNormalizedGeometry(rawPoints);
  const padding = IS_IOS ? QR_BORDER_PADDING_IOS : QR_BORDER_PADDING_DEFAULT;

  // Always evaluate identity mapping; on iOS also try axis-swap candidates.
  const variants: { normalized: boolean; swapAxes: boolean }[] = [
    { normalized, swapAxes: false },
  ];
  if (IS_IOS) {
    variants.push(
      { normalized: true, swapAxes: false },
      { normalized: false, swapAxes: true },
      { normalized: true, swapAxes: true },
      { normalized: false, swapAxes: false },
    );
  }

  let best: DetectedQrBounds | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const variant of variants) {
    const mapped = rawPoints.map((point) =>
      mapPointToOverlay(
        point,
        overlayWidth,
        overlayHeight,
        variant.normalized,
        variant.swapAxes,
      ),
    );
    const box = aabbFromPoints(mapped);
    if (!box) {
      continue;
    }
    const score = scoreOverlayFit(box, overlayWidth, overlayHeight);
    if (score > bestScore) {
      bestScore = score;
      best = box;
    }
  }

  if (!best || bestScore < 0) {
    // Fall back to the simplest mapping so the UI still locks somewhere useful.
    const fallbackPoints = rawPoints.map((point) =>
      mapPointToOverlay(
        point,
        overlayWidth,
        overlayHeight,
        normalized,
        false,
      ),
    );
    best = aabbFromPoints(fallbackPoints);
  }

  if (!best) {
    return null;
  }

  return padAndClamp(best, overlayWidth, overlayHeight, padding);
};
