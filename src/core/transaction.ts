/**
 * Ghost Pay SDK - Transaction Module (Production)
 */

import { sha256, hash256, bytesToHex, hexToBytes, concatBytes, secp256k1GetPublicKey, secp256k1Sign, secp256k1Verify, ed25519PublicKeyFromPrivate, ed25519Sign, ed25519Verify } from './crypto.js';
import { PrivacyManager, StealthAddressGenerator, PedersenCommitmentEngine, RingSignatureEngine, CoinJoinEngine } from './privacy.js';
import type { Transaction, TransactionInput, TransactionOutput, TransactionStatus, ChainId, PrivacyConfig, StealthAddress, PedersenCommitment, RingSignature, CoinJoinRound, ZKRangeProof } from '../types/index.js';

// ============================================
// Constants
// ============================================

export const TX_VERSION = 2;
export const INPUT_MAX_COUNT = 100;
export const OUTPUT_MAX_COUNT = 100;
export const MIN_FEE_RATE = 1;
export const DEFAULT_LOCKTIME = 0;

// ============================================
// Transaction Builder
// ============================================

export class TransactionBuilder {
  private _version: number;
  private _inputs: TransactionInput[] = [];
  private _outputs: TransactionOutput[] = [];
  private _locktime: number;
  private _chain: ChainId;
  private _fee: bigint = 0n;

  constructor(chain: ChainId = 'bitcoin') {
    this._version = TX_VERSION;
    this._locktime = DEFAULT_LOCKTIME;
    this._chain = chain;
  }

  addInput(txId: string, vout: number, amount: bigint, scriptPubKey?: string): this {
    if (this._inputs.length >= INPUT_MAX_COUNT) {
      throw new Error('Maximum inputs exceeded');
    }
    if (!txId) throw new Error('txId must be non-empty');
    if (vout < 0) throw new Error('vout must be non-negative');
    if (amount <= 0n) throw new Error('amount must be positive');

    this._inputs.push({
      txId,
      vout,
      amount,
      scriptPubKey,
      sequence: 0xffffffff,
    });

    return this;
  }

  addOutput(address: string, amount: bigint, scriptType: TransactionOutput['scriptType'] = 'p2pkh'): this {
    if (this._outputs.length >= OUTPUT_MAX_COUNT) {
      throw new Error('Maximum outputs exceeded');
    }
    if (!address) throw new Error('address must be non-empty');
    if (amount <= 0n) throw new Error('amount must be positive');

    this._outputs.push({
      amount,
      address,
      scriptType,
    });

    return this;
  }

  setFee(fee: bigint): this {
    if (fee < 0n) throw new Error('Fee cannot be negative');
    this._fee = fee;
    return this;
  }

  calculateFee(feeRateSatPerByte: number): bigint {
    const size = this.estimateSize();
    return BigInt(Math.ceil(size * feeRateSatPerByte));
  }

  estimateSize(): number {
    const baseSize = 10;
    const inputSize = this._inputs.length * 148;
    const outputSize = this._outputs.length * 34;
    return baseSize + inputSize + outputSize;
  }

  build(): Transaction {
    if (this._inputs.length === 0) {
      throw new Error('Transaction must have at least one input');
    }

    if (this._outputs.length === 0) {
      throw new Error('Transaction must have at least one output');
    }

    const totalInput = this._inputs.reduce((sum, input) => sum + input.amount, 0n);
    const totalOutput = this._outputs.reduce((sum, output) => sum + output.amount, 0n);

    if (totalOutput > totalInput) {
      throw new Error('Output amount exceeds input amount');
    }

    if (this._fee === 0n) {
      this._fee = totalInput - totalOutput;
    }

    return {
      version: this._version,
      inputs: [...this._inputs],
      outputs: [...this._outputs],
      locktime: this._locktime,
      fee: this._fee,
      timestamp: Date.now(),
      chain: this._chain,
      status: 'pending',
    };
  }

  getHash(): string {
    const data = {
      version: this._version,
      inputs: this._inputs.map((i) => ({ txId: i.txId, vout: i.vout })),
      outputs: this._outputs.map((o) => ({ amount: o.amount.toString(), address: o.address })),
      locktime: this._locktime,
    };

    return bytesToHex(hash256(JSON.stringify(data)));
  }

