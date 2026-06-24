/**
 * Ghost Pay SDK - Network Module (P2P Mesh)
 * Black/White Minimalist Design
 * ES6 Modules
 */

import { hash256, bytesToHex, hexToBytes, randomBytes } from './crypto.js';

// ============================================
// Constants
// ============================================

const PEER_DISCOVERY_INTERVAL = 30000;
const GOSSIP_INTERVAL = 5000;
const MAX_PEERS = 50;
const HEARTBEAT_INTERVAL = 10000;
const CONNECTION_TIMEOUT = 15000;

// ============================================
// Peer Discovery (mDNS Simulation)
// ============================================

class PeerDiscovery {
    constructor() {
        this.localPeerId = bytesToHex(randomBytes(16));
        this.discoveredPeers = new Map();
        this.services = new Map();
        this.onPeerDiscovered = null;
        this.onPeerLost = null;
    }

    /**
     * Start peer discovery
     */
    start() {
        this.broadcastPresence();
        this.startDiscoveryLoop();
        this.startListening();
    }

    /**
     * Stop peer discovery
     */
    stop() {
        this.broadcastGoodbye();
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
        }
    }

    /**
     * Broadcast local presence
     */
    broadcastPresence() {
        const presence = {
            type: 'announce',
            peerId: this.localPeerId,
            timestamp: Date.now(),
            services: ['ghost_pay_transaction', 'ghost_pay_wallet'],
            port: 0
        };
        this.broadcast(presence);
    }

    /**
     * Broadcast goodbye
     */
    broadcastGoodbye() {
        const goodbye = {
            type: 'goodbye',
            peerId: this.localPeerId,
            timestamp: Date.now()
        };
        this.broadcast(goodbye);
    }

    /**
     * Start discovery loop
     */
    startDiscoveryLoop() {
        this.discoveryInterval = setInterval(() => {
            this.cleanupStalePeers();
            this.broadcastPresence();
        }, PEER_DISCOVERY_INTERVAL);
    }

    /**
     * Start listening for announcements
     */
    startListening() {
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('message', (event) => {
                this.handleMessage(event.data);
            });
        }
    }

    /**
     * Handle incoming message
     */
    handleMessage(data) {
        if (!data || !data.peerId) return;
        if (data.peerId === this.localPeerId) return;

        switch (data.type) {
            case 'announce':
                this.addPeer(data);
                break;
            case 'goodbye':
                this.removePeer(data.peerId);
                break;
            case 'probe':
                this.handleProbe(data);
                break;
            case 'probe_response':
                this.handleProbeResponse(data);
                break;
        }
    }

    /**
     * Add discovered peer
     */
    addPeer(peerInfo) {
        const existing = this.discoveredPeers.get(peerInfo.peerId);
        
        this.discoveredPeers.set(peerInfo.peerId, {
            ...peerInfo,
            lastSeen: Date.now(),
            connected: existing?.connected || false
        });

        if (!existing && this.onPeerDiscovered) {
            this.onPeerDiscovered(peerInfo);
        }
    }

    /**
     * Remove peer
     */
    removePeer(peerId) {
        if (this.discoveredPeers.has(peerId)) {
            const peer = this.discoveredPeers.get(peerId);
            this.discoveredPeers.delete(peerId);
            
            if (this.onPeerLost) {
                this.onPeerLost(peer);
            }
        }
    }

    /**
     * Cleanup stale peers
     */
    cleanupStalePeers() {
        const now = Date.now();
        const staleThreshold = PEER_DISCOVERY_INTERVAL * 3;

        for (const [peerId, peer] of this.discoveredPeers) {
            if (now - peer.lastSeen > staleThreshold) {
                this.removePeer(peerId);
            }
        }
    }

    /**
     * Handle probe request
     */
    handleProbe(probe) {
        const response = {
            type: 'probe_response',
            peerId: this.localPeerId,
            targetId: probe.peerId,
            timestamp: Date.now()
        };
        this.broadcast(response);
    }

    /**
     * Handle probe response
     */
    handleProbeResponse(response) {
        const peer = this.discoveredPeers.get(response.peerId);
        if (peer) {
            peer.lastSeen = Date.now();
            peer.latency = Date.now() - response.timestamp;
        }
    }

    /**
     * Broadcast message to network
     */
    broadcast(message) {
        if (typeof window !== 'undefined' && window.parent !== window) {
            window.parent.postMessage(message, '*');
        }
        if (typeof window !== 'undefined') {
            window.postMessage(message, '*');
        }
    }

    /**
     * Get all discovered peers
     */
    getPeers() {
        return Array.from(this.discoveredPeers.values());
    }

    /**
     * Get peers with specific service
     */
    getPeersWithService(service) {
        return this.getPeers().filter(peer => 
            peer.services && peer.services.includes(service)
        );
    }
}

