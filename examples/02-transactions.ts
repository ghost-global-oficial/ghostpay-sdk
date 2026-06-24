/**
 * Example: Building and Signing Transactions
 *
 * Demonstrates creating, signing, and validating transactions
 * with the @ghostpay/sdk.
 */

import {
  Wallet,
  TransactionBuilder,
  TransactionSigner,
  TransactionValidator,
  TransactionSerializer,
} from '../src/index.js';

async function transactionExample() {
  console.log('=== Ghost Pay SDK - Transaction Example ===\n');

  // Create wallet
  const wallet = new Wallet();
  wallet.generateMnemonic();
  console.log(`Wallet: ${wallet.id}`);
  console.log(`BTC Address: ${wallet.getAddress('bitcoin')}\n`);

  // ============================================
  // 1. Build a simple transaction
  // ============================================
  console.log('1. Building transaction...');
  const tx = new TransactionBuilder('bitcoin')
    .addInput('abc123def456', 0, 100000n) // 100,000 satoshis
    .addInput('789ghi012jkl', 1, 50000n)  // 50,000 satoshis
    .addOutput('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 140000n) // Recipient
    .addOutput(wallet.getAddress('bitcoin'), 7000n) // Change back to self
    .setFee(3000n) // 3,000 satoshis fee
    .build();

  console.log(`   Version: ${tx.version}`);
  console.log(`   Inputs: ${tx.inputs.length}`);
  console.log(`   Outputs: ${tx.outputs.length}`);
  console.log(`   Fee: ${tx.fee} satoshis`);
  console.log(`   Chain: ${tx.chain}\n`);

  // ============================================
  // 2. Get transaction hash
  // ============================================
  console.log('2. Transaction hash...');
  const txId = TransactionSerializer.getTxId(tx);
  console.log(`   TX ID: ${txId}\n`);

  // ============================================
  // 3. Estimate fee from rate
  // ============================================
  console.log('3. Estimating fee...');
  const builder = new TransactionBuilder('bitcoin')
    .addInput('test_tx', 0, 200000n)
    .addOutput('bc1qrecipient', 195000n);

  const estimatedFee = builder.calculateFee(10); // 10 sat/byte
  console.log(`   Estimated fee: ${estimatedFee} satoshis`);
  console.log(`   Estimated size: ${builder.estimateSize()} bytes\n`);

  // ============================================
  // 4. Build Ethereum transaction
  // ============================================
  console.log('4. Building Ethereum transaction...');
  const ethTx = new TransactionBuilder('ethereum')
    .addInput('0xabcdef1234567890', 0, 1500000000000000000n) // 1.5 ETH
    .addOutput('0x1234567890abcdef1234567890abcdef12345678', 1000000000000000000n) // 1.0 ETH
    .addOutput(wallet.getAddress('ethereum'), 400000000000000000n) // 0.4 ETH change
    .setFee(100000000000000000n) // 0.1 ETH fee
    .build();

  console.log(`   ETH TX inputs: ${ethTx.inputs.length}`);
  console.log(`   ETH TX outputs: ${ethTx.outputs.length}`);
  console.log(`   ETH TX fee: ${ethTx.fee} wei\n`);

  // ============================================
  // 5. Serialize transaction
  // ============================================
  console.log('5. Serializing transaction...');
  const serialized = TransactionSerializer.serialize(tx);
  console.log(`   Serialized length: ${serialized.length} chars`);

  const deserialized = TransactionSerializer.deserialize(serialized);
  console.log(`   Deserialized inputs: ${deserialized.inputs.length}`);
  console.log(`   Deserialized outputs: ${deserialized.outputs.length}\n`);

  // ============================================
  // 6. Validate transaction
  // ============================================
  console.log('6. Validating transaction...');
  const validator = new TransactionValidator();

  // Add UTXOs to validator
  for (const input of tx.inputs) {
    validator.addUTXO(input.txId, input.vout, input.amount);
  }

  const validation = validator.validate(tx);
  console.log(`   Valid: ${validation.valid}`);
  console.log(`   Errors: ${validation.errors.length === 0 ? 'None' : validation.errors.join(', ')}\n`);

  console.log('=== Example Complete ===');
}

// Run the example
transactionExample().catch(console.error);
