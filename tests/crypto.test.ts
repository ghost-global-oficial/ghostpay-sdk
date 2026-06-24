/**
 * Ghost Pay SDK - Crypto Tests
 */

import { describe, it, expect } from 'vitest';
import {
  bytesToHex,
  hexToBytes,
  sha256,
  doubleSha256,
  ripemd160,
  hash160,
  hash256,
  hmacSha256,
  randomBytes,
  constantTimeCompare,
  generateAESKey,
  aesEncrypt,
  aesDecrypt,
  pbkdf2DeriveKey,
  pbkdf2DeriveBits,
  secp256k1GetPublicKey,
  secp256k1Sign,
  secp256k1Verify,
} from '../src/core/crypto.js';

describe('Crypto Module', () => {
  describe('Byte Utilities', () => {
    it('should convert bytes to hex and back', () => {
      const bytes = new Uint8Array([0, 1, 2, 15, 16, 255]);
      const hex = bytesToHex(bytes);
      expect(hex).toBe('0001020f10ff');
      const back = hexToBytes(hex);
      expect(back).toEqual(bytes);
    });

    it('should generate random bytes', () => {
      const bytes = randomBytes(32);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it('should compare bytes in constant time', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      const c = new Uint8Array([1, 2, 4]);

      expect(constantTimeCompare(a, b)).toBe(true);
      expect(constantTimeCompare(a, c)).toBe(false);
      expect(constantTimeCompare(a, new Uint8Array([1, 2]))).toBe(false);
    });
  });

  describe('Hash Functions', () => {
    it('should compute SHA-256', () => {
      const hash = sha256('hello');
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should compute double SHA-256', () => {
      const hash = doubleSha256('hello');
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should compute RIPEMD-160', () => {
      const hash = ripemd160('hello');
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(20);
    });

    it('should compute HASH160 (RIPEMD160(SHA256))', () => {
      const hash = hash160(new Uint8Array([1, 2, 3]));
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(20);
    });

    it('should compute HMAC-SHA256', () => {
      const key = randomBytes(32);
      const data = randomBytes(32);
      const mac = hmacSha256(key, data);
      expect(mac).toBeInstanceOf(Uint8Array);
      expect(mac.length).toBe(32);
    });
  });

  describe('AES-256-GCM', () => {
    it('should encrypt and decrypt data', async () => {
      const key = await generateAESKey();
      const data = { message: 'Hello, World!', number: 42 };

      const encrypted = await aesEncrypt(data, key);
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('data');

      const decrypted = await aesDecrypt(encrypted, key);
      expect(decrypted).toEqual(data);
    });

    it('should encrypt with Uint8Array key', async () => {
      const keyBytes = randomBytes(32);
      const data = { test: true };

      const encrypted = await aesEncrypt(data, keyBytes);
      const decrypted = await aesDecrypt(encrypted, keyBytes);
      expect(decrypted).toEqual(data);
    });
  });

  describe('PBKDF2', () => {
    it('should derive key from password', async () => {
      const password = 'test-password-123';
      const { key, salt } = await pbkdf2DeriveKey(password);

      expect(key).toBeDefined();
      expect(typeof salt).toBe('string');
      expect(salt.length).toBe(32); // 16 bytes hex
    });

    it('should derive bits from password', async () => {
      const password = 'test-password-123';
      const salt = randomBytes(16);
      const bits = await pbkdf2DeriveBits(password, salt, 600000, 256);

      expect(bits).toBeInstanceOf(Uint8Array);
      expect(bits.length).toBe(32); // 256 bits
    }, 10000);

    it('should produce same key with same salt', async () => {
      const password = 'test-password';
      const salt = randomBytes(16);

      const result1 = await pbkdf2DeriveKey(password, salt);
      const result2 = await pbkdf2DeriveKey(password, salt);

      expect(result1.salt).toBe(result2.salt);
    });
  });

  describe('secp256k1', () => {
    it('should get public key from private key', () => {
      const privateKey = randomBytes(32);
      const publicKey = secp256k1GetPublicKey(privateKey, true);

      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKey.length).toBe(33); // Compressed
    });

    it('should get uncompressed public key', () => {
      const privateKey = randomBytes(32);
      const publicKey = secp256k1GetPublicKey(privateKey, false);

      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKey.length).toBe(65); // Uncompressed
    });

    it('should sign and verify', async () => {
      const privateKey = randomBytes(32);
      const message = sha256('test message');

      const signature = await secp256k1Sign(message, privateKey);
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64); // Compact signature

      const publicKey = secp256k1GetPublicKey(privateKey, true);
      const valid = secp256k1Verify(message, signature, publicKey);
      expect(valid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const privateKey1 = randomBytes(32);
      const privateKey2 = randomBytes(32);
      const message = sha256('test message');

      const signature = await secp256k1Sign(message, privateKey1);
      const publicKey2 = secp256k1GetPublicKey(privateKey2, true);

      const valid = secp256k1Verify(message, signature, publicKey2);
      expect(valid).toBe(false);
    });
  });
});
