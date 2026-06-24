/**
 * Example: Basic Wallet Usage
 *
 * Demonstrates creating, importing, and managing wallets
 * with the @ghostpay/sdk.
 */

import { Wallet, createWallet, importWallet, validateMnemonic, generateNewMnemonic } from '../src/index.js';

async function basicWalletExample() {
  console.log('=== Ghost Pay SDK - Basic Wallet Example ===\n');

  // ============================================
  // 1. Create a new wallet
  // ============================================
  console.log('1. Creating a new wallet...');
  const wallet = createWallet();
  const mnemonic = wallet.generateMnemonic();

  console.log(`   Wallet ID: ${wallet.id}`);
  console.log(`   Mnemonic: ${mnemonic}`);
  console.log(`   Created: ${new Date(wallet.createdAt).toISOString()}\n`);

  // ============================================
  // 2. Get addresses for all chains
  // ============================================
  console.log('2. Generated addresses:');
  const addresses = wallet.getAddressMap();

  for (const [chain, address] of Object.entries(addresses)) {
    console.log(`   ${chain.padEnd(10)} ${address}`);
  }
  console.log();

  // ============================================
  // 3. Validate mnemonic
  // ============================================
  console.log('3. Validating mnemonic...');
  const isValid = validateMnemonic(mnemonic);
  console.log(`   Mnemonic valid: ${isValid}\n`);

  // ============================================
  // 4. Export wallet
  // ============================================
  console.log('4. Exporting wallet...');
  const exported = wallet.export();
  console.log(`   Export version: ${exported.version}`);
  console.log(`   Addresses count: ${exported.addresses.length}\n`);

  // ============================================
  // 5. Import wallet from mnemonic
  // ============================================
  console.log('5. Importing wallet from mnemonic...');
  const imported = importWallet(mnemonic);
  console.log(`   Imported wallet ID: ${imported.id}`);
  console.log(`   BTC address matches: ${imported.getAddress('bitcoin') === wallet.getAddress('bitcoin')}\n`);

  // ============================================
  // 6. Generate 24-word mnemonic
  // ============================================
  console.log('6. Generating 24-word mnemonic...');
  const longMnemonic = generateNewMnemonic(24);
  console.log(`   Words: ${longMnemonic.split(' ').length}`);
  console.log(`   Mnemonic: ${longMnemonic}\n`);

  console.log('=== Example Complete ===');
}

// Run the example
basicWalletExample().catch(console.error);
