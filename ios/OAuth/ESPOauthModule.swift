/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React
import UIKit
import AuthenticationServices

/**
 * ESPOauthModule provides OAuth functionality for React Native applications.
 * This module allows opening OAuth authorization URLs in Safari/browser
 * and handles deep link redirects directly on the iOS side to extract authorization codes.
 * 
 * Note: Implements ASWebAuthenticationPresentationContextProviding to provide
 * the presentation context (window) for the OAuth web authentication session.
 */
@objc(ESPOauthModule)
class ESPOauthModule: NSObject, RCTBridgeModule {
    
    var session: ASWebAuthenticationSession!
    private var presentationContextProvider: PresentationContextProvider?
    
    static func moduleName() -> String {
        return "ESPOauthModule"
    }
    
    // MARK: - Public Methods
    
    /**
     * Starts the OAuth flow by opening the authorization URL and waiting for redirect.
     * This method replaces the previous separate openUrl and listening approach.
     *
     * @param url The OAuth authorization URL to open
     * @param promise Promise to resolve with the authorization code or reject with error
     */
    @objc(getOauthCode:resolver:rejecter:)
    func getOauthCode(_ url: String, 
                      resolver resolve: @escaping RCTPromiseResolveBlock, 
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        guard let authURL = URL(string: url) else {
            reject("ESPOauthModuleError", "Invalid URL provided", nil)
            return
        }
        
        session = ASWebAuthenticationSession(url: authURL, callbackURLScheme: nil) { url, error in
            if let error = error {
                reject("ESPOauthModuleError", "Failed to get OAuth code", error)
                return
            }
            
            guard let responseURL = url?.absoluteString else {
                reject("ESPOauthModuleError", "No response URL received", nil)
                return
            }
            
            // Parse the authorization code from the response URL
            let components = responseURL.components(separatedBy: "#")
            for item in components {
                if item.contains("code") {
                    let tokens = item.components(separatedBy: "&")
                    for token in tokens {
                        if token.contains("code") {
                            let idTokenInfo = token.components(separatedBy: "=")
                            if idTokenInfo.count > 1 {
                                let code = idTokenInfo[1]
                                resolve(code)
                                return
                            }
                        }
                    }
                }
            }
            
            // If we reach here, no code was found in the response
            reject("ESPOauthModuleError", "No authorization code found in response", nil)
        }
        
        // Configure the session
        session.prefersEphemeralWebBrowserSession = true
        
        // Create and store a strong reference to the presentation context provider
        // to prevent it from being deallocated (presentationContextProvider is weak)
        self.presentationContextProvider = PresentationContextProvider()
        session.presentationContextProvider = self.presentationContextProvider
        
        session.start()
    }
}

// MARK: - Private Presentation Context Provider

/**
 * Private class to handle presentation context for ASWebAuthenticationSession.
 * This is separated from the main @objc class to avoid Objective-C header generation issues
 * with the ASWebAuthenticationPresentationContextProviding protocol.
 */
private class PresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    
    /**
     * Provides the presentation context (window) for the OAuth web authentication session.
     * This method is required by ASWebAuthenticationPresentationContextProviding protocol.
     * 
     * @param session The web authentication session requesting the presentation context
     * @return The window to present the authentication session in
     */
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Ensure UI API access happens on the main thread
        // This prevents "Main Thread Checker: UI API called on a background thread" warnings
        if Thread.isMainThread {
            return getPresentationWindow()
        } else {
            // If not on main thread, dispatch synchronously to main thread
            return DispatchQueue.main.sync {
                return getPresentationWindow()
            }
        }
    }
    
    private func getPresentationWindow() -> UIWindow {
        // Get the key window from the active window scene
        // Since deployment target is iOS 15.1+, we can use modern window scene approach
        if let windowScene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
            
            // Try to get the key window from the scene
            if let keyWindow = windowScene.windows.first(where: { $0.isKeyWindow }) {
                return keyWindow
            }
            
            // If no key window, get the first window from the scene
            if let firstWindow = windowScene.windows.first {
                return firstWindow
            }
        }
        
        // Last resort fallback - create a new window if no scene is found
        // This should rarely happen in normal app lifecycle
        return UIWindow()
    }
}
