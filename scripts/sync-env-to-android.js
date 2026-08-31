#!/usr/bin/env node

/**
 * Sync .env → Android config
 * - gradle.properties
 * - settings.gradle
 * - build.gradle
 * - google-services.json
 * - keystore.properties (+ validate release keystore file/passwords/alias)
 *
 * IMPORTANT:
 * - App version comes from package.json (`version`, `versionCode`) — not .env
 * - .env is the source of truth for all other native/build identity values
 * - Empty values are synced if explicitly set in .env (KEY=)
 * - Variables not in .env are skipped (not synced), except version fields
 * - Do not manually edit synced files — update .env or package.json instead
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/* =====================================================
 * Paths
 * ===================================================== */
const ROOT = path.resolve(__dirname, '..');
// Env file selectable via ENVFILE (relative to repo root or absolute);
// defaults to .env for the existing copy-based build scripts.
const ENV_FILE = process.env.ENVFILE || '.env';
const PATHS = {
  env: path.isAbsolute(ENV_FILE) ? ENV_FILE : path.join(ROOT, ENV_FILE),
  packageJson: path.join(ROOT, 'package.json'),
  gradleProps: path.join(ROOT, 'android/gradle.properties'),
  buildGradle: path.join(ROOT, 'android/app/build.gradle'),
  settingsGradle: path.join(ROOT, 'android/settings.gradle'),
  googleServices: path.join(ROOT, 'android/app/google-services.json'),
  googleServicesTemplate: path.join(ROOT, 'android/app/google-services.json.template'),
  // Gitignored. Regenerated from the active .env each prebuild so the release
  // signingConfig in build.gradle signs with THIS flavor's keystore. Signing
  // creds go ONLY here — never gradle.properties (which is committed).
  keystoreProps: path.join(ROOT, 'android/keystore.properties'),
};

/**
 * Read marketing version + Android versionCode from package.json (single SoT).
 * @returns {{ version: string, versionCode: string }}
 */
function readPackageVersion() {
  const pkg = JSON.parse(read(PATHS.packageJson) || '{}');
  return {
    version: String(pkg.version ?? ''),
    versionCode: String(pkg.versionCode ?? ''),
  };
}

/**
 * Overlay package.json version fields onto the parsed env map so gradle sync
 * keeps writing APP_VERSION / ANDROID_VERSION_CODE without requiring .env keys.
 * @param {Record<string, string>} env
 * @returns {Record<string, string>}
 */
function applyPackageVersion(env) {
  const { version, versionCode } = readPackageVersion();
  env.APP_VERSION = version;
  env.ANDROID_VERSION_CODE = versionCode;
  return env;
}

/* =====================================================
 * Env → Gradle mapping
 * ===================================================== */
const ENV_TO_GRADLE = {
  APP_NAME: 'APP_NAME',
  // Deployment region (global | cn | auto). Gates the google-services plugin
  // and is read by the region product flavors in build.gradle.
  APP_REGION: 'APP_REGION',
  // Single per-build application id. The value differs per region env file
  // (global vs cn); build.gradle's global flavor inherits it via defaultConfig
  // and the cn flavor reads it via project.findProperty("ANDROID_APP_APPLICATION_ID").
  ANDROID_APP_APPLICATION_ID: 'ANDROID_APP_APPLICATION_ID',
  APP_VERSION: 'APP_VERSION',
  ANDROID_VERSION_CODE: 'ANDROID_VERSION_CODE',

  AGENTS_DEEP_LINK_SCHEME: 'AGENTS_DEEP_LINK_SCHEME',
  AGENTS_DEEP_LINK_HOST: 'AGENTS_DEEP_LINK_HOST',
  AGENTS_DEEP_LINK_PATH_PREFIX: 'AGENTS_DEEP_LINK_PATH_PREFIX',

  THIRD_PARTY_AUTH_REDIRECT_SCHEME: 'THIRD_PARTY_AUTH_REDIRECT_SCHEME',
  THIRD_PARTY_AUTH_REDIRECT_HOST: 'THIRD_PARTY_AUTH_REDIRECT_HOST',
  THIRD_PARTY_AUTH_REDIRECT_URL: 'THIRD_PARTY_AUTH_REDIRECT_URL',

  MATTER_VENDOR_ID: 'MATTER_VENDOR_ID',
  MATTER_COMMISSIONING_METHOD: 'MATTER_COMMISSIONING_METHOD',

  // WeChat login (CN flavor only). Drives the CN flavor's BuildConfig field and
  // the WXEntryActivity URL scheme manifest placeholder.
  WECHAT_APP_ID: 'WECHAT_APP_ID',
};

