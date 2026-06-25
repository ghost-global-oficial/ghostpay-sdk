import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Checkout,
  WebhookClient,
  WebhookVerifier,
  BlockchainBroadcaster,
  createFixedCheckout,
  createPlanCheckout,
  createCustomCheckout,
  hmacSha256,
  bytesToHex,
} from '../src/index.js';

// ============================================
// Checkout Integration Tests
// ============================================

describe('Checkout Integration', () => {
  const receiver = { name: 'Test Store', email: 'test@store.com' };

  describe('Fixed mode with webhook', () => {
    it('should generate payment link with HMAC', () => {
      const checkout = Checkout.fromJSON({
        receiver,
        mode: 'fixed',
        fixedAmount: 25.00,
        fixedCurrency: 'USD',
        webhookUrl: 'https://store.com/api/webhook',
        webhookSecret: 'secret123',
      });

      const link = checkout.generatePaymentLink('bc1qaddr', undefined, 'signing-key');
      expect(link).toContain('ghostpay:payment');
      expect(link).toContain('amount=25');
      expect(link).toContain('sig=');
    });

    it('should build checkout data', () => {
      const checkout = Checkout.fromJSON({
        receiver,
        mode: 'fixed',
        fixedAmount: 50.00,
        fixedCurrency: 'EUR',
      });

      const data = checkout.buildCheckoutData('0xaddr');
      expect(data.amount).toBe(50);
      expect(data.currency).toBe('EUR');
      expect(data.chain).toBe('bitcoin');
      expect(data.receiver.name).toBe('Test Store');
    });
  });

  describe('Plans mode with webhook', () => {
    it('should select plan and generate link', () => {
      const checkout = Checkout.fromJSON({
        receiver,
        mode: 'plans',
        plans: [
          { id: 'basic', name: 'Basic', description: 'Basic plan', price: 10, currency: 'USD' },
          { id: 'pro', name: 'Pro', description: 'Pro plan', price: 25, currency: 'USD', selected: true },
        ],
      });

      checkout.selectPlan('basic');
      expect(checkout.selectedPlan?.id).toBe('basic');

      const link = checkout.generatePaymentLink('bc1qaddr');
      expect(link).toContain('plan=basic');
      expect(link).toContain('amount=10');
    });
  });

  describe('Custom mode', () => {
    it('should generate link with custom amount', () => {
      const checkout = createCustomCheckout(receiver, 'BTC');
      const link = checkout.generatePaymentLink('bc1qaddr', 0.5);
      expect(link).toContain('amount=0.5');
      expect(link).toContain('currency=BTC');
    });

    it('should throw for zero amount', () => {
      const checkout = createCustomCheckout(receiver);
      expect(() => checkout.generatePaymentLink('bc1qaddr', 0)).toThrow('positive');
    });
  });

  describe('Validation', () => {
    it('should validate complete checkout', () => {
      const checkout = Checkout.fromJSON({
        receiver,
        mode: 'plans',
        plans: [
          { id: 'monthly', name: 'Monthly', description: 'Monthly plan', price: 12, currency: 'USD' },
        ],
      });

      const result = checkout.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing receiver', () => {
      const checkout = Checkout.fromJSON({
        receiver: { name: '' },
        mode: 'fixed',
        fixedAmount: 10,
      });

      const result = checkout.validate();
      expect(result.valid).toBe(false);
    });
  });

  describe('Chain selection', () => {
    it('should select supported chain', () => {
      const checkout = Checkout.fromJSON({
        receiver,
        mode: 'fixed',
        fixedAmount: 10,
        supportedChains: ['bitcoin', 'ethereum'],
      });

      checkout.selectChain('ethereum');
      expect(checkout.selectedChain).toBe('ethereum');
    });

    it('should reject unsupported chain', () => {
      const checkout = Checkout.fromJSON({
        receiver,
        mode: 'fixed',
        fixedAmount: 10,
        supportedChains: ['bitcoin'],
      });

      expect(() => checkout.selectChain('ethereum')).toThrow('not supported');
    });
  });
});

// ============================================
// Webhook Integration Tests
// ============================================

describe('Webhook Integration', () => {
  describe('WebhookClient', () => {
    it('should create client with defaults', () => {
      const client = new WebhookClient({
        url: 'https://example.com/webhook',
        secret: 'test-secret',
      });
      expect(client).toBeDefined();
    });

    it('should rate limit duplicate events', async () => {
      const client = new WebhookClient({
        url: 'https://example.com/webhook',
        secret: 'test-secret',
      });

      // Mock fetch to track calls
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', fetchSpy);

      const data = {
        txHash: 'abc123',
        chain: 'bitcoin' as const,
        amount: 100000n,
        currency: 'BTC',
        from: '1A1zP1',
        to: '1BvBMSE',
        confirmations: 1,
        receiver: 'Test',
        plan: null,
        nonce: 'nonce1',
      };

      // First call should go through
      await client.notify('payment.confirmed', data);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second call within 5s should be rate limited
      await client.notify('payment.confirmed', data);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Still 1

      vi.unstubAllGlobals();
    });
  });

  describe('WebhookVerifier', () => {
    it('should verify valid signature', () => {
      const verifier = new WebhookVerifier('my-secret');

      const payload = {
        event: 'payment.confirmed' as const,
        transaction: {
          hash: 'abc123',
          chain: 'bitcoin' as const,
          amount: '100000',
          currency: 'BTC',
          from: '1A1zP1',
          to: '1BvBMSE',
          confirmations: 3,
        },
        checkout: {
          receiver: 'Test Store',
          plan: null,
          nonce: 'nonce123',
        },
        timestamp: Date.now(),
      };

      // Sign the payload
      const mac = hmacSha256(
        new TextEncoder().encode('my-secret'),
        new TextEncoder().encode(JSON.stringify(payload))
      );
      const signature = bytesToHex(mac);

      // Verify
      const isValid = verifier.verify(payload, signature);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const verifier = new WebhookVerifier('my-secret');

      const payload = {
        event: 'payment.confirmed' as const,
        transaction: {
          hash: 'abc123',
          chain: 'bitcoin' as const,
          amount: '100000',
          currency: 'BTC',
          from: '1A1zP1',
          to: '1BvBMSE',
          confirmations: 3,
        },
        checkout: {
          receiver: 'Test Store',
          plan: null,
          nonce: 'nonce123',
        },
        timestamp: Date.now(),
      };

      const isValid = verifier.verify(payload, 'invalid-signature');
      expect(isValid).toBe(false);
    });
  });
});

// ============================================
// Blockchain Broadcaster Tests
// ============================================

describe('Blockchain Broadcaster', () => {
  it('should create broadcaster with default configs', () => {
    const broadcaster = new BlockchainBroadcaster();
    expect(broadcaster).toBeDefined();
  });

  it('should create broadcaster with custom configs', () => {
    const broadcaster = new BlockchainBroadcaster({
      bitcoin: { rpcUrl: 'https://custom-btc-rpc.com', publicKey: '0x1234567890abcdef' },
      ethereum: { rpcUrl: 'https://custom-eth-rpc.com' },
    });
    expect(broadcaster).toBeDefined();
  });

  it('should return error for unsupported chain broadcast', async () => {
    const broadcaster = new BlockchainBroadcaster();
    const result = await broadcaster.broadcast(
      { chain: 'bitcoin', version: 2, inputs: [], outputs: [], locktime: 0, fee: 0n, timestamp: Date.now(), status: 'pending' },
      'invalid-hex'
    );
    // Should fail gracefully (not throw)
    expect(result.success).toBe(false);
  }, 10000);
});
