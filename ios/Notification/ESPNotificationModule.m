/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(ESPNotificationModule, RCTEventEmitter)

RCT_EXTERN_METHOD(getDeviceToken:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getNotificationPlatform:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(removeNotificationListener)
RCT_EXTERN_METHOD(addNotificationListener)
RCT_EXTERN_METHOD(setDeviceToken:(NSString *)token)

@end