  /**
   * Build a privacy-enhanced transaction
   */
  async buildWithPrivacy(params: {
    senderPrivKey: Uint8Array;
    recipientPubKey: Uint8Array;
    ringPublicKeys: Uint8Array[];
    senderIndex: number;
    privacyConfig?: Partial<PrivacyConfig>;
  }): Promise<{
    transaction: Transaction;
    privacy: {
      stealthAddress: StealthAddress | null;
      commitment: PedersenCommitment | null;
      rangeProof: ZKRangeProof | null;
      ringSignature: RingSignature | null;
      coinJoinRound: CoinJoinRound | null;
    };
  }> {
    if (this._inputs.length === 0) {
      throw new Error('Transaction must have at least one input');
    }

    const totalInput = this._inputs.reduce((sum, input) => sum + input.amount, 0n);
    const totalOutput = this._outputs.reduce((sum, output) => sum + output.amount, 0n);

    if (totalOutput > totalInput) {
      throw new Error('Output amount exceeds input amount');
    }

    if (this._fee === 0n) {
      this._fee = totalInput - totalOutput;
    }

    // Apply privacy features
    const privacyManager = new PrivacyManager(params.privacyConfig);
    const privacyResult = await privacyManager.applyPrivacy({
      senderPrivKey: params.senderPrivKey,
      recipientPubKey: params.recipientPubKey,
      amount: totalOutput,
      inputs: this._inputs.map(i => ({
        txId: i.txId,
        vout: i.vout,
        amount: i.amount,
        address: i.scriptPubKey || '',
        scriptPubKey: i.scriptPubKey,
      })),
      ringPublicKeys: params.ringPublicKeys,
      senderIndex: params.senderIndex,
    });

    // Create privacy-enhanced outputs
    const privateOutputs: TransactionOutput[] = privacyResult.privateOutputs.map(o => ({
      amount: o.amount,
      address: o.address,
      scriptType: 'p2pkh' as const,
    }));

    const transaction: Transaction = {
      version: this._version,
      inputs: [...this._inputs],
      outputs: privateOutputs.length > 0 ? privateOutputs : [...this._outputs],
      locktime: this._locktime,
      fee: this._fee,
      timestamp: Date.now(),
      chain: this._chain,
      status: 'pending',
      proof: undefined,
    };

    return {
      transaction,
      privacy: {
        stealthAddress: privacyResult.stealthAddress,
        commitment: privacyResult.commitment,
        rangeProof: privacyResult.rangeProof,
        ringSignature: privacyResult.ringSignature,
        coinJoinRound: privacyResult.coinJoinRound,
      },
    };
  }
}

// ============================================
// Transaction Signer
// ============================================

export class TransactionSigner {
  static async sign(
    tx: Transaction,
    privateKey: Uint8Array,
    inputIndex: number
  ): Promise<Transaction> {
    const input = tx.inputs[inputIndex];
    if (!input) {
      throw new Error(`Input at index ${inputIndex} not found`);
    }

    const signingData = {
      version: tx.version,
      inputs: tx.inputs.map((i) => ({ txId: i.txId, vout: i.vout })),
      outputs: tx.outputs.map((o) => ({ amount: o.amount.toString(), address: o.address })),
      locktime: tx.locktime,
      inputIndex,
    };

    const hash = hash256(JSON.stringify(signingData));
    let publicKey: Uint8Array;
    let signature: Uint8Array;

    // Use Ed25519 for Solana, secp256k1 for others
    if (tx.chain === 'solana') {
      publicKey = await ed25519PublicKeyFromPrivate(privateKey);
      signature = await ed25519Sign(hash, privateKey);
    } else {
      publicKey = secp256k1GetPublicKey(privateKey, true);
      signature = await secp256k1Sign(hash, privateKey);
    }

    const signedInputs = [...tx.inputs];
    signedInputs[inputIndex] = {
      ...input,
      signature: bytesToHex(signature),
      publicKey: bytesToHex(publicKey),
    };

    return {
      ...tx,
      inputs: signedInputs,
    };
  }

  static async signAll(tx: Transaction, privateKey: Uint8Array): Promise<Transaction> {
    let signedTx = tx;
    for (let i = 0; i < tx.inputs.length; i++) {
      signedTx = await TransactionSigner.sign(signedTx, privateKey, i);
    }
    return signedTx;
  }

  static async verify(tx: Transaction, inputIndex: number): Promise<boolean> {
    const input = tx.inputs[inputIndex];
    if (!input?.signature || !input?.publicKey) {
      return false;
    }

    const signingData = {
      version: tx.version,
      inputs: tx.inputs.map((i) => ({ txId: i.txId, vout: i.vout })),
      outputs: tx.outputs.map((o) => ({ amount: o.amount.toString(), address: o.address })),
      locktime: tx.locktime,
      inputIndex,
    };

    const hash = hash256(JSON.stringify(signingData));
    const signature = hexToBytes(input.signature);
    const publicKey = hexToBytes(input.publicKey);

    try {
      // Use Ed25519 for Solana, secp256k1 for others
      if (tx.chain === 'solana') {
        return await ed25519Verify(hash, signature, publicKey);
      }
      return secp256k1Verify(hash, signature, publicKey);
    } catch {
      return false;
    }
  }
}

// ============================================
// Transaction Validator
// ============================================

export class TransactionValidator {
  private utxoSet = new Map<string, { amount: bigint; spent: boolean }>();

  addUTXO(txId: string, vout: number, amount: bigint): void {
    const key = `${txId}:${vout}`;
    this.utxoSet.set(key, { amount, spent: false });
  }

