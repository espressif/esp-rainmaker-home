/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";
import { tokens } from "./tokens";
import { verticalScale } from "@/utils/styling";

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
    padding: tokens.spacing._20,
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    width: "90%",
    maxWidth: 400,
  },
  permissionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.colors.bg2,
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
    marginBottom: tokens.spacing._30,
    fontSize: tokens.fontSize.md,
    paddingHorizontal: tokens.spacing._20,
  },
  permissionButton: {
    minWidth: 200,
    flexDirection: "row",
    alignItems: "center",
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

  sceneAddButtonContainer: {
    position: "absolute",
    bottom: 70,
    left: 0,
    right: 0,
    padding: tokens.spacing._15,
  },

  sceneAddButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing._15,
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
});
