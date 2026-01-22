/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";
import { tokens } from "./tokens";
import { verticalScale } from "@/utils/styling";
import type {
  AgentTermsBottomSheetStyles,
  AgentConversationsSheetStyles,
} from "@/types/global";
import { chartStyles } from "./chartStyleSheet";

export const globalStyles = StyleSheet.create({
  // Typography
  fontRegular: { fontFamily: tokens.fonts.regular },
  fontMedium: { fontFamily: tokens.fonts.medium },
  fontXs: { fontSize: tokens.fontSize.xs },
  fontSm: { fontSize: tokens.fontSize.sm },
  font15: { fontSize: tokens.fontSize._15 },
  fontMd: { fontSize: tokens.fontSize.md },
  fontLg: { fontSize: tokens.fontSize.lg },
  fontXl: { fontSize: tokens.fontSize.xl },

  // Alignment
  textCenter: { textAlign: "center" },
  textLeft: { textAlign: "left" },
  textRight: { textAlign: "right" },

  // Flex layouts
  flex: { flexDirection: "row", display: "flex" },
  flex1: { flex: 1 },
  flexWrap: { flexWrap: "wrap" },
  flexColumn: { flexDirection: "column" },
  justifyCenter: { justifyContent: "center" },
  justifyEnd: { justifyContent: "flex-end" },
  justifyBetween: { justifyContent: "space-between" },
  alignCenter: { alignItems: "center" },
  alignEnd: { alignItems: "flex-end" },

  // Color helpers
  textGray: { color: tokens.colors.gray },
  textWhite: { color: tokens.colors.white },
  textBlack: { color: tokens.colors.black },
  textBlue: { color: tokens.colors.blue },

  textPrimary: { color: tokens.colors.text_primary },
  textPrimaryLight: { color: tokens.colors.text_primary_light },
  textPrimaryDark: { color: tokens.colors.text_primary_dark },
  textSecondary: { color: tokens.colors.text_secondary },
  textSecondaryLight: { color: tokens.colors.text_secondary_light },
  textSecondaryDark: { color: tokens.colors.text_secondary_dark },

  textWarning: { color: tokens.colors.orange },
  textDanger: { color: tokens.colors.red },

  bgWhite: { backgroundColor: tokens.colors.white },
  bgLightBlue: { backgroundColor: tokens.colors.bg1 },
  bgGray: { backgroundColor: tokens.colors.bg2 },
  bgBlue: { backgroundColor: tokens.colors.blue },

  // Borders
  border: { borderWidth: 1, borderColor: tokens.colors.borderColor },
  borderBottom: {
    borderBottomWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  borderTop: { borderTopWidth: 1, borderColor: tokens.colors.borderColor },

  // Radius
  radiusSm: { borderRadius: tokens.radius.sm },
  radiusMd: { borderRadius: tokens.radius.md },

  // Utility
  fullWidth: { width: "100%" },
  fullHeight: { height: "100%" },
  hidden: { overflow: "hidden" },
  ellipsis: {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  // Safe area
  safeArea: {
    paddingTop: tokens.spacing._15,
    height: "100%",
    boxSizing: "border-box",
  },
  btn: {
    width: "100%",
    backgroundColor: tokens.colors.white,
    color: tokens.colors.white,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: tokens.radius.sm,
    lineHeight: 38,
  },
  btnPrimary: {
    backgroundColor: tokens.colors.primary,
    color: tokens.colors.white,
  },
  btnSecondary: {
    backgroundColor: tokens.colors.bg1,
    color: tokens.colors.primary,
  },
  btnDanger: {
    backgroundColor: tokens.colors.red,
    color: tokens.colors.white,
  },
  btnSuccess: {
    backgroundColor: tokens.colors.green,
    color: tokens.colors.white,
  },
  btnWarning: {
    backgroundColor: tokens.colors.orange,
    color: tokens.colors.white,
  },

  btnText: {
    color: tokens.colors.primary,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Container styles
  container: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: tokens.colors.bg5,
    boxSizing: "border-box",
    overflow: "hidden",
    padding: tokens.spacing._15,
    fontFamily: tokens.fonts.regular,
  },

  content: {
    padding: tokens.spacing._15,
    height: "100%",
    flex: 1,
    overflow: "scroll",
  },

  containerWithScroll: {
    paddingBottom: tokens.spacing._40,
    height: "100%",
    overflow: "scroll",
  },

  homeWrap: {
    paddingBottom: verticalScale(50),
  },

  footerWrap: {
    height: verticalScale(84),
    paddingBottom: verticalScale(34),
    boxSizing: "border-box",
  },

  loginWrap: {
    paddingBottom: tokens.spacing._20,
    width: "100%",
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    marginVertical: 10,
  },

  sectionHeader: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
    marginBottom: tokens.spacing._10,
  },

  // Form
  formControl: {
    width: "100%",
    height: verticalScale(36),
    borderBottomWidth: 1,
    borderColor: tokens.colors.borderColor,
    paddingHorizontal: tokens.spacing._10,
    boxSizing: "border-box",
  },

  codeInput: {
    paddingLeft: tokens.spacing._10,
  },

  // Shaking animation style (stub – use Animated API for real behavior)
  shaking: {
    transform: [{ rotate: "2deg" }],
  },

  // Image wrapper
  imagePreview: {
    padding: verticalScale(80),
  },

  // Button wrap
  btnWrap: {
    width: "100%",
  },

  // More icon
  moreIcon: {
    position: "absolute",
    right: tokens.spacing._15,
    fontSize: tokens.fontSize.xl,
    color: tokens.colors.bg3,
  },

  itemCenter: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  heading: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
    marginBottom: tokens.spacing._10,
    fontWeight: 500,
  },
  subHeading: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
    marginBottom: tokens.spacing._10,
    fontWeight: 500,
  },

  screenWrapper: {
    flex: 1,
    backgroundColor: tokens.colors.white,
  },
  scrollViewContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: tokens.spacing._20,
  },
  logoImage: {
    width: 240,
    height: 120,
    resizeMode: "contain",
    marginBottom: tokens.spacing._20,
  },
  inputContainer: {
    width: "100%",
    alignItems: "center",
  },
  signInButton: {
    marginTop: tokens.spacing._20,
  },
  errorText: {
    color: tokens.colors.red,
    marginBottom: tokens.spacing._10,
  },
  forgotPasswordText: {
    color: tokens.colors.primary,
    marginTop: tokens.spacing._20,
    textAlign: "right",
  },
  thirdLoginText: {
    color: tokens.colors.gray,
    marginTop: tokens.spacing._30,
    textAlign: "center",
  },
  oauthContainer: {
    flexDirection: "row",
    marginTop: tokens.spacing._10,
  },
  oauthButton: {
    marginHorizontal: tokens.spacing._10,
  },
  oauthImage: {
    width: 44,
    height: 44,
  },
  versionText: {
    position: "absolute",
    bottom: tokens.spacing._20,
    alignSelf: "center",
    color: tokens.colors.gray,
  },
  linkText: {
    color: tokens.colors.primary,
    textAlign: "center",
    marginTop: tokens.spacing._10,
  },
  switch: {
    backgroundColor: tokens.colors.bg1,
    borderColor: tokens.colors.bg1,
    borderWidth: 0,
    paddingHorizontal: 3,
  },
  switchThumb: {
    backgroundColor: tokens.colors.white,
    marginVertical: 2,
  },
  switchThumbActive: {
    backgroundColor: tokens.colors.primary,
    marginVertical: 2,
  },
  activeTab: {
    color: tokens.colors.primary,
  },
  activeTabIcon: {
    color: tokens.colors.primary,
  },
  activeTabLabel: {
    color: tokens.colors.primary,
  },

  // Header styles
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
    backgroundColor: tokens.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg2,
  },
  headerTitle: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
    fontWeight: "500",
  },
  backButton: {
    padding: tokens.spacing._5,
  },

  // Input styles
  inputWrapper: {
    position: "relative",
    width: "100%",
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.bg1,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._15,
    fontSize: 16,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.black,
    backgroundColor: tokens.colors.white,
    width: "100%",
  },
  inputIcon: {
    position: "absolute",
    right: tokens.spacing._15,
    top: "50%",
    transform: [{ translateY: -10 }],
  },

  // Info display styles
  infoContainer: {
    gap: tokens.spacing._10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: tokens.spacing._5,
  },
  infoLabel: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.gray,
  },
  infoValue: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },

  // Button styles
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._15,
    borderRadius: tokens.radius.sm,
    width: "100%",
  },
  buttonPrimary: {
    backgroundColor: tokens.colors.primary,
  },
  buttonSecondary: {
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  buttonDanger: {
    backgroundColor: tokens.colors.red,
  },
  buttonText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
  buttonTextPrimary: {
    color: tokens.colors.white,
  },
  buttonTextSecondary: {
    color: tokens.colors.primary,
  },
  buttonTextDanger: {
    color: tokens.colors.white,
  },

  // User management styles
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: tokens.spacing._10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg2,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
  },
  userEmail: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.gray,
    marginTop: 2,
  },
  userActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  permissionBadge: {
    backgroundColor: tokens.colors.primary + "20",
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
  },
  permissionText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
  },
  // Generic badge styles
  badgeContainer: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.white,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    shadowColor: tokens.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeText: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text_secondary,
    fontFamily: tokens.fonts.medium,
    marginRight: tokens.spacing._5,
  },
  removeButton: {
    padding: tokens.spacing._5,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: tokens.colors.white,
    marginHorizontal: tokens.spacing._20,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing._20,
    width: "90%",
  },
  modalTitle: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
    textAlign: "center",
    marginBottom: tokens.spacing._10,
  },
  modalDescription: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.gray,
    textAlign: "center",
    marginBottom: tokens.spacing._20,
  },
  modalActions: {
    flexDirection: "row",
    gap: tokens.spacing._5,
  },

  // Loading and warning styles
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing._10,
  },
  loadingText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.gray,
  },
  secondaryText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.gray,
    lineHeight: 20,
  },

  // Error container
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing._20,
  },

  // Settings styles
  settingsSection: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: tokens.spacing._15,
  },
  settingsItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingsItemIcon: {
    marginRight: tokens.spacing._15,
  },
  settingsItemText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.black,
  },
  settingsItemSeparator: {
    height: 1,
    backgroundColor: tokens.colors.bg1,
    marginHorizontal: tokens.spacing._15,
  },

  // Device scanning styles
  scanContainer: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
    padding: tokens.spacing._15,
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
    marginBottom: tokens.spacing._10,
    padding: tokens.spacing._15,
  },
  deviceCardDisabled: {
    opacity: 0.5,
  },
  deviceIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  deviceIcon: {
    width: 35,
    height: 35,
    resizeMode: "contain",
  },
  deviceInfo: {
    flex: 1,
    marginLeft: tokens.spacing._10,
  },
  deviceName: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._5,
  },
  deviceLabel: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_primary,
    fontFamily: tokens.fonts.regular,
  },
  scanningContainer: {
    alignItems: "center",
    paddingVertical: tokens.spacing._20,
  },
  scanningIcon: {
    marginBottom: tokens.spacing._15,
  },
  scanningText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_primary,
    fontFamily: tokens.fonts.medium,
  },
  deviceListContainer: {
    flex: 1,
    paddingBottom: tokens.spacing._20,
  },
  scannedDevicesList: {
    maxHeight: 200,
    width: "100%",
    alignSelf: "flex-start",
  },
  sectionTitle: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.gray,
    marginVertical: tokens.spacing._15,
  },

  // Action buttons
  actionButtonContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: tokens.spacing._10,
    marginTop: tokens.spacing._10,
    paddingBottom: tokens.spacing._20,
  },
  actionButton: {
    minWidth: 100,
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._30,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPrimary: {
    backgroundColor: tokens.colors.primary,
  },
  actionButtonSecondary: {
    backgroundColor: tokens.colors.bg2,
  },
  actionButtonTextPrimary: {
    color: tokens.colors.white,
    fontFamily: tokens.fonts.medium,
    fontSize: tokens.fontSize.sm,
  },
  actionButtonTextSecondary: {
    color: tokens.colors.gray,
    fontFamily: tokens.fonts.medium,
    fontSize: tokens.fontSize.sm,
  },

  // Card Styles
  card: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing._15,
    marginBottom: tokens.spacing._15,
  },

  // Schedule Card Styles
  scheduleCard: {
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._10,
    marginBottom: tokens.spacing._10,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  scheduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  scheduleTitle: {
    fontSize: tokens.fontSize.lg,
    color: tokens.colors.text_primary,
    flex: 1,
  },
  scheduleTimeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.bg1,
    paddingHorizontal: tokens.spacing._5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scheduleTime: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
    marginLeft: tokens.spacing._5,
  },
  scheduleRepeatContainer: {
    marginTop: tokens.spacing._10,
  },
  scheduleDaysContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
  },
  scheduleDayBox: {
    width: 25,
    height: 25,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tokens.colors.bg1,
    opacity: 0.3,
  },
  scheduleDayBoxActive: {
    opacity: 1,
  },
  scheduleDayText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
  },
  scheduleDayTextActive: {
    fontFamily: tokens.fonts.medium,
  },

  cardHeader: {
    flex: 1,
    alignItems: "center",
    marginBottom: tokens.spacing._10,
  },

  // Status Indicators
  statusIndicator: {
    flex: 1,
    alignItems: "center",
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: tokens.spacing._5,
  },

  // Parameter List
  parameterList: {
    gap: tokens.spacing._10,
  },

  parameterRow: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    padding: tokens.spacing._5,
  },

  // Icon Container
  circleIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: tokens.colors.bg2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: tokens.spacing._15,
  },
  // Verification code styles
  verificationContainer: {
    width: "100%",
    marginBottom: tokens.spacing._20,
  },
  verificationInput: {
    height: 48,
    textAlign: "center",
    fontSize: 20,
    backgroundColor: tokens.colors.bg,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.gray,
  },
  verificationButton: {
    backgroundColor: tokens.colors.primary,
    width: "100%",
    marginBottom: tokens.spacing._20,
  },
  verificationTitle: {
    marginBottom: tokens.spacing._10,
    textAlign: "center",
  },
  verificationSubtitle: {
    marginBottom: tokens.spacing._20,
    textAlign: "center",
    color: tokens.colors.gray,
  },
  verificationHelpText: {
    fontSize: tokens.fontSize.sm,
    textAlign: "center",
    color: tokens.colors.gray,
    marginTop: tokens.spacing._10,
  },

  // Bottom Drawer Styles
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  drawerContent: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    padding: tokens.spacing._20,
    minHeight: "30%",
  },
  drawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: tokens.spacing._15,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.spacing._20,
  },
  drawerTitle: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._10,
  },
  drawerDescription: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
    marginBottom: tokens.spacing._20,
    lineHeight: 20,
  },
  drawerCloseButton: {
    position: "absolute",
    right: tokens.spacing._15,
    top: tokens.spacing._15,
    padding: tokens.spacing._5,
    zIndex: 1,
  },
  drawerIconContainer: {
    marginRight: tokens.spacing._15,
  },
  drawerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: tokens.spacing._15,
  },
  drawerTextContainer: {
    flex: 1,
  },

  // Bottom Sheet Styles (reusable)
  bottomSheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  bottomSheetKeyboardAvoidingView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: "80%",
    minHeight: 300,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  bottomSheetTitle: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    flex: 1,
  },
  bottomSheetCloseButton: {
    padding: 4,
  },
  bottomSheetScrollView: {
    maxHeight: 400,
  },
  bottomSheetScrollContent: {
    paddingTop: 10,
  },
  bottomSheetFormContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  bottomSheetInputContainer: {
    marginBottom: tokens.spacing._10,
    position: "relative",
  },
  bottomSheetLoadingContainer: {
    position: "absolute",
    right: tokens.spacing._15,
    top: tokens.spacing._15,
    zIndex: 10,
  },
  bottomSheetButtonContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: tokens.spacing._10,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  bottomSheetButton: {
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 100,
  },
  bottomSheetCancelButton: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: tokens.colors.bg3,
  },
  bottomSheetCancelButtonText: {
    color: tokens.colors.text_primary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
  },
  bottomSheetSaveButton: {
    backgroundColor: tokens.colors.primary,
    borderWidth: 1.5,
    borderColor: tokens.colors.primary,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  bottomSheetSaveButtonDisabled: {
    backgroundColor: tokens.colors.bg3,
    borderColor: tokens.colors.bg3,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.6,
  },
  bottomSheetSaveButtonText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    fontWeight: "600",
  },
  bottomSheetSaveButtonTextDisabled: {
    color: tokens.colors.text_secondary,
  },
  bottomSheetBottomSafeArea: {
    height: 34, // Safe area for devices with home indicator
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.bg1,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: tokens.spacing._10,
    borderRadius: tokens.radius.sm,
    borderLeftWidth: 4,
    borderLeftColor: tokens.colors.red,
    gap: tokens.spacing._10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.red,
  },

  // Agent Terms Styles
  agentTermsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  agentTermsHero: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing._20,
    paddingBottom: tokens.spacing._30,
  },
  agentTermsHeroBubble: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: tokens.colors.bg2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: tokens.colors.primary,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 6,
  },
  agentTermsSheetWrapper: {
    flexGrow: 0,
    justifyContent: "flex-end",
  },
  agentTermsSheet: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: tokens.spacing._20,
    paddingTop: tokens.spacing._15,
    paddingBottom: tokens.spacing._30,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 10,
  },
  agentTermsHandle: {
    width: 48,
    height: 5,
    backgroundColor: tokens.colors.bg2,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: tokens.spacing._15,
  },

  // Icon Container
  processingText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
    borderRadius: tokens.radius.sm,
  },

  // Scanner and Camera styles
  scannerContainer: {
    flex: 1,
    backgroundColor: tokens.colors.black,
  },
  scanner: {
    width: "100%",
    height: "100%",
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  scannerFrameContainer: {
    alignItems: "center",
  },
  scannerText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    marginTop: 24,
    textAlign: "center",
  },
  guideContainer: {
    alignItems: "center",
  },
  guideText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    textAlign: "center",
  },
  guideIcon: {
    marginBottom: 12,
  },
  permissionContent: {
    alignItems: "center",
    width: "90%",
  },
  permissionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.spacing._20,
  },
  permissionTitle: {
    textAlign: "center",
    marginBottom: tokens.spacing._10,
  },
  permissionDescription: {
    textAlign: "center",
    fontSize: tokens.fontSize.md,
  },
  permissionButton: {
    minWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    marginTop:tokens.spacing._20
  },
  cameraControlsContainer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: tokens.spacing._20,
  },
  cameraToggle: {
    position: "absolute",
    right: tokens.spacing._20,
    bottom: 0,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanAgainButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.spacing._30,
  },
  processingContainer: {
    position: "absolute",
    top: -60,
    left: 0,
    right: 0,
    alignItems: "center",
  },

  // Circular Progress styles
  circularProgressWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  circularProgressContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  circularProgressRing: {
    transform: [{ rotateZ: "-90deg" }],
  },

  // Scene styles
  sceneContainer: {
    flex: 1,
    backgroundColor: tokens.colors.bg1,
  },
  sceneContent: {
    flex: 1,
    paddingHorizontal: tokens.spacing._15,
  },
  sceneSection: {
    marginTop: tokens.spacing._15,
  },
  sceneInputContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  sceneInput: {
    flex: 1,
    paddingRight: tokens.spacing._40,
  },
  sceneEditIcon: {
    top: tokens.spacing._10,
    position: "absolute",
    right: 0,
  },
  sceneDeviceList: {
    gap: tokens.spacing._10,
  },
  sceneAddDeviceButton: {
    padding: tokens.spacing._15,
    gap: tokens.spacing._10,
  },
  sceneButtonContainer: {
    padding: tokens.spacing._15,
    paddingBottom: tokens.spacing._30,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.bg1,
    backgroundColor: tokens.colors.white,
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  sceneFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: tokens.spacing._15,
    paddingBottom: tokens.spacing._30,
    zIndex: 1,
  },
  sceneDeviceSection: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
    marginBottom: tokens.spacing._10,
    overflow: "hidden",
  },
  sceneDeviceTitleRow: {
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._15,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg1,
  },
  sceneDeviceTitle: {
    marginLeft: tokens.spacing._10,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: tokens.colors.bg2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  checkboxDisabled: {
    borderColor: tokens.colors.bg3,
    backgroundColor: tokens.colors.bg1,
    borderWidth: 1,
  },
  sceneEmptyText: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text_secondary,
    textAlign: "center",
  },
  sceneParamSection: {
    padding: tokens.spacing._15,
  },
  sceneParamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.spacing._10,
  },
  sceneParamLabel: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
  },
  sceneParamValue: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_primary,
    fontFamily: tokens.fonts.medium,
  },

  darkDivider: {
    backgroundColor: tokens.colors.darkBorderColor,
    height: 1,
    width: "100%",
    marginBottom: tokens.spacing._5,
  },

  // Time Picker Styles
  timePickerModal: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  timePickerContainer: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    paddingBottom: 20,
  },
  timePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: tokens.spacing._15,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderColor,
  },
  timePickerScrollContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: tokens.spacing._20,
    paddingHorizontal: tokens.spacing._20,
  },
  timePickerScrollColumn: {
    minWidth: 60,
  },
  timePickerScrollItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing._5,
  },
  timePickerScrollText: {
    fontSize: 20,
    color: tokens.colors.text_secondary,
    fontFamily: tokens.fonts.regular,
    opacity: 0.3,
    transform: [{ scale: 0.85 }],
  },
  timePickerSelectedText: {
    color: tokens.colors.text_primary,
    fontFamily: tokens.fonts.medium,
    fontSize: 22,
    opacity: 1,
    transform: [{ scale: 1 }],
  },
  timePickerSeparator: {
    fontSize: 24,
    color: tokens.colors.text_primary,
    fontFamily: tokens.fonts.medium,
    marginHorizontal: tokens.spacing._5,
  },
  timePickerSelectionIndicator: {
    position: "absolute",
    left: tokens.spacing._15,
    right: tokens.spacing._15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: tokens.colors.borderColor,
    backgroundColor: tokens.colors.bg1,
    opacity: 0.3,
  },

  // Schedule Styles
  scheduleTimeText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
    letterSpacing: 1,
    fontWeight: "600",
    padding: tokens.spacing._5,
    paddingHorizontal: tokens.spacing._15,
    backgroundColor: tokens.colors.bg1,
    borderRadius: tokens.radius.sm,
  },
  scheduleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: tokens.spacing._10,
    borderBottomWidth: tokens.border.defaultWidth,
    borderBottomColor: tokens.colors.borderColor,
  },
  scheduleDayButton: {
    width: 25,
    height: 25,
    borderRadius: tokens.radius.sm,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tokens.colors.bg1,
    opacity: 0.3,
  },
  scheduleDayButtonSelected: {
    opacity: 1,
  },
  scheduleDayTextSelected: {
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
  },
  scheduleActionsContainer: {
    flex: 1,
    marginBottom: tokens.spacing._15,
  },
  scheduleActionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: tokens.spacing._10,
  },
  scheduleActionsTitle: {
    fontSize: tokens.fontSize.sm,
    fontWeight: "500",
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    paddingLeft: tokens.spacing._5,
  },

  // Schedule Days and Time Styles
  scheduleSectionTitle: {
    fontSize: tokens.fontSize.sm,
    fontWeight: "500",
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    paddingLeft: tokens.spacing._5,
  },
  scheduleTimeButton: {
    alignItems: "flex-end",
  },

  // Scene Management Styles
  sceneCard: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    padding: 5,
    shadowColor: tokens.colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  sceneCardHorizontal: {
    marginRight: tokens.spacing._10,
  },

  sceneCardVertical: {
    aspectRatio: 1,
    marginBottom: tokens.spacing._10,
    marginRight: tokens.spacing._10,
  },

  sceneCardHeader: {
    position: "absolute",
    top: 0,
    left: 5,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 5,
    width: "100%",
    zIndex: 1,
  },

  sceneCardContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },

  sceneCardName: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.black,
    textAlign: "center",
    paddingHorizontal: 5,
  },

  sceneCardButton: {
    padding: tokens.spacing._5,
    minWidth: 24,
    minHeight: 24,
    justifyContent: "center",
    alignItems: "center",
  },

  sceneSectionTitle: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._15,
  },

  sceneFavoritesList: {
    paddingHorizontal: tokens.spacing._5,
    width: "100%",
    height: 130,
  },

  sceneAllScenesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  sceneEmptyStateIcon: {
    borderRadius: 48,
    padding: 24,
    marginBottom: 24,
  },

  sceneEmptyStateTitle: {
    fontSize: 20,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: 8,
    textAlign: "center",
  },

  sceneEmptyStateDescription: {
    fontSize: 16,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    marginBottom: 24,
  },

  footerAddButtonContainer: {
    position: "absolute",
    bottom: 70,
    left: 0,
    right: 0,
    padding: tokens.spacing._15,
  },

  footerAddButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing._15,
    textAlign: "center",
  },

  // Empty State Styles
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: tokens.spacing._20,
    backgroundColor: tokens.colors.white,
  },
  emptyStateIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.colors.bg2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.spacing._20,
  },
  emptyStateTitle: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
    marginBottom: tokens.spacing._10,
  },
  emptyStateDescription: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    lineHeight: 24,
  },

  instructionsText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
    marginBottom: tokens.spacing._10,
  },
  instrctionDescription: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    lineHeight: 24,
  },

  // Parameter styles
  parameterLabel: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    flex: 1,
  },
  parameterValue: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    textAlign: "right",
  },

  // Scene Empty State Styles
  sceneEmptyStateContainer: {
    alignItems: "center",
    flex: 1,
    marginBottom: 140,
  },
  sceneEmptyStateIconContainer: {
    backgroundColor: tokens.colors.white,
    borderRadius: 48,
    padding: 20,
    marginBottom: 24,
  },
  sceneEmptyStateIconContainerTop: {
    backgroundColor: tokens.colors.white,
    borderRadius: 48,
    padding: 20,
    marginBottom: 24,
    marginTop: "50%",
  },
  sceneEmptyStateTitleLarge: {
    fontSize: tokens.fontSize.sm,
    fontWeight: "500",
    color: tokens.colors.text_primary,
    textAlign: "center",
    marginBottom: 8,
  },
  bottomSafeArea: {
    height: 34,
  },

  nameInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: tokens.spacing._10,
  },
  nameInput: {
    flex: 1,
    paddingRight: tokens.spacing._40,
  },
  editIcon: {
    top: tokens.spacing._10,
    position: "absolute",
    right: 0,
  },

  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    padding: tokens.spacing._5,
    borderRadius: tokens.spacing._5,
    backgroundColor: tokens.colors.warnBg,
    marginBottom: tokens.spacing._10,
  },
  warningText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.warn,
  },

  // Shadow styles and elevation
  shadowElevationForLightTheme: {
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },

  // Dropdown/List Styles
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  dropdownModal: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    maxHeight: "80%",
  },
  dropdownSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: tokens.spacing._15,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg5,
    gap: tokens.spacing._10,
  },
  dropdownSearchInput: {
    flex: 1,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    paddingVertical: tokens.spacing._5,
  },
  dropdownClearButton: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text_secondary,
    fontWeight: "300",
  },
  dropdownList: {
    maxHeight: "100%",
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: tokens.spacing._15,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg5,
  },
  dropdownItemSelected: {
    backgroundColor: tokens.colors.bg5,
  },
  dropdownItemText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
  },
  dropdownItemTextSelected: {
    color: tokens.colors.primary,
    fontWeight: "600",
  },
  dropdownEmptyState: {
    padding: tokens.spacing._30,
    alignItems: "center",
  },
  dropdownEmptyStateText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
    textAlign: "center",
  },

  // Automation Empty State Styles
  automationEmptyStateContainer: {
    alignItems: "center",
    flex: 1,
    marginBottom: 140,
  },
  automationEmptyStateIconContainer: {
    backgroundColor: tokens.colors.white,
    borderRadius: 48,
    padding: 20,
    marginBottom: 24,
  },
  automationEmptyStateIconContainerTop: {
    backgroundColor: tokens.colors.white,
    borderRadius: 48,
    padding: 20,
    marginBottom: 24,
    marginTop: "50%",
  },
  automationEmptyStateTitleLarge: {
    fontSize: tokens.fontSize.sm,
    fontWeight: "500",
    color: tokens.colors.text_primary,
    textAlign: "center",
    marginBottom: 8,
  },
  automationEmptyStateDescription: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    marginBottom: 24,
  },
  automationAddButtonContainer: {
    position: "absolute",
    bottom: 70,
    left: 0,
    right: 0,
    padding: tokens.spacing._15,
  },
  automationAddButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing._15,
  },

  // Chat Styles
  chatGestureContainer: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: tokens.colors.bg5,
    padding: 0,
    margin: 0,
  },
  chatContentContainer: {
    flex: 1,
    width: "100%",
  },
  chatInnerContainer: {
    flex: 1,
  },
  chatHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  chatConnectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chatHeaderSettingsButton: {
    padding: tokens.spacing._5,
  },
  chatStatusContainer: {
    maxHeight: 40,
    backgroundColor: tokens.colors.bg2,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg3,
  },
  chatStatusContent: {
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    gap: tokens.spacing._10,
  },
  chatStatusMessage: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    backgroundColor: tokens.colors.bg1,
    borderRadius: tokens.spacing._10,
  },
  chatStatusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chatStatusText: {
    fontSize: 12,
    color: tokens.colors.text_secondary,
  },
  chatMessagesList: {
    flex: 1,
    width: "100%",
  },
  chatMessagesContent: {
    padding: tokens.spacing._15,
    paddingBottom: tokens.spacing._5,
  },
  chatMessagesContentEmpty: {
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  chatMessagesContentKeyboardVisible: {
    paddingBottom: tokens.spacing._10,
  },
  chatMessageWrapper: {
    marginBottom: tokens.spacing._5,
  },
  chatUserMessageWrapper: {
    alignItems: "flex-end",
  },
  chatBotMessageWrapper: {
    alignItems: "flex-start",
  },
  chatMessageContainer: {
    maxWidth: "85%",
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
    borderRadius: tokens.spacing._15,
    shadowColor: tokens.colors.text_primary,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  chatUserMessage: {
    backgroundColor: tokens.colors.primary,
    borderBottomRightRadius: tokens.spacing._5,
  },
  chatBotMessage: {
    backgroundColor: tokens.colors.bg1,
    borderBottomLeftRadius: tokens.spacing._5,
    borderWidth: 1,
    borderColor: tokens.colors.bg3,
  },
  chatMessageText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
  },
  chatUserMessageText: {
    color: tokens.colors.bg1,
  },
  chatBotMessageText: {
    color: tokens.colors.text_primary,
  },
  chatMessageTextPreview: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
  },
  chatExpandButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    gap: tokens.spacing._5,
  },
  chatExpandButtonText: {
    fontSize: 14,
    color: tokens.colors.primary,
    fontWeight: "600",
  },
  chatCollapseButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    gap: tokens.spacing._5,
  },
  chatCollapseButtonText: {
    fontSize: 14,
    color: tokens.colors.primary,
    fontWeight: "600",
  },
  chatTimestamp: {
    fontSize: 11,
    color: tokens.colors.text_secondary,
    marginTop: 10,
    fontWeight: "500",
  },
  chatUserTimestamp: {
    textAlign: "right",
  },
  chatBotTimestamp: {
    textAlign: "left",
  },
  chatInputContainer: {
    backgroundColor: tokens.colors.bg1,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.bg3,
    shadowColor: tokens.colors.text_primary,
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  chatInputContainerKeyboardVisible: {
    paddingBottom: tokens.spacing._5,
  },
  chatConnectionBanner: {
    backgroundColor: tokens.colors.bg2,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg3,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
  },
  chatConnectionBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  chatConnectionBannerIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chatConnectionBannerText: {
    flex: 1,
    fontSize: 13,
    color: tokens.colors.text_secondary,
    fontWeight: "500",
  },
  chatReconnectButtonInline: {
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._5,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.spacing._10,
  },
  chatReconnectTextInline: {
    color: tokens.colors.bg1,
    fontSize: 13,
    fontWeight: "600",
  },
  chatInputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._15,
    gap: tokens.spacing._10,
  },
  chatTextInputContainer: {
    flex: 1,
    backgroundColor: tokens.colors.bg3,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
    minHeight: 44,
    maxHeight: 108,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chatTextInput: {
    flex: 1,
    fontSize: 16,
    color: tokens.colors.text_primary,
    lineHeight: 22,
    padding: 0,
    margin: 0,
  },
  chatTextInputDisabled: {
    opacity: 0.5,
  },
  chatCharCountContainer: {
    position: "absolute",
    bottom: 4,
    right: tokens.spacing._15,
  },
  chatCharCount: {
    fontSize: 11,
    color: tokens.colors.text_secondary,
    fontWeight: "500",
  },
  chatCharCountWarning: {
    color: tokens.colors.error,
    fontWeight: "600",
  },
  chatSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 0,
  },
  chatSendButtonActive: {
    backgroundColor: tokens.colors.primary,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  chatSendButtonDisabled: {
    backgroundColor: tokens.colors.bg3,
    opacity: 0.4,
  },
  chatReconnectButton: {
    marginTop: tokens.spacing._10,
    padding: tokens.spacing._15,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.spacing._10,
    alignItems: "center",
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  chatReconnectText: {
    color: tokens.colors.bg1,
    fontSize: 15,
    fontWeight: "600",
  },
  chatThinkingWrapper: {
    marginBottom: tokens.spacing._10,
  },
  chatThinkingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  chatThinkingLoader: {
    marginRight: tokens.spacing._5,
  },
  chatThinkingText: {
    fontSize: 14,
    color: tokens.colors.text_secondary,
    fontStyle: "italic",
    flex: 1,
  },
  chatThinkingIndicatorWrapper: {
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
  },
  chatThinkingIndicatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  chatThinkingIndicatorLoader: {
    marginRight: tokens.spacing._5,
  },
  chatThinkingIndicatorText: {
    fontSize: 14,
    color: tokens.colors.text_secondary,
    fontStyle: "italic",
  },
  chatToolCallWrapper: {
    marginBottom: tokens.spacing._5,
  },
  chatToolCallText: {
    fontSize: 14,
    color: tokens.colors.text_secondary,
    fontWeight: "500",
  },
  chatToolResultWrapper: {
    marginBottom: tokens.spacing._5,
  },
  chatToolResultLabel: {
    fontSize: 14,
    color: tokens.colors.text_secondary,
    fontWeight: "600",
    marginBottom: tokens.spacing._5,
  },
  chatJsonMessageWrapper: {
    marginBottom: tokens.spacing._5,
  },
  chatJsonContainer: {
    marginTop: tokens.spacing._5,
    borderRadius: tokens.spacing._10,
    borderWidth: 1,
    borderColor: tokens.colors.bg3,
    overflow: "hidden",
  },
  chatJsonExpandedWrapper: {
    width: "100%",
  },
  chatJsonExpandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._10,
    backgroundColor: tokens.colors.bg2,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg3,
  },
  chatJsonCollapsedWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._10,
    backgroundColor: tokens.colors.bg2,
    gap: tokens.spacing._10,
  },
  chatJsonCollapsedIcon: {
    paddingLeft: tokens.spacing._5,
  },
  chatJsonContent: {
    backgroundColor: tokens.colors.bg1,
  },
  chatJsonContentContainer: {
    padding: tokens.spacing._15,
  },
  chatJsonText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: tokens.colors.text_primary,
    lineHeight: 20,
  },
  chatJsonPreview: {
    flex: 1,
    fontSize: 12,
    fontFamily: "monospace",
    color: tokens.colors.text_secondary,
    lineHeight: 18,
  },
  chatInitializingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing._20,
  },
  chatInitializingText: {
    marginTop: tokens.spacing._15,
    fontSize: 16,
    color: tokens.colors.text_secondary,
    textAlign: "center",
  },
  chatErrorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing._20,
  },
  chatErrorText: {
    fontSize: 16,
    color: tokens.colors.error,
    textAlign: "center",
    marginBottom: tokens.spacing._20,
  },
  chatTimeoutMessage: {
    backgroundColor: tokens.colors.error + "20",
    borderWidth: 1,
    borderColor: tokens.colors.error,
    alignItems: "center",
  },
  chatTimeoutMessageText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
    color: tokens.colors.error,
    textAlign: "center",
  },
  chatRetryButton: {
    paddingHorizontal: tokens.spacing._20,
    paddingVertical: tokens.spacing._10,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.spacing._10,
  },
  chatRetryButtonText: {
    color: tokens.colors.bg1,
    fontSize: 16,
    fontWeight: "600",
  },

  // Chat Settings Styles
  chatSettingsCenterContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 0,
  },
  chatSettingsLoadingText: {
    marginTop: tokens.spacing._15,
    fontSize: 16,
    color: tokens.colors.text_secondary,
  },
  chatSettingsErrorText: {
    marginTop: tokens.spacing._15,
    fontSize: 16,
    color: tokens.colors.error,
    textAlign: "center",
  },
  chatSettingsEmptyText: {
    fontSize: 14,
    color: tokens.colors.text_secondary,
    fontStyle: "italic",
    textAlign: "center",
    padding: tokens.spacing._20,
  },
  chatSettingsRetryButton: {
    marginTop: tokens.spacing._20,
    paddingHorizontal: tokens.spacing._20,
    paddingVertical: tokens.spacing._10,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.spacing._10,
  },
  chatSettingsRetryButtonText: {
    color: tokens.colors.bg1,
    fontSize: 16,
    fontWeight: "600",
  },
  chatSettingsScrollView: {
    flex: 1,
  },
  chatSettingsScrollContent: {
    padding: tokens.spacing._15,
    paddingBottom: tokens.spacing._20,
  },
  chatSettingsSectionContainer: {
    marginBottom: tokens.spacing._20,
  },
  chatSettingsSectionTitle: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._5,
  },
  chatSettingsCardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing._10,
    justifyContent: "flex-start",
  },
  chatSettingsCapabilityCard: {
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 100,
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    shadowColor: tokens.colors.text_primary,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chatSettingsCapabilityIconContainer: {
    marginBottom: tokens.spacing._5,
    alignItems: "center",
    justifyContent: "center",
  },
  chatSettingsCapabilityLabel: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
  },
  chatSettingsToolCard: {
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    shadowColor: tokens.colors.text_primary,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chatSettingsToolName: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
    marginBottom: tokens.spacing._5,
  },
  chatSettingsConnectedBadge: {
    backgroundColor: tokens.colors.bg4,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
    marginTop: tokens.spacing._5,
  },
  chatSettingsConnectedText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
  },
  chatSettingsConnectButton: {
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
    marginTop: tokens.spacing._5,
    minWidth: 80,
  },
  chatSettingsConnectButtonText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.white,
    textAlign: "center",
  },

  // Agent Settings Styles
  agentSettingsContainer: {
    flex: 1,
    backgroundColor: tokens.colors.bg5,
    padding: 0,
  },
  agentSettingsScrollView: {
    flex: 1,
  },
  agentSettingsEditButtonContainer: {
    padding: tokens.spacing._10,
    marginRight: -tokens.spacing._10,
  },
  agentSettingsEditButton: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
  agentSettingsList: {
    padding: tokens.spacing._15,
    gap: tokens.spacing._15,
  },
  agentSettingsFooterButton: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: tokens.spacing._15,
    backgroundColor: "transparent",
  },

  // Agent Card Styles
  agentCard: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing._15,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    position: "relative",
    marginBottom: tokens.spacing._10,
  },
  agentCardSelected: {
    borderColor: tokens.colors.primary,
    borderWidth: 2,
  },
  agentCardSelectedBackground: {
    backgroundColor: tokens.colors.primary,
  },
  agentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agentCardInfo: {
    flex: 1,
    marginRight: tokens.spacing._10,
  },
  agentCardName: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._5,
  },
  agentCardNameSelected: {
    color: tokens.colors.white,
  },
  agentCardId: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
  },
  agentCardIdSelected: {
    color: tokens.colors.white,
  },
  agentCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  agentCardSelectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
    gap: tokens.spacing._5,
  },
  agentCardSelectedText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
  },
  agentCardDefaultTagContainer: {
    position: "absolute",
    bottom: 0,
    right: 0,
  },
  agentCardDefaultTag: {
    color: tokens.colors.bg2,
    fontSize: tokens.fontSize.xxs,
    fontFamily: tokens.fonts.regular,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
  },
  agentCardDeleteButton: {
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
  },
  agentCardDeleteButtonText: {
    color: tokens.colors.red,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },

  // Guide Styles
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  guideButton: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: tokens.colors.bg3,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._5,
    borderRadius: 20, // Pill shape (half of height)
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    elevation: 8,
    shadowColor: tokens.colors.text_primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  guideButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing._5,
  },
  guideButtonText: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },

  // Chart Styles
  ...chartStyles,
});

