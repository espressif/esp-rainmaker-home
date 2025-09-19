/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ESPLocalControlModule, NSObject)

RCT_EXTERN_METHOD(isConnected:(NSString *)nodeId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(connect:(NSString *)nodeId
                  baseUrl:(NSString *)baseUrl
                  securityType:(NSNumber *)securityType
                  pop:(nullable NSString *)pop
                  username:(nullable NSString *)username
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(sendData:(NSString *)nodeId
                  path:(NSString *)path
                  data:(NSString *)data
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end

