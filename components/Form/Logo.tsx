/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from "react";
import { Image, StyleSheet } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";

import { testProps } from "../../utils/testProps";
// Types
interface LogoProps {
  /** Size of the logo in pixels */
  size?: number;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * Logo
 * 
 * A component for displaying the app logo with customizable size.
 * Features:
 * - Configurable size
 * - Maintains aspect ratio
 * - Consistent bottom margin
 */
const Logo: React.FC<LogoProps> = ({ size = 180,
  qaId}) => {
  return (
    <Image {...(qaId ? testProps(qaId) : {})}
      style={styles(size).logo}
      resizeMethod="scale"
      source={require("@/assets/images/logo.png")}
    />
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = (size: number) => StyleSheet.create({
  logo: {
    width: size,
    height: size,
    marginBottom: tokens.spacing._20,
  },
});

export default Logo; 
