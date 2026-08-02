/**
 * Initialize polyfills for RainMaker Neo SDK and Node-style modules.
 * Must be imported before any SDK or code that uses Buffer/crypto/URL.
 * Import this first in app/_layout.tsx.
 */

import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';

import { atob as quickAtob, btoa as quickBtoa } from 'react-native-quick-base64';
import { Buffer } from 'buffer';
import CryptoJS from 'crypto-js';
// import { TextEncoder, TextDecoder } from 'util';

declare const global: typeof globalThis & {
  Buffer: typeof Buffer;
  // TextEncoder: typeof TextEncoder;
  // TextDecoder: typeof TextDecoder;
  base64ToArrayBuffer?: (data: string, removeLinebreaks?: boolean) => ArrayBuffer;
  base64FromArrayBuffer?: (buffer: ArrayBuffer, urlSafe?: boolean) => string;
  atob: (data: string) => string;
  btoa: (data: string) => string;
  crypto: typeof crypto & {
    createHash?: (algorithm: string) => any;
    createHmac?: (algorithm: string, key: any) => any;
    randomUUID?: () => string;
    SHA256?: (data: any) => any;
    HmacSHA256?: (data: any, key: any) => any;
  };
};

// global.TextEncoder = TextEncoder;
// global.TextDecoder = TextDecoder;
global.Buffer = Buffer;

// AWS SDK v3 (Cognito login, Kinesis Video camera, etc.) runs through its
// fetch-based HTTP handler in React Native. That handler collects response
// bodies via `Blob.arrayBuffer()`, which React Native's Blob does not implement
// — so response deserialization fails with "TypeError: undefined is not a
// function" even on HTTP 200. Polyfill it using FileReader (readAsArrayBuffer),
// which RN does support.
{
  const BlobCtor = (global as any).Blob;
  if (
    typeof BlobCtor === 'function' &&
    typeof BlobCtor.prototype.arrayBuffer !== 'function'
  ) {
    BlobCtor.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this as unknown as Blob);
      });
    };
  }
}

// quick-base64's JS atob/btoa depend on JSI globals installed by QuickBase64.install().
// If the native module is missing (e.g. Expo Go) or install() was skipped, assigning them
// breaks JWT decode and anything else that uses global.atob.
if (typeof global.base64ToArrayBuffer === 'function') {
  global.atob = quickAtob;
  global.btoa = quickBtoa;
} else if (typeof globalThis.atob === 'function' && typeof globalThis.btoa === 'function') {
  global.atob = globalThis.atob.bind(globalThis);
  global.btoa = globalThis.btoa.bind(globalThis);
} else {
  global.atob = (data: string) => Buffer.from(data, 'base64').toString('latin1');
  global.btoa = (data: string) => Buffer.from(data, 'latin1').toString('base64');
}

if (typeof global.crypto?.getRandomValues !== 'function') {
  console.warn('[polyfills] crypto.getRandomValues may not be available. Ensure react-native-get-random-values is imported.');
}

global.crypto.createHash = (algorithm: string) => {
  if (algorithm !== 'sha256') {
    throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }
  let hashedValue: ReturnType<typeof CryptoJS.SHA256> | null = null;
  return {
    update: (data: string | Uint8Array) => {
      if (hashedValue !== null) {
        throw new Error('Multiple updates are not allowed in this implementation.');
      }
      const inputBytes =
        typeof data === 'string'
          ? CryptoJS.enc.Utf8.parse(data)
          : (CryptoJS.lib.WordArray as any).create(Array.from(data));
      hashedValue = CryptoJS.SHA256(inputBytes);
      return {
        digest: (encoding: string) => {
          if (!hashedValue) throw new Error('No data has been hashed.');
          if (!['hex', 'base64'].includes(encoding)) {
            throw new Error(`Unsupported encoding: ${encoding}`);
          }
          return encoding === 'hex'
            ? hashedValue.toString(CryptoJS.enc.Hex)
            : hashedValue.toString(CryptoJS.enc.Base64);
        },
      };
    },
    digest: () => {
      throw new Error('You must call update(data).digest(encoding) instead.');
    },
  };
};

global.crypto.createHmac = (algorithm: string, key: any) => {
  if (algorithm !== 'sha256') {
    throw new Error(`Unsupported HMAC algorithm: ${algorithm}`);
  }
  return {
    update: (data: any) => ({
      digest: (encoding?: string) => {
        const keyBytes = typeof key === 'string' ? CryptoJS.enc.Utf8.parse(key) : key;
        const dataBytes = typeof data === 'string' ? CryptoJS.enc.Utf8.parse(data) : data;
        const hmac = CryptoJS.HmacSHA256(dataBytes, keyBytes);
        if (!encoding) return hmac;
        if (encoding === 'hex') return hmac.toString(CryptoJS.enc.Hex);
        if (encoding === 'binary') return hmac;
        throw new Error(`Unsupported encoding: ${encoding}`);
      },
    }),
  };
};

(global.crypto as any).randomUUID = (): string => {
  const randomBytes = CryptoJS.lib.WordArray.random(16);
  const hexString = randomBytes.toString(CryptoJS.enc.Hex);
  return [
    hexString.substr(0, 8),
    hexString.substr(8, 4),
    '4' + hexString.substr(13, 3),
    ((parseInt(hexString.substr(16, 1), 16) & 0x3) | 0x8).toString(16) + hexString.substr(17, 3),
    hexString.substr(20, 12),
  ].join('-');
};

(global.crypto as any).SHA256 = (data: any) => {
  const inputBytes =
    typeof data === 'string'
      ? CryptoJS.enc.Utf8.parse(data)
      : (CryptoJS.lib.WordArray as any).create(data);
  return CryptoJS.SHA256(inputBytes);
};

(global.crypto as any).HmacSHA256 = (data: any, key: any) => {
  const keyBytes = typeof key === 'string' ? CryptoJS.enc.Utf8.parse(key) : key;
  const dataBytes = typeof data === 'string' ? CryptoJS.enc.Utf8.parse(data) : data;
  return CryptoJS.HmacSHA256(dataBytes, keyBytes);
};

// Import aws-amplify AFTER all polyfills are set up
// This ensures aws-amplify loads with the required globals (Buffer, atob, crypto, etc.)
// Without this, the first require("aws-amplify") in the SDK fails with "slice of undefined"
try {
  const awsAmplify = require('aws-amplify');
  // Expose Amplify and Auth globally so SDK can access them without re-requiring
  // This prevents module resolution issues when SDK tries to require aws-amplify
  (global as any).__AWS_AMPLIFY__ = awsAmplify.Amplify;
  (global as any).__AWS_AUTH__ = awsAmplify.Auth;
  console.log('[polyfills] aws-amplify loaded successfully, Amplify and Auth exposed globally');
} catch (error) {
  console.warn('[polyfills] Failed to pre-load aws-amplify:', error);
}
