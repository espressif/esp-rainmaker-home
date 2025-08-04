/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from 'react-native';
import { tokens } from '@/theme/tokens';
import { globalStyles } from '@/theme/globalStyleSheet';

export const paramControlStyles = StyleSheet.create({
  // Base Container
  container: {
    width: '100%',
    ...globalStyles.bgWhite,
    ...globalStyles.radiusSm,
    padding: tokens.spacing._15,
  },

  // Text Input
  textInput: {
    ...globalStyles.bgWhite,
    ...globalStyles.radiusSm,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    padding: tokens.spacing._10,
    marginBottom: tokens.spacing._10,
  },


  // Header Layout
  header: {
    ...globalStyles.flex,
    ...globalStyles.justifyBetween,
    ...globalStyles.alignCenter,
    marginBottom: tokens.spacing._10,
  },

  // Content Layout
  content: {
    ...globalStyles.flex,
    ...globalStyles.justifyBetween,
    ...globalStyles.alignCenter,
  },

  textContainer: {
    flex: 1,
  },

  // Typography
  title: {
    ...globalStyles.fontMd,
    ...globalStyles.fontMedium,
    ...globalStyles.textBlack,
  },

  value: {
    ...globalStyles.fontSm,
    ...globalStyles.textGray,
    ...globalStyles.fontMedium,
    marginTop: 2,
  },

  // Slider Styles
  sliderContainer: {
    position: 'relative',
    height: 20,
    ...globalStyles.justifyCenter,
  },

  slider: {
    width: '100%',
    height: 20,
  },

  track: {
    backgroundColor: tokens.colors.bg2,
    height: 4,
    ...globalStyles.radiusSm,
  },

  trackActive: {
    backgroundColor: tokens.colors.primary,
  },

  thumb: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.bg1,
    zIndex: 10,
    shadowColor: tokens.colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 5,
  },

  // Gradient Slider Styles
  gradientSvg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    ...globalStyles.radiusSm,
    zIndex: 1,
  },

  // Color Picker Styles
  colorPickerContainer: {
    height: 200,
    marginTop: tokens.spacing._10,
  },

  colorPicker: {
    flex: 1,
  },

  // Power Button Styles
  powerButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: tokens.spacing._20,
  },

  powerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.white,
    borderWidth: 2,
    borderColor: tokens.colors.bg2,
    shadowColor: tokens.colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },

  powerButtonActive: {
    backgroundColor: tokens.colors.blue,
    borderColor: tokens.colors.blue,
    shadowColor: tokens.colors.blue,
    shadowOpacity: 0.3,
  },

  powerButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.bg2,
  },

  powerButtonInnerActive: {
    backgroundColor: tokens.colors.blue,
    borderColor: tokens.colors.blue,
  },

  powerButtonGlow: {
    position: 'absolute',
    backgroundColor: tokens.colors.blue + '20',
    shadowColor: tokens.colors.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },

  // Push Button Styles
  pushButton: {
    padding: tokens.spacing._20,
    borderRadius: tokens.radius.md,
    ...globalStyles.alignCenter,
    ...globalStyles.justifyCenter,
    backgroundColor: tokens.colors.bg2,
    margin: tokens.spacing._10,
    elevation: 3,
    shadowColor: tokens.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },

  pushButtonActive: {
    backgroundColor: tokens.colors.green,
  },

  pushButtonText: {
    ...globalStyles.fontLg,
    ...globalStyles.fontMedium,
    color: tokens.colors.gray,
  },

  pushButtonTextActive: {
    color: tokens.colors.white,
  },

  // Speed Slider Styles
  speedThumb: {
    borderRadius: '50%',
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.primary,
    shadowColor: tokens.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 4,
  },

  // Text Input Styles
  buttonContainer: {
    ...globalStyles.flex,
    gap: tokens.spacing._10,
  },

  button: {
    flex: 1,
    ...globalStyles.flex,
    ...globalStyles.alignCenter,
    ...globalStyles.justifyCenter,
    padding: tokens.spacing._15,
    ...globalStyles.radiusSm,
    gap: tokens.spacing._5,
  },

  cancelButton: {
    backgroundColor: tokens.colors.bg2,
  },

  saveButton: {
    backgroundColor: tokens.colors.primary,
  },

  cancelButtonText: {
    ...globalStyles.fontMd,
    ...globalStyles.fontMedium,
    ...globalStyles.textGray,
  },

  saveButtonText: {
    ...globalStyles.fontMd,
    ...globalStyles.fontMedium,
    ...globalStyles.textWhite,
  },

  // Toggle Switch Styles
  toggleSwitch: {
    backgroundColor: tokens.colors.bg2,
  },

  toggleThumb: {
    backgroundColor: tokens.colors.white,
  },

  toggleThumbActive: {
    backgroundColor: tokens.colors.primary,
  },

  // Trigger Button Styles
  triggerButton: {
    backgroundColor: tokens.colors.bg2,
    padding: tokens.spacing._15,
    ...globalStyles.radiusMd,
    ...globalStyles.alignCenter,
    ...globalStyles.justifyCenter,
    margin: tokens.spacing._10,
  },

  triggerButtonActive: {
    backgroundColor: tokens.colors.primary,
  },

  triggerButtonText: {
    ...globalStyles.fontMd,
    ...globalStyles.fontMedium,
    color: tokens.colors.gray,
  },

  triggerButtonTextActive: {
    color: tokens.colors.white,
  },

  // Light Bulb Styles
  lightBulb: {
    ...globalStyles.justifyCenter,
    ...globalStyles.alignCenter,
    ...globalStyles.radiusMd,
    backgroundColor: tokens.colors.bg2,
    margin: 'auto',
  },

  lightBulbActive: {
    backgroundColor: tokens.colors.primary,
  },

  // Dropdown Styles
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    ...globalStyles.justifyCenter,
    ...globalStyles.alignCenter,
    padding: tokens.spacing._20,
  },

  modal: {
    ...globalStyles.bgWhite,
    ...globalStyles.radiusMd,

    maxHeight: '40%',
    padding: 0,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    shadowColor: tokens.colors.black,
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacing._20,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg2,
  },

  closeButton: {
    fontSize: tokens.fontSize.lg,
    color: tokens.colors.gray,
    fontWeight: '600',
    padding: tokens.spacing._5,
  },

  modalTitle: {
    ...globalStyles.fontLg,
    ...globalStyles.fontMedium,
    ...globalStyles.textBlack,
    marginBottom: tokens.spacing._15,
    ...globalStyles.textCenter,
  },

  optionsList: {
    maxHeight: 300,
  },

  dropdownItem: {
    ...globalStyles.flex,
    ...globalStyles.justifyBetween,
    ...globalStyles.alignCenter,
    padding: tokens.spacing._15,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.bg2,
  },

  dropdownItemSelected: {
    backgroundColor: tokens.colors.primary + '10',
  },

  dropdownItemText: {
    ...globalStyles.fontMd,
    ...globalStyles.textBlack,
  },

  dropdownItemTextSelected: {
    ...globalStyles.textBlue,
    ...globalStyles.fontMedium,
  },

  // State Modifiers
  disabled: {
    backgroundColor: '#f7f9fc'
  },

  disabledText: {
    color: tokens.colors.gray,
    opacity: 0.5,
  },

  // Error State
  error: {
    ...globalStyles.fontSm,
    color: tokens.colors.red,
    marginTop: tokens.spacing._5,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  controlContainer: {
    flex: 1,
  },
  controlContainerDisabled: {
    opacity: 0.7,
  }
}); 