/**
 * Ghost Pay SDK - Chain Configurations
 * Multi-chain support for BTC, ETH, SOL, Polygon, BSC
 */

import type { ChainConfig, ChainId } from '../types/index.js';

// ============================================
// Helpers
// ============================================

const CURVE_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

function bigIntToBytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function decompressY(x: bigint, odd: boolean): bigint {
  const y2 = (x * x * x + 7n) % CURVE_P;
  // Compute y = y2^((p+1)/4) mod p (Tonelli-Shanks for p ≡ 3 mod 4)
  let y = 1n;
  let base = y2;
  let exp = (CURVE_P + 1n) / 4n;
  while (exp > 0n) {
    if (exp & 1n) y = (y * base) % CURVE_P;
    base = (base * base) % CURVE_P;
    exp >>= 1n;
  }
  if (odd !== Boolean(y & 1n)) {
    y = CURVE_P - y;
  }
  return y;
}

// ============================================
// BIP44 Coin Types
// ============================================

const COIN_TYPES = {
  bitcoin: 0,
  ethereum: 60,
  solana: 501,
  polygon: 60,
  bsc: 60,
} as const;

// ============================================
// Chain Configurations
// ============================================

export const CHAINS: Record<ChainId, ChainConfig> = {
  bitcoin: {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    coinType: COIN_TYPES.bitcoin,
    derivationPath: "m/44'/0'/0'/0/0",
    addressPrefix: 'bc1',
    decimals: 8,
    explorerUrl: 'https://blockstream.info',
    rpcUrl: 'https://blockstream.info/api',
  },
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    coinType: COIN_TYPES.ethereum,
    derivationPath: "m/44'/60'/0'/0/0",
    addressPrefix: '0x',
    decimals: 18,
    explorerUrl: 'https://etherscan.io',
    rpcUrl: 'https://eth.llamarpc.com',
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    coinType: COIN_TYPES.solana,
    derivationPath: "m/44'/501'/0'",
    addressPrefix: '',
    decimals: 9,
    explorerUrl: 'https://solscan.io',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
  },
  polygon: {
    id: 'polygon',
    name: 'Polygon',
    symbol: 'MATIC',
    coinType: COIN_TYPES.polygon,
    derivationPath: "m/44'/60'/0'/0/0",
    addressPrefix: '0x',
    decimals: 18,
    explorerUrl: 'https://polygonscan.com',
    rpcUrl: 'https://polygon-rpc.com',
  },
  bsc: {
    id: 'bsc',
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    coinType: COIN_TYPES.bsc,
    derivationPath: "m/44'/60'/0'/0/0",
    addressPrefix: '0x',
    decimals: 18,
    explorerUrl: 'https://bscscan.com',
    rpcUrl: 'https://bsc-dataseed.binance.org',
  },
};

// ============================================
// Address Generation Helpers
// ============================================

import { hash160, bytesToHex, sha256, hash256 } from './crypto.js';
import { bech32 } from '@scure/base';
import { keccak_256 } from '@noble/hashes/sha3';

// Keccak-256 wrapper for Ethereum address derivation
function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

/**
 * Generate Bitcoin P2PKH address from compressed public key
 */
export function bitcoinP2PKHAddress(publicKey: Uint8Array): string {
  const pubKeyHash = hash160(publicKey);
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = 0x00; // Mainnet P2PKH
  versionedHash.set(pubKeyHash, 1);
  return base58checkEncode(versionedHash);
}

/**
 * Generate Bitcoin P2WPKH (Bech32/SegWit) address from compressed public key
 */
export function bitcoinP2WPKHAddress(publicKey: Uint8Array): string {
  const pubKeyHash = hash160(publicKey);
  return bech32Encode('bc', pubKeyHash);
}

/**
 * Generate Ethereum address from public key (EIP-55 checksum)
 * Uses Keccak-256 (not SHA-256) per Ethereum specification
 * Accepts both compressed (33 bytes) and uncompressed (64/65 bytes) keys
 */