// ============================================
// WebRTC Peer Connection
// ============================================

class PeerConnection {
    constructor(peerId, config = {}) {
        this.peerId = peerId;
        this.connectionId = bytesToHex(randomBytes(8));
        this.connection = null;
        this.dataChannel = null;
        this.config = {
            iceServers: config.iceServers || [
                { urls: 'stun:stun.l.google.com:19302' }
            ],
            ...config
        };
        this.state = 'new';
        this.onDataReceived = null;
        this.onStateChange = null;
        this.messageQueue = [];
    }

    /**
     * Create connection as initiator
     */
    async createOffer() {
        this.connection = new RTCPeerConnection(this.config);
        this.setupConnectionHandlers();

        this.dataChannel = this.connection.createDataChannel('ghost_pay', {
            ordered: true
        });
        this.setupDataChannel(this.dataChannel);

        const offer = await this.connection.createOffer();
        await this.connection.setLocalDescription(offer);

        this.state = 'connecting';
        this.notifyStateChange();

        return {
            type: 'offer',
            sdp: offer.sdp,
            connectionId: this.connectionId
        };
    }

    /**
     * Handle incoming offer
     */
    async handleOffer(offer) {
        this.connection = new RTCPeerConnection(this.config);
        this.setupConnectionHandlers();

        await this.connection.setRemoteDescription({
            type: 'offer',
            sdp: offer.sdp
        });

        const answer = await this.connection.createAnswer();
        await this.connection.setLocalDescription(answer);

        this.state = 'connecting';
        this.notifyStateChange();

        return {
            type: 'answer',
            sdp: answer.sdp,
            connectionId: this.connectionId
        };
    }

    /**
     * Handle answer
     */
    async handleAnswer(answer) {
        await this.connection.setRemoteDescription({
            type: 'answer',
            sdp: answer.sdp
        });
    }

    /**
     * Add ICE candidate
     */
    async addIceCandidate(candidate) {
        if (this.connection) {
            await this.connection.addIceCandidate(candidate);
        }
    }

    /**
     * Setup connection handlers
     */
    setupConnectionHandlers() {
        this.connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'ice_candidate',
                    candidate: event.candidate
                });
            }
        };

        this.connection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel(this.dataChannel);
        };

        this.connection.onconnectionstatechange = () => {
            this.state = this.connection.connectionState;
            this.notifyStateChange();

            if (this.state === 'connected') {
                this.flushMessageQueue();
            }
        };
    }

    /**
     * Setup data channel handlers
     */
    setupDataChannel(channel) {
        channel.onopen = () => {
            this.state = 'connected';
            this.notifyStateChange();
            this.flushMessageQueue();
        };

        channel.onclose = () => {
            this.state = 'closed';
            this.notifyStateChange();
        };

        channel.onmessage = (event) => {
            if (this.onDataReceived) {
                try {
                    const data = JSON.parse(event.data);
                    this.onDataReceived(data);
                } catch (e) {
                    this.onDataReceived(event.data);
                }
            }
        };

        channel.onerror = (error) => {
            console.error('Data channel error:', error);
        };
    }

    /**
     * Send signal to peer
     */
    sendSignal(signal) {
        // Override in MeshNetwork
    }

    /**
     * Send data
     */
    send(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            const message = typeof data === 'string' ? data : JSON.stringify(data);
            this.dataChannel.send(message);
            return true;
        } else {
            this.messageQueue.push(data);
            return false;
        }
    }

    /**
     * Flush queued messages
     */
    flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            this.send(msg);
        }
    }

    /**
     * Close connection
     */
    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.connection) {
            this.connection.close();
        }
        this.state = 'closed';
    }

    /**
     * Notify state change
     */
    notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }
}

// ============================================
// Gossip Protocol
// ============================================

class GossipProtocol {
    constructor(network) {
        this.network = network;
        this.pendingTransactions = new Map();
        this.seenTransactions = new Set();
        this.inventory = new Map();
        this.onTransactionReceived = null;
    }

