import fs from "fs";
import path from "path";
import { execSync } from "child_process";

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

/**
 * Parses a region's env, and — when a local override is in play — asserts it
 * still covers every key the committed template defines.
 *
 * The local file REPLACES the template wholesale; there is no per-key fallback.
 * So a key added to the template after a developer created their local file
 * silently resolves to `undefined`, which surfaces far from the cause (an SDK
 * rejecting an empty config, often only after a config-switch process restart).
 * Failing the build here names the missing keys instead.
 *
 * Keys the template leaves blank are developer-supplied by design (the release
 * keystore credentials), so only keys with a real template value are required.
 */
function loadRegionEnv(pair: { local: string; example: string }): Record<string, string> {
  const fileName = resolveRegionEnvFile(pair);
  const env = parseEnvFile(fileName);
  if (fileName !== pair.local) return env;

  const template = parseEnvFile(pair.example);
  const missing = Object.keys(template).filter((key) => template[key] !== "" && !(key in env));
  if (missing.length > 0) {
    throw new Error(
      `"${pair.local}" is missing ${missing.length} key(s) that "${pair.example}" defines: ` +
        `${missing.join(", ")}. The local file replaces the template wholesale — there is no ` +
        `per-key fallback — so these would resolve to undefined at runtime. Copy the lines ` +
        `across from "${pair.example}".`
    );
  }
  return env;
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
    rmneoSdk: {
      baseUrl: env.RMNEO_BASE_URL,
      userApiBase: env.RMNEO_USER_API_BASE,
      awsRegion: env.RMNEO_AWS_REGION,
      iotEndpoint: env.RMNEO_IOT_ENDPOINT,
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
  global: buildRegionConfig(loadRegionEnv(REGION_ENV_FILES.global)),
  cn: buildRegionConfig(loadRegionEnv(REGION_ENV_FILES.cn)),
};

/**
 * Kept separate from `expo.version` because iOS CFBundleShortVersionString
 * must stay dotted-numeric. Precedence: CI env (`CI_COMMIT_SHORT_SHA` or
 * `APP_COMMIT_ID`), then local git, else empty string.
 */
function resolveCommitId(): string {
  const fromEnv = process.env.CI_COMMIT_SHORT_SHA || process.env.APP_COMMIT_ID;
  if (fromEnv) return fromEnv.trim();
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const commitId = resolveCommitId();

/**
 * Marketing version from package.json (single source of truth). Used for
 * `expo.version` / in-app display; native binaries are synced from the same
 * fields via prebuild scripts (`version` + `versionCode`).
 */
function readPackageVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "package.json"), "utf8");
    const version = JSON.parse(raw)?.version;
    return typeof version === "string" && version ? version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const packageVersion = readPackageVersion();

/**
 * Read from the compiled google-services.json so the id always tracks the FCM
 * project baked into THIS build. The template's placeholder id is treated as
 * unset — dev builds without a real Firebase config cannot receive push anyway.
 */
function readAndroidFcmProjectId(): string | undefined {
  try {
    const raw = fs.readFileSync(
      path.join(__dirname, "android/app/google-services.json"),
      "utf8"
    );
    const projectId = JSON.parse(raw)?.project_info?.project_id;
    return typeof projectId === "string" &&
      projectId &&
      projectId !== "placeholder-project-id"
      ? projectId
      : undefined;
  } catch {
    return undefined;
  }
}

export default {
  expo: {
    name: process.env.APP_NAME || "ESP RainMaker Home",
    slug: process.env.APP_SLUG || "esp-rainmaker-home",
    version: packageVersion,
    scheme: process.env.AGENTS_DEEP_LINK_SCHEME || "rainmaker",
    orientation: "portrait",
    icon: "./src/assets/images/logo.png",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: process.env.IOS_APP_APPLICATION_ID || "com.espressif.novahome",
      associatedDomains: [
        `applinks:${process.env.AGENTS_DEEP_LINK_HOST || "agents.espressif.com"}`,
      ],
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./src/assets/images/logo.png",
        backgroundColor: "#ffffff"
      },
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: process.env.AGENTS_DEEP_LINK_HOST || "agents.espressif.com",
              pathPrefix: process.env.AGENTS_DEEP_LINK_PATH_PREFIX || "/try/agents",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
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
      "expo-localization",
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow $(PRODUCT_NAME) to access your photos to attach images in chat",
        },
      ],
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

      commitId,

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

      // RMNeo /v1/integrations selection: iOS matches by bundle id, Android
      // by Firebase project id.
      push: {
        iosBundleId: process.env.IOS_APP_APPLICATION_ID || "com.espressif.novahome",
        androidFcmProjectId: readAndroidFcmProjectId(),
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
        enableBackendSelector: process.env.ENABLE_BACKEND_SELECTOR !== 'false',
      }

    }
  }
};
