/**
 * Ghost Pay SDK - Crypto Module (Production)
 * Uses @noble/hashes, @noble/secp256k1, and @noble/ed25519 for battle-tested cryptography
 */

import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { ripemd160 as nobleRipemd160 } from '@noble/hashes/ripemd160';
import { hmac } from '@noble/hashes/hmac';
import { hex } from '@scure/base';
import { getPublicKey, signAsync, verify, Signature } from '@noble/secp256k1';
import * as ed25519 from '@noble/ed25519';

// ============================================
// Constants
// ============================================

export const AES_KEY_LENGTH = 256;
export const AES_IV_LENGTH = 12;
export const AES_TAG_LENGTH = 128;
export const PBKDF2_DEFAULT_ITERATIONS = 600_000;
export const PBKDF2_KEY_LENGTH = 256;
export const SALT_LENGTH = 16;

// ============================================
// Byte Utilities
// ============================================

export function bytesToHex(bytes: Uint8Array): string {
  return hex.encode(bytes);
}

export function hexToBytes(hexStr: string): Uint8Array {
  return hex.decode(hexStr);
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) totalLength += arr.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function randomBytes(length: number): Uint8Array {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint8Array(length));
  }
  return nodeRandomBytes(length);
}

function nodeRandomBytes(length: number): Uint8Array {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    return new Uint8Array(crypto.randomBytes(length));
  } catch {
    throw new Error('No secure random source available');
  }
}

export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let result = 0;
  for (let i = 0; i < len; i++) {
    const byteA = i < a.length ? a[i]! : 0;
    const byteB = i < b.length ? b[i]! : 0;
    result |= byteA ^ byteB;
  }
  return result === 0 && a.length === b.length;
}

// ============================================
// Hash Functions
// ============================================

export function sha256(data: Uint8Array | string): Uint8Array {
  const bytesData = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return nobleSha256(bytesData);
}

export function doubleSha256(data: Uint8Array | string): Uint8Array {
  const bytesData = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return nobleSha256(nobleSha256(bytesData));
}

export function ripemd160(data: Uint8Array | string): Uint8Array {
  const bytesData = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return nobleRipemd160(bytesData);
}

export function hash160(data: Uint8Array): Uint8Array {
  return nobleRipemd160(nobleSha256(data));
}

export function hash256(data: Uint8Array | string): Uint8Array {
  return doubleSha256(data);
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(nobleSha256, key, data);
}

// ============================================
// AES-256-GCM Encryption/Decryption
// ============================================

function safeBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function importAESKey(keyData: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    safeBuffer(keyData),
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function aesEncrypt(
  data: unknown,
  key: CryptoKey | Uint8Array
): Promise<{ iv: string; data: string }> {
  const cryptoKey = key instanceof Uint8Array ? await importAESKey(key) : key;
  const iv = randomBytes(AES_IV_LENGTH);
  const encodedData = new TextEncoder().encode(JSON.stringify(data));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: safeBuffer(iv), tagLength: AES_TAG_LENGTH },
    cryptoKey,
    encodedData
  );

  return {
    iv: bytesToHex(iv),
    data: bytesToHex(new Uint8Array(encrypted)),
  };
}

export async function aesDecrypt(
  encryptedData: { iv: string; data: string },
  key: CryptoKey | Uint8Array
): Promise<unknown> {
  const cryptoKey = key instanceof Uint8Array ? await importAESKey(key) : key;
  const iv = hexToBytes(encryptedData.iv);
  const data = hexToBytes(encryptedData.data);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: safeBuffer(iv), tagLength: AES_TAG_LENGTH },
    cryptoKey,
    safeBuffer(data)
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ============================================
// PBKDF2 Key Derivation
// ============================================

export async function pbkdf2DeriveKey(
  password: string,
  salt: Uint8Array | null = null,
  iterations: number = PBKDF2_DEFAULT_ITERATIONS
): Promise<{ key: CryptoKey; salt: string }> {
  const actualSalt = salt || randomBytes(SALT_LENGTH);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: safeBuffer(actualSalt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: PBKDF2_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );

  return { key, salt: bytesToHex(actualSalt) };
}

export async function pbkdf2DeriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bitLength: number
): Promise<Uint8Array> {
  if (iterations < PBKDF2_DEFAULT_ITERATIONS) {
    throw new Error(`PBKDF2 iterations must be at least ${PBKDF2_DEFAULT_ITERATIONS}`);
  }
  if (bitLength <= 0 || bitLength % 8 !== 0) {
    throw new Error('PBKDF2 bitLength must be positive and a multiple of 8');
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: safeBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    bitLength
  );

  return new Uint8Array(bits);
}

// ============================================
// secp256k1 Signatures (ECDSA)
// ============================================

export function secp256k1GetPublicKey(privateKey: Uint8Array, compressed = true): Uint8Array {
  if (privateKey.length !== 32) throw new Error('Private key must be 32 bytes');
  return getPublicKey(privateKey, compressed);
}

export async function secp256k1Sign(
  message: Uint8Array,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  if (privateKey.length !== 32) throw new Error('Private key must be 32 bytes');
  if (message.length === 0) throw new Error('Message must not be empty');
  const sig = await signAsync(message, privateKey);
  return sig.toCompactRawBytes();
}

export function secp256k1Verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  if (signature.length !== 64 && signature.length !== 65) throw new Error('Signature must be 64 or 65 bytes');
  if (publicKey.length !== 33 && publicKey.length !== 65) throw new Error('Public key must be 33 or 65 bytes');
  const sig = Signature.fromCompact(signature);
  return verify(sig, message, publicKey);
}

export async function secp256k1RecoverPublicKey(
  message: Uint8Array,
  signature: Uint8Array,
  recovery: number
): Promise<Uint8Array> {
  if (recovery !== 0 && recovery !== 1) throw new Error('Recovery parameter must be 0 or 1');
  const sig = Signature.fromCompact(signature).addRecoveryBit(recovery);
  const pubKey = sig.recoverPublicKey(message);
  return pubKey.toRawBytes();
}

// ============================================
// Ed25519 Operations (Solana)
// ============================================

export async function ed25519GenerateKeyPair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey };
}

export async function ed25519PublicKeyFromPrivate(
  privateKey: Uint8Array
): Promise<Uint8Array> {
  return ed25519.getPublicKeyAsync(privateKey);
}

export async function ed25519Sign(
  message: Uint8Array,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  return ed25519.signAsync(message, privateKey);
}

export async function ed25519Verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  return ed25519.verifyAsync(signature, message, publicKey);
}
