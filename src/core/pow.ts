/**
 * Ghost Pay SDK - Proof of Work Module (Production)
 */

import { sha256, bytesToHex, randomBytes } from './crypto.js';
import type { PoWResult, HashcashToken } from '../types/index.js';

// ============================================
// Constants
// ============================================

export const HASHCASH_DIFFICULTY_BITS = 20;
export const HASHCASH_PREFIX = '0000';
export const DEFAULT_NONCE_LENGTH = 8;
export const MAX_ITERATIONS = 10_000_000;
export const DIFFICULTY_ADJUSTMENT_INTERVAL = 2016;
export const TARGET_BLOCK_TIME = 600_000; // 10 minutes in ms

// ============================================
// Hashcash Implementation
// ============================================

export class Hashcash {
  private difficulty: number;
  private prefix: string;

  constructor(difficulty: number = HASHCASH_DIFFICULTY_BITS) {
    this.difficulty = difficulty;
    this.prefix = '0'.repeat(Math.floor(difficulty / 4));
  }

  /**
   * Set difficulty (in bits)
   */
  setDifficulty(bits: number): void {
    this.difficulty = bits;
    this.prefix = '0'.repeat(Math.floor(bits / 4));
  }

  /**
   * Mint hashcash token
   */
  async mint(resource: string, difficulty?: number): Promise<PoWResult> {
    const bits = difficulty || this.difficulty;
    const challenge = bytesToHex(randomBytes(DEFAULT_NONCE_LENGTH));
    const timestamp = Date.now();
    const targetPrefix = '0'.repeat(Math.floor(bits / 4));

    let counter = 0;
    const startTime = Date.now();

    while (counter < MAX_ITERATIONS) {
      const token = this.createToken(resource, challenge, timestamp, counter, bits);
      const hash = await this.computeHash(token);

      if (hash.startsWith(targetPrefix)) {
        return {
          token,
          difficulty: bits,
          hash,
          iterations: counter + 1,
          duration: Date.now() - startTime,
        };
      }

      counter++;

      // Yield to prevent blocking
      if (counter % 10_000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    throw new Error(`Failed to mint hashcash after ${MAX_ITERATIONS} iterations`);
  }

  /**
   * Create hashcash token string
   */
  createToken(resource: string, challenge: string, timestamp: number, counter: number, difficulty?: number): string {
    const version = 1;
    const bits = (difficulty ?? this.difficulty).toString(16).padStart(2, '0');
    const counterHex = counter.toString(16).padStart(8, '0');

    return `${version}:${bits}:${resource}:${timestamp}:${challenge}:${counterHex}`;
  }

  /**
   * Parse hashcash token
   */
  parseToken(token: string): HashcashToken | null {
    const parts = token.split(':');
    if (parts.length !== 6) return null;

    return {
      version: parseInt(parts[0]!),
      bits: parseInt(parts[1]!, 16),
      resource: parts[2]!,
      timestamp: parseInt(parts[3]!),
      challenge: parts[4]!,
      counter: parseInt(parts[5]!, 16),
    };
  }

  /**
   * Compute hash of token
   */
  async computeHash(token: string): Promise<string> {
    const hash = sha256(new TextEncoder().encode(token));
    return bytesToHex(hash);
  }

  /**
   * Verify hashcash token
   */
  async verify(token: string, resource: string): Promise<{ valid: boolean; reason?: string; difficulty?: number; counter?: number }> {
    const parsed = this.parseToken(token);

    if (!parsed) {
      return { valid: false, reason: 'Invalid token format' };
    }

    if (parsed.version !== 1) {
      return { valid: false, reason: 'Unknown version' };
    }

    if (parsed.resource !== resource) {
      return { valid: false, reason: 'Resource mismatch' };
    }

    const computedToken = this.createToken(
      resource,
      parsed.challenge,
      parsed.timestamp,
      parsed.counter,
      parsed.bits
    );

    if (computedToken !== token) {
      return { valid: false, reason: 'Token mismatch' };
    }

    const hash = await this.computeHash(token);
    const targetPrefix = '0'.repeat(Math.floor(parsed.bits / 4));

    if (!hash.startsWith(targetPrefix)) {
      return { valid: false, reason: 'Hash does not meet difficulty' };
    }

    return {
      valid: true,
      difficulty: parsed.bits,
      counter: parsed.counter,
    };
  }
}

// ============================================
// Spam Prevention (Rate Limiting)
// ============================================

export class SpamPrevention {
  private rateLimits = new Map<string, { tokens: number; lastRefill: number }>();
  private blacklist = new Set<string>();
  private whitelist = new Set<string>();

  /**
   * Check if request is rate limited
   */
  checkRateLimit(
    identifier: string,
    limit: number = 100,
    windowMs: number = 60_000
  ): { allowed: boolean; remaining?: number; reason?: string; retryAfter?: number } {
    if (this.whitelist.has(identifier)) {
      return { allowed: true };
    }

    if (this.blacklist.has(identifier)) {
      return { allowed: false, reason: 'Blacklisted' };
    }

    const now = Date.now();
    const key = `rate_${identifier}`;

    let bucket = this.rateLimits.get(key) || { tokens: limit, lastRefill: now };

    // Refill tokens
    const elapsed = now - bucket.lastRefill;
    const refillAmount = Math.floor((elapsed / windowMs) * limit);
    bucket.tokens = Math.min(limit, bucket.tokens + refillAmount);
    bucket.lastRefill = now;

    if (bucket.tokens <= 0) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }

    bucket.tokens--;
    this.rateLimits.set(key, bucket);

    return { allowed: true, remaining: bucket.tokens };
  }

  /**
   * Add to blacklist
   */
  blacklistAddress(identifier: string): void {
    this.blacklist.add(identifier);
  }

  /**
   * Remove from blacklist
   */
  unblacklistAddress(identifier: string): void {
    this.blacklist.delete(identifier);
  }

  /**
   * Add to whitelist
   */
  whitelistAddress(identifier: string): void {
    this.whitelist.add(identifier);
  }

  /**
   * Remove from whitelist
   */
  unwhitelistAddress(identifier: string): void {
    this.whitelist.delete(identifier);
  }

  /**
   * Clear all rate limits
   */
  clearRateLimits(): void {
    this.rateLimits.clear();
  }
}

// ============================================
// Difficulty Adjuster
// ============================================

export class DifficultyAdjuster {
  private targetBlockTime: number;
  private adjustmentInterval: number;
  private history: Array<{ hash: string; timestamp: number; difficulty: number }> = [];