  markSpent(txId: string, vout: number): void {
    const key = `${txId}:${vout}`;
    const utxo = this.utxoSet.get(key);
    if (utxo) {
      utxo.spent = true;
    }
  }

  async validate(tx: Transaction): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (tx.inputs.length === 0) {
      errors.push('Transaction has no inputs');
    }

    if (tx.outputs.length === 0) {
      errors.push('Transaction has no outputs');
    }

    for (let i = 0; i < tx.inputs.length; i++) {
      const input = tx.inputs[i];
      const utxoKey = `${input.txId}:${input.vout}`;
      const utxo = this.utxoSet.get(utxoKey);

      if (!utxo) {
        errors.push(`Input ${i}: UTXO not found`);
      } else if (utxo.spent) {
        errors.push(`Input ${i}: UTXO already spent`);
      } else if (utxo.amount !== input.amount) {
        errors.push(`Input ${i}: Amount mismatch`);
      }
    }

    const totalInput = tx.inputs.reduce((sum, input) => sum + input.amount, 0n);
    const totalOutput = tx.outputs.reduce((sum, output) => sum + output.amount, 0n);

    // Check that outputs + fee don't exceed inputs
    if (totalOutput + tx.fee > totalInput) {
      errors.push('Output amount + fee exceeds input amount');
    }

    if (tx.fee < 0n) {
      errors.push('Negative fee');
    }

    for (let i = 0; i < tx.inputs.length; i++) {
      const isValid = await TransactionSigner.verify(tx, i);
      if (!isValid) {
        errors.push(`Input ${i}: Invalid signature`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ============================================
// Transaction Serialization
// ============================================

export class TransactionSerializer {
  static serialize(tx: Transaction): string {
    const data = {
      v: tx.version,
      i: tx.inputs.map((i) => ({
        tx: i.txId,
        v: i.vout,
        s: i.signature,
        p: i.publicKey,
        a: i.amount.toString(),
      })),
      o: tx.outputs.map((o) => ({
        a: o.amount.toString(),
        d: o.address,
      })),
      l: tx.locktime,
      f: tx.fee.toString(),
      t: tx.timestamp,
      c: tx.chain,
    };

    return bytesToHex(new TextEncoder().encode(JSON.stringify(data)));
  }

  static deserialize(hexStr: string): Transaction {
    const json = new TextDecoder().decode(hexToBytes(hexStr));
    const data = JSON.parse(json);

    if (!data.v || !Array.isArray(data.i) || !Array.isArray(data.o)) {
      throw new Error('Invalid transaction format: missing required fields');
    }

    if (data.i.length === 0) throw new Error('Transaction has no inputs');
    if (data.o.length === 0) throw new Error('Transaction has no outputs');

    return {
      version: data.v,
      inputs: data.i.map((i: any) => {
        if (!i.tx || typeof i.v !== 'number' || !i.a) {
          throw new Error('Invalid input format');
        }
        return {
          txId: i.tx,
          vout: i.v,
          signature: i.s,
          publicKey: i.p,
          amount: BigInt(i.a),
        };
      }),
      outputs: data.o.map((o: any) => {
        if (!o.a || !o.d) {
          throw new Error('Invalid output format');
        }
        return {
          amount: BigInt(o.a),
          address: o.d,
        };
      }),
      locktime: data.l || 0,
      fee: BigInt(data.f || '0'),
      timestamp: data.t || Date.now(),
      chain: data.c || 'bitcoin',
      status: 'pending',
    };
  }

  static getTxId(tx: Transaction): string {
    const data = {
      v: tx.version,
      i: tx.inputs.map((i) => ({ tx: i.txId, v: i.vout })),
      o: tx.outputs.map((o) => ({ a: o.amount.toString(), d: o.address })),
      l: tx.locktime,
    };

    return bytesToHex(hash256(JSON.stringify(data)));
  }
}

// ============================================
// SPV Verifier
// ============================================

export class SPVVerifier {
  private headers: Array<{ hash: string; merkleRoot: string; height: number; bits: number }> = [];

  addHeader(hash: string, merkleRoot: string, height: number, bits: number): void {
    this.headers.push({ hash, merkleRoot, height, bits });
  }

  verifyInclusion(
    txHash: string,
    merkleProof: string[],
    blockHash: string
  ): { valid: boolean; confirmations?: number } {
    const header = this.headers.find((h) => h.hash === blockHash);
    if (!header) {
      return { valid: false };
    }

    let currentHash = txHash;
    for (const sibling of merkleProof) {
      // Enforce lexicographic ordering for deterministic Merkle proof
      const left = currentHash < sibling ? currentHash : sibling;
      const right = currentHash < sibling ? sibling : currentHash;
      const combined = hash256(concatBytes(hexToBytes(left), hexToBytes(right)));
      currentHash = bytesToHex(combined);
    }

    if (currentHash !== header.merkleRoot) {
      return { valid: false };
    }

    const confirmations = this.headers.length - header.height;
    return { valid: true, confirmations };
  }
}