/* =====================================================
 * Env → keystore.properties (release signing credentials)
 * Maps .env signing keys to the gitignored android/keystore.properties keys
 * that build.gradle's release signingConfig reads. Each region's .env carries
 * its own values, so building a flavor signs it with that flavor's keystore.
 * DELIBERATELY separate from ENV_TO_GRADLE — signing secrets must NEVER be
 * written to the committed android/gradle.properties.
 * ===================================================== */
const ENV_TO_KEYSTORE = {
  ANDROID_KEYSTORE_FILE: 'storeFile',        // relative to android/app/ (e.g. sign/release.jks)
  ANDROID_KEYSTORE_PASSWORD: 'storePassword',
  ANDROID_KEY_ALIAS: 'keyAlias',
  ANDROID_KEY_PASSWORD: 'keyPassword',
};

/* =====================================================
 * Numeric fields that cannot be empty
 * These fields are parsed as integers in build.gradle
 * If empty, they should not be written to gradle.properties
 * ===================================================== */
const NUMERIC_FIELDS = new Set([
  'ANDROID_VERSION_CODE',
  'MATTER_VENDOR_ID'
]);

/* =====================================================
 * Small helpers
 * ===================================================== */
const read = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : '');
const write = (f, c) => fs.writeFileSync(f, c.trim() + '\n');

const resolveVars = (value, vars) =>
  value.replace(/\$\(([^)]+)\)/g, (_, k) =>
    k === 'APPLICATION_ID'
      ? vars.ANDROID_APP_APPLICATION_ID ??
        `$(${k})`
      : vars[k] ?? `$(${k})`
  );

/* =====================================================
 * Parse .env
 * ===================================================== */
function parseEnv(file) {
  if (!fs.existsSync(file)) {
    console.warn(`⚠️  .env not found`);
    return {};
  }

  const raw = {};
  const lines = read(file).split('\n');
  
  lines.forEach((line, index) => {
    const t = line.trim();
    // Skip comments and empty lines (but track them for context)
    if (!t || t.startsWith('#')) return;
    
    const equalIndex = t.indexOf('=');
    if (equalIndex === -1) return; // Invalid line format
    
    const k = t.substring(0, equalIndex).trim();
    const v = t.substring(equalIndex + 1).trim();
    
    // Preserve empty strings - if key exists with empty value, store as empty string
    // If key doesn't have =, it's not a valid env var
    raw[k] = v.replace(/^['"]|['"]$/g, ''); // Remove quotes but keep empty string
  });

  // Resolve variable references (like $(APP_SCHEMA))
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, resolveVars(v, raw)])
  );
}

/* =====================================================
 * gradle.properties sync
 * ===================================================== */
