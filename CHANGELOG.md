# Changelog

All notable changes to the ESP RainMaker Home app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0]

### Added

This is the initial release of ESP RainMaker Home app, a comprehensive React Native application designed to provide seamless control and management of ESP RainMaker IoT devices.

**Core Features:**

**Authentication & User Management:**

- Secure AWS Cognito-based authentication with OAuth support (Google, Apple)
- Complete user registration, login, and password management flows
- Email verification and account security features

**Device Provisioning & Discovery:**

- Multi-protocol device provisioning supporting QR code scanning, BLE discovery, and SoftAP connection
- Automatic device discovery and seamless onboarding experience
- Support for various ESP device types with custom device panels

**Home & Room Organization:**

- Create and manage multiple homes with room-based device organization
- Intuitive device assignment
- Home sharing capabilities for family and team collaboration

**Device Control & Monitoring:**

- Real-time device control with local and cloud connectivity
- Automatic fallback between local and cloud communication
- Live device status monitoring and parameter updates
- Custom device panels for switches, lights, and other device types

**Scene Management:**

- Create and manage scenes for multiple devices

**Cross-Platform Mobile Experience:**

- Native iOS (15.1+) and Android (API 28+) support
- Modern UI built with Tamagui design system
- Optimized performance with smooth scrolling and efficient rendering
- Internationalization support with multi-language capabilities

**Technical Foundation:**

- Built on React Native 0.76.9 with Expo SDK 52.0.0
- TypeScript implementation for type safety and developer experience
- MobX state management for reactive data handling
- Integration with ESP RainMaker SDK 2.0.2 and CDF 1.1.1
- Native module adapters for iOS and Android platform-specific functionality

This release establishes the foundation for a comprehensive IoT device management platform, enabling users to easily control, monitor, and automate their ESP RainMaker ecosystem from their mobile devices.
