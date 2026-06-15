# Changelog

All notable changes to the ESP RainMaker Home app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.1.1]

### Fixed

- [RMNG] Reinitialize MQTT client on logout/login so live updates resume after account switching
- [RMNG] Device card now reflects live MQTT connectivity changes instead of stale memoized state
- [RMNG] Primary parameter resolution now correctly identifies power/ON-OFF params
- [RMNG] Device name edits persist instead of reverting after save
- [RMNG] Group sharing now uses the user code from the latest profile response
- [RMNG] Validate default values when saving automations and schedules to prevent invalid payloads
- Newly created rooms now appear in the room picker during provisioning

### Enhanced

- [RMNG] Added enable/disable flow for automations
- [RMNG] Provisioning now waits for the device to report online before completing node setup
- Increased param control throttle to 400 ms

## [5.1.0]

### Added

#### Matter Device Control
- Enabled read, write, and command invocation for commissioned Matter devices
- Streamed live attribute updates via Matter subscriptions, with delivery routed per fabric and group
- Supported group-level control by resolving the active Matter fabric for each RainMaker group
- Added local discovery and reachability tracking for commissioned Matter nodes
- Supported concurrent mDNS discovery for Matter services without interfering with existing browse sessions
- Replaced the standalone fabric selection screen with a guided commissioning and fabric-conversion consent flow
- Initialized Matter fabric state after sign-in so device control is available without a separate setup step
- Added RVC device profile, parameter mappings, and locale strings

#### Matter ChipTool Commissioning
- ChipTool commissioning path for hardware without Google Play services; build-time back-end switch (Google Play default)
- Shared RainMaker NOC-chain issuer and fabric details across both back-ends; fixed CAT id admin subject for access control

### Fixed

- [Matter] CHIPController 1.5.1.0 upgrade; fixed PASE/CASE crash on commissioning stage start
- [Matter] NOC chain generation and 2-tier PKI alignment for group admin subject
- [Matter] Access-control entry construction aligned with updated cluster signature

## [5.0.0]

### Enhanced

#### Platform Upgrade (Expo SDK 55 / React Native 0.83)
- Upgraded to Expo SDK 55 and React Native 0.83 for Android 16KB page size compliance
- Migrated Android native build, Gradle wrapper, and project configuration to the required versions
- Refreshed iOS native build configuration to match the upgraded stack
- Fixed splash screen theme so it renders correctly after the upgrade
- Updated affected app hooks to stay compatible with the new dependency versions
- Bumped JS dependencies to versions compatible with Expo SDK 55

## [4.3.0]

### Added

#### On Network Provisioning
- Added manual-add flow to provision RainMaker devices already on the user's Wi-Fi
- mDNS discovery via native Android and iOS modules
- Local ownership claim over the network using HTTP challenge-response
- New OnNetworkDiscovery screen and discovery hook; CDF extended for on-network devices

#### RMNG Local Control
- Wired local control adapter into the RMNG SDK configuration
- Enabled local control in the RMNG SDK feature map
- Subscribe and unsubscribe local discovery from the user transformer

---

### Enhanced

- Moved in-app CDF to the external `@espressif/rainmaker-base-cdf` package; existing `@store` imports unchanged
- Aligned RMNG adaptor with updated backend request and response shapes (entity IDs, automation paths, profile/group-user fields, HTTP status codes, optional `message`)
- Updated RMNG group control payload and sharing request handling (broadcast envelopes, primary user in sharing requests)
- Improved slider UX with drag value bubble, compact mode on device fallback panel, and expanded layout in scene, schedule, group, and automation flows
- Improved SDK node transformation resilience when device payloads are partial

### Fixed

- [RMNG] Schedule enable/disable success toast and toggle UI now stay in sync without a manual refresh
- [RMNG] Refresh node config when IoT shadow `ncfg` version changes
- [RMNG] Clear errors for unsupported automation enable/disable and shared subgroups; fixed subgroup share and unshare for the primary user

## [4.2.0]

### Added

#### Room-Level Device Management
- Added room-level bulk ON/OFF control for all devices 
- Introduced device type filtering within rooms  
- Bulk actions now respect active filter selection  

#### Post-Provision Device Details Screen
- Added screen to rename device after provisioning  
- Enabled room assignment during onboarding (existing, predefined, custom)  

---

### Enhanced

- Improved automation event parameter handling during edit  
- Allowed automation creation with offline devices  
- Smoothed light device slider interactions  
- Fixed Agent chat Rainmaker MCP session expired issue  
- Fixed logout button visibility on small screens phones
- Refined email validation timing in forms  
- Fixed keyboard return/Done behavior in inputs  
- Kept “Save Wi-Fi” enabled by default in provisioning  
- Added revoke confirmation in device sharing  
- Ensured light sliders work even when device is OFF  


