/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";
import { tokens } from "./tokens";

export const chartStyles = StyleSheet.create({
  // Chart Styles
  chartSection: {
    margin: tokens.spacing._10,
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing._10,
    paddingBottom: tokens.spacing._15,
    shadowColor: tokens.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    position: "relative"
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: tokens.spacing._15,
  },
  intervalSection: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    marginBottom: tokens.spacing._10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  periodTabs: {
    flexDirection: "row",
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
    padding: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.radius.sm - 2,
  },
  periodTabText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
  },
  chartTypeSection: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: tokens.colors.borderColor,
  },
  iconButtonActive: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
    shadowColor: tokens.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  chartContainer: {
    alignItems: "center",
    marginVertical: tokens.spacing._20,
    marginTop: 50
  },
  aggregationSection: {
    marginTop: tokens.spacing._20,
  },
  aggregationTabs: {
    flexDirection: "row",
    backgroundColor: tokens.colors.bg,
    borderRadius: tokens.radius.sm,
    padding: 4,
    gap: 4,
  },
  aggregationTab: {
    flex: 1,
    paddingVertical: tokens.spacing._10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.radius.sm - 2,
  },
  aggregationTabText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
  },

  // Selected Point Display Styles
  selectedPointContainer: {
    margin: tokens.spacing._10,
    marginBottom: 0,
    padding: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
  },
  selectedPointContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedPointLabel: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  selectedPointValueContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: tokens.spacing._5,
  },
  selectedPointValue: {
    fontSize: 32,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
  },
  selectedPointTime: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
  },
  selectedPointModal: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    minHeight: "40%",
    maxHeight: "80%",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: tokens.colors.black,
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  selectedPointModalContent: {
    flex: 1,
    padding: tokens.spacing._20,
    paddingBottom: 0,
  },
  selectedPointModalBody: {
    flex: 1,
  },
  selectedPointModalButtonContainer: {
    flexDirection: "row",
    display: "flex",
    gap: tokens.spacing._10,
    paddingTop: tokens.spacing._20,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.bg2,
  },

  // Chart Error State Styles
  chartErrorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing._20,
    backgroundColor: tokens.colors.white,
  },
  chartErrorText: {
    color: tokens.colors.error,
    fontSize: tokens.fontSize.md,
    textAlign: "center",
    marginBottom: tokens.spacing._20,
  },
  chartRetryButton: {
    paddingHorizontal: tokens.spacing._20,
    paddingVertical: tokens.spacing._10,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
  },
  chartRetryButtonText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },

  // Chart Aggregation Dropdown Styles
  // Chart Loading and Empty State Styles
  chartLoadingContainer: {
    height: 360,
    justifyContent: "center",
    alignItems: "center",
  },
  chartLoadingText: {
    marginTop: tokens.spacing._10,
    color: tokens.colors.text_secondary,
    fontSize: tokens.fontSize.sm,
  },
  chartEmptyStateContainer: {
    height: 360,
    justifyContent: "center",
    alignItems: "center",
  },
  chartEmptyStateText: {
    color: tokens.colors.text_secondary,
    fontSize: tokens.fontSize.md,
  },

  // Header Spacer
  headerSpacer: {
    width: 24,
  },

  // Chart Header with Margin
  chartHeaderWithMargin: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: tokens.spacing._15,
  },

  // Section Label with Secondary Color
  sectionLabelSecondary: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    marginBottom: tokens.spacing._10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: tokens.colors.text_secondary,
  },

  // Period Tab Active State
  periodTabActive: {
    backgroundColor: tokens.colors.primary,
    shadowColor: tokens.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },

  // Period Tab Disabled State
  periodTabDisabled: {
    opacity: 0.5,
  },

  // Period Tab Text Active
  periodTabTextActive: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
    color: tokens.colors.white,
  },

  // Period Tab Text Inactive
  periodTabTextInactive: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
    color: tokens.colors.text_secondary,
  },

  // Chart Type Section Container
  chartTypeSectionContainer: {
    marginLeft: tokens.spacing._15,
  },

  // Icon Button Disabled State
  iconButtonDisabled: {
    opacity: 0.5,
  },

  // Time Navigator Styles
  timeNavigatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: tokens.spacing._10,
    backgroundColor: tokens.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderColor,
    margin: tokens.spacing._10,
    borderRadius: tokens.radius.md,
    marginBottom: 0,
    paddingHorizontal: 16
  },
  timeNavigatorButton: {
    borderRadius: tokens.radius.md,
    minWidth: 30,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8
  },
  timeNavigatorButtonDisabled: {
    opacity: 0.5,
  },
  timeNavigatorContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing._20,
    maxWidth: "100%"
  },
  timeNavigatorText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
    textAlign: "center",
    maxWidth: "100%",
  },

  // Range Selector Styles
  rangeSelectorContainer: {
    marginTop: tokens.spacing._10,
    paddingTop: tokens.spacing._10,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderColor,
  },

  // GenericChart Styles
  genericChartContainer: {
    height: 300,
    width: "100%",
  },
  rangeSelectorLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: tokens.spacing._5,
  },
  rangeSelectorChevronContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  rangeSelectorMiniChartWrapper: {
    position: "relative",
    backgroundColor: tokens.colors.bg5,
    borderRadius: tokens.radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  rangeSelectorMiniChartContainer: {
    width: "100%",
    overflow: "hidden",
  },
  rangeSelectorSliderOverlay: {
    position: "absolute",
    flexDirection: "row",
  },
  rangeSelectorSelectedRangeBox: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: 6,
  },
  rangeSelectorHandle: {
    position: "absolute",
    top: "50%",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  rangeSelectorHandleThumb: {
    justifyContent: "center",
    alignItems: "center",
    shadowColor: tokens.colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  rangeSelectorHandleGrip: {
    height: 2,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderRadius: 1,
  },

  // ============================================================================
  // Date Range Calendar Bottom Sheet Styles
  // ============================================================================
  dateRangeCalendarBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  dateRangeCalendarContent: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: "80%",
    width: "100%",
  },
  dateRangeCalendarHandle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  dateRangeCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  dateRangeCalendarTitle: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    flex: 1,
  },
  dateRangeCalendarCloseButton: {
    padding: 4,
  },
  dateRangeCalendarRangeDisplay: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0,
  },
  dateRangeCalendarRangeText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
  },
  dateRangeCalendarContainer: {
    paddingHorizontal: 0,
    height: 400,
  },
  dateRangeCalendarActions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 0,
    gap: 8,
    justifyContent: "space-between",
  },
  dateRangeCalendarButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dateRangeCalendarClearButton: {
    backgroundColor: tokens.colors.bg1,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  dateRangeCalendarClearButtonText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  dateRangeCalendarClearButtonTextDisabled: {
    opacity: 0.5,
  },
  dateRangeCalendarConfirmButton: {
    backgroundColor: tokens.colors.primary,
    borderWidth: 1,
    borderColor: tokens.colors.primary,
  },
  dateRangeCalendarConfirmButtonDisabled: {
    opacity: 0.5,
  },
  dateRangeCalendarConfirmButtonText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.white,
  },
  dateRangeCalendarConfirmButtonTextDisabled: {
    opacity: 0.5,
  },
  dateRangeCalendarCloseButtonAction: {
    backgroundColor: tokens.colors.bg2,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  dateRangeCalendarCloseButtonText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  dateRangeCalendarButtonDisabled: {
    opacity: 0.5,
  },
  dateRangeCalendarButtonTextDisabled: {
    opacity: 0.5,
  },
  dateRangeCalendarBottomSafeArea: {
    height: 34, // Safe area for devices with home indicator
  },

  // ============================================================================
  // Aggregation Tooltip Styles
  // ============================================================================
  aggregationTooltipOverlay: {
    position: "absolute",
    top: -15,
    left: 0,
    right: -15,
    bottom: 0,
    backgroundColor: "transparent",
    zIndex: 9999,
    elevation: 9999,
  },
  aggregationTooltipContainer: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    width: 120,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    zIndex: 10000,
    position: "absolute",
  },
  aggregationTooltipScrollContainer: {
    flexGrow: 0,
  },
  aggregationTooltipArrow: {
    position: "absolute",
    top: -6,
    right: 15,
    width: 12,
    height: 12,
    backgroundColor: tokens.colors.white,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: tokens.colors.borderColor,
    transform: [{ rotate: "-45deg" }],
    zIndex: 10001,
    elevation: 10000,
  },
  aggregationTooltipMenuItem: {
    padding: tokens.spacing._5,
    paddingHorizontal: tokens.spacing._10,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: tokens.colors.borderColor,
    zIndex: 10001,
    elevation: 10000,
  },
  aggregationTooltipLastMenuItem: {
    borderBottomWidth: 0,
  },
  aggregationTooltipSelectedMenuItem: {
    backgroundColor: tokens.colors.bg1,
    borderWidth: 1,
    borderColor: tokens.colors.lightBlue,
    borderRadius: 5,
  },
  aggregationTooltipSelectedMenuItemText: {
    color: tokens.colors.primary,
    fontWeight: "bold",
  },
  aggregationTooltipMenuText: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text_primary,
    fontFamily: tokens.fonts.regular,
  },
});
