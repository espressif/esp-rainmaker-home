/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h> 

@interface RCT_EXTERN_MODULE(ESPDiscoveryModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startDiscovery:(NSDictionary *)params)
RCT_EXTERN_METHOD(stopDiscovery)

@end
