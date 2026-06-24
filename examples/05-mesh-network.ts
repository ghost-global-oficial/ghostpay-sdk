/**
 * Example: Mesh Network
 *
 * Demonstrates P2P networking with WebSocket signaling and WebRTC
 * with the @ghostpay/sdk.
 *
 * NOTE: This example requires a running signaling server.
 * For testing, you can use a mock WebSocket server or run two instances.
 */

import { MeshNetwork, TransactionBuilder, Wallet } from '../src/index.js';

async function networkExample() {
  console.log('=== Ghost Pay SDK - Mesh Network Example ===\n');

  // ============================================
  // 1. Create and start network
  // ============================================
  console.log('1. Creating mesh network...');

  const network = new MeshNetwork({
    signalingUrl: 'wss://signal.ghostpay.io',
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
    maxPeers: 50,
    heartbeatInterval: 30000,
    connectionTimeout: 15000,
    reconnectAttempts: 5,
    reconnectDelay: 1000,
  });

  console.log(`   Peer ID: ${network.peerId}`);
  console.log(`   Running: ${network.isRunning}\n`);

  // ============================================
  // 2. Set up event handlers
  // ============================================
  console.log('2. Setting up event handlers...');

  network.on('network:started', () => {
    console.log('   ✓ Network started');
  });

  network.on('network:stopped', () => {
    console.log('   ✗ Network stopped');
  });

  network.on('peer:connected', (event) => {
    console.log(`   ✓ Peer connected: ${(event.data as any).peerId}`);
  });

  network.on('peer:disconnected', (event) => {
    console.log(`   ✗ Peer disconnected: ${(event.data as any).peerId}`);
  });

  network.on('peer:discovered', (event) => {
    const peers = (event.data as any).peers;
    console.log(`   ✓ Discovered ${peers.length} peer(s)`);
  });

  network.on('transaction:sent', (event) => {
    const data = event.data as any;
    console.log(`   → Transaction sent: ${data.hash?.slice(0, 16)}...`);
  });

  network.on('transaction:received', (event) => {
    const data = event.data as any;
    console.log(`   ← Transaction received: ${data.hash?.slice(0, 16)}...`);
  });
  console.log();

  // ============================================
  // 3. Start network (requires signaling server)
  // ============================================
  console.log('3. Starting network...');
  console.log('   (Requires WebSocket signaling server)');

  try {
    await network.start();
    console.log('   ✓ Connected to signaling server\n');

    // ============================================
    // 4. Get network stats
    // ============================================
    console.log('4. Network stats:');
    const stats = network.getStats();
    console.log(`   Peer ID: ${stats.peerId}`);
    console.log(`   Connected peers: ${stats.connectedPeers}`);
    console.log(`   Total peers: ${stats.totalPeers}`);
    console.log(`   Pending transactions: ${stats.pendingTransactions}`);
    console.log(`   Seen transactions: ${stats.seenTransactions}`);
    console.log(`   Running: ${stats.isRunning}\n`);

    // ============================================
    // 5. Broadcast a transaction
    // ============================================
    console.log('5. Broadcasting transaction...');

    const wallet = new Wallet();
    wallet.generateMnemonic();

    const tx = new TransactionBuilder('bitcoin')
      .addInput('example_txid', 0, 100000n)
      .addOutput('bc1qexample', 99000n)
      .setFee(1000n)
      .build();

    const txHash = network.broadcastTransaction(tx);
    console.log(`   TX Hash: ${txHash.slice(0, 16)}...\n`);

    // ============================================
    // 6. Wait and check stats
    // ============================================
    console.log('6. Waiting 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const finalStats = network.getStats();
    console.log(`   Final stats:`);
    console.log(`   Connected peers: ${finalStats.connectedPeers}`);
    console.log(`   Seen transactions: ${finalStats.seenTransactions}\n`);

    // ============================================
    // 7. Stop network
    // ============================================
    console.log('7. Stopping network...');
    network.stop();
    console.log('   ✓ Network stopped\n');

  } catch (error) {
    console.log('   ✗ Could not connect to signaling server');
    console.log('   (This is expected without a running server)\n');

    // Show what the API looks like
    console.log('   Available API:');
    console.log('   - network.start() → Connect to signaling server');
    console.log('   - network.stop() → Disconnect');
    console.log('   - network.connectToPeer(id) → Connect to specific peer');
    console.log('   - network.broadcastTransaction(tx) → Broadcast TX');
    console.log('   - network.sendTransaction(peerId, tx) → Send to peer');
    console.log('   - network.getStats() → Network statistics\n');
  }

  console.log('=== Example Complete ===');
}

// Run the example
networkExample().catch(console.error);
