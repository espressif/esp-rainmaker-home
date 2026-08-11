/**
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Babel configuration
 * @param api - Babel API (cache, env, etc.)
 * @returns Babel configuration object
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './',
            '@src': './src',
            '@features': './src/features',
            '@shared': './src/shared',
            '@store': './src/store',
            '@native-adaptors': './src/native-adaptors',
            '@sdk-adaptors': './src/sdk-adaptors',
            '@context': './src/context',
            '@config': './config',
            '@assets': './src/assets',
            '@integrations': './src/integrations',
            // Expo: skeleton package imports RN linear-gradient; map to expo shim.
            'react-native-linear-gradient':
              './src/polyfills/react-native-linear-gradient',
          },
          extensions: ['.js', '.jsx', '.tsx', '.ts', '.json'],
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};