export function ethereumAddress(publicKey: Uint8Array): string {
  let uncompressed: Uint8Array;

  if (publicKey.length === 64) {
    // Already uncompressed (x || y), add 04 prefix
    uncompressed = publicKey;
  } else if (publicKey.length === 65 && publicKey[0] === 0x04) {
    // Already uncompressed with prefix, remove it for hashing
    uncompressed = publicKey.slice(1);
  } else if (publicKey.length === 33) {
    // Compressed key - need to decompress
    const x = publicKey.slice(1, 33);
    const prefix = publicKey[0];
    const yParity = prefix === 0x03; // 0x03 = odd, 0x02 = even
    const xBigInt = bytesToBigInt(x);
    const y = decompressY(xBigInt, yParity);
    const yBytes = bigIntToBytes(y);
    uncompressed = new Uint8Array(64);
    uncompressed.set(x, 0);
    uncompressed.set(yBytes.slice(0, 32), 32);
  } else {
    throw new Error('Invalid public key length');
  }

  // Keccak-256 is the correct hash for Ethereum address derivation
  const hash = keccak256(uncompressed);
  const addressBytes = hash.slice(-20);
  return eip55Checksum(addressBytes);
}

/**
 * Generate Solana address from Ed25519 public key
 */
export function solanaAddress(publicKey: Uint8Array): string {
  return base58Encode(publicKey);
}

// ============================================
// Base58 / Bech32 Encoding
// ============================================

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(data: Uint8Array): string {
  let num = BigInt('0x' + bytesToHex(data));
  let str = '';

  while (num > 0n) {
    const remainder = num % 58n;
    str = BASE58_ALPHABET[Number(remainder)] + str;
    num = num / 58n;
  }

  // Handle leading zeros
  for (let i = 0; i < data.length && data[i] === 0; i++) {
    str = '1' + str;
  }

  return str;
}

export function base58Decode(str: string): Uint8Array {
  let num = 0n;
  for (const char of str) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid Base58 character: ${char}`);
    num = num * 58n + BigInt(index);
  }

  const hex = num.toString(16).padStart(2, '0');
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  // Handle leading zeros
  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    leadingZeros++;
  }

  if (leadingZeros > 0) {
    const result = new Uint8Array(leadingZeros + bytes.length);
    result.set(bytes, leadingZeros);
    return result;
  }

  return bytes;
}

export function base58checkEncode(data: Uint8Array): string {
  const checksum = hash256(data).slice(0, 4);
  return base58Encode(new Uint8Array([...data, ...checksum]));
}

export function base58checkDecode(str: string): Uint8Array {
  const bytes = base58Decode(str);
  const payload = bytes.slice(0, -4);
  const checksum = bytes.slice(-4);
  const computedChecksum = hash256(payload).slice(0, 4);

  if (!constantTimeCompare(checksum, computedChecksum)) {
    throw new Error('Invalid Base58Check checksum');
  }

  return payload;
}

function bech32Encode(hrp: string, data: Uint8Array): string {
  const words = bech32.toWords(data);
  words.unshift(0); // Witness version 0
  return bech32.encode(hrp, words, 90);
}

function eip55Checksum(address: Uint8Array): string {
  const hexAddr = bytesToHex(address);
  // EIP-55 requires Keccak-256, not SHA-256
  const hash = keccak256(new TextEncoder().encode(hexAddr));
  const hashHex = bytesToHex(hash);

  let checksummed = '0x';
  for (let i = 0; i < hexAddr.length; i++) {
    const char = hexAddr[i]!;
    if (/[0-9]/.test(char)) {
      checksummed += char;
    } else {
      const hashByte = parseInt(hashHex[i]!, 16);
      checksummed += hashByte > 7 ? char.toUpperCase() : char.toLowerCase();
    }
  }

  return checksummed;
}

function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}

// ============================================
// Chain Address Generator
// ============================================

export function generateAddress(
  chain: ChainId,
  publicKey: Uint8Array
): string {
  switch (chain) {
    case 'bitcoin':
      return bitcoinP2WPKHAddress(publicKey);
    case 'ethereum':
    case 'polygon':
    case 'bsc':
      return ethereumAddress(publicKey);
    case 'solana':
      return solanaAddress(publicKey);
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
}

export function getChainConfig(chain: ChainId): ChainConfig {
  const config = CHAINS[chain];
  if (!config) throw new Error(`Unknown chain: ${chain}`);
  return config;
}
