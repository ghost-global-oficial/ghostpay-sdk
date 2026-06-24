/**
 * Example: Proof of Work and Anti-Spam
 *
 * Demonstrates Hashcash PoW, spam prevention, and difficulty adjustment
 * with the @ghostpay/sdk.
 */

import {
  PoWEngine,
  Hashcash,
  SpamPrevention,
  DifficultyAdjuster,
} from '../src/index.js';

async function powExample() {
  console.log('=== Ghost Pay SDK - Proof of Work Example ===\n');

  // ============================================
  // 1. Basic Hashcash
  // ============================================
  console.log('1. Hashcash - Mint and Verify...');

  const hashcash = new Hashcash(8); // Low difficulty for demo
  const startTime = Date.now();

  const token = await hashcash.mint('payment:tx123', 8);
  const duration = Date.now() - startTime;

  console.log(`   Token: ${token.token.slice(0, 50)}...`);
  console.log(`   Difficulty: ${token.difficulty}`);
  console.log(`   Hash: ${token.hash.slice(0, 20)}...`);
  console.log(`   Iterations: ${token.iterations}`);
  console.log(`   Duration: ${duration}ms`);

  const verified = await hashcash.verify(token.token, 'payment:tx123');
  console.log(`   Valid: ${verified.valid}\n`);

  // ============================================
  // 2. PoW Engine (High-level)
  // ============================================
  console.log('2. PoW Engine - Generate and Verify...');

  const engine = new PoWEngine();

  const transactionData = {
    from: 'bc1qsender...',
    to: 'bc1qrecipient...',
    amount: 100000,
    timestamp: Date.now(),
  };

  const proof = await engine.generateProof(transactionData, 12);
  console.log(`   Difficulty: ${proof.difficulty}`);
  console.log(`   Hash: ${proof.hash.slice(0, 20)}...`);
  console.log(`   Iterations: ${proof.iterations}`);
  console.log(`   Duration: ${proof.duration}ms`);

  const proofValid = await engine.verifyProof(transactionData, proof.token);
  console.log(`   Valid: ${proofValid.valid}\n`);

  // ============================================
  // 3. Spam Prevention (Rate Limiting)
  // ============================================
  console.log('3. Spam Prevention - Rate Limiting...');

  const spam = new SpamPrevention();

  // Simulate multiple requests
  for (let i = 0; i < 5; i++) {
    const check = spam.checkRateLimit('peer-1', 5, 60000);
    console.log(`   Request ${i + 1}: allowed=${check.allowed}, remaining=${check.remaining}`);
  }

  // This should be blocked
  const blocked = spam.checkRateLimit('peer-1', 5, 60000);
  console.log(`   Request 6 (blocked): allowed=${blocked.allowed}, reason=${blocked.reason}\n`);

  // ============================================
  // 4. Blacklist and Whitelist
  // ============================================
  console.log('4. Blacklist and Whitelist...');

  const spamControl = new SpamPrevention();

  // Blacklist a peer
  spamControl.blacklistAddress('malicious-peer');
  const blacklisted = spamControl.checkRateLimit('malicious-peer');
  console.log(`   Blacklisted peer: allowed=${blacklisted.allowed}, reason=${blacklisted.reason}`);

  // Whitelist a peer
  spamControl.whitelistAddress('trusted-peer');
  const whitelisted = spamControl.checkRateLimit('trusted-peer', 1, 1000);
  console.log(`   Whitelisted peer: allowed=${whitelisted.allowed}\n`);

  // ============================================
  // 5. Difficulty Adjustment
  // ============================================
  console.log('5. Difficulty Adjustment...');

  const adjuster = new DifficultyAdjuster(600000, 10); // 10 min blocks, 10 block interval

  // Simulate fast blocks (should increase difficulty)
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    adjuster.recordBlock(`block-${i}`, now + i * 300000, 20); // 5 min intervals
  }

  const newDifficulty = adjuster.calculateDifficulty();
  console.log(`   Default difficulty: 20`);
  console.log(`   Adjusted difficulty: ${newDifficulty}`);
  console.log(`   (Fast blocks → higher difficulty)\n`);

  // ============================================
  // 6. Transaction Anti-Spam
  // ============================================
  console.log('6. Transaction Anti-Spam...');

  const txEngine = new PoWEngine();

  // Simulate sending multiple transactions
  for (let i = 0; i < 3; i++) {
    const check = txEngine.checkTransactionSpam('sender-1', 3, 60000);
    console.log(`   TX ${i + 1}: allowed=${check.allowed}, remaining=${check.remaining}`);
  }

  const blockedTx = txEngine.checkTransactionSpam('sender-1', 3, 60000);
  console.log(`   TX 4 (blocked): allowed=${blockedTx.allowed}, reason=${blockedTx.reason}\n`);

  console.log('=== Example Complete ===');
}

// Run the example
powExample().catch(console.error);
