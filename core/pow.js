/**
 * Ghost Pay SDK - Proof of Work Module
 * Black/White Minimalist Design
 * ES6 Modules
 */

import { sha256, bytesToHex, hexToBytes, randomBytes } from './crypto.js';

// ============================================
// Constants
// ============================================

const HASHCASH_DIFFICULTY_BITS = 20;
const HASHCASH_PREFIX = '0000';
const DEFAULT_NONCE_LENGTH = 8;
const MAX_ITERATIONS = 10000000;
const DIFFICULTY_ADJUSTMENT_INTERVAL = 2016;
const TARGET_BLOCK_TIME = 600000; // 10 minutes in ms

// ============================================
// Hashcash Implementation
// ============================================

class Hashcash {
    constructor() {
        this.difficulty = HASHCASH_DIFFICULTY_BITS;
        this.prefix = HASHCASH_PREFIX;
    }

    /**
     * Set difficulty (in bits)
     */
    setDifficulty(bits) {
        this.difficulty = bits;
        this.prefix = '0'.repeat(Math.floor(bits / 4));
    }

    /**
     * Mint hashcash token
     */
    async mint(resource, difficulty = this.difficulty) {
        const challenge = bytesToHex(randomBytes(DEFAULT_NONCE_LENGTH));
        const timestamp = Date.now();
        
        let counter = 0;
        const targetPrefix = '0'.repeat(Math.floor(difficulty / 4));
        const suffixLength = Math.ceil(difficulty / 4) - targetPrefix.length;

        while (counter < MAX_ITERATIONS) {
            const token = this.createToken(resource, challenge, timestamp, counter);
            const hash = await this.computeHash(token);
            
            if (hash.startsWith(targetPrefix)) {
                return {
                    resource,
                    challenge,
                    timestamp,
                    counter,
                    hash,
                    token,
                    difficulty
                };
            }
            
            counter++;
            
            // Yield to prevent blocking
            if (counter % 10000 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        throw new Error('Failed to mint hashcash after maximum iterations');
    }

    /**
     * Create hashcash token string
     */
    createToken(resource, challenge, timestamp, counter) {
        const version = 1;
        const bits = this.difficulty.toString(16).padStart(2, '0');
        const counterHex = counter.toString(16).padStart(8, '0');
        
        return `${version}:${bits}:${resource}:${timestamp}:${challenge}:${counterHex}`;
    }

    /**
     * Compute hash of token
     */
    async computeHash(token) {
        const hash = await sha256(new TextEncoder().encode(token));
        return bytesToHex(hash);
    }

    /**
     * Verify hashcash token
     */
    async verify(token, resource) {
        const parts = token.split(':');
        
        if (parts.length !== 6) {
            return { valid: false, reason: 'Invalid token format' };
        }

        const [version, bits, res, timestamp, challenge, counterHex] = parts;
        
        if (parseInt(version) !== 1) {
            return { valid: false, reason: 'Unknown version' };
        }

        if (res !== resource) {
            return { valid: false, reason: 'Resource mismatch' };
        }

        const difficulty = parseInt(bits, 16);
        const counter = parseInt(counterHex, 16);
        const computedToken = this.createToken(resource, challenge, parseInt(timestamp), counter);
        
        if (computedToken !== token) {
            return { valid: false, reason: 'Token mismatch' };
        }

        const hash = await this.computeHash(token);
        const targetPrefix = '0'.repeat(Math.floor(difficulty / 4));

        if (!hash.startsWith(targetPrefix)) {
            return { valid: false, reason: 'Hash does not meet difficulty' };
        }

        return {
            valid: true,
            difficulty,
            timestamp: parseInt(timestamp),
            counter
        };
    }
}

// ============================================
// Spam Prevention
// ============================================

class SpamPrevention {
    constructor() {
        this.rateLimits = new Map();
        this.buckets = new Map();
        this.blacklist = new Set();
        this.whitelist = new Set();
        this.hashcash = new Hashcash();
    }

    /**
     * Check if request is rate limited
     */
    checkRateLimit(identifier, limit = 100, windowMs = 60000) {
        if (this.whitelist.has(identifier)) {
            return { allowed: true };
        }

        if (this.blacklist.has(identifier)) {
            return { allowed: false, reason: 'Blacklisted' };
        }

        const now = Date.now();
        const key = `rate_${identifier}`;
        
        let bucket = this.rateLimits.get(key) || {
            tokens: limit,
            lastRefill: now
        };

        // Refill tokens
        const elapsed = now - bucket.lastRefill;
        const refillAmount = Math.floor((elapsed / windowMs) * limit);
        bucket.tokens = Math.min(limit, bucket.tokens + refillAmount);
        bucket.lastRefill = now;

        if (bucket.tokens <= 0) {
            return {
                allowed: false,
                reason: 'Rate limit exceeded',
                retryAfter: Math.ceil(windowMs / 1000)
            };
        }

        bucket.tokens--;
        this.rateLimits.set(key, bucket);

        return { allowed: true, remaining: bucket.tokens };
    }

    /**
     * Add to blacklist
     */
    blacklistAddress(identifier) {
        this.blacklist.add(identifier);
    }

    /**
     * Remove from blacklist
     */
    unblacklistAddress(identifier) {
        this.blacklist.delete(identifier);
    }

    /**
     * Add to whitelist
     */
    whitelistAddress(identifier) {
        this.whitelist.add(identifier);
    }

    /**
     * Remove from whitelist
     */
    unwhitelistAddress(identifier) {
        this.whitelist.delete(identifier);
    }

    /**
     * Require hashcash for operation
     */
    async requireHashcash(identifier, resource, difficulty = 16) {
        const hashcash = new Hashcash();
        const token = await hashcash.mint(resource, difficulty);
        return token;
    }

    /**
     * Verify hashcash token
     */
    async verifyHashcash(token, resource) {
        return await this.hashcash.verify(token, resource);
    }

    /**
     * Get token bucket state
     */
    getBucketState(identifier) {
        const key = `rate_${identifier}`;
        return this.rateLimits.get(key) || { tokens: 0, lastRefill: Date.now() };
    }

    /**
     * Clear all rate limits
     */
    clearRateLimits() {
        this.rateLimits.clear();
    }
}

// ============================================
// Difficulty Adjuster
// ============================================

class DifficultyAdjuster {
    constructor() {
        this.targetBlockTime = TARGET_BLOCK_TIME;
        this.adjustmentInterval = DIFFICULTY_ADJUSTMENT_INTERVAL;
        this.history = [];
    }

    /**
     * Record block time
     */
    recordBlock(blockHash, timestamp) {
        this.history.push({
            hash: blockHash,
            timestamp,
            index: this.history.length
        });

        // Keep only recent history
        if (this.history.length > this.adjustmentInterval * 2) {
            this.history.shift();
        }
    }

    /**
     * Calculate current difficulty
     */
    calculateDifficulty() {
        if (this.history.length < this.adjustmentInterval) {
            return HASHCASH_DIFFICULTY_BITS;
        }

        const recentBlocks = this.history.slice(-this.adjustmentInterval);
        const firstBlock = recentBlocks[0];
        const lastBlock = recentBlocks[recentBlocks.length - 1];

        const actualTime = lastBlock.timestamp - firstBlock.timestamp;
        const expectedTime = this.adjustmentInterval * this.targetBlockTime;

        const ratio = expectedTime / actualTime;
        
        // Clamp adjustment
        const clampedRatio = Math.max(0.25, Math.min(4, ratio));
        
        const currentDifficulty = this.history.length > 0 
            ? this.history[this.history.length - 1].difficulty || HASHCASH_DIFFICULTY_BITS
            : HASHCASH_DIFFICULTY_BITS;

        // Adjust difficulty
        const adjustment = Math.log2(clampedRatio);
        let newDifficulty = currentDifficulty + adjustment;

        // Clamp to reasonable bounds
        newDifficulty = Math.max(8, Math.min(32, newDifficulty));

        return Math.round(newDifficulty);
    }

    /**
     * Get difficulty for next block
     */
    getNextDifficulty() {
        return this.calculateDifficulty();
    }

    /**
     * Reset history
     */
    reset() {
        this.history = [];
    }
}

// ============================================
// Proof of Work Engine
// ============================================

class PoWEngine {
    constructor() {
        this.hashcash = new Hashcash();
        this.spamPrevention = new SpamPrevention();
        this.difficultyAdjuster = new DifficultyAdjuster();
        this.proofCache = new Map();
    }

    /**
     * Generate proof of work
     */
    async generateProof(data, difficulty = null) {
        if (difficulty === null) {
            difficulty = this.difficultyAdjuster.getNextDifficulty();
        }

        const resource = bytesToHex(await sha256(new TextEncoder().encode(JSON.stringify(data))));
        
        const token = await this.hashcash.mint(resource, difficulty);
        
        return {
            proof: token,
            difficulty,
            resource,
            timestamp: Date.now()
        };
    }

    /**
     * Verify proof of work
     */
    async verifyProof(data, proof) {
        const resource = bytesToHex(await sha256(new TextEncoder().encode(JSON.stringify(data))));
        const result = await this.hashcash.verify(proof, resource);
        
        return result;
    }

    /**
     * Check transaction spam
     */
    checkTransactionSpam(senderId, limit = 10, windowMs = 60000) {
        return this.spamPrevention.checkRateLimit(senderId, limit, windowMs);
    }

    /**
     * Apply proof requirement to transaction
     */
    async applyProofToTransaction(tx) {
        const proof = await this.generateProof(tx);
        tx.proof = proof;
        return tx;
    }

    /**
     * Verify transaction proof
     */
    async verifyTransactionProof(tx) {
        if (!tx.proof) {
            return false;
        }

        const txData = { ...tx };
        delete txData.proof;
        
        const result = await this.verifyProof(txData, tx.proof);
        return result.valid;
    }

    /**
     * Get current difficulty
     */
    getCurrentDifficulty() {
        return this.difficultyAdjuster.getNextDifficulty();
    }

    /**
     * Clear proof cache
     */
    clearCache() {
        this.proofCache.clear();
    }
}

export {
    Hashcash,
    SpamPrevention,
    DifficultyAdjuster,
    PoWEngine,
    HASHCASH_DIFFICULTY_BITS,
    HASHCASH_PREFIX,
    DEFAULT_NONCE_LENGTH,
    MAX_ITERATIONS,
    DIFFICULTY_ADJUSTMENT_INTERVAL,
    TARGET_BLOCK_TIME
};
