/**
 * Ghost Pay SDK - Transaction Module
 * Black/White Minimalist Design
 * ES6 Modules
 */

import { sha256, hash256, bytesToHex, hexToBytes, ed25519Sign, ed25519Verify } from './crypto.js';
import { PoWEngine } from './pow.js';

// ============================================
// Constants
// ============================================

const TX_VERSION = 1;
const INPUT_MAX_COUNT = 100;
const OUTPUT_MAX_COUNT = 100;
const MIN_FEE_RATE = 1; // satoshis per byte
const DEFAULT_LOCKTIME = 0;

// ============================================
// Transaction Input
// ============================================

class TransactionInput {
    constructor(options = {}) {
        this.txId = options.txId || null;
        this.vout = options.vout || 0;
        this.sequence = options.sequence || 0xffffffff;
        this.signature = options.signature || null;
        this.pubkey = options.pubkey || null;
    }

    /**
     * Serialize input for signing
     */
    serialize() {
        return {
            txId: this.txId,
            vout: this.vout,
            sequence: this.sequence
        };
    }

    /**
     * Create fromUTXO
     */
    static fromUTXO(utxo, amount) {
        return new TransactionInput({
            txId: utxo.txId,
            vout: utxo.vout,
            sequence: 0xffffffff
        });
    }
}

// ============================================
// Transaction Output
// ============================================

class TransactionOutput {
    constructor(options = {}) {
        this.amount = options.amount || 0n;
        this.scriptPubKey = options.scriptPubKey || null;
        this.address = options.address || null;
        this.scriptType = options.scriptType || 'p2pkh';
    }

    /**
     * Serialize for signing
     */
    serialize() {
        return {
            amount: this.amount.toString(),
            scriptPubKey: this.scriptPubKey
        };
    }

    /**
     * Create payment output
     */
    static payment(address, amount, coin = 'BTC') {
        const output = new TransactionOutput({
            amount: BigInt(amount),
            address,
            scriptType: coin === 'BTC' ? 'p2pkh' : 'address'
        });
        
        output.scriptPubKey = output.generateScriptPubKey(coin);
        return output;
    }

    /**
     * Generate scriptPubKey
     */
    generateScriptPubKey(coin) {
        if (coin === 'BTC') {
            const pubKeyHash = hash256(hexToBytes(this.address)).slice(0, 20);
            return this.createP2PKHScript(bytesToHex(pubKeyHash));
        } else {
            return this.createP2PKHScript(this.address.replace('0x', ''));
        }
    }

    /**
     * Create P2PKH script
     */
    createP2PKHScript(pubKeyHash) {
        const asm = `OP_DUP OP_HASH160 ${pubKeyHash} OP_EQUALVERIFY OP_CHECKSIG`;
        const hex = `76a914${pubKeyHash}88ac`;
        return { asm, hex };
    }
}

// ============================================
// Transaction
// ============================================

class Transaction {
    constructor(options = {}) {
        this.version = options.version || TX_VERSION;
        this.inputs = options.inputs || [];
        this.outputs = options.outputs || [];
        this.locktime = options.locktime || DEFAULT_LOCKTIME;
        this.proof = options.proof || null;
        this.timestamp = options.timestamp || Date.now();
        this.txId = options.txId || null;
        this.coin = options.coin || 'BTC';
        this.fee = options.fee || 0n;
    }

    /**
     * Add input
     */
    addInput(input) {
        if (this.inputs.length >= INPUT_MAX_COUNT) {
            throw new Error('Maximum inputs exceeded');
        }
        this.inputs.push(input);
        this.invalidateHash();
        return this;
    }

    /**
     * Add output
     */
    addOutput(output) {
        if (this.outputs.length >= OUTPUT_MAX_COUNT) {
            throw new Error('Maximum outputs exceeded');
        }
        this.outputs.push(output);
        this.invalidateHash();
        return this;
    }

    /**
     * Remove input by index
     */
    removeInput(index) {
        if (index < 0 || index >= this.inputs.length) {
            throw new Error('Invalid input index');
        }
        this.inputs.splice(index, 1);
        this.invalidateHash();
        return this;
    }

    /**
     * Invalidate transaction hash
     */
    invalidateHash() {
        this.txId = null;
    }

