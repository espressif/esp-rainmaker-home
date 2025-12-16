/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ESPProvModule, NSObject)
RCT_EXTERN_METHOD(searchESPDevices:(NSString *)devicePrefix
                  transport:(NSString *)transport
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopESPDevicesSearch)
RCT_EXTERN_METHOD(createESPDevice:(NSString *)name
                  transport:(NSString *)transport
                  security:(nullable NSNumber *)security
                  proofOfPossession:(nullable NSString *)proofOfPossession
                  softAPPassword:(nullable NSString *)softAPPassword
                  username:(nullable NSString *)username
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(connect:(NSString *)deviceName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getDeviceCapabilities:(NSString *)deviceName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getDeviceVersionInfo:(NSString *)deviceName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setProofOfPossession:(NSString *)deviceName
                  pop:(NSString *)pop
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(initializeSession:(NSString *)deviceName
                  resolve: (RCTPromiseResolveBlock)resolve
                  reject: (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(scanWifiList:(NSString *)deviceName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(sendData:(NSString *)deviceName
                  endPoint:(NSString *)endPoint
                  data:(NSString *)data
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(provision:(NSString *)deviceName
                  ssid:(NSString *)ssid
                  passphrase:(NSString *)passphrase
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(disconnect:(NSString *)deviceName)
@end

