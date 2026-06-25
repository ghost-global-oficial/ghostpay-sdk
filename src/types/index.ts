// ============================================
// Chain Configuration Types
// ============================================

export type ChainId = 'bitcoin' | 'ethereum' | 'solana' | 'polygon' | 'bsc';

export interface ChainConfig {
  id: ChainId;
  name: string;
  symbol: string;
  coinType: number;
  derivationPath: string;
  addressPrefix: string;
  decimals: number;
  explorerUrl: string;
  rpcUrl?: string;
}

// ============================================
// Wallet Types
// ============================================

export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  compressed: boolean;
}

export interface DerivedKey {
  privateKey: string;
  publicKey: string;
  chainCode: string;
  path: string;
  index: number;
}

export interface WalletAddress {
  chain: ChainId;
  address: string;
  path: string;
  index: number;
}

export interface WalletInfo {
  id: string;
  addresses: WalletAddress[];
  createdAt: number;
  version: number;
}

export interface WalletExport {
  version: number;
  id: string;
  mnemonic: string;
  addresses: WalletAddress[];
  createdAt: number;
}

// ============================================
// Transaction Types
// ============================================

export interface TransactionInput {
  txId: string;
  vout: number;
  amount: bigint;
  scriptPubKey?: string;
  sequence?: number;
  signature?: string;
  publicKey?: string;
}

export interface TransactionOutput {
  amount: bigint;
  address: string;
  scriptPubKey?: string;
  scriptType?: 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'op_return';
}

export interface Transaction {
  id?: string;
  version: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  locktime: number;
  fee: bigint;
  timestamp: number;
  chain: ChainId;
  status: TransactionStatus;
  proof?: ProofOfWork;
  blockHeight?: number;
  confirmations?: number;
}

export type TransactionStatus = 'pending' | 'broadcasting' | 'confirmed' | 'failed';

export interface ProofOfWork {
  token: string;
  difficulty: number;
  resource: string;
  timestamp: number;
  counter: number;
}

// ============================================
// Network Types
// ============================================

export interface PeerInfo {
  id: string;
  address?: string;
  port?: number;
  lastSeen: number;
  latency: number;
  score: number;
  services: string[];
  version: string;
}

export interface NetworkConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  maxPeers: number;
  heartbeatInterval: number;
  connectionTimeout: number;
  reconnectAttempts: number;
  reconnectDelay: number;
}

export interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'register' | 'peers' | 'heartbeat';
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
}

export interface GossipMessage {
  type: 'inv' | 'getdata' | 'tx' | 'block' | 'ping' | 'pong';
  data: unknown;
  hash?: string;
}

export interface MeshPaymentIntent {
  id: string;
  receiver: string;
  amount: number;
  currency: string;
  chain: ChainId;
  address: string;
  nonce: string;
  nodeId?: string;
  createdAt: number;
}

// ============================================
// Storage Types
// ============================================

export interface StorageAdapter {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export interface EncryptedData {
  iv: string;
  data: string;
  tag?: string;
}

export interface SessionData {
  id: string;
  walletId: string;
  expiresAt: number;
  createdAt: number;
}

// ============================================
// PoW Types
// ============================================

export interface HashcashToken {
  version: number;
  bits: number;
  resource: string;
  timestamp: number;
  challenge: string;
  counter: number;
}

export interface PoWResult {
  token: string;
  difficulty: number;
  hash: string;
  iterations: number;
  duration: number;
}

// ============================================
// Checkout / Payment Config Types
// ============================================

export type PaymentMode = 'fixed' | 'custom' | 'plans';

export interface ReceiverInfo {
  name: string;
  email?: string;
  logo?: string;
  walletAddress?: string;
}

export interface PaymentPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  period?: string;
  features?: string[];
  selected?: boolean;
}

export interface CheckoutConfig {
  receiver: ReceiverInfo;
  mode: PaymentMode;
  plans?: PaymentPlan[];
  fixedAmount?: number;
  fixedCurrency?: string;
  fixedChain?: ChainId;
  description?: string;
  supportedChains?: ChainId[];
  metadata?: Record<string, string>;
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface CheckoutData {
  receiver: ReceiverInfo;
  plan: PaymentPlan | null;
  amount: number;
  currency: string;
  chain: ChainId;
  address: string;
  paymentLink: string;
  nonce: string;
  timestamp: number;
  metadata?: Record<string, string>;
}

// ============================================
// Event Types
// ============================================

export type SDKEventType =
  | 'wallet:created'
  | 'wallet:imported'
  | 'wallet:locked'
  | 'wallet:unlocked'
  | 'peer:connected'
  | 'peer:disconnected'
  | 'peer:discovered'
  | 'mesh:intent-created'
  | 'mesh:intent-received'
  | 'mesh:intent-synced'
  | 'transaction:sent'
  | 'transaction:received'
  | 'transaction:confirmed'
  | 'network:started'
  | 'network:stopped'
  | 'privacy:stealth-generated'
  | 'privacy:ring-signed'
  | 'privacy:coinjoin-mixed'
  | 'error';

export interface SDKEvent<T = unknown> {
  type: SDKEventType;
  data: T;
  timestamp: number;
}

// ============================================
// Privacy Types
// ============================================

export interface StealthAddress {
  stealthPubKey: string;
  ephemeralPubKey: string;
  viewTag: number;
  scanIndex: number;
  address: string;
}

export interface PedersenCommitment {
  commitment: string;
  blindingFactor: string;
}

export interface PedersenOpen {
  value: bigint;
  blindingFactor: string;
}

export interface RingSignature {
  keyImages: string[];
  signatures: string[];
  publicKeys: string[];
  messageHash: string;
  ringSize: number;
  c0: string; // Initial challenge scalar for verification
}

export interface CoinJoinInput {
  txId: string;
  vout: number;
  amount: bigint;
  address: string;
  scriptPubKey?: string;
}

export interface CoinJoinOutput {
  amount: bigint;
  address: string;
}

export interface CoinJoinRound {
  id: string;
  inputs: CoinJoinInput[];
  outputs: CoinJoinOutput[];
  mixedAmounts: bigint[];
  fee: bigint;
  timestamp: number;
  signatures: string[];
}

export interface ZKRangeProof {
  proof: string;
  commitment: string;
  bitLength: number;
  min: bigint;
  max: bigint;
}

export interface PrivacyConfig {
  stealthAddressCount: number;
  ringSize: number;
  mixingRounds: number;
  anonymityThreshold: number;
  useStealthAddresses: boolean;
  usePedersenCommitments: boolean;
  useRingSignatures: boolean;
  useCoinJoin: boolean;
  useZKRangeProofs: boolean;
}

// ============================================
// Webhook Types
// ============================================

export interface WebhookPayload {
  event: 'payment.confirmed' | 'payment.pending' | 'payment.failed';
  transaction: {
    hash: string;
    chain: ChainId;
    amount: string;
    currency: string;
    from: string;
    to: string;
    confirmations: number;
  };
  checkout: {
    receiver: string;
    plan: string | null;
    nonce: string;
  };
  timestamp: number;
  signature: string;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  retryAttempts?: number;
  retryDelay?: number;
}