// Chat Markdown Styles Helper
// Returns markdown styles configurable by user type and font sizes
export const getChatMarkdownStyles = (
  isUser: boolean,
  fontSizes: {
    base: number;
    lineHeight: number;
    heading1: number;
    heading2: number;
    heading3: number;
  }
) => {
  return {
    body: {
      color: isUser ? tokens.colors.bg1 : tokens.colors.text_primary,
      fontSize: fontSizes.base,
      lineHeight: fontSizes.lineHeight,
      fontFamily: tokens.fonts.regular,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
    },
    heading1: {
      fontSize: fontSizes.heading1,
      fontWeight: "bold" as const,
      marginBottom: 8,
      color: isUser ? tokens.colors.bg1 : tokens.colors.text_primary,
    },
    heading2: {
      fontSize: fontSizes.heading2,
      fontWeight: "bold" as const,
      marginBottom: 6,
      color: isUser ? tokens.colors.bg1 : tokens.colors.text_primary,
    },
    heading3: {
      fontSize: fontSizes.heading3,
      fontWeight: "bold" as const,
      marginBottom: 4,
      color: isUser ? tokens.colors.bg1 : tokens.colors.text_primary,
    },
    code_inline: {
      backgroundColor: isUser ? "rgba(255,255,255,0.2)" : tokens.colors.bg3,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      fontFamily: "monospace",
    },
    code_block: {
      backgroundColor: isUser ? "rgba(255,255,255,0.2)" : tokens.colors.bg3,
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
      fontFamily: "monospace",
    },
    link: {
      color: isUser ? tokens.colors.bg1 : tokens.colors.primary,
      textDecorationLine: "underline" as const,
    },
    list_item: {
      marginBottom: 4,
    },
  };
};

