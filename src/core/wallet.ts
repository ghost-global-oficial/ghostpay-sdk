/**
 * Ghost Pay SDK - Wallet Module (Production)
 * Uses @scure/bip39, @scure/bip32, and @noble/secp256k1 for real HD wallet support
 */

import { generateMnemonic as scureGenerateMnemonic, mnemonicToSeedSync, validateMnemonic as scureValidateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import {
  secp256k1GetPublicKey,
  secp256k1Sign,
  ed25519Sign,
  ed25519PublicKeyFromPrivate,
  bytesToHex,
  hexToBytes,
  sha256,
  hash160,
  randomBytes,
  aesEncrypt,
  aesDecrypt,
  pbkdf2DeriveKey,
} from './crypto.js';
import {
  generateAddress,
  getChainConfig,
} from './chains.js';
import type { ChainId, WalletAddress, WalletInfo, WalletExport, KeyPair } from '../types/index.js';

// ============================================
// Constants
// ============================================

export const BIP39_WORDLIST = wordlist;
export const SEED_LENGTH = 16;
export const PBKDF2_ITERATIONS = 600_000;

// ============================================
// Wallet Class
// ============================================

export class Wallet {
  private _mnemonic: string | null = null;
  private _seed: Uint8Array | null = null;
  private _masterKey: HDKey | null = null;
  private _addresses: WalletAddress[] = [];
  private _id: string;
  private _createdAt: number;

  constructor() {
    this._id = this.generateId();
    this._createdAt = Date.now();
  }

  get id(): string {
    return this._id;
  }

  /**
   * DEPRECATED: Use specific wallet methods instead.
   * Mnemonic should never be exposed through a getter.
   * @internal
   * WARNING: In browser environments, private keys in memory can always be
   * extracted via DevTools. Use server-side for real funds.
   */
  getMnemonic(): string {
    if (!this._mnemonic) throw new Error('No mnemonic available');
    // Log security warning
    console.warn('[GhostPay] SECURITY: getMnemonic() exposes raw private key material. ' +
      'In browser environments, this can be extracted via DevTools. ' +
      'Use server-side operations for real funds.');
    return this._mnemonic;
  }

  get addresses(): WalletAddress[] {
    return [...this._addresses];
  }

  get createdAt(): number {
    return this._createdAt;
  }

  /**
   * Generate new wallet with 12-word mnemonic
   */
  generateMnemonic(): string {
    this._mnemonic = scureGenerateMnemonic(wordlist);
    this._seed = mnemonicToSeedSync(this._mnemonic);
    this._masterKey = HDKey.fromMasterSeed(this._seed);
    this.deriveAllAddresses();
    return this._mnemonic;
  }

  /**
   * Import wallet from mnemonic
   */
  importMnemonic(mnemonic: string): void {
    if (!scureValidateMnemonic(mnemonic, wordlist)) {
      throw new Error('Invalid BIP39 mnemonic');
    }

    this._mnemonic = mnemonic;
    this._seed = mnemonicToSeedSync(mnemonic);
    this._masterKey = HDKey.fromMasterSeed(this._seed);
    this.deriveAllAddresses();
  }

  /**
   * Import wallet from seed bytes
   */
  importSeed(seed: Uint8Array): void {
    // BIP39 mandates 64-byte (512-bit) seeds
    if (seed.length !== 64) {
      throw new Error('Invalid seed length. Expected 64 bytes (BIP39 standard).');
    }

    this._seed = seed;
    this._masterKey = HDKey.fromMasterSeed(seed);
    this.deriveAllAddresses();
  }

  /**
   * Derive a key pair for a specific chain and index
   */
  deriveKeyPair(chain: ChainId, index = 0): KeyPair {
    if (!this._masterKey) {
      throw new Error('Wallet not initialized. Generate or import a wallet first.');
    }

    const config = getChainConfig(chain);
    const path = index === 0
      ? config.derivationPath
      : config.derivationPath.replace(/\/0$/, `/${index}`);

    const derived = this._masterKey.derive(path);
    if (!derived.privateKey || !derived.publicKey) {
      throw new Error(`Failed to derive key for chain: ${chain}`);
    }

    return {
      privateKey: derived.privateKey,
      publicKey: derived.publicKey,
      compressed: true,
    };
  }

  /**
   * Derive address for a specific chain
   */
  deriveAddress(chain: ChainId, index = 0): WalletAddress {
    const keyPair = this.deriveKeyPair(chain, index);
    const address = generateAddress(chain, keyPair.publicKey);
    const config = getChainConfig(chain);
    const path = index === 0
      ? config.derivationPath
      : config.derivationPath.replace(/\/0$/, `/${index}`);

    return {
      chain,
      address,
      path,
      index,
    };
  }

  /**
   * Derive addresses for all supported chains
   */
  private deriveAllAddresses(): void {
    this._addresses = [];
    const chains: ChainId[] = ['bitcoin', 'ethereum', 'solana', 'polygon', 'bsc'];

    for (const chain of chains) {
      const address = this.deriveAddress(chain);
      this._addresses.push(address);
    }
  }

  /**
   * Sign data with chain-specific key
   */
  /**
   * Sign a message hash with chain-specific key.
   * For ETH/BTC: pass keccak256(rlp) or hash256(tx) directly.
   * For SOL: pass the message hash directly.
   */
  async sign(hash: Uint8Array, chain: ChainId, index = 0): Promise<Uint8Array> {
    const keyPair = this.deriveKeyPair(chain, index);

    if (chain === 'solana') {
      // Ed25519 for Solana — caller must pass the message hash
      const signature = await ed25519Sign(hash, keyPair.privateKey);
      return new Uint8Array(signature);
    }

    // BTC, ETH, Polygon, BSC use secp256k1 — caller must pass the hash
    return await secp256k1Sign(hash, keyPair.privateKey);
  }

  /**
   * Export wallet as JSON
   */
  export(): WalletExport {
    if (!this._mnemonic) {
      throw new Error('No mnemonic available. Wallet must be generated or imported.');
    }

    return {
      version: 1,
      id: this._id,
      mnemonic: this._mnemonic,
      addresses: this._addresses,
      createdAt: this._createdAt,
    };
  }

  /**
   * Export encrypted wallet
   */
  async exportEncrypted(password: string): Promise<string> {
    if (!this._mnemonic) {
      throw new Error('No mnemonic available.');
    }

    const walletData = this.export();
    const { key, salt } = await pbkdf2DeriveKey(password);
    const encrypted = await aesEncrypt(walletData, key);
    return JSON.stringify({ ...encrypted, salt });
  }

  /**
   * Import encrypted wallet
   */
  static async importEncrypted(
    encryptedJson: string,
    password: string
  ): Promise<Wallet> {
    const { salt, ...encrypted } = JSON.parse(encryptedJson);
    const saltBytes = hexToBytes(salt);
    const { key } = await pbkdf2DeriveKey(password, saltBytes);
    const data = await aesDecrypt(encrypted, key) as WalletExport;

    if (data.version !== 1) {
      throw new Error(`Unsupported wallet version: ${data.version}`);
    }

    const wallet = new Wallet();
    wallet._id = data.id;
    wallet._createdAt = data.createdAt;
    wallet.importMnemonic(data.mnemonic);
    return wallet;
  }

  private generateId(): string {
    return 'wallet_' + bytesToHex(randomBytes(16));
  }

  /**
   * Get address for a specific chain
   */
  getAddress(chain: ChainId): string {
    const addr = this._addresses.find((a) => a.chain === chain);
    if (!addr) throw new Error(`No address found for chain: ${chain}`);
    return addr.address;
  }

  /**
   * Get all addresses as a map
   */
  getAddressMap(): Record<ChainId, string> {
    const map = {} as Record<ChainId, string>;
    for (const addr of this._addresses) {
      map[addr.chain] = addr.address;
    }
    return map;
  }

  /**
   * Destroy wallet — zeroize sensitive key material from memory.
   * After calling this, the wallet is unusable.
   */
  destroy(): void {
    if (this._mnemonic) {
      // Overwrite mnemonic string in memory (best effort in JS)
      this._mnemonic = 'x'.repeat(this._mnemonic.length);
      this._mnemonic = null;
    }
    if (this._seed) {
      this._seed.fill(0);
      this._seed = null;
    }
    this._masterKey = null;
    this._addresses = [];
  }

  /**
   * Get wallet info
   */
  getInfo(): WalletInfo {
    return {
      id: this._id,
      addresses: this._addresses,
      createdAt: this._createdAt,
      version: 1,
    };
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Validate a BIP39 mnemonic
 */
export function validateMnemonic(mnemonic: string): boolean {
  return scureValidateMnemonic(mnemonic, wordlist);
}

/**
 * Generate a new mnemonic
 */
export function generateNewMnemonic(wordCount: 12 | 24 = 12): string {
  const strength = wordCount === 24 ? 256 : 128;
  return scureGenerateMnemonic(wordlist, strength);
}

/**
 * Create a new wallet instance
 */
export function createWallet(): Wallet {
  return new Wallet();
}

/**
 * Import wallet from mnemonic
 */
export function importWallet(mnemonic: string): Wallet {
  const wallet = new Wallet();
  wallet.importMnemonic(mnemonic);
  return wallet;
}
