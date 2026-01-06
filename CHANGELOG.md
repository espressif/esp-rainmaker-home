# Changelog

All notable changes to the ESP RainMaker Home app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.4.2]

### Enhanced

**Matter Commissioning Background Execution & Error Handling**

* Added background task execution for Matter commissioning to ensure reliability when the app is paused or system dialogs are shown.
* Improved error handling and propagation during Matter commissioning flows with clearer failure reasons.

### Fixed

**Challenge–Response Authentication**

* Fixed an issue where a signature length check in the Challenge–Response workflow caused valid ECDSA keys to fail authentication.
* Removed incorrect assumptions about fixed-length signatures to ensure ECDSA compatibility.

## [3.4.1]
 
### Added
 
**AI Agent Conversations & Volume Control**
 
- Added conversation support for AI Agents across both **Chat** and the **Device Panel**.
- Introduced a new **conversation management UI** to better handle multiple conversations.
- Added **volume control** for AI Agent devices if supported.
- Enabled the ability to **resume past conversations directly from the Chat screen**.
 
**Agent Onboarding Enhancements**
 
- Added **AI Agent device identification** during the onboarding process.
- Improved the **agent profile setup workflow** for a smoother onboarding experience.
- Introduced a **Terms & Conditions bottom sheet** during profile setup for compliance.
 
### Fixed
 
**Bluetooth & QR Code Flow**
 
- Fixed an issue where the **Bluetooth connection was not disconnected** when navigating back to the QR scan screen.
- Ensured the **camera is properly closed** after QR code scan completion.
 
**Agent Management & Error Handling**
 
- Fixed error handling when attempting to add an **already added agent** in Chat.
- Resolved issues causing **agent addition failures** and inconsistent error states.

## [3.4.0]

### Added

**Challenge Response Based User–Node Mapping**

- Added support for challenge–response based user–node mapping during provisioning.

### Enhanced

**Provisioning Flow**

- Ensures UI progress indicators accurately reflect the actual provisioning state.
- Eliminates inconsistencies between SDK events and UI progress updates.

### Fixed

**Provisioning UI (POP & Wi-Fi Screens)**

- Resolved minor UI and interaction issues in POP and Wi-Fi configuration screens.
- Improved screen stability and overall user experience during device provisioning.

**Error Reporting**

- Displays actual errors encountered during provisioning flows.

## [3.3.3]

### Added

**ESP AI Agent Support:**

- Integrated the default RainMaker Control AI Agent for device management via chat.
- Added support for selecting from multiple AI agents or adding custom agents using a QR code or AI Agent ID.
- Enabled configuration of ESP AI Voice Assistant devices with a preferred AI agent.

**Assisted Claiming:**

- Added support for Assisted Claiming during device onboarding.

**System Services**

- Introduced System Services to allow primary users to perform supported node-level operations like reboot remotely, Wi-Fi reset and factory reset.
- Added handling of RainMaker Authentication Services on devices.

### Enhanced

**Provisioning**

- Added BLE status check during device provisioning.
- Automatically display the device README after successful provisioning.

## [3.2.0]

### Added

**Matter Commissioning Support:**

- Introduced Matter ecosystem commissioning with support for onboarding Matter-enabled ESP devices.
- Added QR-based Matter device setup flow with seamless integration into the existing provisioning workflow.
- Integrated Matter commissioning status updates and device sync into RainMaker homes and rooms.
- Added UI and error-handling improvements to guide users through onboarding failures and retries.

### Enhanced

**Timezone Management:**

- Set the user’s timezone on the device during provisioning.
- Display the current node timezone with the ability to update it from the node settings screen.

## [3.1.3]

### Enhanced

**Password Recovery:**

- Rectified forgot password flow to require OTP verification before presenting new password fields.

**Device Control:**

- Added brightness slider to the color tab for enhanced control.
- Implemented logic to toggle color mode based on supported device features.

**UI Improvements:**

- Corrected Temperature Sensor label for better clarity.
- Unified Automation screen button placement for better user experience.

### Fixed

**Home Initialization:**

- Filtered out unsupported matter nodes while adding nodes to Home group during initialization.

## [3.1.2]

### Enhanced

**Home Management:**

- Ensure home groups are marked as mutually exclusive if not already.
- Improved unassigned nodes filtering and assignment logic.
- Improved candidate home lookup logic.
- Improved error handling for home creation.

## [3.1.1]

### Enhanced

**Scene Management:**

- Scenes are now synced only from nodes in the currently selected home.

**Data Fetching:**

- Added support for paginated fetching of groups and nodes for improved scalability.

**Home Management:**

- Persisted the selected home across user sessions for better continuity.

### Fixed

**Shared Homes Permissions:**

- Blocked non-primary users from adding devices to shared homes.

**Node Assignment:**

- Disabled automatic group assignment for unassigned nodes when no primary home is available.

**Rooms List:**

- Rooms are now displayed based on the selected home in the Home Management screen instead of the Home screen.

## [3.1.0]

### Added

**Automation Features:**

- Introduced a comprehensive automation system with support for create, update, delete, and enable/disable operations to automate devices based on event trigger

**Schedule Features:**

- Introduced a comprehensive scheduling system with support for create, edit, delete, and enable/disable operations to automate devices based on time and repeat patterns

### Enhanced

**UI Enhancement:**

- Improved footer navigation layout

**Provisioning Enhancement:**

- Automatically add provisioned nodes to the selected home during the provisioning process

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
