/**
 * Ghost Pay SDK - Blockchain Broadcaster
 * Real RPC broadcasting for BTC, ETH, SOL, Polygon, BSC
 */

import { getChainConfig } from './chains.js';
import type { ChainId, Transaction } from '../types/index.js';

// ============================================
// Input Validation (SSRF Prevention)
// ============================================

const SAFE_ADDRESS = /^[a-zA-Z0-9]+$/;
const SAFE_TXHASH = /^[a-fA-F0-9]+$/;

function sanitizeUrlParam(value: string, pattern: RegExp, name: string): string {
  if (!pattern.test(value)) {
    throw new Error(`Invalid ${name}: contains unsafe characters`);
  }
  if (value.length > 128) {
    throw new Error(`${name} too long (max 128 chars)`);
  }
  return encodeURIComponent(value);
}

// ============================================
// Types
// ============================================

export interface BroadcastResult {
  success: boolean;
  txHash?: string;
  error?: string;
  chain: ChainId;
}

export interface UTXO {
  txid: string;
  vout: number;
  amount: number;
  scriptPubKey: string;
  confirmations: number;
}

export interface BalanceInfo {
  address: string;
  balance: string;
  chain: ChainId;
}

export interface BroadcastConfig {
  rpcUrls?: string[];
  rpcUrl?: string;
  apiKey?: string;
  timeout?: number;
}

// ============================================
// Blockchain Broadcaster
// ============================================

export class BlockchainBroadcaster {
  private configs: Map<ChainId, BroadcastConfig> = new Map();

  constructor(customConfigs?: Partial<Record<ChainId, BroadcastConfig>>) {
    const chains: ChainId[] = ['bitcoin', 'ethereum', 'solana', 'polygon', 'bsc'];
    for (const chain of chains) {
      const chainConfig = getChainConfig(chain);
      this.configs.set(chain, {
        rpcUrls: customConfigs?.[chain]?.rpcUrls || [chainConfig.rpcUrl!],
        apiKey: customConfigs?.[chain]?.apiKey,
        timeout: customConfigs?.[chain]?.timeout || 30000,
      });
    }
  }

  /**
   * Broadcast a signed transaction to the blockchain
   */
  async broadcast(tx: Transaction, signedHex: string): Promise<BroadcastResult> {
    switch (tx.chain) {
      case 'bitcoin':
        return this.broadcastBitcoin(signedHex);
      case 'ethereum':
        return this.broadcastEthereum(signedHex);
      case 'solana':
        return this.broadcastSolana(signedHex);
      case 'polygon':
        return this.broadcastPolygon(signedHex);
      case 'bsc':
        return this.broadcastBSC(signedHex);
      default:
        return { success: false, error: `Unsupported chain: ${tx.chain}`, chain: tx.chain };
    }
  }

  /**
   * Get balance for an address
   */
  async getBalance(address: string, chain: ChainId): Promise<BalanceInfo> {
    const config = this.configs.get(chain)!;

    switch (chain) {
      case 'bitcoin':
        return this.getBitcoinBalance(address, config);
      case 'ethereum':
      case 'polygon':
      case 'bsc':
        return this.getEVMBalance(address, chain, config);
      case 'solana':
        return this.getSolanaBalance(address, config);
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }
  }

