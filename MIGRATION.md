# Migration Guide: Old SDK → @ghostpay/sdk

This guide helps you migrate from the old vanilla JavaScript SDK to the new TypeScript production SDK.

---

## Overview of Changes

| Aspect | Old SDK | New SDK |
|--------|---------|---------|
| Language | JavaScript | TypeScript |
| Module System | ES6 Modules / IIFE | ESM + CJS + UMD |
| Crypto | P-256 (wrong curve) | secp256k1 (correct for BTC/ETH) |
| BIP39 | 48 words (truncated) | Full 2048 words |
| Network | `window.postMessage` | WebSocket + WebRTC |
| Storage | Plain localStorage | AES-256-GCM encrypted |
| Chains | BTC, ETH (broken addresses) | BTC, ETH, SOL, Polygon, BSC |
| Privacy | None | Stealth, Pedersen, Ring, CoinJoin, ZK |
| Webhooks | None | HMAC-SHA256 signed notifications |
| Checkout | None | Fixed, plans, custom payment pages |
| Security | Basic | PBKDF2 600k, constant-time compare, XSS protection |
| Package | No package | `@ghostpay/sdk` on npm |
| Tests | None | 87 passing tests |

---

## Installation

### Before

```html
<script src="ghostpay-sdk.js"></script>
```

### After

```bash
npm install @ghostpay/sdk
```

```typescript
import { Wallet, MeshNetwork, TransactionBuilder } from '@ghostpay/sdk';
```

Or via CDN:

```html
<script src="https://unpkg.com/@ghostpay/sdk/dist/umd/ghostpay-sdk.js"></script>
<script>
  // Global: GhostPaySDK.Wallet, GhostPaySDK.MeshNetwork, etc.
</script>
```

---

## API Changes

### Wallet

#### Creating a Wallet

**Before:**
```javascript
const wallet = new GhostPaySDK.WalletManager();
const walletData = wallet.createWallet();
```

**After:**
```typescript
import { Wallet } from '@ghostpay/sdk';

const wallet = new Wallet();
const mnemonic = wallet.generateMnemonic(); // Returns 12-word mnemonic
console.log(wallet.mnemonic);              // Access mnemonic directly
console.log(wallet.id);                    // Unique wallet ID
```

#### Getting Addresses

**Before:**
```javascript
const addresses = wallet.getAddresses();
// { btc: '1...', eth: '0x...' } (broken addresses)
```

**After:**
```typescript
wallet.getAddress('bitcoin');   // bc1q... (correct Bech32)
wallet.getAddress('ethereum');  // 0x... (correct EIP-55)
wallet.getAddress('solana');    // Base58...
wallet.getAddress('polygon');   // 0x...
wallet.getAddress('bsc');       // 0x...

wallet.getAddressMap(); // All addresses as object
```

#### Importing a Wallet

**Before:**
```javascript
const wallet = walletManager.importWallet('mnemonic words...');
```

**After:**
```typescript
import { Wallet, importWallet } from '@ghostpay/sdk';

// Option 1: Class method
const wallet = new Wallet();
wallet.importMnemonic('abandon ability able ...');

// Option 2: Utility function
const wallet = importWallet('abandon ability able ...');

// Option 3: Encrypted import
const wallet = await Wallet.importEncrypted(encryptedJson, 'password');
```

#### Exporting a Wallet

**Before:**
```javascript
const exported = wallet.exportWallet();
```

**After:**
```typescript
// Plain export
const exported = wallet.export();
// { version, id, mnemonic, addresses, createdAt }

// Encrypted export
const encrypted = await wallet.exportEncrypted('password');
```

---

### Network

#### Starting the Network

**Before:**
```javascript
const network = new GhostPaySDK.NetworkManager();
network.initialize();
network.startDiscovery();
```

**After:**
```typescript
import { MeshNetwork } from '@ghostpay/sdk';

const network = new MeshNetwork({
  signalingUrl: 'wss://signal.ghostpay.dev',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  maxPeers: 50,
});

await network.start();
console.log('Peer ID:', network.peerId);
```

#### Broadcasting Transactions

**Before:**
```javascript
network.broadcastTransaction(txData);
```

**After:**
```typescript
const txHash = network.broadcastTransaction(tx);
```

#### Peer Events

**Before:**
```javascript
network.onPeerConnected = (peer) => { /* ... */ };
network.onTransactionReceived = (tx) => { /* ... */ };
```

**After:**
```typescript
network.on('peer:connected', (event) => {
  console.log('Peer connected:', event.data.peerId);
});

network.on('transaction:received', (event) => {
  console.log('Transaction received:', event.data);
});
```

---

### Transactions

#### Building Transactions

**Before:**
```javascript
const tx = new GhostPaySDK.Transaction({
  inputs: [{ txId: '...', vout: 0 }],
  outputs: [{ address: '...', amount: 100000 }],
});
```

