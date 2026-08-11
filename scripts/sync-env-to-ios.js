#!/usr/bin/env node

/**
 * Sync .env → iOS config
 * - APP.xcconfig (all variables defined here)
 *
 * IMPORTANT:
 * - App version comes from package.json (`version`) — not .env
 * - .env is the source of truth for all other native/build identity values
 * - Empty values are synced if explicitly set in .env (KEY=)
 * - Variables not in .env are skipped (not synced), except APP_VERSION
 * - Do not manually edit synced files — update .env or package.json instead
 *
 * Note: Info.plist references variables from APP.xcconfig using $(VARIABLE_NAME) syntax
 * and will automatically resolve values from xcconfig at build time.
 */

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
  xcconfig: path.join(ROOT, 'ios/APP.xcconfig'),
};

/**
 * Read marketing version from package.json (single SoT for APP_VERSION).
 * @returns {string}
 */
function readPackageVersion() {
  const pkg = JSON.parse(read(PATHS.packageJson) || '{}');
  return String(pkg.version ?? '');
}

/**
 * Overlay package.json version onto the parsed env map so xcconfig sync keeps
 * writing APP_VERSION without requiring that key in .env.
 * @param {Record<string, string>} env
 * @returns {Record<string, string>}
 */
function applyPackageVersion(env) {
  env.APP_VERSION = readPackageVersion();
  return env;
}

/* =====================================================
 * Small helpers
 * ===================================================== */
const read = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : '');
const write = (f, c) => fs.writeFileSync(f, c.trim() + '\n');

const resolveVars = (value, vars) =>
  value.replace(/\$\(([^)]+)\)/g, (_, k) =>
    k === 'APPLICATION_ID'
      ? vars.IOS_APP_APPLICATION_ID ??
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
 * Update APP.xcconfig
 * ===================================================== */
