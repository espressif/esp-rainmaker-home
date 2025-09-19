/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as WebBrowser from "expo-web-browser";

export const openUrl = (url: string) => {
    WebBrowser.openBrowserAsync(url);
};
/**
 * Creates a deep clone of an object or array
 * @param obj The object to clone
 * @returns A deep clone of the object
 */
export const deepClone = <T>(obj: T): T => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item)) as unknown as T;
    }

    const clonedObj = {} as T;
    Object.entries(obj).forEach(([key, value]) => {
        (clonedObj as any)[key] = deepClone(value);
    });

    return clonedObj;
};

/**
 * Generates a 4-character random ID
 * Uses uppercase letters and replaces numbers with 'X'
 * @returns {string} 4-character identifier
 */
export const generateRandomId = () => {
    const randomStr = Math.random().toString(36).substring(2, 15);
    return randomStr.toUpperCase().replace(/[0-9]/g, "X").substring(0, 4);
}


/**
 * Calculates the dimensions of scene cards based on screen width and number of cards per row
 * @param SIDE_PADDING - Padding on each side of the screen
 * @param CARD_MARGIN_RIGHT - Margin between cards
 * @param MIN_CARD_WIDTH - Minimum width of a card
 * @param NUM_CARDS_3 - Number of cards per row when 3 cards fit
 * @param NUM_CARDS_2 - Number of cards per row when 2 cards fit
 * @param screenWidth - Width of the screen
 * @returns {Object} Object containing card dimensions and number of cards per row
 */
export const getSceneCardDimensions = ({
    SIDE_PADDING,
    CARD_MARGIN_RIGHT,
    MIN_CARD_WIDTH,
    NUM_CARDS_3,
    NUM_CARDS_2,
    screenWidth,
}: {
    SIDE_PADDING: number;
    CARD_MARGIN_RIGHT: number;
    MIN_CARD_WIDTH: number;
    NUM_CARDS_3: number;
    NUM_CARDS_2: number;
    screenWidth: number;
}) => {
    // Try to fit 3 cards
    const totalHorizontalPadding = SIDE_PADDING * 2;
    const totalMarginFor3 = CARD_MARGIN_RIGHT * (NUM_CARDS_3 - 1);
    const availableWidth3 =
        screenWidth - totalHorizontalPadding - totalMarginFor3;
    const cardWidth3 = Math.floor(availableWidth3 / NUM_CARDS_3);

    if (cardWidth3 >= MIN_CARD_WIDTH) {
        return {
            width: cardWidth3,
            height: cardWidth3, // keep square, or adjust as needed
            cardsPerRow: 3,
        };
    } else {
        // Fallback to 2 cards per row
        const totalMarginFor2 = CARD_MARGIN_RIGHT * (NUM_CARDS_2 - 1);
        const availableWidth2 =
            screenWidth - totalHorizontalPadding - totalMarginFor2;
        const cardWidth2 = Math.floor(availableWidth2 / NUM_CARDS_2);
        return {
            width: cardWidth2,
            height: cardWidth2, // keep square, or adjust as needed
            cardsPerRow: 2,
        };
    }
};