function syncGradleProperties(file, env) {
  let content = read(file);

  Object.entries(ENV_TO_GRADLE).forEach(([envKey, gradleKey]) => {
    // Sync all values from .env, even if empty (empty string is valid)
    // Only skip if the key doesn't exist in .env at all
    if (!(envKey in env)) {
      console.warn(`  ⚠ ${envKey} not found in .env, skipping`);
      return;
    }

    // Use empty string if value is empty (explicitly set to empty in .env)
    const value = env[envKey] ?? '';
    
    // Skip numeric fields if empty - they cannot be parsed as integers
    // This prevents Gradle build errors when trying to parse empty strings
    if (NUMERIC_FIELDS.has(envKey) && value === '') {
      console.warn(`  ⚠ ${gradleKey} is empty - skipping (numeric fields cannot be empty)`);
      // Remove the property from gradle.properties if it exists
      const regex = new RegExp(`^${gradleKey}=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, '');
      }
      return;
    }
    
    const line = `${gradleKey}=${value}`;
    const regex = new RegExp(`^${gradleKey}=.*$`, 'm');

    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      // Add new line if key doesn't exist in gradle.properties
      content = content + `\n${line}`;
    }

    // Only log non-empty values (empty values are synced silently)
    if (value !== '') {
      console.log(`  ✓ ${gradleKey} = ${value}`);
    }
  });

  write(file, content);
}

/* =====================================================
 * Android config updates
 * ===================================================== */
function updateApplicationId(appId) {
  // Keep the GLOBAL application id in sync across:
  //   - build.gradle defaultConfig `applicationId "..."` (global default; the
  //     `cn` flavor overrides it at build time, and the Expo CLI parses this
  //     literal to launch the app — it must stay a plain quoted string).
  //   - settings.gradle rootProject.name (stable, recognizable project name).
  //   - google-services.json package (Firebase ships in the global flavor only).
  // The first `applicationId "..."` literal in build.gradle is defaultConfig;
  // the cn flavor uses project.findProperty(...) (no quoted literal), so this
  // replacement never touches the cn id.
  if (!appId) return;

  write(
    PATHS.buildGradle,
    read(PATHS.buildGradle).replace(
      /^(\s*)applicationId\s+["'].*["']\s*$/m,
      `$1applicationId "${appId}"`
    )
  );

  write(
    PATHS.settingsGradle,
    read(PATHS.settingsGradle).replace(
      /^\s*rootProject\.name\s*=.*$/m,
      `rootProject.name = '${appId}'`
    )
  );

  console.log(`  ✓ global applicationId = ${appId}`);
  console.log(`  ✓ rootProject.name = ${appId}`);
}

function ensureGoogleServicesExists() {
  if (fs.existsSync(PATHS.googleServices)) return true;

  if (fs.existsSync(PATHS.googleServicesTemplate)) {
    fs.copyFileSync(PATHS.googleServicesTemplate, PATHS.googleServices);
    console.log(`  ✓ google-services.json created from template (placeholder values)`);
    return true;
  }

  console.warn(`  ⚠ google-services.json not found and no template available`);
  return false;
}

function updateGoogleServices(appId) {
  if (!ensureGoogleServicesExists()) return;

  try {
    const json = JSON.parse(read(PATHS.googleServices));
    const client =
      json.client?.[0]?.client_info?.android_client_info;

    if (!client) {
      console.warn(`  ⚠ google-services.json structure not supported`);
      return;
    }

    const old = client.package_name;
    client.package_name = appId;

    fs.writeFileSync(
      PATHS.googleServices,
      JSON.stringify(json, null, 2),
    );
    console.log(`  ✓ google-services.json: ${old} → ${appId}`);
  } catch (e) {
    console.error(`  ✗ google-services.json error: ${e.message}`);
  }
}

/* =====================================================
 * keystore.properties sync (release signing creds → gitignored file)
 * ===================================================== */
function syncKeystoreProperties(env) {
  // Only (re)generate when this build's .env actually configures a keystore.
  // A checkout without signing creds is left untouched, so it still builds a
  // debug (default debug key) / unsigned release.
  if (!env.ANDROID_KEYSTORE_FILE) {
    console.warn('  ⚠ ANDROID_KEYSTORE_FILE not set in .env — keystore.properties left as-is (unsigned/debug build)');
    return;
  }

  // Written ONLY to the gitignored android/keystore.properties — never to the
  // committed gradle.properties. Overwritten from the active .env each prebuild
  // so the release signingConfig uses THIS flavor's keystore.
  const lines = Object.entries(ENV_TO_KEYSTORE).map(
    ([envKey, propKey]) => `${propKey}=${env[envKey] ?? ''}`
  );
  fs.writeFileSync(PATHS.keystoreProps, lines.join('\n') + '\n');
  console.log(`  ✓ keystore.properties written (storeFile = ${env.ANDROID_KEYSTORE_FILE})`);
}

/**
 * Spawn options for `keytool` that force English labels so locale-independent
 * parsing (e.g. "Keystore type: PKCS12") works under non-English JDKs.
 *
 * @returns {{ encoding: string, env: NodeJS.ProcessEnv }}
 */
function keytoolSpawnOpts() {
  return {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
  };
}

/**
 * Runs `keytool` with English JVM locale forced via `-J-Duser.language=en`
 * and C locale env, so output labels stay parseable on any host locale.
 *
 * @param {string[]} args keytool argv after the command name
 * @returns {import('child_process').SpawnSyncReturns<string>}
 */
function runKeytool(args) {
  return spawnSync(
    'keytool',
    ['-J-Duser.language=en', ...args],
    keytoolSpawnOpts()
  );
}

/**
 * True when the store path looks like PKCS12 (`.p12` / `.pfx`), used before
 * parsing keytool `-list` output so non-English locales cannot mis-route.
 *
 * @param {string} storeFile Relative or absolute keystore path
 * @returns {boolean}
 */
function isPkcs12ByExtension(storeFile) {
  return /\.(p12|pfx)$/i.test(storeFile);
}

/**
 * True when keytool `-list` stdout reports PKCS12 (English labels assumed
 * after {@link runKeytool} forces `user.language=en`).
 *
 * @param {string} listStdout keytool `-list` stdout
 * @returns {boolean}
 */
function isPkcs12FromKeytoolList(listStdout) {
  return /Keystore type:\s*PKCS12/i.test(listStdout || '');
}

/**
 * Verifies the release keystore file exists and that store password, key
 * alias, and key password unlock it via `keytool`. Skipped when signing is
 * not configured. Fails the prebuild on mismatch so CI/local builds catch
 * bad credentials before Gradle signing.
 *
 * PKCS12 stores do not support `-keypasswd` and require identical store/key
 * passwords; JKS uses a no-op `-keypasswd` to verify the key password.
 * PKCS12 is detected from `.p12`/`.pfx` first, then keytool list output.
 *
 * @param {Record<string, string>} env Parsed .env map
 * @returns {void}
 */
function validateKeystore(env) {
  const storeFile = env.ANDROID_KEYSTORE_FILE;
  if (!storeFile) {
    return;
  }

  const storePassword = env.ANDROID_KEYSTORE_PASSWORD || '';
  const keyAlias = env.ANDROID_KEY_ALIAS || '';
  const keyPassword = env.ANDROID_KEY_PASSWORD || '';
  const absPath = path.join(ROOT, 'android/app', storeFile);

  if (!storePassword || !keyAlias || !keyPassword) {
    console.error(
      '  ✗ keystore credentials incomplete — need ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD'
    );
    process.exit(1);
  }

  if (!fs.existsSync(absPath)) {
    console.error(
      `  ✗ keystore file not found: android/app/${storeFile} — need ANDROID_KEYSTORE_FILE`
    );
    process.exit(1);
  }

  const list = runKeytool(['-list', '-keystore', absPath, '-storepass', storePassword]);
  if (list.error && list.error.code === 'ENOENT') {
    console.error('  ✗ keytool not found on PATH (install a JDK / Android Studio JDK)');
    process.exit(1);
  }
  if (list.status !== 0) {
    console.error(
      '  ✗ keystore store password invalid (or corrupt keystore) — need ANDROID_KEYSTORE_PASSWORD'
    );
    process.exit(1);
  }

  const listAlias = runKeytool([
    '-list',
    '-keystore', absPath,
    '-storepass', storePassword,
    '-alias', keyAlias,
  ]);
  if (listAlias.status !== 0) {
    console.error(
      `  ✗ keystore alias not found: ${keyAlias} — need ANDROID_KEY_ALIAS`
    );
    process.exit(1);
  }

  const isPkcs12 =
    isPkcs12ByExtension(storeFile) || isPkcs12FromKeytoolList(list.stdout || '');
  if (isPkcs12) {
    // Java PKCS12 ignores a distinct -keypass; Gradle signing needs them equal.
    if (storePassword !== keyPassword) {
      console.error(
        '  ✗ PKCS12 keystore requires ANDROID_KEY_PASSWORD to match ANDROID_KEYSTORE_PASSWORD — need ANDROID_KEY_PASSWORD, ANDROID_KEYSTORE_PASSWORD'
      );
      process.exit(1);
    }
  } else {
    // JKS (and similar): same password as -new is a no-op that confirms key password.
    const keyCheck = runKeytool([
      '-keypasswd',
      '-keystore', absPath,
      '-alias', keyAlias,
      '-storepass', storePassword,
      '-keypass', keyPassword,
      '-new', keyPassword,
    ]);
    if (keyCheck.status !== 0) {
      console.error(
        '  ✗ keystore key password invalid — need ANDROID_KEY_PASSWORD'
      );
      process.exit(1);
    }
  }

  console.log(
    `  ✓ keystore validated (file=${storeFile}, alias=${keyAlias} — file + passwords match)`
  );
}

/* =====================================================
 * Main
 * ===================================================== */
function main() {
  console.log('🔄 Syncing Android config from .env (+ package.json version)');

  const env = parseEnv(PATHS.env);
  if (!Object.keys(env).length) return;

  // Backward compatibility for older .env keys
  if (!('THIRD_PARTY_AUTH_REDIRECT_HOST' in env) && 'ANDROID_THIRD_PARTY_AUTH_REDIRECT_HOST' in env) {
    env.THIRD_PARTY_AUTH_REDIRECT_HOST = env.ANDROID_THIRD_PARTY_AUTH_REDIRECT_HOST;
  }
  if (!('THIRD_PARTY_AUTH_REDIRECT_URL' in env) && 'ANDROID_THIRD_PARTY_AUTH_REDIRECT_URL' in env) {
    env.THIRD_PARTY_AUTH_REDIRECT_URL = env.ANDROID_THIRD_PARTY_AUTH_REDIRECT_URL;
  }

  applyPackageVersion(env);
  console.log(`  ✓ APP_VERSION = ${env.APP_VERSION} (from package.json)`);
  console.log(`  ✓ ANDROID_VERSION_CODE = ${env.ANDROID_VERSION_CODE} (from package.json versionCode)`);

  syncGradleProperties(PATHS.gradleProps, env);
  syncKeystoreProperties(env);
  validateKeystore(env);

  // Single per-build application id (ANDROID_APP_APPLICATION_ID). The cn flavor
  // reads it directly via findProperty; the global flavor inherits it via the
  // defaultConfig literal, which we rewrite below.
  const appId =
    env.ANDROID_APP_APPLICATION_ID ??
    env.APP_APPLICATION_ID ??
    'com.espressif.novahome';

  // Rewrite the defaultConfig applicationId literal, settings.gradle
  // rootProject.name, and google-services.json package ONLY for non-CN builds.
  // These all concern the GLOBAL flavor (Firebase / google-services + the
  // Expo-parseable literal); the cn flavor overrides applicationId via
  // findProperty and ships no google-services. Skipping for CN keeps
  // build.gradle / settings.gradle stable at the global id (no per-flavor churn)
  // — mirrors the google-services plugin gating in build.gradle.
  const isCnBuild = (env.APP_REGION || '').toLowerCase() === 'cn';
  if (!isCnBuild) {
    updateApplicationId(appId);
    updateGoogleServices(appId);
  } else {
    console.log('  ⓘ CN build — leaving defaultConfig/settings/google-services unchanged (cn flavor sets its own applicationId)');
  }

  console.log('✅ Android Sync complete');
}

if (require.main === module) {
  main();
}

module.exports = { main };
