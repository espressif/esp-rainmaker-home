# ESP RainMaker Home App

<div align="center">
<p align="center">
  <img src="assets/images/logo.png" alt="ESP RainMaker Home App" width="200"/>
</p>
</div>

<div align="center">

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-yellow.svg)](https://opensource.org/licenses/Apache-2.0)
[![React Native](https://img.shields.io/badge/React%20Native-v0.76.9-blue.svg)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2052-black.svg)](https://expo.dev/)

</div>

<div align="center">
<p align="center">
  A powerful React Native application built with Expo for managing your ESP RainMaker IoT ecosystem. 
  Control your smart devices, manage rooms, and automate your home with ease.
</p>
</div>

## ⚡ Quick Start

> If you already have a React Native development environment set up with Node.js 22+, Android Studio/Xcode configured, you can jump straight into the Quick Start section below. For starting from scratch, refer to our detailed [Environment Setup](#environment-setup) section.

**TL;DR - Get running in 5 minutes:**

```bash
# Prerequisites: Node.js 22+, Android Studio or Xcode
git clone https://github.com/espressif/esp-rainmaker-home.git
cd esp-rainmaker-home
nvm use 22
npm install

## Devlopment Build

# For Android
npm run android

# For iOS (macOS only)
npm run ios -- --device
```

## Key Features

- **Easy Device Provisioning** - Seamlessly add new ESP devices via QR code scanning, BLE discovery, or SoftAP connection
- **Room Management** - Organize devices by Homes and Rooms with intuitive controls
- **Local & Cloud Control** - Control devices both locally and through the ESP RainMaker cloud
- **Secure Authentication** - AWS Cognito-based authentication with OAuth providers (Google, Apple) and account management
- **Real-time Updates** - Instant state synchronization across all connected devices
- **Scene Management** - Create and manage automated scenes for multiple devices
- **Cross-Platform** - Native iOS and Android apps with consistent UX
- **Push Notifications** - Stay informed about device status and system events
- **Customizable UI** - Themeable interface with support for custom device panels

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version **22**
- **npm** (Node Package Manager)
- **NVM** (Node Version Manager) - Recommended for managing Node.js versions
- A properly configured **React Native development environment**
- **Android Studio** (for Android development)
- **Xcode** (for iOS development on macOS)

> ⚠️ **Important**: This project uses a **development build** and does **not** rely on EAS Build.

#### Node.js Installation

You have two options for installing Node.js:

**Option 1: Using NVM (Recommended)**

NVM allows you to manage multiple Node.js versions easily. Follow the installation guide at:

- 📥 **[NVM Official Repository](https://github.com/nvm-sh/nvm)**

After installing NVM, install Node.js 22:

```bash
nvm install 22
nvm use 22
node --version  # Should show v22.x.x
```

**Option 2: Direct Installation**

Install Node.js directly from the official website:

- 📥 **[Node.js Official Website](https://nodejs.org/)**
- Download **Node.js 22 LTS**
- Verify installation: `node --version` (should show v22.x.x)

### Environment Setup

#### Android Setup

To configure your environment for building and running the app on Android using Android Studio:

👉 **[Expo Environment Setup for Android](https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build&buildEnv=local&platform=android&device=physical)**

**Key Requirements:**

- Install Android Studio with the Android SDK
- Set up Android SDK Build-Tools and Platform-Tools
- Configure Android Virtual Device (AVD) or connect a physical device
- Enable USB Debugging on your Android device

> ⚠️ **Important:** Before syncing Gradle in Android Studio, ensure that the JDK in use is **Zulu JDK 17**.  
> To verify or update this, navigate to:  
> `Tools > SDK Manager > Build, Execution, Deployment > Gradle` and check the JDK path.

If you encounter build issues, try deleting the `./gradle` folders from both your user directory and the project's Android directory.

#### iOS Setup

To set up your environment for building and running the app from Xcode (macOS only):

👉 **[Expo Environment Setup for iOS](https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build&buildEnv=local&platform=ios&device=physical)**

**Key Requirements:**

- Install Xcode from the Mac App Store
- Install Xcode Command Line Tools: `xcode-select --install`
- Install CocoaPods: `sudo gem install cocoapods`
- Configure iOS Simulator or connect a physical iOS device

### Installation

1. **Use the correct Node version and clone the repository**

   ```bash
   # Use Node.js 22
   nvm use 22

   # Clone the repository
   git clone https://github.com/espressif/esp-rainmaker-home.git
   cd esp-rainmaker-home
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

### Configuration & Customization

The app is highly configurable and customizable. For detailed configuration instructions, please see:

📖 **[Configuration & Customization Guide](./docs/CONFIGURATION.md)**

This guide covers:

- SDK configuration and setup
- Device and parameter customization
- Theme and UI customization
- Localization and internationalization
- Advanced customization options
- API endpoint configuration

### Running the App

#### Android

To run the app on a connected Android device or emulator:

```bash
npm run android
```

#### iOS

To run the app on a connected iOS device or simulator:

```bash
npm run ios
```

#### Development Server

To start the development server:

```bash
npm start
```

### Building for Production

#### Android Release Build

```bash
npx react-native run-android --mode release
```

This command properly bundles the JavaScript code and builds a complete release APK. The APK will be available at `android/app/build/outputs/apk/release/app-release.apk`

> **Note:** Using `./gradlew assembleRelease` directly may result in a white screen because it doesn't bundle the JavaScript code required for the app to run.

#### iOS Release Build

1. Install iOS dependencies:

   ```bash
   cd ios
   pod install
   ```

2. Open the workspace in Xcode:

   ```bash
   open NOVA.xcworkspace
   ```

3. In Xcode:
   - Select the "NOVA Release" scheme
   - Select your target device or "Any iOS Device"
   - Build and archive the app (Product → Archive)

### Supports

- **iOS**: Version **15.1** or greater
- **Xcode**: Version **16.3** and above
- **Android Studio**: Narwhal | 2025.1.1 Patch 1
- **Android**: Version **9** & higher

### Native Modules & Adapters

The app includes several native modules and adapters that provide platform-specific functionality:

#### Platform(iOS/Android) Specific Native Modules

- **ESPDiscoveryModule** - Device discovery via mDNS
- **ESPLocalControlModule** - Local control functionality
- **ESPNotificationModule** - Push notification handling
- **ESPOauthModule** - OAuth integration
- **ESPProvModule** - Provisioning capabilities
- **ESPAppUtilityModule** - Utility functions and permissions

#### TypeScript Adapters

Located in the `/adaptors` directory, these provide the bridge between React Native and native functionality:

- `ESPDiscoveryAdapter.ts`
- `ESPLocalControlAdapter.ts`
- `ESPNotificationAdapter.ts`
- `ESPOauthAdapter.ts`
- `ESPProvAdapter.ts`
- `ESPAppUtilityAdapter.ts`

### Troubleshooting

For comprehensive troubleshooting guidance, please see:

🔧 **[Troubleshooting Guide](./docs/TROUBLESHOOTING.md)**

This guide includes solutions for:

- General build and dependency issues
- iOS-specific problems and fixes
- Android-specific issues and solutions
- Development build troubleshooting
- Network and connectivity problems

## 📚 Documentation

### Project Documentation

- 📖 **[Configuration & Customization Guide](./docs/CONFIGURATION.md)** - Detailed guide on configuring and customizing the app
- 🔧 **[Troubleshooting Guide](./docs/TROUBLESHOOTING.md)** - Solutions to common issues and problems

### SDK Documentation

- [ESP RainMaker SDK API Documentation](https://espressif.github.io/esp-rainmaker-app-sdk-ts/)
- [ESP RainMaker CDF API Documentation](https://espressif.github.io/esp-rainmaker-app-cdf-ts/)
- [SDK GitHub Repository](https://github.com/espressif/esp-rainmaker-app-sdk-ts)
- [CDF GitHub Repository](https://github.com/espressif/esp-rainmaker-app-cdf-ts)

## License

This project is licensed under the Apache 2.0 license - see the [LICENSE](LICENSE) file for details.

---

> **⚠️ IMPORTANT NOTICE**: The AWS public deployment details provided in this repository are intended for **development and educational purposes only** and should **NOT be used for commercial purposes**.