function updateXcconfig(file, env) {
  let content = read(file);

  const hasSourceKey = (sourceKey) =>
    sourceKey in env ||
    (sourceKey === 'IOS_APP_APPLICATION_ID' && 'APP_APPLICATION_ID' in env);

  const getIosAppId = (env) =>
    env.IOS_APP_APPLICATION_ID ?? env.APP_APPLICATION_ID ?? '';

  // Map .env variables to xcconfig variables (direct values, like Android)
  // Compute values based on what exists in .env (even if empty)
  const updates = [
    {
      key: 'APP_DISPLAY_NAME',
      sourceKey: 'APP_NAME',
      computeValue: (env) => env.APP_NAME ?? ''
    },
    {
      key: 'APP_BUNDLE_ID',
      sourceKey: 'IOS_APP_APPLICATION_ID',
      computeValue: (env) => getIosAppId(env)
    },
    {
      key: 'APP_GROUP_ID',
      sourceKey: 'IOS_APP_GROUP_ID',
      computeValue: (env) => env.IOS_APP_GROUP_ID ?? ''
    },
    {
      key: 'APP_MATTER_EXTENSION',
      sourceKey: 'IOS_APP_APPLICATION_ID',
      computeValue: (env) => {
        const appId = getIosAppId(env);
        return appId ? `${appId}.MatterExtension` : ''
      }
    },
    {
      key: 'APP_VERSION',
      sourceKey: 'APP_VERSION',
      computeValue: (env) => env.APP_VERSION ?? ''
    },
    {
      key: 'APP_SCHEMA',
      sourceKey: 'APP_SCHEMA',
      computeValue: (env) => env.APP_SCHEMA ?? ''
    },
    {
      key: 'ASSOCIATED_DOMAIN',
      sourceKey: 'AGENTS_DEEP_LINK_HOST',
      computeValue: (env) => env.AGENTS_DEEP_LINK_HOST ?? ''
    },
    {
      key: 'ASSOCIATED_DOMAIN_ENTITLEMENT',
      sourceKey: 'AGENTS_DEEP_LINK_HOST',
      computeValue: (env) => {
        const host = env.AGENTS_DEEP_LINK_HOST ?? '';
        return host ? `applinks:${host}` : ''
      }
    },
    {
      key: 'MATTER_VENDOR_ID',
      sourceKey: 'MATTER_VENDOR_ID',
      computeValue: (env) => env.MATTER_VENDOR_ID ?? ''
    },
    {
      key: 'MATTER_ECOSYSTEM_NAME',
      sourceKey: 'MATTER_ECOSYSTEM_NAME',
      computeValue: (env) => env.MATTER_ECOSYSTEM_NAME ?? ''
    },
    // WeChat login (CN). The App ID also feeds the URL scheme in Info.plist.
    {
      key: 'WECHAT_APP_ID',
      sourceKey: 'WECHAT_APP_ID',
      computeValue: (env) => env.WECHAT_APP_ID ?? ''
    },
    // The Universal Link is split into two xcconfig values (xcconfig treats
    // "//" as a comment, so neither carries the scheme):
    //  - HOST: host only — used by the associated-domains entitlement
    //    (applinks: accepts no path).
    //  - PREFIX: host + optional path, trailing slash ensured — used by
    //    Info.plist's WeChatUniversalLink (WeChat matches the full prefix).
    {
      key: 'WECHAT_UNIVERSAL_LINK_HOST',
      sourceKey: 'WECHAT_UNIVERSAL_LINK',
      computeValue: (env) =>
        (env.WECHAT_UNIVERSAL_LINK ?? '')
          .replace(/^https?:\/\//, '')
          .split('/')[0]
    },
    {
      key: 'WECHAT_UNIVERSAL_LINK_PREFIX',
      sourceKey: 'WECHAT_UNIVERSAL_LINK',
      computeValue: (env) => {
        const stripped = (env.WECHAT_UNIVERSAL_LINK ?? '')
          .replace(/^https?:\/\//, '')
          .replace(/\/+$/, '');
        return stripped ? `${stripped}/` : '';
      }
    }
  ];

  updates.forEach(({ key, sourceKey, computeValue }) => {
    // Skip if source key doesn't exist in .env at all
    if (!hasSourceKey(sourceKey)) {
      console.warn(`  ⚠ ${key} skipped (source ${sourceKey} not in .env)`);
      return;
    }

    // Compute value - this will handle empty strings correctly
    // Empty string means the key exists in .env but has empty value
    const finalValue = computeValue(env);
    
    // Find and replace the value (similar to Android sync script).
    // [^\S\n] = whitespace EXCEPT newline: plain \s would cross the line
    // break on keys with an empty value (e.g. `WECHAT_APP_ID =`) and swallow
    // the following line. The value part is `*` (not `+`) so empty keys can
    // be both matched and filled.
    const regex = new RegExp(`^(${key}[^\\S\\n]*=[^\\S\\n]*)([^\\n]*)$`, 'm');
    
    if (regex.test(content)) {
      content = content.replace(regex, `$1${finalValue}`);
      // Only log non-empty values (empty values are synced silently)
      if (finalValue !== '') {
        console.log(`  ✓ ${key} = ${finalValue}`);
      }
    } else {
      console.warn(`  ⚠ ${key} not found in xcconfig`);
    }
  });

  write(file, content);
}

/* =====================================================
 * Main
 * ===================================================== */
function main() {
  console.log('🔄 Syncing iOS config from .env (+ package.json version)');

  const env = parseEnv(PATHS.env);
  if (!Object.keys(env).length) {
    console.warn('⚠️  No environment variables found');
    return;
  }

  applyPackageVersion(env);
  console.log(`  ✓ APP_VERSION = ${env.APP_VERSION} (from package.json)`);

  updateXcconfig(PATHS.xcconfig, env);

  console.log('✅ IOS Sync complete');
}

if (require.main === module) {
  main();
}

module.exports = { main };
