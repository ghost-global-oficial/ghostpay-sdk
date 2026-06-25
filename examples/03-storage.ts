/**
 * Example: Encrypted Storage
 *
 * Demonstrates secure storage, sessions, and wallet persistence
 * with the @ghostpay/sdk.
 */

import {
  Wallet,
  createSecureStorage,
  createSessionManager,
  createWalletStorage,
  MemoryStorageAdapter,
  BrowserStorageAdapter,
} from '../src/index.js';

async function storageExample() {
  console.log('=== Ghost Pay SDK - Storage Example ===\n');

  // Use MemoryStorage for Node.js example (BrowserStorageAdapter for browsers)
  const adapter = new MemoryStorageAdapter();

  // ============================================
  // 1. Initialize secure storage
  // ============================================
  console.log('1. Initializing secure storage...');
  const storage = createSecureStorage(adapter);

  const initResult = await storage.init('my-secure-password-123');
  console.log(`   First time: ${!initResult.existing}`);
  console.log(`   Key ID: ${initResult.keyId?.slice(0, 16)}...\n`);

  // ============================================
  // 2. Store and retrieve encrypted data
  // ============================================
  console.log('2. Storing encrypted data...');
  const secretData = { publicKey: '0x1234567890abcdef', secret: 'my-secret-value' };
  await storage.set('api-config', secretData);
  console.log(`   Stored: ${JSON.stringify(secretData)}\n`);

  console.log('3. Retrieving encrypted data...');
  const retrieved = await storage.get<typeof secretData>('api-config');
  console.log(`   Retrieved: ${JSON.stringify(retrieved)}`);
  console.log(`   Match: ${JSON.stringify(retrieved) === JSON.stringify(secretData)}\n`);

  // ============================================
  // 4. Lock and unlock storage
  // ============================================
  console.log('4. Locking storage...');
  storage.lock();
  console.log(`   Locked: ${!storage.isUnlocked}`);

  console.log('5. Unlocking storage...');
  await storage.unlock('my-secure-password-123');
  console.log(`   Unlocked: ${storage.isUnlocked}\n`);

  // ============================================
  // 5. Session management
  // ============================================
  console.log('6. Creating session...');
  const sessionManager = createSessionManager(storage);

  const sessionId = await sessionManager.createSession('wallet-123', 3600000);
  console.log(`   Session ID: ${sessionId.slice(0, 16)}...`);

  const session = await sessionManager.getSession();
  console.log(`   Wallet ID: ${session?.walletId}`);
  console.log(`   Expires: ${new Date(session!.expiresAt).toISOString()}\n`);

  // ============================================
  // 6. Wallet storage
  // ============================================
  console.log('7. Storing wallet...');
  const walletStorage = createWalletStorage(storage);

  const wallet = new Wallet();
  wallet.generateMnemonic();

  await walletStorage.storeWallet('wallet-1', wallet.export());
  console.log(`   Stored wallet: ${wallet.id}`);

  console.log('8. Listing wallets...');
  const wallets = await walletStorage.listWallets();
  console.log(`   Found ${wallets.length} wallet(s)`);

  for (const w of wallets) {
    console.log(`   - ${w.id} (stored: ${new Date(w.storedAt).toISOString()})`);
  }

  console.log('9. Retrieving wallet...');
  const retrievedWallet = await walletStorage.getWallet<{ id: string; mnemonic: string }>('wallet-1');
  console.log(`   Wallet ID: ${retrievedWallet?.id}`);
  console.log(`   Mnemonic: ${retrievedWallet?.mnemonic?.split(' ').length} words\n`);

  console.log('10. Deleting wallet...');
  await walletStorage.deleteWallet('wallet-1');
  const afterDelete = await walletStorage.listWallets();
  console.log(`   Wallets after delete: ${afterDelete.length}\n`);

  // ============================================
  // 7. Different storage adapters
  // ============================================
  console.log('11. Storage adapter examples...');
  console.log('    - BrowserStorageAdapter: Uses localStorage (browser)');
  console.log('    - MemoryStorageAdapter: In-memory (testing)');
  console.log('    - Custom adapter: Implement StorageAdapter interface\n');

  console.log('=== Example Complete ===');
}

// Run the example
storageExample().catch(console.error);
