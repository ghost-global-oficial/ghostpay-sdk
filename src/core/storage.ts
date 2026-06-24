/**
 * Ghost Pay SDK - Storage Module (Production)
 * Cross-platform storage with encryption
 */

import { pbkdf2DeriveKey, aesEncrypt, aesDecrypt, randomBytes, bytesToHex, hexToBytes } from './crypto.js';
import type { StorageAdapter, SessionData } from '../types/index.js';

// ============================================
// Constants
// ============================================

const STORAGE_PREFIX = 'ghost_pay_';
const SESSION_KEY = 'ghost_session';
const ENCRYPTED_KEY_ID = 'ghost_master_key';
const DEFAULT_ITERATIONS = 600_000;

// ============================================
// Browser Storage Adapter
// ============================================

export class BrowserStorageAdapter implements StorageAdapter {
  private storage: Storage;

  constructor(storage: Storage = localStorage) {
    this.storage = storage;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const value = this.storage.getItem(STORAGE_PREFIX + key);
    if (!value) return null;
    return hexToBytes(value);
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    this.storage.setItem(STORAGE_PREFIX + key, bytesToHex(value));
  }

  async delete(key: string): Promise<boolean> {
    const existed = this.storage.getItem(STORAGE_PREFIX + key) !== null;
    this.storage.removeItem(STORAGE_PREFIX + key);
    return existed;
  }

  async has(key: string): Promise<boolean> {
    return this.storage.getItem(STORAGE_PREFIX + key) !== null;
  }

  async clear(): Promise<void> {
    const keysToRemove: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => this.storage.removeItem(key));
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        keys.push(key.slice(STORAGE_PREFIX.length));
      }
    }
    return keys;
  }
}

// ============================================
// In-Memory Storage Adapter
// ============================================

export class MemoryStorageAdapter implements StorageAdapter {
  private data = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | null> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }
}

// ============================================
// Secure Storage
// ============================================

export class SecureStorage {
  private _adapter: StorageAdapter;
  private masterKey: CryptoKey | null = null;
  private _isUnlocked = false;

  constructor(adapter?: StorageAdapter) {
    this._adapter = adapter || new BrowserStorageAdapter();
  }

  get isUnlocked(): boolean {
    return this._isUnlocked;
  }

  get adapter(): StorageAdapter {
    return this._adapter;
  }

  async init(password: string): Promise<{ existing: boolean; keyId?: string }> {
    const existingKey = await this._adapter.has(ENCRYPTED_KEY_ID);

    if (existingKey) {
      return { existing: true };
    }

    const { key, salt } = await pbkdf2DeriveKey(password, null, DEFAULT_ITERATIONS);
    this.masterKey = key;
    this._isUnlocked = true;

    const keyId = bytesToHex(randomBytes(32));
    const encrypted = await aesEncrypt({ keyId }, this.masterKey);

    await this._adapter.set(
      ENCRYPTED_KEY_ID,
      new TextEncoder().encode(
        JSON.stringify({
          salt,
          iterations: DEFAULT_ITERATIONS,
          ...encrypted,
        })
      )
    );

    return { existing: false, keyId };
  }

  private _failedAttempts = 0;
  private _lockoutUntil = 0;
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly BASE_DELAY_MS = 1000;

  async unlock(password: string): Promise<{ success: boolean }> {
    // Brute-force protection with exponential backoff
    if (this._failedAttempts >= SecureStorage.MAX_ATTEMPTS) {
      const elapsed = Date.now() - this._lockoutUntil;
      if (elapsed < 0) {
        const remaining = Math.ceil(-elapsed / 1000);
        throw new Error(`Too many failed attempts. Try again in ${remaining}s`);
      }
      this._failedAttempts = 0;
    }

    const stored = await this._adapter.get(ENCRYPTED_KEY_ID);

    if (!stored) {
      throw new Error('Storage not initialized');
    }

    const { salt, iterations, iv, data } = JSON.parse(new TextDecoder().decode(stored));
    const { key } = await pbkdf2DeriveKey(password, hexToBytes(salt), iterations);

    try {
      await aesDecrypt({ iv, data }, key);
      this.masterKey = key;
      this._isUnlocked = true;
      this._failedAttempts = 0;
      return { success: true };
    } catch {
      this._failedAttempts++;
      if (this._failedAttempts >= SecureStorage.MAX_ATTEMPTS) {
        const delay = SecureStorage.BASE_DELAY_MS * Math.pow(2, this._failedAttempts - SecureStorage.MAX_ATTEMPTS);
        this._lockoutUntil = Date.now() + delay;
      }
      throw new Error('Invalid password');
    }
  }

  lock(): void {
    this.masterKey = null;
    this._isUnlocked = false;
  }

