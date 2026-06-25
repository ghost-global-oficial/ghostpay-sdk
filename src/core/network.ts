/**
 * Ghost Pay SDK - Network Module (Production)
 * WebSocket signaling + WebRTC data transport
 */

import { bytesToHex, randomBytes, hash256 } from './crypto.js';
import type { PeerInfo, NetworkConfig, SignalMessage, SDKEvent, MeshPaymentIntent } from '../types/index.js';

// ============================================
// Constants
// ============================================

const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  signalingUrl: 'wss://signal.ghostpay.io',
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  maxPeers: 50,
  heartbeatInterval: 30_000,
  connectionTimeout: 15_000,
  reconnectAttempts: 5,
  reconnectDelay: 1_000,
};

// ============================================
// Event Emitter
// ============================================

type EventCallback<T = unknown> = (event: SDKEvent<T>) => void;

class EventEmitter {
  private listeners = new Map<string, Set<EventCallback>>();

  on<T = unknown>(type: string, callback: EventCallback<T>): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback as EventCallback);
  }

  off<T = unknown>(type: string, callback: EventCallback<T>): void {
    this.listeners.get(type)?.delete(callback as EventCallback);
  }

  emit<T = unknown>(type: string, data: T): void {
    const event: SDKEvent<T> = { type: type as any, data, timestamp: Date.now() };
    for (const callback of this.listeners.get(type) || []) {
      try {
        callback(event);
      } catch (e) {
        console.error(`Event listener error for ${type}:`, e);
      }
    }
  }
}

// ============================================
// Signaling Client (WebSocket)
// ============================================

class SignalingClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: NetworkConfig;
  private peerId: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _isConnected = false;

  constructor(peerId: string, config: NetworkConfig) {
    super();
    this.peerId = peerId;
    this.config = config;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.signalingUrl);

        this.ws.onopen = () => {
          this._isConnected = true;
          this.reconnectAttempts = 0;
          this.register();
          this.startHeartbeat();
          this.emit('network:started', { peerId: this.peerId });
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          this._isConnected = false;
          this.stopHeartbeat();
          this.emit('network:stopped', {});
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('Signaling WebSocket error:', error);
          reject(new Error('Failed to connect to signaling server'));
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.config.reconnectAttempts;
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
  }

  sendSignal(to: string, type: SignalMessage['type'], payload: unknown): void {
    if (!this._isConnected || !this.ws) {
      throw new Error('Not connected to signaling server');
    }

    const message: SignalMessage = {
      type,
      from: this.peerId,
      to,
      payload,
      timestamp: Date.now(),
    };

    this.ws.send(JSON.stringify(message));
  }

  private register(): void {
    this.sendSignal('server', 'register', {
      peerId: this.peerId,
      services: ['ghost_pay_transaction'],
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this._isConnected && this.ws) {
        this.sendSignal('server', 'heartbeat', { timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleMessage(data: string): void {
    try {
      const message: SignalMessage = JSON.parse(data);
      if (message.from === this.peerId) return;

      switch (message.type) {
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          this.emit('signal', message);
          break;
        case 'peers':
          this.emit('peers', message.payload);
          break;
      }
    } catch (e) {
      console.error('Failed to parse signaling message:', e);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        this.attemptReconnect();
      });
    }, delay);
  }
}

// ============================================
// Peer Connection (WebRTC)
// ============================================

class PeerConnection extends EventEmitter {
  private _peerId: string;
  private connection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private config: NetworkConfig;
  private signaling: SignalingClient;
  private _state: RTCPeerConnectionState = 'new';
  private messageQueue: unknown[] = [];

  constructor(peerId: string, config: NetworkConfig, signaling: SignalingClient) {
    super();
    this._peerId = peerId;
    this.config = config;
    this.signaling = signaling;

    this.signaling.on('signal', (event) => {
      const message = event.data as SignalMessage;
      if (message.from === this._peerId) {
        this.handleSignal(message);
      }
    });
  }

  get state(): RTCPeerConnectionState {
    return this._state;
  }

  get id(): string {
    return this._peerId;
  }

  async createOffer(): Promise<void> {
    this.connection = new RTCPeerConnection({
      iceServers: this.config.iceServers,
    });

    this.setupConnectionHandlers();
    this.dataChannel = this.connection.createDataChannel('ghost_pay', {
      ordered: true,
    });
    this.setupDataChannel(this.dataChannel);

    const offer = await this.connection.createOffer();
    await this.connection.setLocalDescription(offer);

    this.signaling.sendSignal(this._peerId, 'offer', {
      sdp: offer.sdp,
      type: offer.type,
    });
  }

  async handleOffer(sdp: string): Promise<void> {
    this.connection = new RTCPeerConnection({
      iceServers: this.config.iceServers,
    });

    this.setupConnectionHandlers();

    await this.connection.setRemoteDescription({
      type: 'offer',
      sdp,
    });

    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);

    this.signaling.sendSignal(this._peerId, 'answer', {
      sdp: answer.sdp,
      type: answer.type,
    });
  }

  async handleAnswer(sdp: string): Promise<void> {
    if (!this.connection) {
      throw new Error('No connection to set answer on');
    }

    await this.connection.setRemoteDescription({
      type: 'answer',
      sdp,
    });
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.connection) return;
    await this.connection.addIceCandidate(candidate);
  }

  private static readonly MAX_QUEUE_SIZE = 1000;

  send(data: unknown): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.dataChannel.send(message);
      return true;
    }

    if (this.messageQueue.length >= PeerConnection.MAX_QUEUE_SIZE) {
      return false; // Drop message to prevent memory exhaustion
    }
    this.messageQueue.push(data);
    return false;
  }

  close(): void {
    this.dataChannel?.close();
    this.connection?.close();
    this._state = 'closed';
    this.emit('peer:disconnected', { peerId: this._peerId });
  }

  private setupConnectionHandlers(): void {
    if (!this.connection) return;

    this.connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendSignal(this._peerId, 'ice-candidate', event.candidate.toJSON());
      }
    };

    this.connection.onconnectionstatechange = () => {
      this._state = this.connection?.connectionState || 'new';

      if (this._state === 'connected') {
        this.flushMessageQueue();
        this.emit('peer:connected', { peerId: this._peerId });
      } else if (this._state === 'failed' || this._state === 'closed') {
        this.emit('peer:disconnected', { peerId: this._peerId });
      }
    };
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this._state = 'connected';
      this.flushMessageQueue();
      this.emit('peer:connected', { peerId: this._peerId });
    };

    channel.onclose = () => {
      this._state = 'closed';
      this.emit('peer:disconnected', { peerId: this._peerId });
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('data', data);
      } catch {
        this.emit('data', event.data);
      }
    };

    channel.onerror = (error) => {
      console.error(`Data channel error with ${this._peerId}:`, error);
    };
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'offer':
          await this.handleOffer((message.payload as any).sdp);
          break;
        case 'answer':
          await this.handleAnswer((message.payload as any).sdp);
          break;
        case 'ice-candidate':
          await this.handleIceCandidate(message.payload as RTCIceCandidateInit);
          break;
      }
    } catch (e) {
      console.error(`Error handling signal from ${this._peerId}:`, e);
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      this.send(msg);
    }
  }
}

// ============================================
// Gossip Protocol
// ============================================

interface GossipMessage {
  type: 'inv' | 'getdata' | 'tx' | 'block' | 'ping' | 'pong';
  data?: unknown;
  hashes?: string[];
  hash?: string;
}

class GossipProtocol extends EventEmitter {
  private seenTransactions = new Set<string>();
  private pendingTransactions = new Map<string, { tx: unknown; timestamp: number; relays: Set<string> }>();
  private inventory = new Map<string, string>();
  private static readonly MAX_SEEN_SIZE = 10_000;

