export default {
  expo: {
    name: process.env.APP_NAME || "ESP RainMaker Home",
    slug: process.env.APP_SLUG || "esp-rainmaker-home",
    version: process.env.APP_VERSION || "5.2.0",
    scheme: process.env.AGENTS_DEEP_LINK_SCHEME || "rainmaker",
    orientation: "portrait",
    icon: "./src/assets/images/logo.png",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: process.env.IOS_APP_APPLICATION_ID || "com.espressif.novahome"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./src/assets/images/logo.png",
        backgroundColor: "#ffffff"
      }
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./src/assets/images/logo.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "image": "./src/assets/images/logo.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff"
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera",
          "microphonePermission": "Allow $(PRODUCT_NAME) to access your microphone",
          "recordAudioAndroid": true
        }
      ],
      [
        "expo-system-ui",
        {
          "userInterfaceStyle": "automatic"
        }
      ],
      "expo-font",
      "expo-web-browser"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      router: {
        origin: false
      },
      eas: {
        projectId: "b020040e-1c36-426a-9528-042d4730d69e"
      },
      // Scan configuration
      enableScanConfiguration: process.env.ENABLE_SCAN_CONFIGURATION !== 'false',
      // RM SDK (namespaced)
      rmSdk: {
        baseUrl: process.env.BASE_URL,
        authUrl: process.env.THIRD_PARTY_AUTH_AUTH_URL,
        version: process.env.API_VERSION,
        clientId: process.env.THIRD_PARTY_AUTH_CLIENT_ID,
        redirectUrl: process.env.THIRD_PARTY_AUTH_REDIRECT_URL,
      },
      // Matter SDK (namespaced)
      matterSdk: {
        vendorId: process.env.MATTER_VENDOR_ID,
      },
      // RMNG SDK (namespaced)
      rmngSdk: {
        baseUrl: process.env.RMNG_BASE_URL,
        apiPath: process.env.RMNG_API_PATH,
        userApiBase: process.env.RMNG_USER_API_BASE,
        userApiBaseUrl: process.env.RMNG_USER_API_BASE_URL,
        userApiPath: process.env.RMNG_USER_API_PATH,
        identityId: process.env.RMNG_IDENTITY_ID,
        awsRegion: process.env.RMNG_AWS_REGION,
        userPoolId: process.env.RMNG_USER_POOL_ID,
        clientId: process.env.RMNG_CLIENT_ID,
        iotEndpoint: process.env.RMNG_IOT_ENDPOINT,
      },

      // Active SDK identifier
      activeSdk: process.env.ACTIVE_SDK || 'rainmaker-base-sdk',

      // Public website & legal URLs (overridable by CLI / env for white-label builds)
      websiteLinks: {
        website: process.env.WEBSITE_LINK,
        termsOfUse: process.env.TERMS_OF_USE_LINK,
        privacyPolicy: process.env.PRIVACY_POLICY_LINK,
      },

      // Unified feature flags block (Level 1)
      features: {
        enableScenes: process.env.ENABLE_SCENES !== 'false',
        enableSchedules: process.env.ENABLE_SCHEDULES !== 'false',
        enableAutomations: process.env.ENABLE_AUTOMATIONS !== 'false',
        enableLocalControl: process.env.ENABLE_LOCAL_CONTROL !== 'false',
        enableNotifications: process.env.ENABLE_NOTIFICATIONS !== 'false',
        enableGroupSharing: process.env.ENABLE_GROUP_SHARING !== 'false',
        enableOta: process.env.ENABLE_OTA !== 'false',
        enableAiAgent: process.env.ENABLE_AI_AGENT !== 'false',
        enableThirdPartyAuth: process.env.ENABLE_THIRD_PARTY_AUTH !== 'false',
        thirdPartyAuthProviders: process.env.ENABLE_THIRD_PARTY_AUTH !== 'false'
          ? (process.env.THIRD_PARTY_AUTH_ENABLED_PROVIDERS?.split(',') || process.env.THIRD_PARTY_AUTH_ENABLED_THIRD_PARTY_PROVIDERS?.split(',') || [])
          : [],
        enableVoiceAssistants: process.env.ENABLE_VOICE_ASSISTANTS !== 'false',
        enableCdfAutoSync: process.env.ENABLE_CDF_AUTOSYNC !== 'false',
        enableControlGroups: process.env.ENABLE_CONTROL_GROUPS !== 'false',
        enableOnNetworkProvisioning: process.env.ENABLE_ON_NETWORK_PROVISIONING !== 'false',
      }

    }
  }
};