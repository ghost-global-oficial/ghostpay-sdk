/**
 * Ghost Pay SDK - Storage Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryStorageAdapter,
  SecureStorage,
  SessionManager,
  WalletStorage,
  createSecureStorage,
  createSessionManager,
  createWalletStorage,
} from '../src/core/storage.js';

describe('Storage Module', () => {
  describe('MemoryStorageAdapter', () => {
    let storage: MemoryStorageAdapter;

    beforeEach(() => {
      storage = new MemoryStorageAdapter();
    });

    it('should set and get values', async () => {
      const key = 'test-key';
      const value = new Uint8Array([1, 2, 3, 4]);

      await storage.set(key, value);
      const retrieved = await storage.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for missing keys', async () => {
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should delete values', async () => {
      await storage.set('key', new Uint8Array([1]));
      const deleted = await storage.delete('key');

      expect(deleted).toBe(true);
      expect(await storage.get('key')).toBeNull();
    });

    it('should check if key exists', async () => {
      expect(await storage.has('key')).toBe(false);

      await storage.set('key', new Uint8Array([1]));
      expect(await storage.has('key')).toBe(true);
    });

    it('should clear all values', async () => {
      await storage.set('key1', new Uint8Array([1]));
      await storage.set('key2', new Uint8Array([2]));

      await storage.clear();

      expect(await storage.has('key1')).toBe(false);
      expect(await storage.has('key2')).toBe(false);
    });

    it('should list all keys', async () => {
      await storage.set('a', new Uint8Array([1]));
      await storage.set('b', new Uint8Array([2]));

      const keys = await storage.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });
  });

  describe('SecureStorage', () => {
    it('should initialize with password', async () => {
      const storage = createSecureStorage(new MemoryStorageAdapter());
      const result = await storage.init('password123');

      expect(result.existing).toBe(false);
      expect(result.keyId).toBeDefined();
      expect(storage.isUnlocked).toBe(true);
    });

    it('should unlock existing storage', async () => {
      const adapter = new MemoryStorageAdapter();
      const storage1 = createSecureStorage(adapter);
      await storage1.init('password123');

      const storage2 = createSecureStorage(adapter);
      const result = await storage2.unlock('password123');

      expect(result.success).toBe(true);
      expect(storage2.isUnlocked).toBe(true);
    });

    it('should reject wrong password', async () => {
      const adapter = new MemoryStorageAdapter();
      const storage1 = createSecureStorage(adapter);
      await storage1.init('password123');

      const storage2 = createSecureStorage(adapter);
      await expect(storage2.unlock('wrongpassword')).rejects.toThrow('Invalid password');
    });

    it('should store and retrieve encrypted data', async () => {
      const storage = createSecureStorage(new MemoryStorageAdapter());
      await storage.init('password123');

      const data = { secret: 'my-secret-data' };
      await storage.set('key1', data);

      const retrieved = await storage.get<typeof data>('key1');
      expect(retrieved).toEqual(data);
    });

    it('should throw when locked', async () => {
      const storage = createSecureStorage(new MemoryStorageAdapter());

      await expect(storage.set('key', { data: 1 }))
        .rejects.toThrow('Storage is locked');
    });

    it('should lock storage', async () => {
      const storage = createSecureStorage(new MemoryStorageAdapter());
      await storage.init('password123');
      expect(storage.isUnlocked).toBe(true);

      storage.lock();
      expect(storage.isUnlocked).toBe(false);
    });
  });

  describe('SessionManager', () => {
    it('should create and retrieve session', async () => {
      const secureStorage = createSecureStorage(new MemoryStorageAdapter());
      await secureStorage.init('password123');

      const sessionManager = createSessionManager(secureStorage);
      const sessionId = await sessionManager.createSession('wallet1');

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');

      const session = await sessionManager.getSession();
      expect(session).not.toBeNull();
      expect(session!.walletId).toBe('wallet1');
    });

    it('should delete session', async () => {
      const secureStorage = createSecureStorage(new MemoryStorageAdapter());
      await secureStorage.init('password123');

      const sessionManager = createSessionManager(secureStorage);
      const sessionId = await sessionManager.createSession('wallet1');

      await sessionManager.deleteSession(sessionId);

      const session = await sessionManager.getSession();
      expect(session).toBeNull();
    });
  });

  describe('WalletStorage', () => {
    it('should store and retrieve wallet', async () => {
      const secureStorage = createSecureStorage(new MemoryStorageAdapter());
      await secureStorage.init('password123');

      const walletStorage = createWalletStorage(secureStorage);
      const walletData = { mnemonic: 'test mnemonic', addresses: ['addr1'] };

      await walletStorage.storeWallet('wallet1', walletData);
      const retrieved = await walletStorage.getWallet('wallet1');

      expect(retrieved).toEqual(walletData);
    });

    it('should list wallets', async () => {
      const secureStorage = createSecureStorage(new MemoryStorageAdapter());
      await secureStorage.init('password123');

      const walletStorage = createWalletStorage(secureStorage);

      await walletStorage.storeWallet('w1', { data: 1 });
      await walletStorage.storeWallet('w2', { data: 2 });

      const wallets = await walletStorage.listWallets();
      expect(wallets.length).toBe(2);
      expect(wallets.map(w => w.id)).toContain('w1');
      expect(wallets.map(w => w.id)).toContain('w2');
    });

    it('should delete wallet', async () => {
      const secureStorage = createSecureStorage(new MemoryStorageAdapter());
      await secureStorage.init('password123');

      const walletStorage = createWalletStorage(secureStorage);

      await walletStorage.storeWallet('w1', { data: 1 });
      await walletStorage.deleteWallet('w1');

      const retrieved = await walletStorage.getWallet('w1');
      expect(retrieved).toBeNull();
    });
  });
});