// Agent Terms Bottom Sheet Styles
export const agentTermsBottomSheetStyles: AgentTermsBottomSheetStyles =
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      justifyContent: "flex-end",
    },
    keyboardView: {
      flexGrow: 0,
    },
    bottomSheet: {
      backgroundColor: tokens.colors.white,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: tokens.spacing._20,
      paddingTop: tokens.spacing._15,
      paddingBottom: tokens.spacing._30,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowOffset: { width: 0, height: -4 },
      shadowRadius: 12,
      elevation: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: tokens.spacing._10,
    },
    title: {
      fontSize: tokens.fontSize.lg,
      fontWeight: "bold",
      color: tokens.colors.text_primary,
      flex: 1,
    },
    closeButton: {
      padding: tokens.spacing._5,
    },
    handle: {
      width: 48,
      height: 5,
      backgroundColor: tokens.colors.bg2,
      borderRadius: 3,
      alignSelf: "center",
      marginTop: tokens.spacing._10,
      marginBottom: tokens.spacing._10,
    },
    content: {
      gap: tokens.spacing._20,
      marginTop: tokens.spacing._20,
    },
    subtitle: {
      fontSize: tokens.fontSize.sm,
      color: tokens.colors.text_secondary,
      textAlign: "center",
      marginBottom: tokens.spacing._5,
    },
    inputContainer: {
      marginTop: 0,
    },
    consentContainer: {
      width: "100%",
      marginTop: tokens.spacing._10,
      marginBottom: tokens.spacing._5,
      flexDirection: "row",
      alignItems: "center",
    },
    consentTextContainer: {
      flex: 1,
      paddingTop: 2,
    },
    consentText: {
      fontSize: tokens.fontSize.sm,
      color: tokens.colors.gray,
      lineHeight: 20,
    },
    linkText: {
      fontSize: tokens.fontSize.sm,
      color: tokens.colors.primary,
      textDecorationLine: "underline",
    },
    continueButton: {
      marginTop: tokens.spacing._15,
      marginBottom: 0,
    },
  });