**After:**
```typescript
import { TransactionBuilder } from '@ghostpay/sdk';

const tx = new TransactionBuilder('bitcoin')
  .addInput('txid_abc', 0, 100000n)
  .addOutput('bc1q...', 99000n)
  .setFee(1000n)
  .build();
```

#### Signing Transactions

**Before:**
```javascript
const signed = tx.sign(privateKey);
```

**After:**
```typescript
import { TransactionSigner } from '@ghostpay/sdk';

// Sign all inputs
const signed = await TransactionSigner.signAll(tx, privateKey);

// Sign specific input
const signed = await TransactionSigner.sign(tx, privateKey, 0);

// Verify signature
const valid = TransactionSigner.verify(signedTx, 0);
```

---

### Storage

#### Encrypted Storage

**Before:**
```javascript
localStorage.setItem('wallet', JSON.stringify(walletData));
```

**After:**
```typescript
import { createSecureStorage, BrowserStorageAdapter } from '@ghostpay/sdk';

const storage = createSecureStorage(new BrowserStorageAdapter());
await storage.init('my-password');    // First time
await storage.unlock('my-password');  // Subsequent times

await storage.set('wallet', walletData);
const data = await storage.get('wallet');

storage.lock();
```

---

### Proof of Work

**Before:**
```javascript
const proof = GhostPaySDK.PoW.generateProof(data);
```

**After:**
```typescript
import { PoWEngine } from '@ghostpay/sdk';

const engine = new PoWEngine();

// Generate proof
const result = await engine.generateProof(data, 16);
// { token, difficulty, hash, iterations, duration }

// Verify proof
const valid = await engine.verifyProof(data, result.token);
// { valid: true }

// Spam prevention
const check = engine.checkTransactionSpam('peer-id', 10, 60000);
// { allowed: true, remaining: 9 }
```

---

## Type Definitions

The new SDK includes full TypeScript type definitions. Key types:

```typescript
import type {
  ChainId,           // 'bitcoin' | 'ethereum' | 'solana' | 'polygon' | 'bsc'
  WalletAddress,     // { chain, address, path, index }
  WalletInfo,        // { id, mnemonic, addresses, createdAt, version }
  WalletExport,      // { version, id, mnemonic, addresses, createdAt }
  KeyPair,           // { privateKey, publicKey, compressed }
  Transaction,       // Full transaction object
  TransactionInput,  // { txId, vout, amount, signature, publicKey }
  TransactionOutput, // { amount, address, scriptType }
  NetworkConfig,     // { signalingUrl, iceServers, maxPeers, ... }
  PeerInfo,          // { id, lastSeen, latency, score, services }
  SDKEvent,          // { type, data, timestamp }
} from '@ghostpay/sdk';
```

---

## Breaking Changes Summary

1. **No more `GhostPaySDK` global** - Use ES module imports
2. **Wallet addresses are now correct** - BTC uses Bech32, ETH uses EIP-55
3. **Transactions use BigInt** - Amounts are `bigint`, not `number`
4. **Async operations** - Many functions are now `async`
5. **Events use emitter pattern** - `network.on('event', callback)` instead of callbacks
6. **Storage requires initialization** - Must call `init()` or `unlock()` before use
7. **TypeScript types** - Use proper types for better DX and safety

---

## Example: Complete Payment Flow

### Old Way

```javascript
const wallet = new GhostPaySDK.WalletManager();
const walletData = wallet.createWallet();

const payment = GhostPaySDK.PaymentManager.createPayment({
  amount: 0.001,
  currency: 'BTC',
  recipient: 'bc1q...',
});

const result = wallet.signPayment(payment);
```

### New Way

```typescript
import { Wallet, TransactionBuilder, TransactionSigner, MeshNetwork } from '@ghostpay/sdk';

// 1. Create wallet
const wallet = new Wallet();
wallet.generateMnemonic();
console.log('Mnemonic:', wallet.mnemonic);

// 2. Connect to network
const network = new MeshNetwork();
await network.start();

// 3. Build transaction
const tx = new TransactionBuilder('bitcoin')
  .addInput('prev_txid', 0, 100000n)
  .addOutput('bc1qrecipient', 99000n)
  .setFee(1000n)
  .build();

// 4. Sign
const signed = await TransactionSigner.signAll(tx, wallet.deriveKeyPair('bitcoin').privateKey);

// 5. Broadcast
network.broadcastTransaction(signed);

// 6. Listen for confirmation
network.on('transaction:confirmed', (event) => {
  console.log('Transaction confirmed:', event.data);
});
```

---

## Need Help?

- See [SDK-README.md](./SDK-README.md) for full API reference
- Run tests: `npm test`
- Check types: `npm run typecheck`
