/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text } from "react-native";

import { paramControlStyles as styles } from "./lib/styles";
import { ParamControlChildProps } from "./lib/types";
import { isUnknownParamValue } from "@shared/utils/paramUtils";
import { observer } from "mobx-react-lite";
import { resolveParamUnitSymbol } from "@shared/utils/paramUnits";

/**
 * StatusReadout
 *
 * Read-only status row for Matter enum and numeric status params (operational state, battery, errors).
 *
 * A sensor readout is exactly where a unit earns its place: `42` alone says
 * nothing, `42%` / `42 lx` does. An adaptor-supplied `valueSuffix` still wins,
 * since it is the more specific instruction; otherwise the declared unit
 * provides the suffix, and a param declaring neither renders as before.
 * Enumerated values render their declared label (`2` → `Jammed`).
 * @param label - Param display label.
 * @param value - Current semantic or numeric value.
 * @param meta - Optional display metadata (`valueSuffix`, `unit`, `labels` map).
 * @returns Non-interactive status row.
 */
const StatusReadout = observer(
  ({ label, value, meta }: ParamControlChildProps) => {
    const labels = meta?.labels as Record<string, string> | undefined;
    const explicitSuffix =
      typeof meta?.valueSuffix === "string" ? meta.valueSuffix : "";
    const suffix = explicitSuffix || resolveParamUnitSymbol(meta?.unit);
    const raw = value == null ? "" : String(value);
    const isUnknown = isUnknownParamValue(value);
    const display = isUnknown
      ? "—"
      : `${labels?.[raw] ?? raw}${suffix}`;

    return (
      <View style={[styles.container, styles.containerCompact]}>
        <View style={styles.content}>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{label}</Text>
            <Text style={styles.value} numberOfLines={2}>
              {display}
            </Text>
          </View>
        </View>
      </View>
    );
  },
);

export default StatusReadout;
