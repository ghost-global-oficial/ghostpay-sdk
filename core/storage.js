/**
 * Ghost Pay SDK - Storage Module
 * Black/White Minimalist Design
 * ES6 Modules
 */

import { 
    pbkdf2DeriveKey, 
    aesEncrypt, 
    aesDecrypt,
    randomBytes,
    bytesToHex,
    hexToBytes
} from './crypto.js';

const STORAGE_PREFIX = 'ghost_pay_';
const SESSION_KEY = 'ghost_session';
const ENCRYPTED_KEY_ID = 'ghost_master_key';
const DEFAULT_ITERATIONS = 100000;

/**
 * Secure Storage class
 */
class SecureStorage {
    constructor() {
        this.masterKey = null;
        this.sessionId = null;
        this.isUnlocked = false;
    }

    /**
     * Initialize storage with password
     */
    async init(password) {
        const existingKey = localStorage.getItem(STORAGE_PREFIX + ENCRYPTED_KEY_ID);
        
        if (existingKey) {
            return { existing: true };
        }
        
        // First time setup
        const { key, salt } = await pbkdf2DeriveKey(password, null, DEFAULT_ITERATIONS);
        this.masterKey = key;
        this.isUnlocked = true;
        
        // Store encrypted key identifier
        const keyId = bytesToHex(randomBytes(32));
        const encrypted = await aesEncrypt({ keyId }, this.masterKey);
        
        localStorage.setItem(STORAGE_PREFIX + ENCRYPTED_KEY_ID, JSON.stringify({
            salt,
            iterations: DEFAULT_ITERATIONS,
            ...encrypted
        }));
        
        return { existing: false, keyId };
    }

    /**
     * Unlock existing storage
     */
    async unlock(password) {
        const stored = localStorage.getItem(STORAGE_PREFIX + ENCRYPTED_KEY_ID);
        
        if (!stored) {
            throw new Error('Storage not initialized');
        }
        
        const { salt, iterations, iv, data } = JSON.parse(stored);
        const { key } = await pbkdf2DeriveKey(password, hexToBytes(salt), iterations);
        
        try {
            const decrypted = await aesDecrypt({ iv, data }, key);
            this.masterKey = key;
            this.isUnlocked = true;
            return { success: true };
        } catch (e) {
            throw new Error('Invalid password');
        }
    }

    /**
     * Lock storage
     */
    lock() {
        this.masterKey = null;
        this.sessionId = null;
        this.isUnlocked = false;
        this.clearSession();
    }

    /**
     * Store data securely
     */
    async set(key, value) {
        if (!this.isUnlocked || !this.masterKey) {
            throw new Error('Storage is locked');
        }
        
        const storageKey = STORAGE_PREFIX + key;
        const encrypted = await aesEncrypt(value, this.masterKey);
        localStorage.setItem(storageKey, JSON.stringify(encrypted));
        
        return true;
    }

    /**
     * Retrieve data
     */
    async get(key) {
        if (!this.isUnlocked || !this.masterKey) {
            throw new Error('Storage is locked');
        }
        
        const storageKey = STORAGE_PREFIX + key;
        const stored = localStorage.getItem(storageKey);
        
        if (!stored) {
            return null;
        }
        
        const { iv, data } = JSON.parse(stored);
        return await aesDecrypt({ iv, data }, this.masterKey);
    }

    /**
     * Remove data
     */
    remove(key) {
        const storageKey = STORAGE_PREFIX + key;
        localStorage.removeItem(storageKey);
    }

    /**
     * Check if key exists
     */
    has(key) {
        const storageKey = STORAGE_PREFIX + key;
        return localStorage.getItem(storageKey) !== null;
    }

    /**
     * Clear all storage
     */
    clear() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(STORAGE_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
}

/**
 * Session Manager
 */
class SessionManager {
    constructor(storage) {
        this.storage = storage;
        this.sessionData = {};
        this.expiryTimeout = null;
    }

    /**
     * Create new session
     */
    async createSession(data, ttlMs = 3600000) {
        const sessionId = bytesToHex(randomBytes(32));
        const expiresAt = Date.now() + ttlMs;
        
        this.sessionData = {
            id: sessionId,
            data,
            expiresAt,
            createdAt: Date.now()
        };
        
        await this.storage.set(SESSION_KEY, this.sessionData);
        
        // Auto-expire session
        this.expiryTimeout = setTimeout(() => {
            this.clearSession();
        }, ttlMs);
        
        return sessionId;
    }

    /**
     * Get current session
     */
    async getSession() {
        const session = await this.storage.get(SESSION_KEY);
        
        if (!session) {
            return null;
        }
        
        if (Date.now() > session.expiresAt) {
            this.clearSession();
            return null;
        }
        
        return session;
    }

    /**
     * Update session data
     */
    async updateSession(data) {
        const session = await this.getSession();
        
        if (!session) {
            throw new Error('No active session');
        }
        
        session.data = { ...session.data, ...data };
        await this.storage.set(SESSION_KEY, session);
        this.sessionData = session;
        
        return session;
    }

    /**
     * Clear session
     */
    clearSession() {
        if (this.expiryTimeout) {
            clearTimeout(this.expiryTimeout);
            this.expiryTimeout = null;
        }
        this.storage.remove(SESSION_KEY);
        this.sessionData = {};
    }

    /**
     * Extend session
     */
    async extendSession(ttlMs = 3600000) {
        const session = await this.getSession();
        
        if (!session) {
            throw new Error('No active session');
        }
        
        session.expiresAt = Date.now() + ttlMs;
        await this.storage.set(SESSION_KEY, session);
        
        if (this.expiryTimeout) {
            clearTimeout(this.expiryTimeout);
        }
        this.expiryTimeout = setTimeout(() => {
            this.clearSession();
        }, ttlMs);
        
        return session;
    }
}

/**
 * Wallet Key Storage
 */
class WalletStorage {
    constructor(storage) {
        this.storage = storage;
    }

    /**
     * Store wallet keys
     */
    async storeWallet(walletId, keys) {
        const walletData = {
            id: walletId,
            keys: {
                btc: keys.btc,
                eth: keys.eth,
                usdt: keys.usdt
            },
            addresses: {
                btc: keys.addresses?.btc,
                eth: keys.addresses?.eth,
                usdt: keys.addresses?.usdt
            },
            storedAt: Date.now()
        };
        
        await this.storage.set(`wallet_${walletId}`, walletData);
        return true;
    }

    /**
     * Retrieve wallet keys
     */
    async getWallet(walletId) {
        return await this.storage.get(`wallet_${walletId}`);
    }

    /**
     * List all wallets
     */
    async listWallets() {
        const wallets = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(STORAGE_PREFIX + 'wallet_')) {
                const walletId = key.replace(STORAGE_PREFIX + 'wallet_', '');
                const meta = await this.storage.get(`wallet_${walletId}`);
                if (meta) {
                    wallets.push({
                        id: walletId,
                        addresses: meta.addresses,
                        storedAt: meta.storedAt
                    });
                }
            }
        }
        return wallets;
    }

    /**
     * Delete wallet
     */
    async deleteWallet(walletId) {
        this.storage.remove(`wallet_${walletId}`);
        return true;
    }
}

// Export singleton instances
const secureStorage = new SecureStorage();
const sessionManager = new SessionManager(secureStorage);
const walletStorage = new WalletStorage(secureStorage);

export {
    SecureStorage,
    SessionManager,
    WalletStorage,
    secureStorage,
    sessionManager,
    walletStorage,
    STORAGE_PREFIX,
    SESSION_KEY,
    ENCRYPTED_KEY_ID
};