  getTransactionHash(tx: unknown): string {
    return bytesToHex(hash256(JSON.stringify(tx)));
  }

  gossipTransaction(tx: unknown, getConnectedPeers: () => PeerConnection[]): string {
    const txHash = this.getTransactionHash(tx);

    if (this.seenTransactions.has(txHash)) {
      return txHash;
    }

    // Prune seenTransactions if too large
    if (this.seenTransactions.size >= GossipProtocol.MAX_SEEN_SIZE) {
      const entries = Array.from(this.seenTransactions);
      const toRemove = entries.slice(0, Math.floor(entries.length / 2));
      for (const h of toRemove) {
        this.seenTransactions.delete(h);
      }
    }

    this.seenTransactions.add(txHash);
    this.pendingTransactions.set(txHash, {
      tx,
      timestamp: Date.now(),
      relays: new Set(),
    });

    const inv: GossipMessage = { type: 'inv', hashes: [txHash] };
    this.inventory.set(txHash, txHash);

    const peers = getConnectedPeers();
    for (const peer of peers) {
      peer.send(inv);
    }

    this.emit('transaction:sent', { hash: txHash, tx });
    return txHash;
  }

  handleInventory(peerId: string, hashes: string[], peer: PeerConnection): void {
    const newHashes = hashes.filter((h) => !this.seenTransactions.has(h));

    if (newHashes.length > 0) {
      peer.send({
        type: 'getdata',
        hashes: newHashes,
      });
    }
  }

  handleGetData(hashes: string[], peer: PeerConnection): void {
    for (const hash of hashes) {
      const pending = this.pendingTransactions.get(hash);
      if (pending) {
        peer.send({
          type: 'tx',
          hash,
          data: pending.tx,
        });
      }
    }
  }

  handleTransactionData(tx: unknown, getConnectedPeers: () => PeerConnection[]): string {
    const txHash = this.getTransactionHash(tx);

    if (!this.seenTransactions.has(txHash)) {
      this.seenTransactions.add(txHash);
      this.emit('transaction:received', { hash: txHash, tx });

      const peers = getConnectedPeers();
      for (const peer of peers) {
        peer.send({ type: 'inv', hashes: [txHash] });
      }
    }

    return txHash;
  }

  getPendingCount(): number {
    return this.pendingTransactions.size;
  }

  getSeenCount(): number {
    return this.seenTransactions.size;
  }

  cleanup(maxAge = 3_600_000): void {
    const now = Date.now();
    for (const [hash, data] of this.pendingTransactions) {
      if (now - data.timestamp > maxAge) {
        this.pendingTransactions.delete(hash);
        this.seenTransactions.delete(hash);
        this.inventory.delete(hash);
      }
    }
  }
}

class MeshCoordinator extends EventEmitter {
  private intents = new Map<string, MeshPaymentIntent>();

  createIntent(intent: Omit<MeshPaymentIntent, 'id' | 'createdAt'>): MeshPaymentIntent {
    const nextIntent: MeshPaymentIntent = {
      ...intent,
      id: bytesToHex(randomBytes(12)),
      createdAt: Date.now(),
    };
    this.intents.set(nextIntent.id, nextIntent);
    this.emit('mesh:intent-created', nextIntent);
    return nextIntent;
  }

  receiveIntent(intent: MeshPaymentIntent): void {
    this.intents.set(intent.id, intent);
    this.emit('mesh:intent-received', intent);
  }

  markSynced(intentId: string): void {
    const intent = this.intents.get(intentId);
    if (!intent) return;
    this.emit('mesh:intent-synced', intent);
  }

