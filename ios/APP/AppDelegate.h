#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>
#import <Expo/Expo.h>
#import <UserNotifications/UserNotifications.h>
#import <WechatOpenSDK/WechatOpenSDK.h>

@interface AppDelegate : RCTAppDelegate <UNUserNotificationCenterDelegate, WXApiDelegate>

@end
