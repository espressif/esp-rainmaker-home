# Troubleshooting Guide

This document provides solutions to common issues you might encounter while developing with the ESP RainMaker Home app.

## Table of Contents

- [General Issues](#general-issues)
- [iOS-Specific Issues](#ios-specific-issues)
- [Android-Specific Issues](#android-specific-issues)
- [Development Build Issues](#development-build-issues)
- [Network & Connectivity Issues](#network--connectivity-issues)

## General Issues

### Node Version Issues

**Problem**: App fails to build or run due to Node.js version compatibility.

**Solution**:

```bash
# Ensure you're using Node.js 22
nvm use 22
node --version

# If you don't have Node 22 installed
nvm install 22
nvm use 22
```

### Dependency Issues

**Problem**: Build fails due to corrupted or outdated dependencies.

**Solution**:

```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Metro Bundler Issues

**Problem**: Metro bundler cache causing build or runtime issues.

**Solution**:

```bash
# Clear metro cache
npm start -- --reset-cache

# Or clear cache when running development builds
npm run android -- --reset-cache  # For Android
npm run ios -- --reset-cache      # For iOS
```

### JavaScript Bundle Issues

**Problem**: White screen or app crashes due to JavaScript bundle issues.

**Solution**:

```bash
# Reset Metro cache and restart
npx react-native start --reset-cache

# For persistent issues, clear all caches
rm -rf /tmp/metro-*
rm -rf node_modules/.cache
npm start -- --reset-cache
```

## iOS-Specific Issues

### iOS Build Fails

**Problem**: iOS build fails during compilation or linking.

**Solution**:

```bash
cd ios
pod install --repo-update

# If still failing, clean and reinstall
pod deintegrate
pod install
```

### CocoaPods Issues

**Problem**: Pod installation fails or dependencies are not resolved.

**Solution**:

```bash
# Update CocoaPods
sudo gem install cocoapods

# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Clean and reinstall pods
cd ios
rm -rf Pods Podfile.lock
pod install --repo-update
```

### Xcode Build Errors

**Problem**: Build errors in Xcode IDE.

**Solutions**:

- Ensure you're using the latest Xcode version
- Clean build folder: `Product > Clean Build Folder` in Xcode
- Check that the iOS deployment target matches your device/simulator
- Verify provisioning profiles and certificates are valid

### iOS Simulator Issues

**Problem**: App doesn't run on iOS Simulator.

**Solution**:

```bash
# Reset iOS Simulator
xcrun simctl erase all

# Or reset specific simulator
xcrun simctl erase "iPhone 15 Pro"

# Restart simulator and try again
```

### Code Signing Issues

**Problem**: Code signing errors during build or archive.

**Solutions**:

- Verify your Apple Developer account is active
- Check provisioning profiles in Xcode: `Preferences > Accounts`
- Ensure bundle identifier matches your app configuration
- Clean and rebuild the project

## Android-Specific Issues

### Android Build Fails

**Problem**: Android build fails during Gradle sync or compilation.

**Solution**:

```bash
cd android
./gradlew clean

# Delete gradle folders if needed
rm -rf ~/.gradle
rm -rf android/.gradle

# Rebuild
npm run android
```

### Gradle Sync Issues

**Problem**: Gradle sync fails in Android Studio.

**Solutions**:

- Ensure JDK 17 (Zulu) is configured in Android Studio
- Check `Tools > SDK Manager > Build, Execution, Deployment > Gradle`
- Invalidate caches: `File > Invalidate Caches and Restart`
- Update Gradle wrapper if needed

### Device Connection Issues

**Problem**: Android device not detected or connection issues.

**Solution**:

```bash
# Check connected devices
adb devices

# Restart ADB if needed
adb kill-server
adb start-server

# Check if device is properly connected
adb devices -l
```

### Permission Issues

**Problem**: Permission denied errors or USB debugging issues.

**Solutions**:

- Ensure USB Debugging is enabled on your device
- Check that your device is authorized for debugging
- Try revoking and re-accepting USB debugging authorization
- Enable "Install via USB" in developer options

### Android Emulator Issues

**Problem**: Android emulator not starting or running slowly.

**Solutions**:

```bash
# List available AVDs
emulator -list-avds

# Start emulator with specific AVD
emulator -avd "Your_AVD_Name"

# Cold boot emulator
emulator -avd "Your_AVD_Name" -no-snapshot-load
```

### Gradle Memory Issues

**Problem**: Gradle runs out of memory during build.

**Solution**:
Add to `android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxPermSize=512m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8
org.gradle.parallel=true
org.gradle.daemon=true
```

## Development Build Issues

### Native Module Linking Issues

**Problem**: Native modules not working or causing crashes.

**Solutions**:

- This project uses development builds, so native modules should be automatically linked
- If experiencing issues, try cleaning and rebuilding:

```bash
# iOS
cd ios && pod install && cd ..

# Android
cd android && ./gradlew clean && cd ..
```

### Hot Reload Issues

**Problem**: Hot reload not working or causing app crashes.

**Solution**:

```bash
# Disable hot reload temporarily
# In the app, shake device and disable "Hot Reloading"

# Or restart with fresh cache
npm start -- --reset-cache
```

### Debug Menu Issues

**Problem**: Debug menu not accessible or not working.

**Solutions**:

- **iOS Simulator**: Press `Cmd + D`
- **Android Emulator**: Press `Cmd + M` (Mac) or `Ctrl + M` (Windows/Linux)
- **Physical Device**: Shake the device
- **Alternative**: Run `adb shell input keyevent 82` for Android

## Network & Connectivity Issues

### API Connection Issues

**Problem**: App cannot connect to ESP RainMaker API.

**Solutions**:

- Check internet connectivity
- Verify API endpoint in `rainmaker.config.ts`
- Check firewall settings
- Test API endpoint directly in browser or Postman

### Local Discovery Issues

**Problem**: Local device discovery not working.

**Solutions**:

- Ensure devices are on the same network
- Check mDNS configuration
- Verify local discovery adapter configuration
- Check network permissions in app settings

## Useful Commands Reference

```bash
# Development
npm start                           # Start Metro bundler
npm run android                     # Run on Android
npm run ios                         # Run on iOS

# Debugging
npx react-native log-android        # View Android logs
npx react-native log-ios            # View iOS logs
adb logcat                          # Android system logs

# Cleaning
npm start -- --reset-cache          # Reset Metro cache
rm -rf node_modules && npm install  # Reinstall dependencies
cd ios && pod install               # Reinstall iOS pods
cd android && ./gradlew clean       # Clean Android build
```