  listIntents(): MeshPaymentIntent[] {
    return Array.from(this.intents.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
}

export class MeshIntentManager extends EventEmitter {
  private coordinator = new MeshCoordinator();

  constructor() {
    super();
    this.coordinator.on('mesh:intent-created', (event) => this.emit('mesh:intent-created', event.data));
    this.coordinator.on('mesh:intent-received', (event) => this.emit('mesh:intent-received', event.data));
    this.coordinator.on('mesh:intent-synced', (event) => this.emit('mesh:intent-synced', event.data));
  }

  create(intent: Omit<MeshPaymentIntent, 'id' | 'createdAt'>): MeshPaymentIntent {
    return this.coordinator.createIntent(intent);
  }

  receive(intent: MeshPaymentIntent): void {
    this.coordinator.receiveIntent(intent);
  }

  sync(intentId: string): void {
    this.coordinator.markSynced(intentId);
  }

  list(): MeshPaymentIntent[] {
    return this.coordinator.listIntents();
  }
}

// ============================================
// Mesh Network
// ============================================

export class MeshNetwork extends EventEmitter {
  private _peerId: string;
  private config: NetworkConfig;
  private signaling: SignalingClient;
  private connections = new Map<string, PeerConnection>();
  private gossip: GossipProtocol;
  private meshCoordinator: MeshCoordinator;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;

  constructor(config: Partial<NetworkConfig> = {}) {
    super();
    this.config = { ...DEFAULT_NETWORK_CONFIG, ...config };
    this._peerId = bytesToHex(randomBytes(16));
    this.signaling = new SignalingClient(this._peerId, this.config);
    this.gossip = new GossipProtocol();
    this.meshCoordinator = new MeshCoordinator();

    this.setupSignalingHandlers();
    this.setupGossipHandlers();
    this.setupMeshHandlers();
  }

  get peerId(): string {
    return this._peerId;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get connectedPeers(): PeerConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.state === 'connected'
    );
  }

  get peerCount(): number {
    return this.connections.size;
  }

  async start(): Promise<void> {
    if (this._isRunning) return;

    await this.signaling.connect();
    this._isRunning = true;
    this.startHeartbeat();

    this.emit('network:started', { peerId: this._peerId });
  }

  stop(): void {
    if (!this._isRunning) return;

    this._isRunning = false;
    this.stopHeartbeat();

    for (const [peerId, conn] of this.connections) {
      conn.close();
    }
    this.connections.clear();

    this.signaling.disconnect();
    this.emit('network:stopped', {});
  }

  async connectToPeer(peerId: string): Promise<void> {
    if (this.connections.has(peerId)) {
      throw new Error(`Already connected to peer: ${peerId}`);
    }

    if (this.connections.size >= this.config.maxPeers) {
      throw new Error('Maximum peer limit reached');
    }

    const connection = new PeerConnection(peerId, this.config, this.signaling);
    this.setupPeerConnection(connection);
    this.connections.set(peerId, connection);

    await connection.createOffer();
  }

  disconnectFromPeer(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.close();
      this.connections.delete(peerId);
    }
  }

  broadcastTransaction(tx: unknown): string {
    return this.gossip.gossipTransaction(tx, () => this.connectedPeers);
  }

  createPaymentIntent(intent: Omit<MeshPaymentIntent, 'id' | 'createdAt'>): MeshPaymentIntent {
    const nextIntent = this.meshCoordinator.createIntent({ ...intent, nodeId: intent.nodeId || this._peerId });
    this.broadcastIntent(nextIntent);
    return nextIntent;
  }

  receivePaymentIntent(intent: MeshPaymentIntent): void {
    this.meshCoordinator.receiveIntent(intent);
  }

  getPaymentIntents(): MeshPaymentIntent[] {
    return this.meshCoordinator.listIntents();
  }

  sendTransaction(peerId: string, tx: unknown): boolean {
    const conn = this.connections.get(peerId);
    if (!conn || conn.state !== 'connected') {
      return false;
    }

    return conn.send({ type: 'tx', data: tx });
  }

