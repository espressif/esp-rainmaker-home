#!/usr/bin/env node

/**
 * Sync .env → Android config
 * - gradle.properties
 * - settings.gradle
 * - build.gradle
 * - google-services.json
 * 
 * IMPORTANT: .env is the SINGLE SOURCE OF TRUTH
 * - All values are synced exactly as they appear in .env
 * - Empty values are synced if explicitly set in .env (KEY=)
 * - Variables not in .env are skipped (not synced)
 * - Do not manually edit synced files - update .env instead
 */

const fs = require('fs');
const path = require('path');

/* =====================================================
 * Paths
 * ===================================================== */
const ROOT = path.resolve(__dirname, '..');
const PATHS = {
  env: path.join(ROOT, '.env'),
  gradleProps: path.join(ROOT, 'android/gradle.properties'),
  buildGradle: path.join(ROOT, 'android/app/build.gradle'),
  settingsGradle: path.join(ROOT, 'android/settings.gradle'),
  googleServices: path.join(ROOT, 'android/app/google-services.json'),
  googleServicesTemplate: path.join(ROOT, 'android/app/google-services.json.template'),
};

/* =====================================================
 * Env → Gradle mapping
 * ===================================================== */
const ENV_TO_GRADLE = {
  APP_NAME: 'APP_NAME',
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
  // Allow empty string - sync exactly from .env
  // appId can be empty string if explicitly set to empty in .env

  write(
    PATHS.buildGradle,
    read(PATHS.buildGradle).replace(
      /^\s*applicationId\s+.+$/m,
      `        applicationId "${appId}"`
    )
  );

  write(
    PATHS.settingsGradle,
    read(PATHS.settingsGradle).replace(
      /^\s*rootProject\.name\s*=.*$/m,
      `rootProject.name = '${appId}'`
    )
  );

  // Only log non-empty values (empty values are synced silently)
  if (appId !== '') {
    console.log(`  ✓ applicationId = ${appId}`);
  }
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
 * Main
 * ===================================================== */
function main() {
  console.log('🔄 Syncing Android config from .env');

  const env = parseEnv(PATHS.env);
  if (!Object.keys(env).length) return;

  // Backward compatibility for older .env keys
  if (!('THIRD_PARTY_AUTH_REDIRECT_HOST' in env) && 'ANDROID_THIRD_PARTY_AUTH_REDIRECT_HOST' in env) {
    env.THIRD_PARTY_AUTH_REDIRECT_HOST = env.ANDROID_THIRD_PARTY_AUTH_REDIRECT_HOST;
  }
  if (!('THIRD_PARTY_AUTH_REDIRECT_URL' in env) && 'ANDROID_THIRD_PARTY_AUTH_REDIRECT_URL' in env) {
    env.THIRD_PARTY_AUTH_REDIRECT_URL = env.ANDROID_THIRD_PARTY_AUTH_REDIRECT_URL;
  }

  syncGradleProperties(PATHS.gradleProps, env);

  // Update application ID even if empty (sync exactly from .env)
  if ('ANDROID_APP_APPLICATION_ID' in env || 'APP_APPLICATION_ID' in env) {
    const appId = env.ANDROID_APP_APPLICATION_ID ?? env.APP_APPLICATION_ID ?? '';
    updateApplicationId(appId);
    if (appId) {
      updateGoogleServices(appId);
    }
  }

  console.log('✅ Android Sync complete');
}

if (require.main === module) {
  main();
}

module.exports = { main };
