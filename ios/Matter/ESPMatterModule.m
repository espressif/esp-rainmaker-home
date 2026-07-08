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

RCT_EXTERN_METHOD(syncFabricSession:(NSDictionary *)params
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// =====================================================================
// Matter Control Adapter — four canonical Matter Interaction Model
// operations (Read / Write / Invoke / Subscribe) plus their lifecycle
// siblings (Init / Shutdown / Unsubscribe). Mirrors the Android
// `ESPMatterControl` `@ReactMethod`s so a single JS shim can call the
// same names on either platform. Cluster-specific semantic routing
// (semantic units, OnOff bool, mode pickers) lives above this surface
// in TypeScript hooks/panels or in the Matter SDK transformer.
// =====================================================================

RCT_EXTERN_METHOD(matterControlInit:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(matterControlShutdown:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(matterControlRead:(NSString *)matterNodeId
                  endpoint:(nonnull NSNumber *)endpoint
                  clusterId:(nonnull NSNumber *)clusterId
                  attributeId:(nonnull NSNumber *)attributeId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(matterControlWrite:(NSString *)matterNodeId
                  endpoint:(nonnull NSNumber *)endpoint
                  clusterId:(nonnull NSNumber *)clusterId
                  attributeId:(nonnull NSNumber *)attributeId
                  value:(NSDictionary *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(matterControlInvoke:(NSString *)matterNodeId
                  endpoint:(nonnull NSNumber *)endpoint
                  clusterId:(nonnull NSNumber *)clusterId
                  commandId:(nonnull NSNumber *)commandId
                  commandFields:(NSDictionary *)commandFields
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(matterControlSubscribe:(NSString *)matterNodeId
                  attributePaths:(NSArray *)attributePaths
                  minIntervalSec:(nonnull NSNumber *)minIntervalSec
                  maxIntervalSec:(nonnull NSNumber *)maxIntervalSec
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(matterControlUnsubscribe:(NSString *)subscriptionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(matterEncodeCommandFieldsToTlvHex:(NSDictionary *)commandFields
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