  constructor(
    targetBlockTime: number = TARGET_BLOCK_TIME,
    adjustmentInterval: number = DIFFICULTY_ADJUSTMENT_INTERVAL
  ) {
    this.targetBlockTime = targetBlockTime;
    this.adjustmentInterval = adjustmentInterval;
  }

  /**
   * Record block
   */
  recordBlock(hash: string, timestamp: number, difficulty: number): void {
    this.history.push({ hash, timestamp, difficulty });

    // Keep only recent history
    if (this.history.length > this.adjustmentInterval * 2) {
      this.history.shift();
    }
  }

  /**
   * Calculate current difficulty
   */
  calculateDifficulty(): number {
    if (this.history.length < this.adjustmentInterval) {
      return HASHCASH_DIFFICULTY_BITS;
    }

    const recentBlocks = this.history.slice(-this.adjustmentInterval);
    const firstBlock = recentBlocks[0]!;
    const lastBlock = recentBlocks[recentBlocks.length - 1]!;

    const actualTime = lastBlock.timestamp - firstBlock.timestamp;
    const expectedTime = this.adjustmentInterval * this.targetBlockTime;

    const ratio = expectedTime / actualTime;

    // Clamp adjustment
    const clampedRatio = Math.max(0.25, Math.min(4, ratio));

    const currentDifficulty = lastBlock.difficulty || HASHCASH_DIFFICULTY_BITS;

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
  getNextDifficulty(): number {
    return this.calculateDifficulty();
  }

  /**
   * Reset history
   */
  reset(): void {
    this.history = [];
  }
}

// ============================================
// Proof of Work Engine
// ============================================

export class PoWEngine {
  private hashcash: Hashcash;
  private spamPrevention: SpamPrevention;
  private difficultyAdjuster: DifficultyAdjuster;

  constructor() {
    this.hashcash = new Hashcash();
    this.spamPrevention = new SpamPrevention();
    this.difficultyAdjuster = new DifficultyAdjuster();
  }

  /**
   * Generate proof of work
   */
  async generateProof(data: unknown, difficulty?: number): Promise<PoWResult> {
    const bits = difficulty || this.difficultyAdjuster.getNextDifficulty();
    const resource = bytesToHex(sha256(JSON.stringify(data)));

    return this.hashcash.mint(resource, bits);
  }

  /**
   * Verify proof of work
   */
  async verifyProof(
    data: unknown,
    proof: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const resource = bytesToHex(sha256(JSON.stringify(data)));
    return this.hashcash.verify(proof, resource);
  }

  /**
   * Check transaction spam
   */
  checkTransactionSpam(
    senderId: string,
    limit: number = 10,
    windowMs: number = 60_000
  ): { allowed: boolean; remaining?: number; reason?: string; retryAfter?: number } {
    return this.spamPrevention.checkRateLimit(senderId, limit, windowMs);
  }

  /**
   * Get current difficulty
   */
  getCurrentDifficulty(): number {
    return this.difficultyAdjuster.getNextDifficulty();
  }

  /**
   * Record block for difficulty adjustment
   */
  recordBlock(hash: string, timestamp: number, difficulty: number): void {
    this.difficultyAdjuster.recordBlock(hash, timestamp, difficulty);
  }
}