  async set(key: string, value: unknown): Promise<void> {
    if (!this._isUnlocked || !this.masterKey) {
      throw new Error('Storage is locked');
    }

    const encrypted = await aesEncrypt(value, this.masterKey);
    await this._adapter.set(key, new TextEncoder().encode(JSON.stringify(encrypted)));
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this._isUnlocked || !this.masterKey) {
      throw new Error('Storage is locked');
    }

    const stored = await this._adapter.get(key);

    if (!stored) {
      return null;
    }

    const { iv, data } = JSON.parse(new TextDecoder().decode(stored));
    return (await aesDecrypt({ iv, data }, this.masterKey)) as T;
  }

  async remove(key: string): Promise<void> {
    await this._adapter.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this._adapter.has(key);
  }

  async clear(): Promise<void> {
    await this._adapter.clear();
  }
}

// ============================================
// Session Manager
// ============================================

export class SessionManager {
  private storage: SecureStorage;
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(storage: SecureStorage) {
    this.storage = storage;
  }

  async createSession(walletId: string, ttlMs: number = 3_600_000): Promise<string> {
    const sessionId = bytesToHex(randomBytes(32));
    const session: SessionData = {
      id: sessionId,
      walletId,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    };

    // Store multiple sessions instead of overwriting
    const existing = await this.storage.get<SessionData[]>(SESSION_KEY);
    const sessions = Array.isArray(existing) ? existing : [];
    sessions.push(session);
    await this.storage.set(SESSION_KEY, sessions);

    const timer = setTimeout(() => {
      this.deleteSession(sessionId);
    }, ttlMs);

    this.expiryTimers.set(sessionId, timer);

    return sessionId;
  }

  async getSession(): Promise<SessionData | null> {
    const sessions = await this.storage.get<SessionData[]>(SESSION_KEY);
    if (!Array.isArray(sessions) || sessions.length === 0) return null;

    const now = Date.now();
    const valid = sessions.filter(s => s.expiresAt > now);

    if (valid.length !== sessions.length) {
      await this.storage.set(SESSION_KEY, valid);
    }

    return valid.length > 0 ? valid[valid.length - 1]! : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const timer = this.expiryTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(sessionId);
    }

    const sessions = await this.storage.get<SessionData[]>(SESSION_KEY);
    if (Array.isArray(sessions)) {
      const filtered = sessions.filter(s => s.id !== sessionId);
      await this.storage.set(SESSION_KEY, filtered);
    }
  }

  async extendSession(ttlMs: number = 3_600_000): Promise<SessionData> {
    const session = await this.getSession();

    if (!session) {
      throw new Error('No active session');
    }

    session.expiresAt = Date.now() + ttlMs;

    // Read the full session list, update the target session, and write the array back
    const sessions = await this.storage.get<SessionData[]>(SESSION_KEY);
    const sessionList = Array.isArray(sessions) ? sessions : [];
    const index = sessionList.findIndex(s => s.id === session.id);
    if (index !== -1) {
      sessionList[index] = session;
    }
    await this.storage.set(SESSION_KEY, sessionList);

    const timer = this.expiryTimers.get(session.id);
    if (timer) {
      clearTimeout(timer);
    }

    const newTimer = setTimeout(() => {
      this.deleteSession(session.id);
    }, ttlMs);

    this.expiryTimers.set(session.id, newTimer);

    return session;
  }
}

// ============================================
// Wallet Storage
// ============================================

export class WalletStorage {
  private storage: SecureStorage;

  constructor(storage: SecureStorage) {
    this.storage = storage;
  }

  async storeWallet(walletId: string, data: unknown): Promise<void> {
    await this.storage.set(`wallet_${walletId}`, {
      id: walletId,
      data,
      storedAt: Date.now(),
    });
  }

  async getWallet<T = unknown>(walletId: string): Promise<T | null> {
    const stored = await this.storage.get<{ id: string; data: T; storedAt: number }>(
      `wallet_${walletId}`
    );
    return stored?.data || null;
  }

  async listWallets(): Promise<Array<{ id: string; storedAt: number }>> {
    const keys = await this.storage.adapter.keys();
    const walletKeys = keys.filter((k) => k.startsWith('wallet_'));

    const wallets: Array<{ id: string; storedAt: number }> = [];
    for (const key of walletKeys) {
      const stored = await this.storage.get<{ id: string; storedAt: number }>(key);
      if (stored) {
        wallets.push({ id: stored.id, storedAt: stored.storedAt });
      }
    }

    return wallets;
  }

  async deleteWallet(walletId: string): Promise<void> {
    await this.storage.remove(`wallet_${walletId}`);
  }
}

// ============================================
// Factory Functions
// ============================================

export function createSecureStorage(adapter?: StorageAdapter): SecureStorage {
  return new SecureStorage(adapter);
}

export function createSessionManager(storage: SecureStorage): SessionManager {
  return new SessionManager(storage);
}

export function createWalletStorage(storage: SecureStorage): WalletStorage {
  return new WalletStorage(storage);
}