    /**
     * Gossip transaction to peers
     */
    async gossipTransaction(tx) {
        const txHash = this.getTransactionHash(tx);
        
        if (this.seenTransactions.has(txHash)) {
            return false;
        }
        
        this.seenTransactions.add(txHash);
        this.pendingTransactions.set(txHash, {
            tx,
            timestamp: Date.now(),
            relayedBy: new Set()
        });

        const inv = {
            type: 'tx',
            hash: txHash
        };
        
        this.inventory.set(txHash, inv);

        // Gossip to all connected peers
        const peers = this.network.getConnectedPeers();
        for (const peer of peers) {
            if (!this.pendingTransactions.get(txHash)?.relayedBy.has(peer.peerId)) {
                peer.send({ type: 'inv', inventory: [inv] });
                this.pendingTransactions.get(txHash).relayedBy.add(peer.peerId);
            }
        }

        return true;
    }

    /**
     * Handle inventory message
     */
    handleInventory(peer, inventory) {
        const newItems = [];

        for (const item of inventory) {
            if (!this.seenTransactions.has(item.hash)) {
                newItems.push(item);
            }
        }

        if (newItems.length > 0) {
            // Request missing items
            peer.send({ type: 'getdata', inventory: newItems });
        }
    }

    /**
     * Handle transaction request
     */
    async handleGetData(peer, inventory) {
        for (const item of inventory) {
            const pending = this.pendingTransactions.get(item.hash);
            if (pending) {
                peer.send({ type: 'tx', data: pending.tx });
            }
        }
    }

    /**
     * Handle transaction data
     */
    handleTransactionData(tx) {
        const txHash = this.getTransactionHash(tx);
        
        if (!this.seenTransactions.has(txHash)) {
            this.seenTransactions.add(txHash);
            
            if (this.onTransactionReceived) {
                this.onTransactionReceived(tx);
            }

            // Relay to other peers
            this.gossipTransaction(tx);
        }
    }

    /**
     * Get transaction hash
     */
    getTransactionHash(tx) {
        return bytesToHex(hash256(JSON.stringify(tx)));
    }

    /**
     * Get pending count
     */
    getPendingCount() {
        return this.pendingTransactions.size;
    }
}

// ============================================
// Transaction Broadcast
// ============================================

class TransactionBroadcaster {
    constructor(network) {
        this.network = network;
        this.broadcastQueue = [];
        this.isProcessing = false;
    }

    /**
     * Queue transaction for broadcast
     */
    queueBroadcast(tx) {
        this.broadcastQueue.push(tx);
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    /**
     * Process broadcast queue
     */
    async processQueue() {
        this.isProcessing = true;

        while (this.broadcastQueue.length > 0) {
            const tx = this.broadcastQueue.shift();
            await this.broadcast(tx);
        }

        this.isProcessing = false;
    }

    /**
     * Broadcast transaction
     */
    async broadcast(tx) {
        const peers = this.network.getConnectedPeers();
        
        const broadcastPromises = peers.map(peer => 
            this.broadcastToPeer(peer, tx)
        );

        await Promise.allSettled(broadcastPromises);
    }

    /**
     * Broadcast to single peer
     */
    async broadcastToPeer(peer, tx) {
        try {
            return await this.network.sendToPeer(peer.peerId, {
                type: 'transaction',
                data: tx,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error(`Broadcast failed to ${peer.peerId}:`, e);
            return false;
        }
    }
}

// ============================================
// P2P Mesh Network
// ============================================

class MeshNetwork {
    constructor() {
        this.peerId = bytesToHex(randomBytes(16));
        this.peers = new Map();
        this.connections = new Map();
        this.discovery = new PeerDiscovery();
        this.gossip = new GossipProtocol(this);
        this.broadcaster = new TransactionBroadcaster(this);
        
        this.isRunning = false;
        this.onPeerConnected = null;
        this.onPeerDisconnected = null;
        this.onTransactionReceived = null;
    }

    /**
     * Start the network
     */
    async start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.discovery.onPeerDiscovered = (peer) => this.handlePeerDiscovered(peer);
        this.discovery.onPeerLost = (peer) => this.handlePeerLost(peer);
        this.discovery.start();

        this.gossip.onTransactionReceived = (tx) => {
            if (this.onTransactionReceived) {
                this.onTransactionReceived(tx);
            }
        };

        this.startHeartbeat();
    }

    /**
     * Stop the network
     */
    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        this.discovery.stop();

        for (const [peerId, connection] of this.connections) {
            connection.close();
        }
        this.connections.clear();
        this.peers.clear();

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
    }

    /**
     * Handle discovered peer
     */
    async handlePeerDiscovered(peerInfo) {
        if (this.peers.size >= MAX_PEERS) return;
        if (this.peers.has(peerInfo.peerId)) return;

        const connection = new PeerConnection(peerInfo.peerId);
        connection.sendSignal = (signal) => this.sendSignal(peerInfo.peerId, signal);
        
        connection.onStateChange = (state) => {
            if (state === 'connected') {
                this.handlePeerConnected(peerInfo.peerId, connection);
            } else if (state === 'closed' || state === 'failed') {
                this.handlePeerDisconnected(peerInfo.peerId);
            }
        };

        connection.onDataReceived = (data) => this.handleData(peerInfo.peerId, data);

        this.peers.set(peerInfo.peerId, { ...peerInfo, connection });
        this.connections.set(peerInfo.peerId, connection);
        
        try {
            const offer = await connection.createOffer();
            await this.sendSignal(peerInfo.peerId, offer);
        } catch (e) {
            console.error('Failed to create offer:', e);
        }
    }

    /**
     * Handle peer lost
     */
    handlePeerLost(peerId) {
        this.handlePeerDisconnected(peerId);
    }

    /**
     * Handle peer connected
     */
    handlePeerConnected(peerId, connection) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.connected = true;
        }

