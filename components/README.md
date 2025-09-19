# Components

<details>
<summary><strong>Overview</strong></summary>

This directory contains reusable components used throughout the ESP RainMaker Home app. Each component is designed to be modular, maintainable, and consistent with the app's design system. Components are organized by functionality and use case.

</details>

<details>
<summary><strong>Component Organization</strong></summary>

The components are organized into the following directories:

- **Banners/**: Header banners, empty states, and promotional components
- **Cards/**: Card-based UI components for displaying grouped information
- **DeviceSettings/**: Components specific to device configuration and management
- **Form/**: Form inputs, buttons, and user interaction components
- **HomeSettings/**: Components for home/group management functionality
- **Info/**: Information display components and list items
- **Layout/**: Layout containers, wrappers, and structural components
- **Modals/**: Modal dialogs, overlays, and popup components
- **Navigations/**: Navigation headers, tabs, and routing components
- **ParamControls/**: Device parameter control components (sliders, toggles, etc.)
- **Scene/**: Scene-related display and management components

</details>

<details>
<summary><strong>Banners</strong></summary>

### Banner

- **Purpose**: Home/group selection banner with dropdown
- **Features**:
  - Group selection dropdown
  - Welcome message display
  - Decorative image support
- **CDF Integration**: Uses `ESPRMGroup` for group data

### AddYourFirstDeviceBanner

- **Purpose**: Onboarding banner for new users with no devices
- **Features**:
  - Welcome message for first-time users
  - Device addition guidance
  - Navigation to device addition flow

### EmptyState

- **Purpose**: Generic empty state component for lists and collections
- **Features**:
  - Custom icon display
  - Custom message text
  - Consistent styling across the app

</details>

<details>
<summary><strong>Cards</strong></summary>

### DeviceCard

- **Purpose**: Card component for displaying and controlling IoT devices
- **Features**:
  - Device status display (online/offline)
  - Power control toggle
  - Device type specific icons
  - Compact mode support
- **CDF Integration**: Uses `ESPRMDevice`, `ESPRMNode` for device control

### RoomCard

- **Purpose**: Card component for room management and device grouping
- **Features**:
  - Room name and device count display
  - Toggle all devices in room
  - Swipeable actions (edit/delete)
  - Device list with individual controls
- **CDF Integration**: Uses `ESPRMGroup` for room management

### CollapsibleCard

- **Purpose**: Expandable card component with smooth animations
- **Features**:
  - Animated expand/collapse functionality
  - Optional item count display
  - Custom header and content areas
  - Smooth transition effects

</details>

<details>
<summary><strong>Device Settings</strong></summary>

### DeviceName

- **Purpose**: Component for displaying and editing device names
- **Features**:
  - Editable device name with validation
  - Save functionality with loading states
  - Error handling and user feedback

### DeviceInfo

- **Purpose**: Component for displaying comprehensive device information
- **Features**:
  - Device metadata display
  - System information and specifications
  - Connection status and diagnostics

### OTA

- **Purpose**: Over-the-air update management component
- **Features**:
  - Update status monitoring
  - Progress tracking with visual indicators
  - Version information display
  - Update initiation and management

</details>

<details>
<summary><strong>Form Components</strong></summary>

### ActionButton

- **Purpose**: Versatile button component with multiple style variants
- **Features**:
  - Multiple variants (primary, secondary, danger)
  - Loading state support with spinner
  - Disabled state styling
  - Custom style overrides

### Button

- **Purpose**: Base button component with enhanced features
- **Features**:
  - Loading spinner integration
  - Disabled state handling
  - Custom styling options
  - Child element support

### Input

- **Purpose**: Customizable text input component for forms
- **Features**:
  - Optional icon display
  - Password toggle visibility
  - Input validation support
  - Platform-specific styling
  - Error state handling

### Typo

- **Purpose**: Typography component for consistent text styling
- **Features**:
  - Multiple text variants
  - Size and color customization
  - Font weight control
  - Line break support

### Logo

- **Purpose**: App logo component for branding
- **Features**:
  - Size customization
  - Aspect ratio maintenance
  - Consistent margins

### DangerButton

- **Purpose**: Button for dangerous or destructive actions
- **Features**:
  - Icon and text display
  - Red color scheme for warnings
  - Consistent styling with other buttons

### LogoutButton

- **Purpose**: Specialized button for user logout functionality
- **Features**:
  - Loading state during logout process
  - Icon and text display
  - Press interaction handling

### EditableField

- **Purpose**: Text field with inline edit functionality
- **Features**:
  - Edit button for activation
  - Placeholder text support
  - Single line display optimization

### InputDialog

- **Purpose**: Enhanced input dialog with additional features
- **Features**:
  - Customizable title and buttons
  - Initial value support
  - Loading state management
  - Input validation

</details>

<details>
<summary><strong>Home Settings</strong></summary>

### HomeName

- **Purpose**: Component for editing home/group names
- **Features**:
  - Inline name editing
  - Validation and error handling
  - Save confirmation

### HomeSharing

- **Purpose**: Home sharing management component
- **Features**:
  - User permissions display
  - Share home functionality
  - Remove shared access controls

### HomeRemove

- **Purpose**: Component for home deletion functionality
- **Features**:
  - Confirmation dialog integration
  - Destructive action handling
  - User feedback

### AddUserModal

- **Purpose**: Modal for adding users to home sharing
- **Features**:
  - User search and selection
  - Permission level assignment
  - Invitation management

</details>

<details>
<summary><strong>Info Components</strong></summary>

### InfoItem

- **Purpose**: Component for displaying label-value pairs
- **Features**:
  - Label and value display
  - Optional press interaction
  - Separator option

### InfoRow

- **Purpose**: Simple label-value row component
- **Features**:
  - Label and value with colon separator
  - Consistent styling
  - Compact layout

### SettingsItem

- **Purpose**: Component for settings menu items
- **Features**:
  - Icon and title display
  - Navigation and toggle types
  - Optional separator

### SettingsSection

- **Purpose**: Container component for grouped settings items
- **Features**:
  - Consistent section styling
  - Group organization
  - Background color management

### ProfileSection

- **Purpose**: User profile display component
- **Features**:
  - User information display
  - Debug mode support
  - Press interaction handling

### NotificationItem

- **Purpose**: Component for displaying notification items
- **Features**:
  - Status indication
  - Accept/decline action buttons
  - Loading states
  - Timestamp display

### IntegrationItem

- **Purpose**: Component for third-party integration options
- **Features**:
  - Icon display
  - Title text
  - Press interaction handling

### UserOperationItem

- **Purpose**: Component for user-related operations and actions
- **Features**:
  - Operation status display
  - Action buttons
  - User feedback

</details>

<details>
<summary><strong>Layout Components</strong></summary>

### ScreenWrapper

- **Purpose**: Base wrapper component for screen content
- **Features**:
  - Safe area handling
  - Consistent padding and margins
  - Background color management
  - Style customization options

### ContentWrapper

- **Purpose**: Container component for consistent content layout
- **Features**:
  - Optional header with title
  - Optional scrollable content
  - Left slot for custom content
  - Consistent padding and margins

### ToastContainer

- **Purpose**: Toast notification display component
- **Features**:
  - Multiple notification types (success, error, warning)
  - Auto-dismiss functionality
  - Custom styling options
  - Animation support

### PhonePair

- **Purpose**: Component for displaying side-by-side phone images
- **Features**:
  - Responsive layout design
  - Shadow styling effects
  - Press interaction support
  - Aspect ratio maintenance

### RoundedSlider

- **Purpose**: Custom slider component with rounded styling
- **Features**:
  - Smooth value transitions
  - Custom thumb and track styling
  - Touch gesture support

</details>

<details>
<summary><strong>Modals</strong></summary>

### ConfirmationDialog

- **Purpose**: Modal dialog for confirming user actions
- **Features**:
  - Custom title and description
  - Loading state support
  - Custom button colors
  - Animated transitions

### EditModal

- **Purpose**: Modal for editing text values
- **Features**:
  - Text input with validation
  - Loading state management
  - Character limit support
  - Cancel/confirm actions

### HomeTooltip

- **Purpose**: Tooltip component for home-related help and information
- **Features**:
  - Multiple placement options
  - Arrow alignment
  - Scrollable content support
  - Icon integration

### SceneMenuBottomSheet

- **Purpose**: Bottom sheet modal for scene management actions
- **Features**:
  - Scene action menu
  - Swipe gesture support
  - Animated transitions
  - Action confirmation

</details>

<details>
<summary><strong>Navigation Components</strong></summary>

### Header

- **Purpose**: App header component with navigation controls
- **Features**:
  - Back navigation button
  - Custom back URL support
  - Right slot for action buttons
  - Platform-specific styling

### FooterTabs

- **Purpose**: Bottom navigation tab component
- **Features**:
  - Tab highlighting for active route
  - Icon and label display
  - Platform-specific styling
  - Route management integration

### Tabs

- **Purpose**: Tab selection component for content switching
- **Features**:
  - Multiple tab support
  - Active tab highlighting
  - Label display
  - Smooth transitions

</details>

<details>
<summary><strong>Parameter Controls</strong></summary>

### PowerButton

- **Purpose**: Toggle button for device power control
- **Features**:
  - Visual state feedback
  - Loading state support
  - Disabled state handling

### BrightnessSlider

- **Purpose**: Slider component for controlling device brightness
- **Features**:
  - Percentage-based control
  - Visual feedback
  - Smooth value transitions

### ColorTemperatureSlider

- **Purpose**: Slider for controlling light color temperature
- **Features**:
  - Temperature range control
  - Visual temperature indication
  - Kelvin value display

### HueCircle

- **Purpose**: Circular color picker for hue selection
- **Features**:
  - 360-degree hue selection
  - Visual color feedback
  - Touch gesture support

### HueSlider

- **Purpose**: Linear slider for hue selection
- **Features**:
  - Hue range control
  - Color gradient display
  - Touch interaction

### SaturationSlider

- **Purpose**: Slider for controlling color saturation
- **Features**:
  - Saturation percentage control
  - Visual feedback with color preview
  - Current value display

### SpeedSlider

- **Purpose**: Slider for controlling device speed (fans, motors)
- **Features**:
  - Multiple speed level support
  - Visual feedback
  - Current speed display

### TemperatureSlider

- **Purpose**: Slider for temperature control devices
- **Features**:
  - Temperature range selection
  - Visual feedback with color coding
  - Current temperature display

### VolumeSlider

- **Purpose**: Slider for audio volume control
- **Features**:
  - Volume level control
  - Visual feedback
  - Mute functionality

### DropdownSelector

- **Purpose**: Dropdown component for parameter selection
- **Features**:
  - Custom option lists
  - Current selection display
  - Disabled state support

### ToggleSwitch

- **Purpose**: Switch component for boolean parameters
- **Features**:
  - On/off state control
  - Visual state feedback
  - Loading state support

### TriggerButton

- **Purpose**: Button for triggering device actions
- **Features**:
  - Visual press feedback
  - Loading state support
  - Action confirmation

### PushButton

- **Purpose**: Momentary push button component
- **Features**:
  - Press feedback animation
  - Loading state support
  - Disabled state handling

### Slider

- **Purpose**: Generic slider component for numeric values
- **Features**:
  - Customizable range
  - Visual feedback
  - Touch gesture support

### TextInput

- **Purpose**: Text input component for parameter values
- **Features**:
  - Validation support
  - Placeholder text
  - Error state handling

### DeviceLightBulb

- **Purpose**: Light bulb visualization component
- **Features**:
  - State-based color changes
  - Animation effects
  - Touch interaction

### DeviceAction

- **Purpose**: Generic device action component
- **Features**:
  - Action button display
  - Loading states
  - Error handling

### ParamWrap & ParamControlWrap

- **Purpose**: Wrapper components for parameter controls
- **Features**:
  - Consistent styling
  - Label display
  - Error state handling

</details>

<details>
<summary><strong>Scene Components</strong></summary>

### SceneItem

- **Purpose**: Component for displaying individual scene items
- **Features**:
  - Scene name and description
  - Activation button
  - Edit/delete actions
  - Loading states

</details>
