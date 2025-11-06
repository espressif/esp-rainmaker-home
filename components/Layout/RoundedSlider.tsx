/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { Svg, Path, G, Defs, LinearGradient, Stop } from "react-native-svg";

// Styles
import { tokens } from "@/theme/tokens";

import { testProps } from "../../utils/testProps";
interface RoundedSliderProps {
  /** Current progress value (0-100) */
  progress: number;
  /** Label to display */
  progressLabel?: string;
  /** Number of segments */
  segments: number;
  /** Height of each segment in pixels (or stroke width for circular) */
  height?: number;
  /** Width of each segment in pixels (linear only) */
  segmentWidth?: number;
  /** Border radius of segments in pixels (linear only) */
  borderRadius?: number;
  /** Gap between segments in pixels (linear) or degrees (circular) */
  gap?: number;
  /** Color of filled segments */
  fillColor?: string;
  /** Color of empty segments */
  emptyColor?: string;
  /** Show percentage text */
  showPercentage?: boolean;
  /** Shape type: linear or circular */
  shape?: "linear" | "circular";
  /** Radius for circular progress (in pixels) */
  radius?: number;
  /** Start angle for circular progress (in degrees, 0 = top) */
  startAngle?: number;
  /** Total arc angle for circular progress (in degrees) */
  arcAngle?: number;
  /** Size of the container */
  size?: number;
  /** Unit to display */
  unit?: string;
  /** Label to display */
  label?: string;
  /** Width of tick marks for circular gauge (in pixels) */
  tickWidth?: number;
  /** Enable gradient for filled segments */
  useGradient?: boolean;
  /** Array of colors for gradient */
  gradientColors?: string[];
  children?: React.ReactNode;
  /** QA automation identifier */
  qaId?: string;
}

