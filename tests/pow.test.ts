/**
 * Ghost Pay SDK - PoW Tests
 */

import { describe, it, expect } from 'vitest';
import { Hashcash, SpamPrevention, DifficultyAdjuster, PoWEngine } from '../src/core/pow.js';

describe('Proof of Work Module', () => {
  describe('Hashcash', () => {
    it('should mint and verify token', async () => {
      const hashcash = new Hashcash(8); // Low difficulty for fast test
      const result = await hashcash.mint('test-resource', 8);

      expect(result.token).toBeDefined();
      expect(result.difficulty).toBe(8);
      expect(result.hash).toMatch(/^0+/);
      expect(result.iterations).toBeGreaterThan(0);

      const verified = await hashcash.verify(result.token, 'test-resource');
      expect(verified.valid).toBe(true);
    });

    it('should reject invalid token', async () => {
      const hashcash = new Hashcash(8);
      const verified = await hashcash.verify('invalid:token:format', 'resource');
      expect(verified.valid).toBe(false);
    });

    it('should reject token for wrong resource', async () => {
      const hashcash = new Hashcash(8);
      const result = await hashcash.mint('correct-resource', 8);

      const verified = await hashcash.verify(result.token, 'wrong-resource');
      expect(verified.valid).toBe(false);
    });

    it('should parse token correctly', () => {
      const hashcash = new Hashcash(16);
      const token = hashcash.createToken('test', 'challenge123', Date.now(), 42);
      const parsed = hashcash.parseToken(token);

      expect(parsed).not.toBeNull();
      expect(parsed!.version).toBe(1);
      expect(parsed!.resource).toBe('test');
    });
  });

  describe('SpamPrevention', () => {
    it('should allow requests within rate limit', () => {
      const spam = new SpamPrevention();
      const result = spam.checkRateLimit('peer1', 10, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeDefined();
    });

    it('should block blacklisted peers', () => {
      const spam = new SpamPrevention();
      spam.blacklistAddress('bad-peer');

      const result = spam.checkRateLimit('bad-peer');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Blacklisted');
    });

    it('should always allow whitelisted peers', () => {
      const spam = new SpamPrevention();
      spam.whitelistAddress('good-peer');

      const result = spam.checkRateLimit('good-peer');
      expect(result.allowed).toBe(true);
    });

    it('should enforce rate limits', () => {
      const spam = new SpamPrevention();

      // Use up all tokens
      for (let i = 0; i < 5; i++) {
        spam.checkRateLimit('peer1', 5, 60000);
      }

      // Next request should be blocked
      const result = spam.checkRateLimit('peer1', 5, 60000);
      expect(result.allowed).toBe(false);
    });
  });

  describe('DifficultyAdjuster', () => {
    it('should return default difficulty initially', () => {
      const adjuster = new DifficultyAdjuster();
      expect(adjuster.getNextDifficulty()).toBe(20);
    });

    it('should record blocks', () => {
      const adjuster = new DifficultyAdjuster();
      adjuster.recordBlock('hash1', Date.now(), 20);
      adjuster.recordBlock('hash2', Date.now() + 600000, 20);

      expect(adjuster.calculateDifficulty()).toBeDefined();
    });
  });

  describe('PoWEngine', () => {
    it('should generate and verify proof', async () => {
      const engine = new PoWEngine();
      const data = { test: 'data' };

      const result = await engine.generateProof(data, 8);
      expect(result.token).toBeDefined();
      expect(result.difficulty).toBe(8);

      const verified = await engine.verifyProof(data, result.token);
      expect(verified.valid).toBe(true);
    });

    it('should check transaction spam', () => {
      const engine = new PoWEngine();
      const result = engine.checkTransactionSpam('sender1', 5, 60000);
      expect(result.allowed).toBe(true);
    });
  });
});