    /**
     * Get serialized transaction data for signing
     */
    getSigningData(sighashType = 0x01) {
        return {
            version: this.version,
            inputs: this.inputs.map(input => input.serialize()),
            outputs: this.outputs.map(output => output.serialize()),
            locktime: this.locktime,
            sighashType
        };
    }

    /**
     * Sign transaction
     */
    async sign(privateKeyHex, sighashType = 0x01) {
        const signingData = this.getSigningData(sighashType);
        const signature = await ed25519Sign(signingData, privateKeyHex);

        // Apply signature to inputs
        for (const input of this.inputs) {
            input.signature = signature;
            input.pubkey = this.derivePubkey(privateKeyHex);
        }

        this.invalidateHash();
        return signature;
    }

    /**
     * Derive public key from private key
     */
    derivePubkey(privateKeyHex) {
        // Simplified - in production use proper key derivation
        return bytesToHex(hash256(hexToBytes(privateKeyHex))).slice(0, 64);
    }

    /**
     * Verify transaction signatures
     */
    async verify() {
        if (this.inputs.length === 0) {
            throw new Error('Transaction has no inputs');
        }

        const signingData = this.getSigningData();

        for (const input of this.inputs) {
            if (!input.signature || !input.pubkey) {
                return false;
            }

            const isValid = await ed25519Verify(signingData, input.signature, input.pubkey);
            if (!isValid) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get transaction ID (hash)
     */
    async getTxId() {
        if (this.txId) {
            return this.txId;
        }

        const data = {
            version: this.version,
            inputs: this.inputs.map(i => ({ txId: i.txId, vout: i.vout })),
            outputs: this.outputs.map(o => ({ amount: o.amount.toString(), scriptPubKey: o.scriptPubKey?.hex })),
            locktime: this.locktime
        };

        const hash = sha256(new TextEncoder().encode(JSON.stringify(data)));
        this.txId = bytesToHex(hash).reverse();
        return this.txId;
    }

    /**
     * Calculate total input amount
     */
    getTotalInput() {
        // For coinbase or generation transactions
        return this.inputs.reduce((sum, input) => {
            if (input.amount !== undefined) {
                return sum + BigInt(input.amount);
            }
            return sum;
        }, 0n);
    }

    /**
     * Calculate total output amount
     */
    getTotalOutput() {
        return this.outputs.reduce((sum, output) => sum + output.amount, 0n);
    }

    /**
     * Calculate fee
     */
    calculateFee() {
        const inputTotal = this.getTotalInput();
        const outputTotal = this.getTotalOutput();
        this.fee = inputTotal - outputTotal;
        return this.fee;
    }

    /**
     * Get fee rate (satoshis per byte)
     */
    getFeeRate() {
        const size = this.getSize();
        if (size === 0) return 0;
        return Number(this.fee) / size;
    }

    /**
     * Get transaction size in bytes (estimated)
     */
    getSize() {
        const inputSize = this.inputs.length * 148; // Typical P2PKH input size
        const outputSize = this.outputs.length * 34; // Typical P2PKH output size
        const baseSize = 10; // Version + locktime
        const overheadSize = 4; // Marker + flag + length
        
        return baseSize + overheadSize + inputSize + outputSize;
    }

    /**
     * Serialize transaction
     */
    serialize() {
        return {
            version: this.version,
            inputs: this.inputs.map(input => ({
                txId: input.txId,
                vout: input.vout,
                sequence: input.sequence,
                signature: input.signature,
                pubkey: input.pubkey
            })),
            outputs: this.outputs.map(output => ({
                amount: output.amount.toString(),
                scriptPubKey: output.scriptPubKey
            })),
            locktime: this.locktime,
            proof: this.proof,
            timestamp: this.timestamp,
            coin: this.coin,
            fee: this.fee.toString()
        };
    }

    /**
     * Convert to JSON
     */
    toJSON() {
        return this.serialize();
    }

    /**
     * Create from JSON
     */
    static fromJSON(json) {
        const tx = new Transaction({
            version: json.version,
            locktime: json.locktime,
            proof: json.proof,
            timestamp: json.timestamp,
            coin: json.coin,
            fee: BigInt(json.fee || 0)
        });

        tx.inputs = json.inputs.map(i => new TransactionInput({
            txId: i.txId,
            vout: i.vout,
            sequence: i.sequence,
            signature: i.signature,
            pubkey: i.pubkey
        }));

        tx.outputs = json.outputs.map(o => new TransactionOutput({
            amount: BigInt(o.amount),
            scriptPubKey: o.scriptPubKey
        }));

        tx.txId = json.txId || null;
        return tx;
    }
}

// ============================================
// Transaction Validator
// ============================================

class TransactionValidator {
    constructor(options = {}) {
        this.network = options.network || null;
        this.utxoSet = options.utxoSet || new Map();
        this.minFeeRate = options.minFeeRate || MIN_FEE_RATE;
    }

    /**
     * Add UTXO to set
     */
    addUTXO(txId, vout, amount, scriptPubKey) {
        const key = `${txId}:${vout}`;
        this.utxoSet.set(key, {
            txId,
            vout,
            amount: BigInt(amount),
            scriptPubKey,
            spent: false
        });
    }

    /**
     * Mark UTXO as spent
     */
    markSpent(txId, vout) {
        const key = `${txId}:${vout}`;
        const utxo = this.utxoSet.get(key);
        if (utxo) {
            utxo.spent = true;
        }
    }

    /**
     * Get UTXO
     */
    getUTXO(txId, vout) {
        return this.utxoSet.get(`${txId}:${vout}`);
    }

    /**
     * Validate transaction
     */
    async validate(tx) {
        const errors = [];

        // Basic validation
        if (tx.inputs.length === 0) {
            errors.push('Transaction has no inputs');
        }

        if (tx.outputs.length === 0) {
            errors.push('Transaction has no outputs');
        }

        // Verify inputs exist and are not spent
        for (let i = 0; i < tx.inputs.length; i++) {
            const input = tx.inputs[i];
            const utxo = this.getUTXO(input.txId, input.vout);
            
            if (!utxo) {
                errors.push(`Input ${i}: UTXO not found`);
            } else if (utxo.spent) {
                errors.push(`Input ${i}: UTXO already spent`);
            }
        }

        // Verify amounts
        const totalInput = tx.getTotalInput();
        const totalOutput = tx.getTotalOutput();

        if (totalOutput > totalInput) {
            errors.push('Output amount exceeds input amount');
        }

        // Verify signatures
        try {
            const isValid = await tx.verify();
            if (!isValid) {
                errors.push('Invalid signature');
            }
        } catch (e) {
            errors.push(`Signature verification error: ${e.message}`);
        }

        // Verify fee rate
        tx.calculateFee();
        const feeRate = tx.getFeeRate();
        if (feeRate < this.minFeeRate) {
            errors.push(`Fee rate too low: ${feeRate} < ${this.minFeeRate}`);
        }

        // Verify proof of work if present
        if (tx.proof) {
            const pow = new PoWEngine();
            const txData = { ...tx };
            delete txData.proof;
            const isValidProof = await pow.verifyProof(txData, tx.proof);
            if (!isValidProof) {
                errors.push('Invalid proof of work');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Quick validation (sync)
     */
    quickValidate(tx) {
        const errors = [];

        if (tx.inputs.length === 0) {
            errors.push('No inputs');
        }

        if (tx.outputs.length === 0) {
            errors.push('No outputs');
        }

        if (tx.getTotalOutput() > tx.getTotalInput()) {
            errors.push('Insufficient funds');
        }

        if (tx.inputs.some(i => !i.signature)) {
            errors.push('Missing signatures');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// ============================================
// SPV Verifier
// ============================================

class SPVVerifier {
    constructor(options = {}) {
        this.headers = [];
        this.merkleTree = new MerkleTree();
        this.trustedPeers = options.trustedPeers || [];
        this.maxHeaders = 2016;
    }

    /**
     * Add block header
     */
    addHeader(header) {
        this.headers.push(header);
        
        // Keep only recent headers
        if (this.headers.length > this.maxHeaders) {
            this.headers.shift();
        }
    }

    /**
     * Get header at height
     */
    getHeaderAtHeight(height) {
        if (height < 0 || height >= this.headers.length) {
            return null;
        }
        return this.headers[height];
    }

    /**
     * Verify transaction inclusion (SPV)
     */
    verifyTxInclusion(txId, merkleProof, blockHeader) {
        // Verify merkle proof
        const merkleRoot = this.merkleTree.verifyProof(txId, merkleProof);
        
        if (!merkleRoot) {
            return { valid: false, reason: 'Invalid merkle proof' };
        }

        // Verify header is in chain
        const headerValid = this.verifyHeader(blockHeader);
        if (!headerValid) {
            return { valid: false, reason: 'Invalid block header' };
        }

        // Verify merkle root matches header
        if (blockHeader.merkleRoot !== merkleRoot) {
            return { valid: false, reason: 'Merkle root mismatch' };
        }

        return {
            valid: true,
            blockHeight: blockHeader.height,
            confirmations: this.headers.length - blockHeader.height
        };
    }

    /**
     * Verify block header
     */
    verifyHeader(header) {
        const headerHash = hash256(JSON.stringify(header));
        const target = this.calculateTarget(header.bits);
        
        const hashNum = BigInt('0x' + bytesToHex(headerHash));
        if (hashNum > target) {
            return false;
        }

        const now = Date.now();
        if (header.timestamp > now + 7200000) {
            return false;
        }

        return true;
    }

    /**
     * Calculate target from bits
     */
    calculateTarget(bits) {
        const exponent = (bits >> 24) & 0xff;
        const mantissa = bits & 0x7fffff;
        return mantissa * (2 ** (8 * (exponent - 3)));
    }

    /**
     * Compare hash to target
     */
    compareHash(hash, target) {
        const hashNum = BigInt('0x' + bytesToHex(hash));
        return hashNum > target ? 1 : (hashNum < target ? -1 : 0);
    }

    /**
     * Get latest header
     */
    getLatestHeader() {
        return this.headers.length > 0 
            ? this.headers[this.headers.length - 1] 
            : null;
    }

    /**
     * Get chain work
     */
    getChainWork() {
        return this.headers.reduce((work, header) => {
            return work + BigInt(header.bits);
        }, 0n);
    }
}

// ============================================
// Merkle Tree
// ============================================

class MerkleTree {
    constructor() {
        this.tree = [];
    }

    /**
     * Build merkle tree
     */
    build(hashes) {
        if (hashes.length === 0) {
            return null;
        }

        this.tree = [hashes];

        while (this.tree[this.tree.length - 1].length > 1) {
            const level = this.tree[this.tree.length - 1];
            const nextLevel = [];

            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = i + 1 < level.length ? level[i + 1] : left;
                const combined = this.combineHash(left, right);
                nextLevel.push(combined);
            }

            this.tree.push(nextLevel);
        }

        return this.tree[this.tree.length - 1][0];
    }

    /**
     * Combine two hashes
     */
    combineHash(left, right) {
        return hash256(new Uint8Array([...left, ...right]));
    }

    /**
     * Get merkle proof
     */
    getProof(txHash) {
        const proof = [];
        let index = this.tree[0].indexOf(txHash);

        if (index === -1) {
            return null;
        }

        for (let i = 0; i < this.tree.length - 1; i++) {
            const level = this.tree[i];
            const pairIndex = index % 2 === 0 ? index + 1 : index - 1;
            const isLeft = index % 2 === 1;

            if (pairIndex < level.length) {
                proof.push({
                    hash: level[pairIndex],
                    left: isLeft
                });
            }

            index = Math.floor(index / 2);
        }

        return proof;
    }

    /**
     * Verify merkle proof
     */
    verifyProof(txHash, proof) {
        let currentHash = txHash;

        for (const step of proof) {
            currentHash = step.left
                ? this.combineHash(step.hash, currentHash)
                : this.combineHash(currentHash, step.hash);
        }

        return currentHash;
    }

    /**
     * Get root
     */
    getRoot() {
        return this.tree.length > 0 
            ? this.tree[this.tree.length - 1][0] 
            : null;
    }
}

export {
    Transaction,
    TransactionInput,
    TransactionOutput,
    TransactionValidator,
    SPVVerifier,
    MerkleTree,
    TX_VERSION,
    INPUT_MAX_COUNT,
    OUTPUT_MAX_COUNT,
    MIN_FEE_RATE,
    DEFAULT_LOCKTIME
};