// Agent Conversations Bottom Sheet Styles
export const agentConversationsSheetStyles: AgentConversationsSheetStyles =
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  closeText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_secondary,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 8,
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  itemContainerActive: {
    backgroundColor: tokens.colors.bg3,
  },
  itemTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  itemTitle: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
  },
  itemSubtitle: {
    marginTop: 2,
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text_secondary,
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  activeBadge: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.success,
  },
  deleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deleteButtonText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.red,
  },
});

// Agent Selection Bottom Sheet Styles
export const agentSelectionSheetStyles = StyleSheet.create({
  content: {
    backgroundColor: tokens.colors.white,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    padding: tokens.spacing._20,
    paddingTop: tokens.spacing._15,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: tokens.spacing._20,
    paddingBottom: tokens.spacing._20,
    paddingTop: tokens.spacing._10,
  },
  title: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    flex: 1,
  },
  closeButton: {
    padding: tokens.spacing._5,
  },
  scrollContent: {
    paddingBottom: tokens.spacing._30,
    paddingTop: tokens.spacing._10,
  },
  section: {
    paddingHorizontal: tokens.spacing._20,
    marginBottom: tokens.spacing._5,
  },
  sectionTitle: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_secondary,
    marginBottom: tokens.spacing._15,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  agentItem: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing._10,
    borderWidth: 1,
    borderColor: tokens.colors.bg2,
    padding: tokens.spacing._15,
  },
  agentItemSelected: {
    backgroundColor: tokens.colors.primary + "10",
    borderColor: tokens.colors.primary,
    borderWidth: 2,
  },
  agentItemContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  agentInfo: {
    flex: 1,
    marginRight: tokens.spacing._15,
  },
  agentName: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._5,
  },
  agentNameSelected: {
    color: tokens.colors.primary,
  },
  agentId: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
  },
  agentIdSelected: {
    color: tokens.colors.primary,
  },
  loadingContainer: {
    padding: tokens.spacing._40,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  loadingText: {
    marginTop: tokens.spacing._20,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
  },
  errorContainer: {
    padding: tokens.spacing._40,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  errorText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.red,
    marginBottom: tokens.spacing._20,
    textAlign: "center",
  },
  retryButton: {
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._20,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
  },
  retryButtonText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.white,
  },
  emptyContainer: {
    padding: tokens.spacing._40,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  emptyText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    textAlign: "center",
  },
});
