/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ESPMatterUtilityModule, NSObject)

RCT_EXTERN_METHOD(isUserNocAvailableForFabric:(NSString *)fabricId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(storePrecommissionInfo:(NSDictionary *)params
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

