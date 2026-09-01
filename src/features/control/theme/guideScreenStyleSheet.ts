/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";

/**
 * Guide Screen Styles
 */
export const guideScreenStyleSheet = StyleSheet.create({
    contentWrapper: {
        flex: 1,
        position: "relative",
    },
    scrollView: {
        flex: 1,
    },
    scrollContentWithBottomPadding: {
        paddingBottom: 70, // Keeping 70px to accommodate the continue button
    },
    emptyStateWithFooter: {
        paddingBottom: 70,
    },
    continueButtonContainer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
    },
});
