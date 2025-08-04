#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <CoreLocation/CoreLocation.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>
#import <Network/Network.h>
#import <React/RCTBridge.h>
#import <ExpoModulesCore-Swift.h>
#import "NOVA-Swift.h"


@implementation AppDelegate 


- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  [self registerForRemoteNotifications];
  
  // Request BLE and Location permissions for ESP device functionality
  
  [self requestAppPermissions];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

/**
 * Requests BLE and Location permissions using ESPPermissionUtils.
 * Called during app launch to ensure necessary permissions are available for ESP device functionality.
 * Includes a delay to ensure the app UI is fully loaded before showing permission dialogs.
 */
- (void)requestAppPermissions {
  // Add a 2-second delay to allow the app to fully launch and load UI components
  // This ensures permission dialogs appear after the app is visually ready
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(5.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    // Request permissions directly via Swift permission manager
    ESPPermissionUtils *permissionManager = [ESPPermissionUtils sharedInstance];
    [permissionManager requestAllPermissions];
  });
}

/**
 * Registers the app for remote push notifications and requests user authorization.
 * 
 * This method configures the UNUserNotificationCenter and requests permission for:
 * - Alert notifications (banners/alerts)
 * - Sound notifications 
 * - Badge notifications (app icon badge count)
 * 
 * If permission is granted, the app registers with APNS to receive device tokens.
 */
- (void)registerForRemoteNotifications {
  // Get the shared notification center instance
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  center.delegate = self; // Set the notification center delegate to handle incoming notifications

  // Request user authorization for notification types needed by the ESP RainMaker app
  [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                        completionHandler:^(BOOL granted, NSError * _Nullable error) {
    if (granted) {
      // Permission granted - register for remote notifications on the main queue
      dispatch_async(dispatch_get_main_queue(), ^{
        [[UIApplication sharedApplication] registerForRemoteNotifications];
      });
    } else {
      // Permission denied or error occurred - log the issue for debugging
      NSLog(@"Notification permission not granted: %@", error.localizedDescription);
    }
  }];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Linking API
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  return [super application:application openURL:url options:options] || [RCTLinkingManager application:application openURL:url options:options];
}

// Universal Links
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler {
  BOOL result = [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
  return [super application:application continueUserActivity:userActivity restorationHandler:restorationHandler] || result;
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  return [super application:application didFailToRegisterForRemoteNotificationsWithError:error];
}

// Device token registration
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken {
  const unsigned char *tokenBytes = (const unsigned char *)[deviceToken bytes];
  NSMutableString *deviceTokenString = [NSMutableString string];
   
  for (NSUInteger i = 0; i < deviceToken.length; i++) {
    [deviceTokenString appendFormat:@"%02x", tokenBytes[i]];
  }

  // Call setToken to set the device token
  [[ESPNotificationModule shared] setDeviceToken:deviceTokenString];
}

// Handle notification when app is in foreground
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
  NSDictionary *userInfo = notification.request.content.userInfo;
  
  // Send notification data to React Native
  [[ESPNotificationModule shared] handlePushNotification:userInfo];
  
  // Show notification even when app is in foreground
  completionHandler(UNNotificationPresentationOptionList | UNNotificationPresentationOptionBanner |
                   UNNotificationPresentationOptionSound |
                   UNNotificationPresentationOptionBadge);
}

// Notification response handling
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler {
  NSDictionary *userInfo = response.notification.request.content.userInfo;
  
  // Send push notification to JavaScript using Swift singleton instance
  [[ESPNotificationModule shared] handlePushNotification:userInfo];
  completionHandler();
}

// Silent notification handling
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo
fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler {
  [[ESPNotificationModule shared] handleSilentNotification:userInfo];
  completionHandler(UIBackgroundFetchResultNewData);
}

@end