  getStats() {
    return {
      peerId: this._peerId,
      connectedPeers: this.connectedPeers.length,
      totalPeers: this.connections.size,
      pendingTransactions: this.gossip.getPendingCount(),
      seenTransactions: this.gossip.getSeenCount(),
      isRunning: this._isRunning,
    };
  }

  private setupSignalingHandlers(): void {
    this.signaling.on('signal', (event) => {
      const message = event.data as SignalMessage;
      this.handleSignal(message);
    });

    this.signaling.on('peers', (event) => {
      const peers = event.data as PeerInfo[];
      this.emit('peer:discovered', { peers });
    });
  }

  private setupGossipHandlers(): void {
    this.gossip.on('transaction:sent', (event) => {
      this.emit('transaction:sent', event.data);
    });

    this.gossip.on('transaction:received', (event) => {
      this.emit('transaction:received', event.data);
    });
  }

  private setupMeshHandlers(): void {
    this.meshCoordinator.on('mesh:intent-created', (event) => {
      this.emit('mesh:intent-created', event.data);
    });
    this.meshCoordinator.on('mesh:intent-received', (event) => {
      this.emit('mesh:intent-received', event.data);
    });
    this.meshCoordinator.on('mesh:intent-synced', (event) => {
      this.emit('mesh:intent-synced', event.data);
    });
  }

  private broadcastIntent(intent: MeshPaymentIntent): void {
    for (const peer of this.connectedPeers) {
      peer.send({ type: 'tx', data: { meshType: 'payment-intent', intent } });
    }
  }

  private setupPeerConnection(conn: PeerConnection): void {
    conn.on('peer:connected', (event) => {
      this.emit('peer:connected', event.data);
    });

    conn.on('peer:disconnected', (event) => {
      const { peerId } = event.data as { peerId: string };
      this.connections.delete(peerId);
      this.emit('peer:disconnected', event.data);
    });

    conn.on('data', (event) => {
      this.handlePeerData(conn.id, event.data);
    });
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    const { from, type, payload } = message;

    if (!this.connections.has(from)) {
      if (this.connections.size >= this.config.maxPeers) {
        console.warn(`Rejecting peer ${from}: max limit reached`);
        return;
      }

      const conn = new PeerConnection(from, this.config, this.signaling);
      this.setupPeerConnection(conn);
      this.connections.set(from, conn);
    }

    const conn = this.connections.get(from)!;

    switch (type) {
      case 'offer':
        await conn.handleOffer((payload as any).sdp);
        break;
      case 'answer':
        await conn.handleAnswer((payload as any).sdp);
        break;
      case 'ice-candidate':
        await conn.handleIceCandidate(payload as RTCIceCandidateInit);
        break;
    }
  }

  private handlePeerData(peerId: string, data: unknown): void {
    const message = data as GossipMessage;

    switch (message.type) {
      case 'inv':
        if (message.hashes) {
          this.gossip.handleInventory(peerId, message.hashes, this.connections.get(peerId)!);
        }
        break;
      case 'getdata':
        if (message.hashes) {
          this.gossip.handleGetData(message.hashes, this.connections.get(peerId)!);
        }
        break;
      case 'tx':
        if (message.data && typeof message.data === 'object' && (message.data as any).meshType === 'payment-intent') {
          this.meshCoordinator.receiveIntent((message.data as any).intent as MeshPaymentIntent);
          break;
        }
        this.gossip.handleTransactionData(message.data, () => this.connectedPeers);
        break;
      case 'ping':
        this.connections.get(peerId)?.send({ type: 'pong', timestamp: Date.now() });
        break;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const conn of this.connectedPeers) {
        conn.send({ type: 'ping', timestamp: Date.now() });
      }
      this.gossip.cleanup();
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export { SignalingClient, PeerConnection, GossipProtocol };
export type { NetworkConfig, PeerInfo, SignalMessage, GossipMessage as GossipProtocolMessage };
