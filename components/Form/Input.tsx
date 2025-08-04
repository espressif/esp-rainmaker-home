/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, forwardRef, useCallback } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
  Text,
} from "react-native";

// Icons
import { Ionicons } from "@expo/vector-icons";

// Hooks
import { useDebounce } from "@/hooks/useDebounce";

// Styles
import { tokens } from "@/theme/tokens";

// Types
type InputMode = "text" | "numeric" | "email" | "tel" | "url";

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

interface InputProps extends Omit<TextInputProps, "onChangeText"> {
  /** Icon name from Ionicons */
  icon?: string;
  /** Whether the input is for password entry */
  isPassword?: boolean;
  /** Whether to validate while user types/changes value */
  validateOnChange?: boolean;
  /** Whether to validate when field loses focus */
  validateOnBlur?: boolean;
  /** Debounce delay in milliseconds for error display (default: 500ms) */
  debounceDelay?: number;
  /** Input identifier */
  id?: string;
  /** Input mode type */
  inputMode?: InputMode;
  /** Validation function */
  validator?: (value: string) => ValidationResult;
  /** Callback when field value/validation state changes */
  onFieldChange?: (value: string, isValid: boolean, error: string) => void;
  /** Custom onBlur callback */
  onBlur?: () => void;
  /** Initial value */
  initialValue?: string;
  /** Additional style overrides */
  style?: Object;
  /** Whether to show bottom border */
  border?: boolean;
  /** Whether to add horizontal padding */
  paddingHorizontal?: boolean;
  /** Whether to add bottom margin */
  marginBottom?: boolean;
}

/**
 * Input
 *
 * A customizable text input component with various features.
 * Features:
 * - Optional icon display
 * - Password toggle visibility
 * - Input validation
 * - Customizable styling
 * - Forward ref support
 * - Platform-specific styling
 */
const Input = forwardRef<TextInput, InputProps>(
  (
    {
      icon,
      isPassword = false,
      validateOnChange = false,
      validateOnBlur = false,
      debounceDelay = 500,
      id,
      placeholder,
      inputMode = "text",
      validator,
      onFieldChange,
      onBlur,
      initialValue = "",
      editable = true,
      style,
      border = true,
      paddingHorizontal = true,
      marginBottom = true,
      ...rest
    },
    ref
  ) => {
    // State
    const [showPassword, setShowPassword] = useState(false);
    const [value, setValue] = useState<string>(initialValue);
    const [errorMessage, setErrorMessage] = useState<string>("");

    // Immediate validation for button state (no error display)
    const validateImmediate = useCallback(
      (inputValue: string): boolean => {
        if (validator) {
          const result = validator(inputValue);
          return result.isValid;
        }
        return true;
      },
      [validator]
    );

    // Validation with error display
    const validateWithError = useCallback(
      (inputValue: string): boolean => {
        if (validator) {
          const result = validator(inputValue);
          if (!result.isValid) {
            setErrorMessage(result.error || "");
            return false;
          } else {
            setErrorMessage("");
            return true;
          }
        }
        setErrorMessage("");
        return true;
      },
      [validator]
    );

    // Debounced validation for error display (prevents immediate errors while typing)
    const debouncedValidateWithError = useDebounce(
      validateWithError,
      debounceDelay
    );

    // Handlers
    const handleChange = (val: string) => {
      setValue(val);

      // Clear error when user starts typing
      if (errorMessage) {
        setErrorMessage("");
      }

      // Always get immediate validation state for button enabling/disabling
      const isValid = validateImmediate(val);
      let currentErrorMessage = "";

      if (validateOnChange) {
        // Clear error immediately when user starts typing (better UX)
        if (errorMessage) {
          setErrorMessage("");
        }
        // Debounced error display to prevent annoying immediate errors
        debouncedValidateWithError(val);
        currentErrorMessage = errorMessage; // Send current error state
      } else if (validator) {
        // Clear any existing errors if not validating on change
        if (errorMessage) {
          setErrorMessage("");
        }
        currentErrorMessage = ""; // No error display while typing
      }

      // Notify parent of changes
      onFieldChange?.(val, isValid, currentErrorMessage);
    };

    const handleBlur = () => {
      if (initialValue === value) {
        return;
      }
      // Validate on blur if enabled
      if (validator && validateOnBlur) {
        // Immediate validation with error display on blur (no debounce needed)
        const isValid = validateWithError(value);
        onFieldChange?.(value, isValid, errorMessage);
      }

      // Call custom onBlur callback if provided
      onBlur?.();
    };

    const togglePassword = () => {
      setShowPassword((prev) => !prev);
    };

    const hasError = !!errorMessage;

    return (
      <View style={[styles.container, marginBottom && styles.marginBottom]}>
        <View style={[styles.inputWrapper]}>
          {!!icon && (
            <Ionicons
              name={icon as any}
              size={22}
              style={styles.leftIcon}
              color={hasError ? tokens.colors.red : tokens.colors.gray}
            />
          )}

          <TextInput
            ref={ref}
            secureTextEntry={isPassword && !showPassword}
            value={value}
            onChangeText={handleChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            placeholderTextColor={tokens.colors.gray}
            style={[
              styles.input,
              style,
              !!icon && styles.paddingLeft,
              !editable && styles.disabled,
              border && styles.border,
              hasError && styles.errorBorder,
              paddingHorizontal && styles.paddingHorizontal,
            ]}
            inputMode={inputMode}
            editable={editable}
            {...rest}
          />

          {isPassword && (
            <TouchableOpacity onPress={togglePassword} style={styles.eyeIcon}>
              <Ionicons
                name={showPassword ? "eye-outline" : "eye-off-outline"}
                size={16}
                color={tokens.colors.gray}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Error Message */}
        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      </View>
    );
  }
);

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  inputWrapper: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
  },
  marginBottom: {
    marginBottom: tokens.spacing._15,
  },
  border: {
    borderBottomWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  errorBorder: {
    borderBottomWidth: 1,
    borderColor: tokens.colors.red,
  },
  input: {
    flex: 1,
    height: 40,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.black,
    fontFamily: tokens.fonts.regular,
  },
  paddingHorizontal: {
    paddingHorizontal: tokens.spacing._20,
  },
  paddingLeft: {
    paddingLeft: 30,
  },
  leftIcon: {
    position: "absolute",
    left: 0,
    zIndex: 10,
    marginRight: tokens.spacing._10,
  },
  eyeIcon: {
    position: "absolute",
    right: tokens.spacing._5,
    zIndex: 10,
  },
  disabled: {
    opacity: 0.4,
  },
  errorText: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.red,
    marginTop: tokens.spacing._5,
    fontFamily: tokens.fonts.regular,
  },
});

export default Input;
