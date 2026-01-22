/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback, useImperativeHandle, forwardRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { useTranslation } from "react-i18next";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
import type {
  DateRangeCalendarBottomSheetProps,
  DateRangeCalendarBottomSheetRef,
} from "@/types/global";

// Utils
import {
  alignToDayStart,
  alignToMonthStart,
  alignToYearStart,
  getEndOfDay,
  getEndOfMonth,
  getEndOfYear,
  determineRangeDurationAggregationInterval,
  getMaxInterval,
  formatDateRangeDisplay,
  timestampToDateString,
  dateStringToTimestamp,
  DATE_RANGE_CONSTANTS,
} from "@/utils/dateRangeHelper";

// ============================================================================
// Component
// ============================================================================

/**
 * DateRangeCalendarBottomSheetV2
 *
 * A bottom sheet modal component for date range selection.
 * Features:
 * - Slides up from bottom with animation
 * - Calendar for date range selection
 * - Full width on mobile devices
 * - Backdrop press to close
 */
const DateRangeCalendarBottomSheetV2 = forwardRef<
  DateRangeCalendarBottomSheetRef,
  DateRangeCalendarBottomSheetProps
>(({
  visible,
  onClose,
  onSelect,
  range,
  aggregation,
  minDate,
  maxDate,
  weekStart = 1, // Default to Monday
  anchorPosition: _anchorPosition, // Deprecated - kept for backward compatibility
  isSimpleTimeSeries = false, // Default to false
}, ref) => {
  const { t } = useTranslation();

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Selected start date in YYYY-MM-DD format
   */
  const [selectedStart, setSelectedStart] = useState<string | null>(
    range?.start ? timestampToDateString(range.start) : null
  );

  /**
   * Selected end date in YYYY-MM-DD format
   */
  const [selectedEnd, setSelectedEnd] = useState<string | null>(
    range?.end ? timestampToDateString(range.end) : null
  );

  /**
   * Current month displayed in calendar (YYYY-MM-DD format)
   */
  const [currentMonth, setCurrentMonth] = useState<string>(
    timestampToDateString(Date.now())
  );

  // ============================================================================
  // Effects
  // ============================================================================

  /**
   * Syncs internal state with range prop changes.
   */
  useEffect(() => {
    if (range) {
      const newStart = timestampToDateString(range.start);
      const newEnd = timestampToDateString(range.end);

      setSelectedStart(newStart);
      setSelectedEnd(newEnd);
      setCurrentMonth(newStart);
    } else {
      setSelectedStart(null);
      setSelectedEnd(null);
    }
  }, [range]);

  // ============================================================================
  // Computed Values
  // ============================================================================

  /**
   * Calculates the minimum date for the calendar.
   */
  const calendarMinDate = useMemo(() => {
    if (minDate) {
      return timestampToDateString(minDate);
    }
    const limitDate = new Date();
    limitDate.setFullYear(limitDate.getFullYear() - 5);
    return timestampToDateString(limitDate.getTime());
  }, [minDate]);

  /**
   * Calculates the maximum date for the calendar.
   */
  const calendarMaxDate = useMemo(() => {
    if (maxDate) {
      return timestampToDateString(maxDate);
    }
    return timestampToDateString(Date.now());
  }, [maxDate]);

  /**
   * Calculates the maximum allowed interval.
   * For simple time series, no restrictions are applied (returns Infinity).
   */
  const maxInterval = useMemo(() => {
    // No restrictions for simple time series
    if (isSimpleTimeSeries) {
      return Infinity;
    }

    if (selectedStart && selectedEnd) {
      const startTimestamp = dateStringToTimestamp(selectedStart);
      const endTimestamp = dateStringToTimestamp(selectedEnd);
      const rangeDuration = getEndOfDay(endTimestamp) - alignToDayStart(startTimestamp);
      const suggestedInterval = determineRangeDurationAggregationInterval(rangeDuration, aggregation);
      return getMaxInterval(suggestedInterval, aggregation);
    }
    return aggregation === "raw"
      ? DATE_RANGE_CONSTANTS.RAW_DATA_MAX_INTERVAL
      : DATE_RANGE_CONSTANTS.YEAR_INTERVAL_MAX;
  }, [selectedStart, selectedEnd, aggregation, isSimpleTimeSeries]);

  /**
   * Configuration for marked dates in the calendar.
   */
  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};

    if (selectedStart) {
      marked[selectedStart] = {
        startingDay: true,
        color: tokens.colors.primary,
        textColor: tokens.colors.white,
      };
    }

    if (selectedEnd) {
      marked[selectedEnd] = {
        endingDay: true,
        color: tokens.colors.primary,
        textColor: tokens.colors.white,
      };
    }

    if (selectedStart && selectedEnd) {
      const start = new Date(selectedStart);
      const end = new Date(selectedEnd);
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];
        if (dateStr !== selectedStart && dateStr !== selectedEnd) {
          marked[dateStr] = {
            color: tokens.colors.bg4,
            textColor: tokens.colors.text_primary,
          };
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return marked;
  }, [selectedStart, selectedEnd]);

  /**
   * Calculates which dates should be disabled.
   * For simple time series, only minDate and maxDate restrictions apply (no interval restrictions).
   */
  const disabledDates = useMemo(() => {
    const disabled: Record<string, { disabled: boolean; disableTouchEvent: boolean }> = {};

    if (minDate) {
      const minDateObj = new Date(minDate);
      const current = new Date(calendarMinDate);
      while (current < minDateObj) {
        const dateStr = current.toISOString().split("T")[0];
        disabled[dateStr] = { disabled: true, disableTouchEvent: true };
        current.setDate(current.getDate() + 1);
      }
    }

    if (maxDate) {
      const current = new Date(maxDate);
      current.setDate(current.getDate() + 1);
      while (current <= new Date(calendarMaxDate)) {
        const dateStr = current.toISOString().split("T")[0];
        disabled[dateStr] = { disabled: true, disableTouchEvent: true };
        current.setDate(current.getDate() + 1);
      }
    }

    if (selectedStart) {
      const startTimestamp = dateStringToTimestamp(selectedStart);
      const alignedStart = alignToDayStart(startTimestamp);
      const maxEndTimestamp = alignedStart + maxInterval;

      const current = new Date(maxEndTimestamp);
      current.setDate(current.getDate() + 1);
      const maxCalendarDate = new Date(calendarMaxDate);
      while (current <= maxCalendarDate) {
        const dateStr = current.toISOString().split("T")[0];
        if (!disabled[dateStr]) {
          disabled[dateStr] = { disabled: true, disableTouchEvent: true };
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return disabled;
  }, [minDate, maxDate, calendarMinDate, calendarMaxDate, selectedStart, maxInterval, isSimpleTimeSeries]);

  /**
   * Formats the selected date range for display.
   */
  const formatDateRange = useMemo(() => {
    return formatDateRangeDisplay(selectedStart, selectedEnd);
  }, [selectedStart, selectedEnd]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handles day press events on the calendar.
   * For simple time series, interval validation is skipped.
   */
  const handleDayPress = useCallback(
    (day: any) => {
      const dateStr = day.dateString;
      const timestamp = dateStringToTimestamp(dateStr);

      if (!selectedStart || timestamp < dateStringToTimestamp(selectedStart)) {
        setSelectedStart(dateStr);
        setSelectedEnd(null);
        return;
      }

      if (selectedStart && !selectedEnd) {
        const startTimestamp = dateStringToTimestamp(selectedStart);
        const alignedStart = alignToDayStart(startTimestamp);
        const alignedEnd = getEndOfDay(timestamp);

        // Skip interval validation for simple time series
        if (!isSimpleTimeSeries && alignedEnd - alignedStart > maxInterval) {
          setSelectedStart(dateStr);
          setSelectedEnd(null);
          return;
        }

        if (timestamp <= startTimestamp) {
          setSelectedStart(dateStr);
          setSelectedEnd(null);
          return;
        }

        setSelectedEnd(dateStr);
      } else if (selectedStart && selectedEnd) {
        setSelectedStart(dateStr);
        setSelectedEnd(null);
      }
    },
    [selectedStart, selectedEnd, maxInterval, isSimpleTimeSeries]
  );

  /**
   * Handles confirmation of the date range selection.
   * For simple time series, interval restrictions and max duration validation are skipped.
   */
  const handleConfirm = useCallback(() => {
    if (!selectedStart || !selectedEnd) {
      return;
    }

    const startTimestamp = dateStringToTimestamp(selectedStart);
    const endTimestamp = dateStringToTimestamp(selectedEnd);

    const rangeDuration = getEndOfDay(endTimestamp) - alignToDayStart(startTimestamp);
    const suggestedInterval = determineRangeDurationAggregationInterval(rangeDuration, aggregation);

    let alignedStart: number;
    let alignedEnd: number;

    switch (suggestedInterval) {
      case "year":
        alignedStart = alignToYearStart(startTimestamp);
        alignedEnd = getEndOfYear(endTimestamp);
        break;
      case "month":
        alignedStart = alignToMonthStart(startTimestamp);
        alignedEnd = getEndOfMonth(endTimestamp);
        break;
      case "day":
      default:
        alignedStart = alignToDayStart(startTimestamp);
        alignedEnd = getEndOfDay(endTimestamp);
        break;
    }

    // Skip max duration validation for simple time series
    if (!isSimpleTimeSeries) {
      const suggestedMaxInterval = getMaxInterval(suggestedInterval, aggregation);
      const actualDuration = alignedEnd - alignedStart;
      
      if (actualDuration > suggestedMaxInterval) {
        const maxEndTimestamp = alignedStart + suggestedMaxInterval;
        if (suggestedInterval === "year") {
          alignedEnd = getEndOfYear(maxEndTimestamp);
        } else if (suggestedInterval === "month") {
          alignedEnd = getEndOfMonth(maxEndTimestamp);
        } else {
          alignedEnd = getEndOfDay(maxEndTimestamp);
        }

        const finalDuration = alignedEnd - alignedStart;
        if (finalDuration > suggestedMaxInterval) {
          alignedEnd = alignedStart + suggestedMaxInterval;
        }
      }
    }

    if (alignedEnd <= alignedStart) {
      return;
    }

    onSelect({
      start: alignedStart,
      end: alignedEnd,
      aggregationInterval: suggestedInterval,
    });

    onClose();
  }, [selectedStart, selectedEnd, aggregation, onSelect, onClose, isSimpleTimeSeries]);

  /**
   * Handles month change in the calendar.
   */
  const handleMonthChange = useCallback((month: any) => {
    setCurrentMonth(month.dateString);
  }, []);

  /**
   * Clears the current date selection.
   */
  const handleClearSelection = useCallback(() => {
    setSelectedStart(null);
    setSelectedEnd(null);
  }, []);

  /**
   * Handles close action.
   */
  const handleClose = useCallback(() => {
    handleClearSelection();
    onClose();
  }, [handleClearSelection, onClose]);

  /**
   * Handles backdrop press to close the modal.
   */
  const handleBackdropPress = useCallback(() => {
    onClose();
  }, [onClose]);

  /**
   * Prevents closing when pressing on the content.
   */
  const handleContentPress = useCallback((e: any) => {
    e.stopPropagation();
  }, []);

  // ============================================================================
  // Ref Exposure
  // ============================================================================

  useImperativeHandle(
    ref,
    () => ({
      clearSelection: handleClearSelection,
    }),
    [handleClearSelection]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={globalStyles.dateRangeCalendarBackdrop} onPress={handleBackdropPress}>
        <Pressable 
          style={globalStyles.dateRangeCalendarContent}
          onPress={handleContentPress}
        >
          {/* Handle */}
          <View style={globalStyles.dateRangeCalendarHandle} />

          {/* Header with title */}
          <View style={[globalStyles.flex, globalStyles.dateRangeCalendarHeader]}>
            <Text style={globalStyles.dateRangeCalendarTitle}>
              {t("device.chart.selectDateRange") || "Select Date Range"}
            </Text>
          </View>

          {/* Selected Range Display */}
          {formatDateRange && (
            <View style={globalStyles.dateRangeCalendarRangeDisplay}>
              <Text style={globalStyles.dateRangeCalendarRangeText}>
                {formatDateRange}
              </Text>
            </View>
          )}

          {/* Calendar Component */}
          <ScrollView
            style={globalStyles.dateRangeCalendarContainer}
            showsVerticalScrollIndicator={false}
          >
            <Calendar
              current={currentMonth}
              minDate={calendarMinDate}
              maxDate={calendarMaxDate}
              onDayPress={handleDayPress}
              markedDates={{
                ...markedDates,
                ...disabledDates,
              }}
              markingType="period"
              onMonthChange={handleMonthChange}
              enableSwipeMonths={true}
              hideExtraDays={true}
              firstDay={weekStart}
              disabledDaysIndexes={[]}
              disableAllTouchEventsForDisabledDays={true}
              theme={{
                backgroundColor: tokens.colors.white,
                calendarBackground: tokens.colors.white,
                textSectionTitleColor: tokens.colors.text_secondary,
                selectedDayBackgroundColor: tokens.colors.primary,
                selectedDayTextColor: tokens.colors.white,
                todayTextColor: tokens.colors.primary,
                dayTextColor: tokens.colors.text_primary,
                textDisabledColor: tokens.colors.text_secondary,
                dotColor: tokens.colors.primary,
                selectedDotColor: tokens.colors.white,
                arrowColor: tokens.colors.primary,
                monthTextColor: tokens.colors.text_primary,
                indicatorColor: tokens.colors.primary,
                textDayFontFamily: tokens.fonts.regular,
                textMonthFontFamily: tokens.fonts.medium,
                textDayHeaderFontFamily: tokens.fonts.regular,
                textDayFontSize: tokens.fontSize.sm,
                textMonthFontSize: tokens.fontSize.md,
                textDayHeaderFontSize: tokens.fontSize.xs,
              }}
            />
          </ScrollView>

          {/* Action Buttons: Clear, Confirm, Close */}
          <View style={[globalStyles.flex, globalStyles.dateRangeCalendarActions]}>
            {/* Clear Button */}
            <TouchableOpacity
              style={[
                globalStyles.dateRangeCalendarButton,
                globalStyles.dateRangeCalendarClearButton,
                (!selectedStart && !selectedEnd) && globalStyles.dateRangeCalendarButtonDisabled,
              ]}
              onPress={handleClearSelection}
              disabled={!selectedStart && !selectedEnd}
            >
              <Text
                style={[
                  globalStyles.dateRangeCalendarClearButtonText,
                  (!selectedStart && !selectedEnd) && globalStyles.dateRangeCalendarButtonTextDisabled,
                ]}
              >
                {t("common.clear") || "Clear"}
              </Text>
            </TouchableOpacity>

            {/* Confirm Button */}
            <TouchableOpacity
              style={[
                globalStyles.dateRangeCalendarButton,
                globalStyles.dateRangeCalendarConfirmButton,
                (!selectedStart || !selectedEnd) && globalStyles.dateRangeCalendarButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!selectedStart || !selectedEnd}
            >
              <Text
                style={[
                  globalStyles.dateRangeCalendarConfirmButtonText,
                  (!selectedStart || !selectedEnd) && globalStyles.dateRangeCalendarButtonTextDisabled,
                ]}
              >
                {t("common.confirm") || "Confirm"}
              </Text>
            </TouchableOpacity>

            {/* Close Button */}
            <TouchableOpacity
              style={[globalStyles.dateRangeCalendarButton, globalStyles.dateRangeCalendarCloseButtonAction]}
              onPress={handleClose}
            >
              <Text style={globalStyles.dateRangeCalendarCloseButtonText}>
                {t("common.close") || "Close"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom safe area */}
          <View style={globalStyles.dateRangeCalendarBottomSafeArea} />
        </Pressable>
      </Pressable>
    </Modal>
  );
});

DateRangeCalendarBottomSheetV2.displayName = "DateRangeCalendarBottomSheetV2";
export default DateRangeCalendarBottomSheetV2;