export function RoundedSlider({
  progress = 0,
  progressLabel = "",
  segments = 5,
  height = 8,
  segmentWidth = 40,
  borderRadius = 4,
  gap = 4,
  fillColor = "#3b82f6",
  emptyColor = "#e5e7eb",
  showPercentage = false,
  shape = "linear",
  radius = 80,
  startAngle = 135, // Start from bottom-left (speedometer style)
  arcAngle = 270, // 270 degrees creates a gap at the bottom
  qaId,
  size = 200,
  unit = "%",
  label = "PROGRESS",
  tickWidth = 15,
  useGradient = true,
  gradientColors = ["#ff6b6b", "#4ecdc4", "#45b7d1"],
  children,
}: RoundedSliderProps) {
  // Clamp progress between 0 and 100
  const clampedProgress = Math.max(0, Math.min(100, progress));

  // Calculate how many segments should be filled
  const progressPerSegment = 100 / segments;
  const filledSegments = Math.floor(clampedProgress / progressPerSegment);
  const partialProgress =
    (clampedProgress % progressPerSegment) / progressPerSegment;

  if (shape === "circular") {
    // Calculate proper dimensions to ensure segments are fully visible
    const strokeWidth = height;
    const actualRadius = radius - strokeWidth / 2; // Adjust radius to account for stroke width
    const center = size / 2; // Use size prop for center calculation
    const svgSize = size; // Use size prop for SVG size

    // Calculate segment angles for discrete lines within the specified arc
    const segmentAngle = arcAngle / segments; // Angle per segment

    const segments_array = Array.from({ length: segments }, (_, index) => {
      let segmentFillPercentage = 0;

      if (index < filledSegments) {
        segmentFillPercentage = 100;
      } else if (index === filledSegments) {
        segmentFillPercentage = partialProgress * 100;
      }

      // Calculate start angle for this segment line within the arc
      const segmentStartAngle = startAngle + index * segmentAngle;
      const segmentEndAngle =
        segmentStartAngle + segmentAngle * (segmentFillPercentage / 100);

      return {
        segmentFillPercentage,
        segmentStartAngle,
        segmentEndAngle,
        segmentAngle,
        index,
      };
    });

    const polarToCartesian = (
      centerX: number,
      centerY: number,
      radius: number,
      angleInDegrees: number
    ) => {
      const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
      return {
        x: centerX + radius * Math.cos(angleInRadians),
        y: centerY + radius * Math.sin(angleInRadians),
      };
    };

    // Returns the interpolated color for a segment index along the gradient
    const getprogressGradientColor = (index: number): string => {
      if (!gradientColors || gradientColors.length === 0) {
        return fillColor;
      }
      if (gradientColors.length === 1) {
        return gradientColors[0];
      }
      // Calculate the percentage along the gradient for this segment
      const percent = segments <= 1 ? 0 : index / (segments - 1);

      // Find which two colors to interpolate between
      const stops = gradientColors.length - 1;
      const scaled = percent * stops;
      const lower = Math.floor(scaled);
      const upper = Math.ceil(scaled);

      // If exactly at a stop, return that color
      if (lower === upper) {
        return gradientColors[lower];
      }

      // Interpolate between lower and upper
      const t = scaled - lower;

      // Helper to parse hex color to rgb
      function hexToRgb(hex: string) {
        let c = hex.replace("#", "");
        if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
        const num = parseInt(c, 16);
        return {
          r: (num >> 16) & 255,
          g: (num >> 8) & 255,
          b: num & 255,
        };
      }
      // Helper to convert rgb to hex
      function rgbToHex(r: number, g: number, b: number) {
        return (
          "#" +
          [r, g, b]
            .map((x) => {
              const hex = x.toString(16);
              return hex.length === 1 ? "0" + hex : hex;
            })
            .join("")
        );
      }

      const colorA = hexToRgb(gradientColors[lower]);
      const colorB = hexToRgb(gradientColors[upper]);
      const r = Math.round(colorA.r + (colorB.r - colorA.r) * t);
      const g = Math.round(colorA.g + (colorB.g - colorA.g) * t);
      const b = Math.round(colorA.b + (colorB.b - colorA.b) * t);

      return rgbToHex(r, g, b);
    };

    // Calculate current tick index based on progress
    const getCurrentTickIndex = (progress: number): number => {
      const progressPerSegment = 100 / segments;
      const currentTickIndex = Math.floor(progress / progressPerSegment);
      return Math.min(currentTickIndex, segments - 1);
    };

    return (
      <View {...(qaId ? testProps(qaId) : {})}  style={[styles.container, { width: size, height: size }]}>
        <View style={styles.svgContainer}>
          <Svg width={svgSize} height={svgSize}>
            {/* Define gradient if enabled */}
            {useGradient && (
              <Defs>
                <LinearGradient
                  id="progressGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  {gradientColors.map((color, index) => (
                    <Stop
                      key={index}
                      offset={`${(index / (gradientColors.length - 1)) * 100}%`}
                      stopColor={color}
                    />
                  ))}
                </LinearGradient>
              </Defs>
            )}

            {segments_array.map(
              ({ segmentFillPercentage, segmentStartAngle, index }) => {
                // Create discrete line segments instead of continuous arcs
                const innerRadius = actualRadius - tickWidth / 2;
                const outerRadius = actualRadius + tickWidth / 2;

                const startPoint = polarToCartesian(
                  center,
                  center,
                  innerRadius,
                  segmentStartAngle
                );
                const endPoint = polarToCartesian(
                  center,
                  center,
                  outerRadius,
                  segmentStartAngle
                );

                const linePath = `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;

                // Calculate triangle points for the current progress tick
                const isCurrentTick =
                  index === getCurrentTickIndex(clampedProgress);
                const triangleSize = 8; // Size of the equilateral triangle
                const triangleRadius = outerRadius - tickWidth - 15; // Position triangle at the center of the band

                let trianglePath = "";
                if (isCurrentTick && segmentFillPercentage > 0) {
                  // Calculate triangle points for equilateral triangle
                  const triangleAngle = segmentStartAngle;
                  const triangleCenter = polarToCartesian(
                    center,
                    center,
                    triangleRadius,
                    triangleAngle
                  );

                  // Calculate equilateral triangle vertices
                  const angleRad = (triangleAngle * Math.PI) / 180;

                  // For equilateral triangle, all angles are 60 degrees (π/3)
                  // Point 1: pointing outward along the tick direction
                  const point1 = {
                    x: triangleCenter.x + triangleSize * Math.cos(angleRad),
                    y: triangleCenter.y + triangleSize * Math.sin(angleRad),
                  };

                  // Point 2: 120 degrees clockwise from point 1
                  const angle2 = angleRad + (2 * Math.PI) / 3;
                  const point2 = {
                    x: triangleCenter.x + triangleSize * Math.cos(angle2),
                    y: triangleCenter.y + triangleSize * Math.sin(angle2),
                  };

                  // Point 3: 120 degrees counter-clockwise from point 1
                  const angle3 = angleRad - (2 * Math.PI) / 3;
                  const point3 = {
                    x: triangleCenter.x + triangleSize * Math.cos(angle3),
                    y: triangleCenter.y + triangleSize * Math.sin(angle3),
                  };

                  trianglePath = `M ${point1.x} ${point1.y} L ${point2.x} ${point2.y} L ${point3.x} ${point3.y} Z`;
                }

                return (
                  <G {...(qaId ? testProps(qaId) : {})}  key={index}>
                    {/* Background line segment */}
                    <Path
                      d={linePath}
                      stroke={emptyColor}
                      strokeWidth={strokeWidth}
                      fill="none"
                      strokeLinecap="round"
                    />
                    {/* Filled line segment */}
                    {segmentFillPercentage > 0 && (
                      <Path
                        d={linePath}
                        stroke={
                          useGradient
                            ? getprogressGradientColor(index)
                            : fillColor
                        }
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeLinecap="round"
                      />
                    )}
                    {/* Triangle indicator for current progress tick */}
                    {isCurrentTick &&
                      segmentFillPercentage > 0 &&
                      trianglePath && (
                        <Path
                          d={trianglePath}
                          fill={
                            useGradient
                              ? getprogressGradientColor(index)
                              : fillColor
                          }
                          stroke="#ccc"
                          strokeWidth={1}
                        />
                      )}
                  </G>
                );
              }
            )}
          </Svg>

          {/* Center percentage display for circular */}

          <View style={styles.centerContent}>
            {children
              ? children
              : showPercentage && (
                  <>
                    <View style={styles.valueContainer}>
                      <Text
                        style={[
                          styles.valueText,
                          {
                            color: getprogressGradientColor(
                              getCurrentTickIndex(clampedProgress)
                            ),
                          },
                        ]}
                      >
                        {progressLabel || Math.round(clampedProgress)}
                      </Text>
                      <Text style={styles.unitText}>{unit}</Text>
                    </View>
                    <Text style={styles.labelText}>{label}</Text>
                  </>
                )}
          </View>
        </View>
      </View>
    );
  }

  // Linear progress bar (React Native version)
  return (
    <View {...(qaId ? testProps(qaId) : {})}  style={styles.linearContainer}>
      <View style={[styles.linearBar, { gap: gap }]}>
        {Array.from({ length: segments }, (_, index) => {
          let segmentFillPercentage = 0;

          if (index < filledSegments) {
            segmentFillPercentage = 100;
          } else if (index === filledSegments) {
            segmentFillPercentage = partialProgress * 100;
          }

          // Calculate gradient color based on segment position
          let segmentColor = fillColor;
          if (useGradient && segmentFillPercentage > 0) {
            // Calculate position in the progress (0 to 1)
            const progressPosition = index / segments;
            // Map to gradient colors
            const colorIndex = Math.floor(
              progressPosition * gradientColors.length
            );
            const clampedIndex = Math.max(
              0,
              Math.min(gradientColors.length - 1, colorIndex)
            );
            segmentColor = gradientColors[clampedIndex];
          }

          return (
            <View {...(qaId ? testProps(qaId) : {})}
              key={index}
              style={[
                styles.segment,
                {
                  width: segmentWidth,
                  height: height,
                  borderRadius: borderRadius,
                  backgroundColor: emptyColor,
                },
              ]}
            >
              <View
                style={[
                  styles.segmentFill,
                  {
                    width: `${segmentFillPercentage}%`,
                    backgroundColor: segmentColor,
                    borderRadius: borderRadius,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {showPercentage && (
        <Text style={styles.percentageText}>
          {Math.round(clampedProgress)}%
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  svgContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  centerContent: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  valueContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  valueText: {
    fontSize: 48,
    fontWeight: "700",
    textAlign: "center",
    color: tokens.colors.black,
  },
  unitText: {
    fontSize: 24,
    fontWeight: "400",
    marginTop: 2,
  },
  labelText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginTop: tokens.spacing._5,
    textTransform: "uppercase",
    color: tokens.colors.gray,
  },
  linearContainer: {
    flexDirection: "column",
  },
  linearBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  segment: {
    overflow: "hidden",
  },
  segmentFill: {
    height: "100%",
  },
  percentageText: {
    marginTop: tokens.spacing._5,
    fontSize: 14,
    fontWeight: "500",
    color: tokens.colors.gray,
    textAlign: "center",
  },
});

export default RoundedSlider;