## [4.1.0]

### Added

**Camera Device Support (WebRTC)**

* Added support for a new **camera device type** with a dedicated control panel UI.
* Integrated **WebRTC-based video streaming** using AWS Kinesis Video Streams (KVS).
* Implemented signaling client, channel caching, and AWS region helpers.
* Added a **VideoPlayer component** with playback controls, connection state, and streaming statistics.
* Introduced `useCameraWebRTC` hook to manage peer connection lifecycle.

**Manual Wi-Fi Network Join**

* Added support for manually entering **Wi-Fi SSID and password** during provisioning.
* Enabled connection to **open networks** (no password required).

---

### Enhanced

**Provisioning Experience**

* Improved **post-provisioning navigation flow** with the addition of a **“Continue” button** on the user manual screen.

**Control & Data Handling**

* Improved **control group updates** by routing parameter updates through `ESPCDFGroup.setParams` for better consistency.

**Code Quality & Maintainability**

* Introduced **strict code quality enforcement**:

  * ESLint with stricter rules and JSDoc validation
  * Architecture boundary checks using dependency-cruiser
  * Spell checking via cspell
  * Pre-commit hooks using Husky
* Refactored codebase to:

  * Improve typings and inline documentation
  * Remove duplication and clean up shared components
  * Strengthen modular, feature-based architecture

**DevOps & Release Automation**

* Added **GitHub tag-based APK release automation**:

  * Automated APK build and artifact generation
  * Attached versioned APKs to CI pipelines
  * Optimized Gradle builds (ABI splits, shrinking, R8)

---

### Fixed

**Provisioning**

- Resolved MQTT-based provisioning failures.

**Device Sync [RMNG]**

- Fixed MQTT connection timing issues to ensure reliable node synchronization and prevent dropped shadow updates.

**Authentication & Navigation**

- Fixed OAuth login back navigation issue where users could get stuck on the account setup screen.

**Data Accuracy**

- Corrected incorrect device counts in scenes and schedules.

## [4.0.1]

### Fixed

**Stability & Data Integrity**

- Prevented saving of **empty or invalid values** in automations and schedules.
- Fixed **redundant time zone updates** triggered during the post-provisioning flow.

### Enhanced

**RMNG Integration**

- Improved accuracy of the **group sharing** feature, ensuring correct handling of **creation and revocation flows**.
- Added support for using a **phone number as the preferred username** in phone number–based login flows.

**Wi-Fi Listing Experience**

- Improved the **Wi-Fi listing flow** flow by auto-loading available networks on page load for better user experience.

## [4.0.0]

### Added

**Project Restructure & Architecture**

- Restructured the app into a **modular, feature-based architecture** for better organization and scalability.
- Introduced a **unified CDF store** for consistent and centralized state management across multiple SDKs.

**Architecture Layer (Adapter Pattern)**

- Implemented an **adapter-based architecture** to standardize SDK integrations.
- Added support for **runtime SDK switching via QR code scan**, allowing dynamic selection between **RMNG and RainMaker SDKs** using a predefined configuration payload.

**ESP RainMaker Base SDK Integration**

- Integrated RainMaker via adapter layer for:
  - User, devices, groups
  - Scenes, schedules, automations, provisioning

**Matter Support (Commissioning Only)**

- Added support for **Matter device commissioning**.

**RMNG Integration**

- Integrated RMNG SDK with support for:
  - Device and group management
  - Schedules and automations
  - Provisioning flows
  - Group control
  - Group sharing

**Provisioning Enhancements**

- Added support for **parsing newer provisioning QR code payload formats**:
  - `NP:PROV_xxx|yyy|b` → BLE provisioning
  - `NP:PROV_xxx|yyy|s` → SoftAP provisioning

**BLE Scan Experience**

- Added support for **displaying device icons during BLE scan** using advertisement data.

---

### Enhanced

- Enhanced flexibility for adding new features and SDKs.
- Improved provisioning flow by **leveraging SDK flag-based APIs**, simplifying internal handling.

---

### Security

- Disabled Android `allowBackup` flag to improve application data security.

---

## [3.5.0]

### Added

**Time Series Visualization Support**

- Added support for **time series** and **simple time series** data visualization using **bar** and **line** charts.
- Introduced support for **predefined time intervals** and **aggregated views**.
- Enabled **custom date range selection** using a calendar for flexible data analysis.


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