        if (this.onPeerConnected) {
            this.onPeerConnected(peerId, peer);
        }

        // Send inventory
        const inventory = Array.from(this.gossip.inventory.values());
        if (inventory.length > 0) {
            connection.send({ type: 'inv', inventory });
        }
    }

    /**
     * Handle peer disconnected
     */
    handlePeerDisconnected(peerId) {
        const peer = this.peers.get(peerId);
        this.peers.delete(peerId);
        this.connections.delete(peerId);

        if (peer && this.onPeerDisconnected) {
            this.onPeerDisconnected(peerId, peer);
        }
    }

    /**
     * Handle incoming data
     */
    handleData(peerId, data) {
        switch (data.type) {
            case 'inv':
                this.gossip.handleInventory(this.peers.get(peerId), data.inventory);
                break;
            case 'getdata':
                this.gossip.handleGetData(this.peers.get(peerId), data.inventory);
                break;
            case 'tx':
                this.gossip.handleTransactionData(data.data);
                break;
            case 'transaction':
                if (this.onTransactionReceived) {
                    this.onTransactionReceived(data.data);
                }
                break;
        }
    }

    /**
     * Send signal to peer
     */
    async sendSignal(peerId, signal) {
        const peer = this.peers.get(peerId);
        if (peer && peer.connection) {
            return peer.connection.send(signal);
        }
    }

    /**
     * Start heartbeat
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            for (const [peerId, peer] of this.peers) {
                if (peer.connection && peer.connection.state === 'connected') {
                    peer.connection.send({ type: 'ping', timestamp: Date.now() });
                }
            }
        }, HEARTBEAT_INTERVAL);
    }

    /**
     * Get all connected peers
     */
    getConnectedPeers() {
        return Array.from(this.peers.values()).filter(p => p.connected);
    }

    /**
     * Send to specific peer
     */
    async sendToPeer(peerId, data) {
        const peer = this.peers.get(peerId);
        if (peer && peer.connected) {
            return peer.connection.send(data);
        }
        throw new Error('Peer not connected');
    }

    /**
     * Broadcast transaction
     */
    broadcastTransaction(tx) {
        this.broadcaster.queueBroadcast(tx);
        this.gossip.gossipTransaction(tx);
    }

    /**
     * Get network stats
     */
    getStats() {
        return {
            peerId: this.peerId,
            connectedPeers: this.getConnectedPeers().length,
            totalPeers: this.peers.size,
            pendingTransactions: this.gossip.getPendingCount()
        };
    }
}

export {
    MeshNetwork,
    PeerDiscovery,
    PeerConnection,
    GossipProtocol,
    TransactionBroadcaster,
    PEER_DISCOVERY_INTERVAL,
    GOSSIP_INTERVAL,
    MAX_PEERS,
    HEARTBEAT_INTERVAL,
    CONNECTION_TIMEOUT
};
