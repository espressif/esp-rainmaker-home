/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ESPWeChatModule, NSObject)

RCT_EXTERN_METHOD(initiateWeChatLogin:(NSString *)tokenUrl
                  clientId:(NSString *)clientId
                  redirectUri:(NSString *)redirectUri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
