/**
 * Ghost Pay SDK - Wallet Tests
 */

import { describe, it, expect } from 'vitest';
import { Wallet, validateMnemonic, generateNewMnemonic, createWallet, importWallet } from '../src/core/wallet.js';

describe('Wallet Module', () => {
  describe('Mnemonic Generation', () => {
    it('should generate 12-word mnemonic', () => {
      const mnemonic = generateNewMnemonic(12);
      const words = mnemonic.split(' ');
      expect(words.length).toBe(12);
    });

    it('should generate 24-word mnemonic', () => {
      const mnemonic = generateNewMnemonic(24);
      const words = mnemonic.split(' ');
      expect(words.length).toBe(24);
    });

    it('should validate correct mnemonic', () => {
      const mnemonic = generateNewMnemonic(12);
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should reject invalid mnemonic', () => {
      expect(validateMnemonic('invalid mnemonic phrase')).toBe(false);
      expect(validateMnemonic('')).toBe(false);
    });
  });

  describe('Wallet Creation', () => {
    it('should create wallet with mnemonic', () => {
      const wallet = createWallet();
      const mnemonic = wallet.generateMnemonic();

      expect(mnemonic).toBeDefined();
      expect(mnemonic.split(' ').length).toBe(12);
      expect(wallet.id).toBeDefined();
      expect(wallet.addresses.length).toBeGreaterThan(0);
    });

    it('should generate addresses for all chains', () => {
      const wallet = createWallet();
      wallet.generateMnemonic();

      const chains = ['bitcoin', 'ethereum', 'solana', 'polygon', 'bsc'] as const;
      for (const chain of chains) {
        const address = wallet.getAddress(chain);
        expect(address).toBeDefined();
        expect(typeof address).toBe('string');
        expect(address.length).toBeGreaterThan(0);
      }
    });

    it('should generate valid Bitcoin address', () => {
      const wallet = createWallet();
      wallet.generateMnemonic();

      const btcAddress = wallet.getAddress('bitcoin');
      expect(btcAddress).toMatch(/^bc1/); // Bech32 format
    });

    it('should generate valid Ethereum address', () => {
      const wallet = createWallet();
      wallet.generateMnemonic();

      const ethAddress = wallet.getAddress('ethereum');
      expect(ethAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });
  });

  describe('Wallet Import', () => {
    it('should import wallet from mnemonic', () => {
      const originalWallet = createWallet();
      const mnemonic = originalWallet.generateMnemonic();

      const importedWallet = importWallet(mnemonic);
      expect(importedWallet.getAddress('bitcoin')).toBe(originalWallet.getAddress('bitcoin'));
      expect(importedWallet.getAddress('ethereum')).toBe(originalWallet.getAddress('ethereum'));
    });

    it('should throw on invalid mnemonic', () => {
      expect(() => importWallet('invalid mnemonic')).toThrow('Invalid BIP39 mnemonic');
    });
  });

  describe('Wallet Export/Import', () => {
    it('should export wallet as JSON', () => {
      const wallet = createWallet();
      wallet.generateMnemonic();

      const exported = wallet.export();
      expect(exported.version).toBe(1);
      expect(exported.id).toBeDefined();
      expect(exported.mnemonic).toBeDefined();
      expect(exported.addresses.length).toBe(5);
    });

    it('should export and import encrypted wallet', async () => {
      const wallet = createWallet();
      wallet.generateMnemonic();

      const encrypted = await wallet.exportEncrypted('password123');
      expect(typeof encrypted).toBe('string');

      const imported = await Wallet.importEncrypted(encrypted, 'password123');
      expect(imported.getAddress('bitcoin')).toBe(wallet.getAddress('bitcoin'));
    });

    it('should reject wrong password', async () => {
      const wallet = createWallet();
      wallet.generateMnemonic();

      const encrypted = await wallet.exportEncrypted('password123');

      await expect(Wallet.importEncrypted(encrypted, 'wrongpassword'))
        .rejects.toThrow();
    });
  });

  describe('Wallet Address Map', () => {
    it('should return address map', () => {
      const wallet = createWallet();
      wallet.generateMnemonic();

      const map = wallet.getAddressMap();
      expect(map).toHaveProperty('bitcoin');
      expect(map).toHaveProperty('ethereum');
      expect(map).toHaveProperty('solana');
      expect(map).toHaveProperty('polygon');
      expect(map).toHaveProperty('bsc');
    });
  });

  describe('Wallet Info', () => {
    it('should return wallet info without exposing mnemonic', () => {
      const wallet = createWallet();
      wallet.generateMnemonic();

      const info = wallet.getInfo();
      expect(info.id).toBeDefined();
      expect((info as any).mnemonic).toBeUndefined();
      expect(info.addresses.length).toBe(5);
      expect(info.createdAt).toBeGreaterThan(0);
      expect(info.version).toBe(1);
    });
  });
});
