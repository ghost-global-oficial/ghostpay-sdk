# @ghostpay/sdk

**Decentralized P2P Cryptocurrency Payment SDK with Mesh Network & Privacy**

[![MIT License](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-104%20passing-brightgreen.svg)](#testing)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Architecture](#architecture)
- [API Reference](#api-reference)
  - [Wallet](#wallet)
  - [Checkout](#checkout)
  - [Webhook](#webhook)
  - [Privacy](#privacy)
- [Network](#network)
  - [Mesh Intent Manager](#mesh-intent-manager)
  - [Transaction](#transaction)
  - [Storage](#storage)
  - [Proof of Work](#proof-of-work)
  - [Crypto](#crypto)
  - [Chains](#chains)
- [Supported Chains](#supported-chains)
- [Testing](#testing)
- [Building](#building)
- [Security](#security)

---

## Quick Start

```typescript
import { Wallet, Checkout, WebhookClient } from '@ghostpay/sdk';

// 1. Create wallet
const wallet = new Wallet();
wallet.generateMnemonic();
console.log('BTC Address:', wallet.getAddress('bitcoin'));

// 2. Setup checkout (hosted mode - transactions via Ghost Pay hosted page)
const checkout = Checkout.fromJSON({
  receiver: { name: 'My Store', email: 'pay@mystore.com' },
  mode: 'fixed',
  fixedAmount: 25.00,
  fixedCurrency: 'USD',
  transactionMode: 'hosted', // Default - uses hosted payment page
  webhookUrl: 'https://mystore.com/api/ghostpay',
  webhookSecret: 'my-secret-key',
});

// 3. Generate payment link
const link = checkout.generatePaymentLink(
  'bc1q...',
  undefined,
  process.env.GHOSTPAY_SIGNING_KEY
);
// → https://ghostpay-landing.vercel.app/payment?receiver=...&amount=25&sig=...
```

---

## Installation

```bash
npm install @ghostpay/sdk
```

### CDN / Script Tag

```html
<script src="https://unpkg.com/@ghostpay/sdk/dist/umd/ghostpay-sdk.js"></script>
<script>
  const wallet = new GhostPaySDK.Wallet();
</script>
```

---

## Architecture

```
@ghostpay/sdk
├── core/
│   ├── crypto.ts       # SHA-256, RIPEMD-160, secp256k1, AES-256-GCM
│   ├── chains.ts       # Multi-chain configs (BTC, ETH, SOL, Polygon, BSC)
│   ├── wallet.ts       # BIP39/BIP32 HD wallet
│   ├── checkout.ts     # Payment pages: fixed, plans, custom
│   ├── webhook.ts      # Webhook notifications + verification
│   ├── privacy.ts      # Stealth addresses, Pedersen, Ring, CoinJoin, ZK
│   ├── network.ts      # WebSocket signaling + WebRTC mesh
│   ├── transaction.ts  # TX builder, signer, validator, SPV
│   ├── pow.ts          # Hashcash anti-spam, rate limiting
│   └── storage.ts      # Encrypted storage, sessions
└── types/
    └── index.ts        # TypeScript interfaces
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `@noble/hashes` | SHA-256, RIPEMD-160, HMAC |
| `@noble/secp256k1` | ECDSA signatures |
| `@scure/bip39` | BIP39 mnemonic (2048 words) |
| `@scure/bip32` | HD key derivation |
| `@scure/base` | Hex, Base58, Bech32 encoding |

---

## API Reference

### Wallet

```typescript
import { Wallet, createWallet, importWallet, validateMnemonic, generateNewMnemonic } from '@ghostpay/sdk';
```

#### `new Wallet()`

Creates a new empty wallet instance.

#### `wallet.generateMnemonic(wordCount?: 12 | 24): string`

Generates a new BIP39 mnemonic and derives all chain addresses.

```typescript
const wallet = new Wallet();
const mnemonic = wallet.generateMnemonic(); // 12 words
```

#### `wallet.importMnemonic(mnemonic: string): void`

Imports wallet from an existing BIP39 mnemonic.

#### `wallet.getAddress(chain: ChainId): string`

Returns the address for a specific chain.

```typescript
wallet.getAddress('bitcoin');   // bc1q...
wallet.getAddress('ethereum');  // 0x...
wallet.getAddress('solana');    // Base58...
```

#### `wallet.exportEncrypted(password: string): Promise<string>`

Exports wallet encrypted with a password (PBKDF2 600k iterations + AES-256-GCM).

```typescript
const encrypted = await wallet.exportEncrypted('my-secure-password');
```

#### `Wallet.importEncrypted(encryptedJson: string, password: string): Promise<Wallet>`

Static method to import an encrypted wallet.

#### `wallet.sign(data: Uint8Array, chain: ChainId): Promise<Uint8Array>`

Sign data with real secp256k1 ECDSA signature.

```typescript
const signature = await wallet.sign(messageHash, 'bitcoin');
```

---

### Checkout

Configurable payment pages: fixed amount, plans, or custom amount. Supports **hosted** mode (via Ghost Pay payment page) or **local** mode (custom URI scheme).

```typescript
import { Checkout, createFixedCheckout, createPlanCheckout, createCustomCheckout } from '@ghostpay/sdk';
```

#### Transaction Modes

| Mode | Description |
|------|-------------|
| `hosted` (default) | Transactions are processed via the hosted Ghost Pay payment page at `https://ghostpay-landing.vercel.app/payment` |
| `local` | Transactions use the `ghostpay:payment?` URI scheme for local processing |

```typescript
const checkout = Checkout.fromJSON({
  receiver: { name: 'My Store' },
  mode: 'fixed',
  fixedAmount: 25.00,
  fixedCurrency: 'USD',
  transactionMode: 'hosted', // or 'local'
  hostedPaymentUrl: 'https://custom-domain.com/payment', // optional override
});
```

#### Fixed Amount

```typescript
const checkout = Checkout.fromJSON({
  receiver: { name: 'My Store', email: 'pay@mystore.com' },
  mode: 'fixed',
  fixedAmount: 25.00,
  fixedCurrency: 'USD',
  supportedChains: ['bitcoin', 'ethereum'],
});
```

#### Plans

```typescript
const checkout = Checkout.fromJSON({
  receiver: { name: 'My Store' },
  mode: 'plans',
  plans: [
    { id: 'monthly', name: 'Monthly', price: 12.00, currency: 'USD', period: '/mo' },
    { id: 'annual', name: 'Annual', price: 10.00, currency: '/mo', period: '/mo', selected: true },
  ],
});
```

#### Custom Amount

```typescript
const checkout = createCustomCheckout({ name: 'My Store' }, 'USD');
const link = checkout.generatePaymentLink('bc1q...', 50.00);
```

#### `checkout.generatePaymentLink(address, amount?, signingKey?): string`

Generates a payment link with optional HMAC signature.

```typescript
// Hosted mode (default)
const link = checkout.generatePaymentLink('bc1q...', undefined, 'my-signing-key');
// → https://ghostpay-landing.vercel.app/payment?receiver=...&amount=25&sig=hmac-sha256...

// Local mode
const localCheckout = new Checkout({
  receiver: { name: 'My Store' },
  mode: 'fixed',
  fixedAmount: 25.00,
  transactionMode: 'local',
});
const localLink = localCheckout.generatePaymentLink('bc1q...');
// → ghostpay:payment?receiver=...&amount=25
```

#### `checkout.openPaymentPage(address, amount?, signingKey?): string`

Opens the payment page in a new browser tab (hosted mode only).

```typescript
checkout.openPaymentPage('bc1q...'); // Opens new tab with hosted payment page
```

#### `checkout.notifyWebhook(event, data): Promise<{ success, statusCode }>`

Send webhook notification when payment status changes.

```typescript
await checkout.notifyWebhook('payment.confirmed', {
  txHash: 'abc123...',
  amount: 2500000000n,
  from: '1A1zP1...',
  to: '1BvBMSE...',
  confirmations: 3,
});
```

---

### Webhook

Stateless webhook notifications for payment confirmations.

```typescript
import { WebhookClient, WebhookVerifier } from '@ghostpay/sdk';
```

#### Sending Webhooks

```typescript
const client = new WebhookClient({
  url: 'https://mystore.com/api/ghostpay-webhook',
  secret: 'my-webhook-secret',
});

const result = await client.notify('payment.confirmed', {
  txHash: 'abc123...',
  chain: 'bitcoin',
  amount: 2500000000n,
  currency: 'USD',
  from: '1A1zP1...',
  to: '1BvBMSE...',
  confirmations: 3,
  receiver: 'My Store',
  plan: 'monthly',
  nonce: '...',
});
// { success: true, statusCode: 200 }
```

#### Verifying Webhooks (Server-Side)

```typescript
import { WebhookVerifier } from '@ghostpay/sdk';

const verifier = new WebhookVerifier('my-webhook-secret');

// In your webhook handler:
app.post('/ghostpay-webhook', (req, res) => {
  const signature = req.headers['x-ghostpay-signature'];
  const isValid = verifier.verify(req.body, signature);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process payment confirmation
  const { event, transaction, checkout } = req.body;
  res.status(200).json({ received: true });
});
```

#### Webhook Payload

```json
{
  "event": "payment.confirmed",
  "transaction": {
    "hash": "abc123...",
    "chain": "bitcoin",
    "amount": "2500000000",
    "currency": "USD",
    "from": "1A1zP1...",
    "to": "1BvBMSE...",
    "confirmations": 3
  },
  "checkout": {
    "receiver": "My Store",
    "plan": "monthly",
    "nonce": "..."
  },
  "timestamp": 1719123456789,
  "signature": "hmac-sha256-signature"
}
```

---

### Privacy

5 privacy techniques to hide transaction traces on blockchain.

```typescript
import {
  StealthAddressGenerator,
  PedersenCommitmentEngine,
  RingSignatureEngine,
  CoinJoinEngine,
  PrivacyManager,
} from '@ghostpay/sdk';
```

#### Stealth Addresses

One-time addresses per transaction — real address never exposed on-chain.

```typescript
const stealth = StealthAddressGenerator.generate(recipientPubKey);
// { stealthPubKey, ephemeralPubKey, viewTag, address }

// Generate batch
const stealths = StealthAddressGenerator.generateBatch(recipientPubKey, 10);

// Check ownership
const belongs = StealthAddressGenerator.belongsTo(stealth, viewKey, spendKey);
```

#### Pedersen Commitments

Hide transaction amounts (C = v*G + r*H).

```typescript
const commitment = PedersenCommitmentEngine.commit(2500000000n);
// { commitment, blindingFactor, value }

// Verify
const valid = PedersenCommitmentEngine.verify(commitment);

// Homomorphic addition
const sum = PedersenCommitmentEngine.add(commitment1, commitment2);

// Range proof (proves value is valid without revealing)
const rangeProof = PedersenCommitmentEngine.createRangeProof(commitment, 64);
```

#### Ring Signatures

Sign as part of a group — impossible to determine who signed.

```typescript
const ringSig = RingSignatureEngine.sign(
  message,
  signerPrivateKey,
  publicKeys, // Ring members
  0           // Signer index
);

// Verify
const valid = RingSignatureEngine.verify(ringSig);

// With decoy keys
const ringSig = RingSignatureEngine.signWithDecoys(
  message, signerKey, allPublicKeys, signerIndex, 11
);
```

#### CoinJoin Mixing

Pool transactions to break traceability.

```typescript
const round = CoinJoinEngine.createRound(inputs, fee);

// Sign
await CoinJoinEngine.signRound(round.id, inputIndex, privateKey);

// Verify
const valid = CoinJoinEngine.verifyRound(round.id);

// Finalize
const finalized = CoinJoinEngine.finalizeRound(round.id);
```

#### Privacy Manager

Orchestrates all privacy features.

```typescript
const pm = new PrivacyManager({
  useStealthAddresses: true,
  usePedersenCommitments: true,
  useRingSignatures: true,
  useCoinJoin: true,
  ringSize: 11,
});

const result = await pm.applyPrivacy({
  senderPrivKey,
  recipientPubKey,
  amount: 2500000000n,
  inputs: [...],
  ringPublicKeys: [...],
  senderIndex: 0,
});
// { stealthAddress, commitment, rangeProof, ringSignature, coinJoinRound, privateOutputs }
```

---

### Network

```typescript
import { MeshNetwork } from '@ghostpay/sdk';
```

#### `new MeshNetwork(config?)`

```typescript
const network = new MeshNetwork({
  signalingUrl: 'wss://signal.ghostpay.dev',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  maxPeers: 50,
});
```

#### `network.start(): Promise<void>`

```typescript
await network.start();
```

#### `network.broadcastTransaction(tx: Transaction): string`

```typescript
const txHash = network.broadcastTransaction(tx);
```

#### Events

```typescript
network.on('peer:connected', (event) => console.log('Peer:', event.data));
network.on('transaction:received', (event) => console.log('TX:', event.data));
```

### Mesh Intent Manager

Use this API when you want to create, list, receive, and sync payment intents as first-class
mesh events without reaching into the internal network classes.

```typescript
import { MeshIntentManager } from '@ghostpay/sdk';

const mesh = new MeshIntentManager();

mesh.on('mesh:intent-created', (event) => {
  console.log('Intent created:', event.data);
});

const intent = mesh.create({
  receiver: 'My Store',
  amount: 49.99,
  currency: 'USD',
  chain: 'bitcoin',
  address: 'bc1q...',
  nonce: 'abc123',
  nodeId: 'local-node-1',
});

const allIntents = mesh.list();
mesh.sync(intent.id);
```

Events:

- `mesh:intent-created`
- `mesh:intent-received`
- `mesh:intent-synced`

---

### Transaction

```typescript
import { TransactionBuilder, TransactionSigner, TransactionValidator, TransactionSerializer, SPVVerifier } from '@ghostpay/sdk';
```

#### `TransactionBuilder`

```typescript
const tx = new TransactionBuilder('bitcoin')
  .addInput('txid_abc', 0, 100000n)
  .addOutput('bc1q...', 99000n)
  .setFee(1000n)
  .build();

// Build with privacy
const { transaction, privacy } = await tx.buildWithPrivacy({
  senderPrivKey, recipientPubKey, ringPublicKeys, senderIndex: 0,
});
```

#### `TransactionSigner`

```typescript
const signed = await TransactionSigner.signAll(tx, privateKey);
const valid = TransactionSigner.verify(signed, 0);
```

#### `TransactionSerializer`

```typescript
const hex = TransactionSerializer.serialize(tx);
const deserialized = TransactionSerializer.deserialize(hex);
```

---

### Storage

```typescript
import { SecureStorage, SessionManager, WalletStorage } from '@ghostpay/sdk';
```

#### `SecureStorage`

```typescript
const storage = createSecureStorage();
await storage.init('password'); // First time
await storage.unlock('password'); // Subsequent
await storage.set('key', { secret: 'value' });
const data = await storage.get('key');
```

#### `SessionManager`

```typescript
const sessionManager = createSessionManager(storage);
const sessionId = await sessionManager.createSession('wallet-id', 3600000);
const session = await sessionManager.getSession();
```

---

### Proof of Work

```typescript
import { PoWEngine, Hashcash, SpamPrevention } from '@ghostpay/sdk';
```

```typescript
const engine = new PoWEngine();
const proof = await engine.generateProof(transactionData, 16);
const result = await engine.verifyProof(transactionData, proof.token);
```

---

### Crypto

```typescript
import {
  sha256, hash256, hash160, hmacSha256,
  aesEncrypt, aesDecrypt, pbkdf2DeriveKey,
  secp256k1GetPublicKey, secp256k1Sign, secp256k1Verify,
  bytesToHex, hexToBytes, randomBytes, constantTimeCompare,
} from '@ghostpay/sdk';
```

#### Hash Functions

```typescript
const hash = sha256('hello');
const hash = hash256(data);        // Double SHA-256
const hash = hash160(publicKey);   // RIPEMD160(SHA256(key))
```

#### AES-256-GCM

```typescript
const key = await generateAESKey();
const encrypted = await aesEncrypt({ secret: 'data' }, key);
const decrypted = await aesDecrypt(encrypted, key);
```

#### PBKDF2 (600,000 iterations)

```typescript
const { key, salt } = await pbkdf2DeriveKey('password');
```

#### secp256k1

```typescript
const pubKey = secp256k1GetPublicKey(privKey, true);
const sig = await secp256k1Sign(messageHash, privKey);
const valid = secp256k1Verify(messageHash, sig, pubKey);
```

---

### Chains

```typescript
import { CHAINS, getChainConfig, generateAddress } from '@ghostpay/sdk';

const btcConfig = getChainConfig('bitcoin');
const address = generateAddress('bitcoin', publicKey);
```

---

## Supported Chains

| Chain | Symbol | Derivation Path | Address Format | Decimals |
|-------|--------|-----------------|----------------|----------|
| Bitcoin | BTC | `m/44'/0'/0'/0/0` | Bech32 (bc1q...) | 8 |
| Ethereum | ETH | `m/44'/60'/0'/0/0` | EIP-55 (0x...) | 18 |
| Solana | SOL | `m/44'/501'/0'` | Base58 | 9 |
| Polygon | MATIC | `m/44'/60'/0'/0/0` | EVM (0x...) | 18 |
| BNB Chain | BNB | `m/44'/60'/0'/0/0` | EVM (0x...) | 18 |

---

## Testing

```bash
npm test              # Run all 87 tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Test Structure

```
tests/
├── crypto.test.ts      # 17 tests - Hash, AES, PBKDF2, secp256k1
├── wallet.test.ts      # 15 tests - BIP39, HD derivation, encrypt/decrypt
├── transaction.test.ts # 11 tests - Builder, serializer, multi-input/output
├── pow.test.ts         # 12 tests - Hashcash, spam prevention, difficulty
├── storage.test.ts     # 17 tests - SecureStorage, sessions, wallets
└── checkout.test.ts    # 15 tests - Checkout modes, payment links
```

---

## Building

```bash
npm run build          # Build all formats (ESM + CJS + UMD + Types)
npm run build:esm      # ES Modules only
npm run build:cjs      # CommonJS only
npm run build:umd      # UMD bundle only
npm run build:types    # TypeScript declarations only
npm run typecheck      # Type checking without emit
npm run lint           # ESLint
```

### Output Structure

```
dist/
├── esm/index.js           # ES Modules (tree-shakeable)
├── cjs/index.cjs.js       # CommonJS
├── umd/ghostpay-sdk.js    # UMD bundle (minified)
└── types/index.d.ts       # TypeScript declarations
```

---

## Security

### Security Audit Fixes Applied

| Issue | Fix |
|-------|-----|
| Fake EC operations in privacy module | Real secp256k1 via `@noble/secp256k1` |
| `sign()` returning hash instead of signature | Real secp256k1 ECDSA signing |
| PBKDF2 with 2048 iterations | Increased to 600,000 |
| Timing leak in `constantTimeCompare` | Constant-time comparison |
| PBKDF2 hash mismatch (SHA-256 vs SHA-512) | Unified to SHA-256 |
| innerHTML XSS vulnerabilities | `escapeHtml()` + `textContent` |
| Password stored in sessionStorage | Removed, kept in memory only |
| Unsigned payment links | HMAC-SHA256 signature |
| `Math.random()` in nonce generation | `crypto.getRandomValues()` |
| `base58Decode` leading zeros bug | Fixed zero restoration |
| `seenTransactions` memory leak | Pruning with 10k limit |
| Session overwrite | Multiple concurrent sessions |

### Best Practices

- **Passwords**: Never stored in plaintext, always encrypted with PBKDF2 + AES-256-GCM
- **Signing**: Real secp256k1 ECDSA, not hash placeholders
- **Privacy**: Real elliptic curve math for Stealth, Pedersen, Ring, CoinJoin
- **Webhooks**: HMAC-SHA256 signed, constant-time verification
- **Input Validation**: Transaction deserialization validates all fields

---

## License

MIT License - See [LICENSE](../LICENSE) for details.
