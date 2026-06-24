/**
 * Ghost Pay SDK - Signaling Server
 * WebSocket server for WebRTC peer discovery
 *
 * Usage:
 *   node signaling-server.js
 *   or
 *   npx tsx src/server/signaling-server.ts
 */

import { WebSocketServer, WebSocket } from 'ws';

// ============================================
// Types
// ============================================

interface Peer {
  id: string;
  ws: WebSocket;
  lastSeen: number;
  ip: string;
}

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'register' | 'peers' | 'heartbeat';
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
}

// ============================================
// Signaling Server
// ============================================

class SignalingServer {
  private wss: WebSocketServer;
  private peers = new Map<string, Peer>();
  private heartbeatInterval: ReturnType<typeof setInterval>;
  private port: number;
  private rateLimits = new Map<string, { count: number; resetTime: number }>();
  private static readonly RATE_LIMIT_WINDOW = 60_000; // 1 minute
  private static readonly MAX_REQUESTS_PER_WINDOW = 100;

  constructor(port: number = 8080) {
    this.port = port;
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    this.heartbeatInterval = setInterval(() => this.cleanupPeers(), 30_000);

    console.log(`[Signaling] Server running on ws://localhost:${port}`);
  }

  private handleConnection(ws: WebSocket, req: any): void {
    let peerId: string | null = null;
    const ip = req.socket.remoteAddress || 'unknown';

    ws.on('message', (data: Buffer) => {
      // Prevent memory exhaustion DoS
      if (data.length > 65536) {
        console.log(`[Signaling] Message too large from ${ip}: ${data.length} bytes`);
        ws.close();
        return;
      }

      try {
        const message: SignalMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'register':
            // Validate peer ID format — prevent impersonation
            if (!message.from || typeof message.from !== 'string' || message.from.length > 128) {
              ws.close();
              return;
            }
            // If this socket already has a peerId, reject re-registration
            if (peerId) {
              ws.close();
              return;
            }
            peerId = message.from;
            this.registerPeer(peerId, ws, ip);
            this.sendPeerList(peerId);
            break;

          case 'offer':
          case 'answer':
          case 'ice-candidate':
            // Verify sender matches registered peer — prevent impersonation
            if (message.from !== peerId) {
              console.log(`[Signaling] Sender mismatch: claimed ${message.from}, registered ${peerId}`);
              ws.close();
              return;
            }
            this.forwardSignal(message);
            break;

          case 'heartbeat':
            this.handleHeartbeat(peerId);
            break;
        }
      } catch (error) {
        console.error('[Signaling] Invalid message:', error);
      }
    });

    ws.on('close', () => {
      if (peerId) {
        this.removePeer(peerId);
      }
    });

    ws.on('error', (error) => {
      console.error('[Signaling] WebSocket error:', error);
      if (peerId) {
        this.removePeer(peerId);
      }
    });
  }

  private registerPeer(id: string, ws: WebSocket, ip: string): void {
    // Rate limiting check
    if (!this.checkRateLimit(ip)) {
      console.log(`[Signaling] Rate limit exceeded for ${ip}`);
      ws.close();
      return;
    }

    this.peers.set(id, { id, ws, lastSeen: Date.now(), ip });
    console.log(`[Signaling] Peer registered: ${id} from ${ip} (total: ${this.peers.size})`);

    // Send registration confirmation
    ws.send(JSON.stringify({
      type: 'registered',
      peerId: id,
      timestamp: Date.now(),
    }));
  }

  private checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const limit = this.rateLimits.get(ip);

    if (!limit || now > limit.resetTime) {
      this.rateLimits.set(ip, {
        count: 1,
        resetTime: now + SignalingServer.RATE_LIMIT_WINDOW
      });
      return true;
    }

    if (limit.count >= SignalingServer.MAX_REQUESTS_PER_WINDOW) {
      return false;
    }

    limit.count++;
    return true;
  }

  private sendPeerList(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const peerIds = Array.from(this.peers.keys()).filter(id => id !== peerId);
    peer.ws.send(JSON.stringify({
      type: 'peers',
      payload: { peers: peerIds },
      timestamp: Date.now(),
    }));
  }

  private forwardSignal(message: SignalMessage): void {
    const target = this.peers.get(message.to);
    if (!target) {
      console.log(`[Signaling] Peer not found: ${message.to}`);
      return;
    }

    if (target.ws.readyState === WebSocket.OPEN) {
      target.ws.send(JSON.stringify(message));
    }
  }

  private handleHeartbeat(peerId: string | null): void {
    if (!peerId) return;
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.lastSeen = Date.now();
    }
  }

  private cleanupPeers(): void {
    const now = Date.now();
    const timeout = 60_000; // 60 seconds

    // Clean up expired rate limits
    for (const [ip, limit] of this.rateLimits) {
      if (now > limit.resetTime) {
        this.rateLimits.delete(ip);
      }
    }

    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > timeout) {
        this.removePeer(id);
        console.log(`[Signaling] Peer timed out: ${id}`);
      }
    }
  }

  private removePeer(id: string): void {
    const peer = this.peers.get(id);
    if (peer) {
      peer.ws.close();
      this.peers.delete(id);
      console.log(`[Signaling] Peer disconnected: ${id} (total: ${this.peers.size})`);
    }
  }

  stop(): void {
    clearInterval(this.heartbeatInterval);
    this.wss.close();
    console.log('[Signaling] Server stopped');
  }
}

// ============================================
// Start Server
// ============================================

const port = parseInt(process.env.SIGNALING_PORT || '8080', 10);
const server = new SignalingServer(port);

process.on('SIGINT', () => {
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});

export { SignalingServer };
