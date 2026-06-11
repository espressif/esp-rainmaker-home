import fs from "fs";
import path from "path";

/**
 * Region config files, one per region. Each holds native/build identity AND
 * the JS/runtime region config. For every region we prefer a LOCAL, gitignored
 * `.env.<region>` (a developer's real values) and fall back to the committed
 * `.env.<region>.example` template when the local file is absent (CI / fresh
 * checkout). Regardless of which region is built, BOTH are parsed here and
 * embedded under `extra.regionConfigs` so the single iOS binary can resolve its
 * region at runtime (config/region.config.ts). Region keys are identical across
 * the two regions.
 */
const REGION_ENV_FILES = {
  global: { local: ".env.global", example: ".env.global.example" },
  cn: { local: ".env.cn", example: ".env.cn.example" },
} as const;

/**
 * Resolves a region's env file: the local (gitignored, real-values) file if it
 * exists, otherwise the committed `.example` template.
 */
function resolveRegionEnvFile(pair: { local: string; example: string }): string {
  return fs.existsSync(path.join(__dirname, pair.local)) ? pair.local : pair.example;
}

/**
 * Minimal .env parser (KEY=VALUE lines, `#` comments, optional quotes).
 * Local so app.config has no dotenv dependency; fail-fast when the resolved
 * file is missing — the committed `.example` fallback means absence is a broken
 * checkout.
 */
function parseEnvFile(fileName: string): Record<string, string> {
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing region config file "${fileName}". The committed .example is a hard dependency — restore it before building.`
    );
  }
  const result: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** `true` unless the value is exactly "false" (same semantics as before). */
const flag = (v?: string): boolean => v !== "false";

const splitCsv = (v?: string): string[] =>
  (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Maps one region env file onto the runtime region-config shape consumed via
 * config/region.config.ts `getRegionConfig()`. Reads only the JS-consumable
 * (region) keys; the native/build-identity keys that share the file are ignored
 * here — they are synced to Android/iOS by scripts/sync-env-to-*.js instead.
 */
function buildRegionConfig(env: Record<string, string>) {
  return {
    activeSdk: env.ACTIVE_SDK || "rainmaker-base-sdk",
    rmSdk: {
      baseUrl: env.BASE_URL,
      authUrl: env.THIRD_PARTY_AUTH_AUTH_URL,
      version: env.API_VERSION,
      clientId: env.THIRD_PARTY_AUTH_CLIENT_ID,
      redirectUrl: env.THIRD_PARTY_AUTH_REDIRECT_URL,
      claimUrl: env.CLAIM_URL || undefined,
    },
    rmngSdk: {
      baseUrl: env.RMNG_BASE_URL,
      apiPath: env.RMNG_API_PATH,
      userApiBase: env.RMNG_USER_API_BASE,
      userApiBaseUrl: env.RMNG_USER_API_BASE_URL,
      userApiPath: env.RMNG_USER_API_PATH,
      identityId: env.RMNG_IDENTITY_ID,
      awsRegion: env.RMNG_AWS_REGION,
      userPoolId: env.RMNG_USER_POOL_ID,
      clientId: env.RMNG_CLIENT_ID,
      iotEndpoint: env.RMNG_IOT_ENDPOINT,
    },
    websiteLinks: {
      website: env.WEBSITE_LINK,
      termsOfUse: env.TERMS_OF_USE_LINK,
      privacyPolicy: env.PRIVACY_POLICY_LINK,
    },
    // Region-level feature availability (disable-only layer; see
    // config/features.config.ts for the full cascade).
    features: {
      enableScenes: flag(env.ENABLE_SCENES),
      enableSchedules: flag(env.ENABLE_SCHEDULES),
      enableAutomations: flag(env.ENABLE_AUTOMATIONS),
      enableLocalControl: flag(env.ENABLE_LOCAL_CONTROL),
      enableNotifications: flag(env.ENABLE_NOTIFICATIONS),
      enableGroupSharing: flag(env.ENABLE_GROUP_SHARING),
      enableOta: flag(env.ENABLE_OTA),
      enableAiAgent: flag(env.ENABLE_AI_AGENT),
      enableThirdPartyAuth: flag(env.ENABLE_THIRD_PARTY_AUTH),
      enableVoiceAssistants: flag(env.ENABLE_VOICE_ASSISTANTS),
      enableControlGroups: flag(env.ENABLE_CONTROL_GROUPS),
      enableOnNetworkProvisioning: flag(env.ENABLE_ON_NETWORK_PROVISIONING),
      thirdPartyAuthProviders: flag(env.ENABLE_THIRD_PARTY_AUTH)
        ? splitCsv(env.THIRD_PARTY_AUTH_ENABLED_PROVIDERS)
        : [],
    },
  };
}

const regionConfigs = {
  global: buildRegionConfig(parseEnvFile(resolveRegionEnvFile(REGION_ENV_FILES.global))),
  cn: buildRegionConfig(parseEnvFile(resolveRegionEnvFile(REGION_ENV_FILES.cn))),
};

export default {
  expo: {
    name: process.env.APP_NAME || "ESP RainMaker Home",
    slug: process.env.APP_SLUG || "esp-rainmaker-home",
    version: process.env.APP_VERSION || "5.2.1",
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
      "expo-web-browser",
      "expo-localization"
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
      // Scan configuration (binary-level app capability)
      enableScanConfiguration: process.env.ENABLE_SCAN_CONFIGURATION !== 'false',
      // Deployment region selector (global | cn | auto). `auto` lets the
      // single iOS binary resolve by device Region; Android flavors force one.
      appRegion: process.env.APP_REGION || 'auto',

      // Region-scoped runtime config, one block per region with an identical
      // shape, built from the committed .env.global.example / .env.cn.example files. Consumed
      // via config/region.config.ts getRegionConfig(); legacy top-level
      // rmSdk / rmSdkCn / websiteLinks(Cn) / activeSdk keys are gone — there
      // is deliberately no fallback to them.
      regionConfigs,

      // Matter SDK (hardware/brand property — not region-varying)
      matterSdk: {
        vendorId: process.env.MATTER_VENDOR_ID,
      },

      // BINARY-level feature overrides (disable-only). Region availability
      // lives in regionConfigs.<region>.features; this layer disables what a
      // specific binary cannot support (e.g. notifications on the Android CN
      // binary, which ships without FCM). Absent keys default to enabled.
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
        enableVoiceAssistants: process.env.ENABLE_VOICE_ASSISTANTS !== 'false',
        enableCdfAutoSync: process.env.ENABLE_CDF_AUTOSYNC !== 'false',
        enableControlGroups: process.env.ENABLE_CONTROL_GROUPS !== 'false',
        enableOnNetworkProvisioning: process.env.ENABLE_ON_NETWORK_PROVISIONING !== 'false',
      }

    }
  }
};