  /**
   * Get UTXOs for a Bitcoin address
   */
  private async getUTXOs(address: string): Promise<UTXO[]> {
    const config = this.configs.get('bitcoin')!;
    const safeAddress = sanitizeUrlParam(address, SAFE_ADDRESS, 'address');
    const rpcUrls = Array.isArray(config.rpcUrls) ? config.rpcUrls : [config.rpcUrls];
    const response = await this.rpcCall(`${rpcUrls[0]}/address/${safeAddress}/utxo`, config);
    return response.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      amount: utxo.value / 1e8,
      scriptPubKey: utxo.scriptPubKey || '',
      confirmations: utxo.status?.confirmed ? 1 : 0,
    }));
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(txHash: string, chain: ChainId): Promise<{
    confirmed: boolean;
    confirmations: number;
    blockHeight?: number;
  }> {
    const config = this.configs.get(chain)!;

    switch (chain) {
      case 'bitcoin':
        return this.getBitcoinTxStatus(txHash, config);
      case 'ethereum':
      case 'polygon':
      case 'bsc':
        return this.getEVMTxStatus(txHash, chain, config);
      case 'solana':
        return this.getSolanaTxStatus(txHash, config);
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }
  }

  // ----------------------------------------
  // Bitcoin
  // ----------------------------------------

  private async broadcastBitcoin(signedHex: string): Promise<BroadcastResult> {
    const config = this.configs.get('bitcoin')!;
    const rpcUrls = this.getAllowedRpcUrls('bitcoin');
    try {
      const response = await this.rpcCall(`${rpcUrls[0]}/tx`, config, {
        method: 'POST',
        body: signedHex,
        headers: { 'Content-Type': 'text/plain' }
      });
      return { success: true, txHash: response, chain: 'bitcoin' };
    } catch (error) {
      return { success: false, error: String(error), chain: 'bitcoin' };
    }
  }

  private async getBitcoinBalance(address: string, config: BroadcastConfig): Promise<BalanceInfo> {
    const safeAddress = sanitizeUrlParam(address, SAFE_ADDRESS, 'address');
    const rpcUrls = this.getAllowedRpcUrls('bitcoin');
    const response = await this.rpcCall(`${rpcUrls[0]}/address/${safeAddress}/utxo`, config);
    const balance = response.reduce((sum: number, utxo: any) => sum + utxo.value, 0) / 1e8;
    return { address, balance: String(balance), chain: 'bitcoin' };
  }

  private async getBitcoinTxStatus(txHash: string, config: BroadcastConfig) {
    const safeTxHash = sanitizeUrlParam(txHash, SAFE_TXHASH, 'txHash');
    const rpcUrls = this.getAllowedRpcUrls('bitcoin');
    const response = await this.rpcCall(`${rpcUrls[0]}/tx/${safeTxHash}`, config);
    return {
      confirmed: response.status?.confirmed || false,
      confirmations: response.status?.block_height ? 2 : 0,
      blockHeight: response.status?.block_height,
    };
  }

  // ----------------------------------------
  // EVM (Ethereum, Polygon, BSC)
  // ----------------------------------------

  private async broadcastEVM(signedHex: string, chain: ChainId): Promise<BroadcastResult> {
    const config = this.configs.get(chain)!;
    const rpcUrls = this.getAllowedRpcUrls(chain);
    try {
      const response = await this.rpcCall(rpcUrls[0]!, config, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_sendRawTransaction',
          params: [`0x${signedHex}`],
          id: Date.now(),
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      return { success: true, txHash: response.result, chain };
    } catch (error) {
      return { success: false, error: String(error), chain };
    }
  }

  private async broadcastEthereum(signedHex: string): Promise<BroadcastResult> {
    return this.broadcastEVM(signedHex, 'ethereum');
  }

  private async broadcastPolygon(signedHex: string): Promise<BroadcastResult> {
    return this.broadcastEVM(signedHex, 'polygon');
  }

  private async broadcastBSC(signedHex: string): Promise<BroadcastResult> {
    return this.broadcastEVM(signedHex, 'bsc');
  }

  private async getEVMBalance(address: string, chain: ChainId, config: BroadcastConfig): Promise<BalanceInfo> {
    const rpcUrls = this.getAllowedRpcUrls(chain);
    const response = await this.rpcCall(rpcUrls[0]!, config, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: Date.now(),
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const balanceWei = BigInt(response.result);
    const balanceEth = balanceWei / 1000000000000000000n;
    const balanceRemainder = balanceWei % 1000000000000000000n;
    const balanceStr = balanceEth.toString() + '.' + balanceRemainder.toString().padStart(18, '0');
    return { address, balance: balanceStr, chain };
  }

  private async getEVMTxStatus(txHash: string, chain: ChainId, config: BroadcastConfig) {
    const receipt = await this.rpcCall(config.rpcUrl!, config, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: Date.now(),
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!receipt.result) {
      return { confirmed: false, confirmations: 0 };
    }

    const blockNumber = await this.rpcCall(config.rpcUrl!, config, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: Date.now(),
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const currentBlock = parseInt(blockNumber.result, 16);
    const txBlock = parseInt(receipt.result.blockNumber, 16);

    return {
      confirmed: receipt.result.status === '0x1',
      confirmations: currentBlock - txBlock + 1,
      blockHeight: txBlock,
    };
  }

  // ----------------------------------------
  // Solana
  // ----------------------------------------

  private async broadcastSolana(signedHex: string): Promise<BroadcastResult> {
    const config = this.configs.get('solana')!;
    try {
      const response = await this.rpcCall(config.rpcUrl!, config, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'sendTransaction',
          params: [signedHex, { encoding: 'base64' }],
          id: Date.now(),
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      return { success: true, txHash: response.result, chain: 'solana' };
    } catch (error) {
      return { success: false, error: String(error), chain: 'solana' };
    }
  }

  private async getSolanaBalance(address: string, config: BroadcastConfig): Promise<BalanceInfo> {
    const response = await this.rpcCall(config.rpcUrl!, config, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'getBalance',
        params: [address],
        id: Date.now(),
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const lamports = response.result.value;
    const sol = lamports / 1e9;
    return { address, balance: String(sol), chain: 'solana' };
  }

  private async getSolanaTxStatus(txHash: string, config: BroadcastConfig) {
    const response = await this.rpcCall(config.rpcUrl!, config, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'getSignatureStatuses',
        params: [[txHash], { searchTransactionHistory: false }],
        id: Date.now(),
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const status = response.result?.value?.[0];
    return {
      confirmed: status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized',
      confirmations: status?.confirmations || 0,
      blockHeight: status?.slot,
    };
  }

  private getAllowedRpcUrls(chain: ChainId): string[] {
    const config = this.configs.get(chain);
    if (!config?.rpcUrls) return [];
    return Array.isArray(config.rpcUrls) ? config.rpcUrls : [config.rpcUrls];
  }

  // ----------------------------------------
  // RPC Helper
  // ----------------------------------------

  private async rpcCall(
    url: string,
    config: BroadcastConfig,
    options?: RequestInit
  ): Promise<any> {
    // SSRF protection: validate URL
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Invalid RPC protocol: ${parsedUrl.protocol}`);
    }

    const controller = new AbortController();
    const timeout = config?.timeout || 30000; // Default 30s timeout
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        ...(options?.headers as Record<string, string>),
      };

      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`RPC error ${response.status}: ${text}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
