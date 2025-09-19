/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { View, StyleSheet, Image, Pressable, Dimensions } from 'react-native';

// Styles
import { tokens } from '@/theme/tokens';
import { globalStyles } from '@/theme/globalStyleSheet';

const { width: screenWidth } = Dimensions.get('window');

// Types
interface PhonePairProps {
  /** Image source for left phone */
  leftImage: any;
  /** Image source for right phone */
  rightImage: any;
  /** Press handler for left phone */
  onLeftImagePress?: () => void;
  /** Press handler for right phone */
  onRightImagePress?: () => void;
}

/**
 * PhonePair
 * 
 * A component for displaying a pair of phone images side by side.
 * Features:
 * - Responsive layout
 * - Press interaction for each phone
 * - Shadow styling
 * - Consistent spacing
 * - Aspect ratio maintenance
 */
const PhonePair: React.FC<PhonePairProps> = ({
  leftImage,
  rightImage,
  onLeftImagePress,
  onRightImagePress,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.phoneContainer}>
        <Pressable style={styles.phoneWrapper} onPress={onLeftImagePress}>
          <View style={styles.phoneFrame}>
            <Image 
              source={leftImage}
              style={styles.phoneImage}
              resizeMode="contain"
            />
          </View>
        </Pressable>
        
        <Pressable style={styles.phoneWrapper} onPress={onRightImagePress}>
          <View style={styles.phoneFrame}>
            <Image 
              source={rightImage}
              style={styles.phoneImage}
              resizeMode="contain"
            />
          </View>
        </Pressable>
      </View>
    </View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    width: screenWidth - 70, // Full width minus margins
    ...globalStyles.justifyCenter,
    ...globalStyles.alignCenter,
    paddingHorizontal: tokens.spacing._10,
  },
  phoneContainer: {
    ...globalStyles.flex,
    ...globalStyles.alignCenter,
    width: '100%',
    gap: tokens.spacing._15,
    justifyContent: 'space-between',
  },
  phoneWrapper: {
    flex: 1,
    ...globalStyles.alignCenter,
  },
  phoneFrame: {
    width: '100%',
    aspectRatio: 0.5,
    maxHeight: 350,
    ...globalStyles.justifyCenter,
    ...globalStyles.alignCenter,
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    shadowColor: tokens.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  phoneImage: {
    width: '95%',
    height: '95%',
    borderRadius: tokens.radius.md,
  },
});

export default PhonePair; 