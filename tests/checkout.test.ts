import { describe, it, expect } from 'vitest';
import {
  Checkout,
  createFixedCheckout,
  createPlanCheckout,
  createCustomCheckout,
} from '../src/core/checkout.js';
import type { PaymentPlan, CheckoutConfig } from '../src/types/index.js';

const mockReceiver = {
  name: 'Test Store',
  email: 'pay@test.com',
};

const mockPlans: PaymentPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    description: 'Monthly plan',
    price: 12,
    currency: 'USD',
    period: '/month',
    features: ['Feature 1', 'Feature 2'],
  },
  {
    id: 'annual',
    name: 'Annual',
    description: 'Annual plan',
    price: 10,
    currency: 'USD',
    period: '/month',
    selected: true,
  },
];

describe('Checkout', () => {
  describe('Fixed mode', () => {
    it('should create fixed checkout', () => {
      const checkout = createFixedCheckout(mockReceiver, 0.5, 'BTC', 'bitcoin');
      expect(checkout.mode).toBe('fixed');
      expect(checkout.getAmount()).toBe(0.5);
      expect(checkout.getCurrency()).toBe('BTC');
      expect(checkout.receiver.name).toBe('Test Store');
    });

    it('should generate payment link (hosted mode by default)', () => {
      const checkout = createFixedCheckout(mockReceiver, 100, 'USD');
      const link = checkout.generatePaymentLink('bc1qtest123');
      expect(link).toContain('https://ghostpay-systems.vercel.app/payment?');
      expect(link).toContain('amount=100');
      expect(link).toContain('currency=USD');
      expect(link).toContain('address=bc1qtest123');
      expect(link).toContain('receiver=Test+Store');
    });

    it('should generate payment link in local mode', () => {
      const checkout = new Checkout({
        receiver: mockReceiver,
        mode: 'fixed',
        fixedAmount: 100,
        fixedCurrency: 'USD',
        transactionMode: 'local',
      });
      const link = checkout.generatePaymentLink('bc1qtest123');
      expect(link).toContain('ghostpay:payment?');
      expect(link).toContain('amount=100');
    });

    it('should validate fixed checkout', () => {
      const valid = createFixedCheckout(mockReceiver, 10, 'USD');
      expect(valid.validate().valid).toBe(true);

      const invalid = new Checkout({
        receiver: { name: '' },
        mode: 'fixed',
        fixedAmount: -5,
        fixedCurrency: 'USD',
      });
      const result = invalid.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Plans mode', () => {
    it('should create plan checkout', () => {
      const checkout = createPlanCheckout(mockReceiver, mockPlans);
      expect(checkout.mode).toBe('plans');
      expect(checkout.plans).toHaveLength(2);
      expect(checkout.selectedPlan?.id).toBe('annual');
    });

    it('should select a plan', () => {
      const checkout = createPlanCheckout(mockReceiver, mockPlans);
      const plan = checkout.selectPlan('monthly');
      expect(plan.id).toBe('monthly');
      expect(checkout.getAmount()).toBe(12);
      expect(checkout.selectedPlan?.id).toBe('monthly');
    });

    it('should throw for invalid plan', () => {
      const checkout = createPlanCheckout(mockReceiver, mockPlans);
      expect(() => checkout.selectPlan('nonexistent')).toThrow();
    });

    it('should generate payment link with plan', () => {
      const checkout = createPlanCheckout(mockReceiver, mockPlans);
      checkout.selectPlan('monthly');
      const link = checkout.generatePaymentLink('bc1qtest');
      expect(link).toContain('plan=monthly');
      expect(link).toContain('amount=12');
    });

    it('should validate plan checkout', () => {
      const valid = createPlanCheckout(mockReceiver, mockPlans);
      expect(valid.validate().valid).toBe(true);

      const noPlans = new Checkout({
        receiver: mockReceiver,
        mode: 'plans',
        plans: [],
      });
      expect(noPlans.validate().valid).toBe(false);
    });
  });

  describe('Custom mode', () => {
    it('should create custom checkout', () => {
      const checkout = createCustomCheckout(mockReceiver, 'USD');
      expect(checkout.mode).toBe('custom');
      expect(checkout.getAmount()).toBe(0);
    });

    it('should generate link with custom amount', () => {
      const checkout = createCustomCheckout(mockReceiver, 'BTC');
      const link = checkout.generatePaymentLink('bc1qtest', 0.5);
      expect(link).toContain('amount=0.5');
      expect(link).toContain('currency=BTC');
    });
  });

  describe('Chain selection', () => {
    it('should select chain', () => {
      const checkout = createFixedCheckout(mockReceiver, 10, 'USD');
      checkout.selectChain('ethereum');
      expect(checkout.selectedChain).toBe('ethereum');
    });

    it('should reject unsupported chain', () => {
      const checkout = createFixedCheckout(mockReceiver, 10, 'USD', 'bitcoin');
      checkout.selectChain('bitcoin');
      // Try to select a chain not in supportedChains
      const restricted = new Checkout({
        receiver: mockReceiver,
        mode: 'fixed',
        fixedAmount: 10,
        fixedCurrency: 'USD',
        supportedChains: ['bitcoin', 'ethereum'],
      });
      expect(() => restricted.selectChain('solana')).toThrow();
    });
  });

  describe('buildCheckoutData', () => {
    it('should build complete checkout data', () => {
      const checkout = createPlanCheckout(mockReceiver, mockPlans);
      checkout.selectPlan('annual');
      const data = checkout.buildCheckoutData('bc1qaddr');

      expect(data.receiver.name).toBe('Test Store');
      expect(data.plan?.id).toBe('annual');
      expect(data.amount).toBe(10);
      expect(data.currency).toBe('USD');
      expect(data.chain).toBe('bitcoin');
      expect(data.address).toBe('bc1qaddr');
      expect(data.paymentLink).toContain('ghostpay-systems.vercel.app/payment');
      expect(data.nonce).toHaveLength(32);
      expect(data.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize', () => {
      const checkout = createPlanCheckout(mockReceiver, mockPlans);
      const json = checkout.toJSON();
      const restored = Checkout.fromJSON(json);

      expect(restored.receiver.name).toBe('Test Store');
      expect(restored.plans).toHaveLength(2);
      expect(restored.mode).toBe('plans');
    });
  });

  describe('Metadata', () => {
    it('should include metadata in payment link', () => {
      const checkout = new Checkout({
        receiver: mockReceiver,
        mode: 'fixed',
        fixedAmount: 50,
        fixedCurrency: 'USD',
        metadata: { orderId: '12345', product: 'Widget' },
      });
      const link = checkout.generatePaymentLink('bc1qtest');
      expect(link).toContain('meta_orderId=12345');
      expect(link).toContain('meta_product=Widget');
    });
  });
});
