/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(ESPMatterModule, RCTEventEmitter)

// CSR Generation Methods
// Parameters: fabricInfo dictionary with keys: groupId (String), fabricId (String), name (String)
// This matches the ESPRMGenerateCSRRequest structure from the adapter
RCT_EXTERN_METHOD(generateCSR:(NSDictionary *)fabricInfo
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Matter Commissioning Methods
RCT_EXTERN_METHOD(startEcosystemCommissioning:(NSString *)onboardingPayload
                  fabric:(NSDictionary *)fabric
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Post Message Method (Unified Message Router)
RCT_EXTERN_METHOD(postMessage:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
