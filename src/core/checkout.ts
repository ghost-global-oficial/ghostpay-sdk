/**
 * Ghost Pay SDK - Checkout Module (Production)
 * Configurable payment pages: fixed amount, custom amount, or plans
 */

import type {
  CheckoutConfig,
  CheckoutData,
  PaymentPlan,
  PaymentMode,
  ReceiverInfo,
  ChainId,
  TransactionMode,
} from '../types/index.js';
import { DEFAULT_HOSTED_PAYMENT_URL } from '../types/index.js';
import { hmacSha256, bytesToHex } from './crypto.js';
import { WebhookClient } from './webhook.js';

// ============================================
// Checkout Class
// ============================================

export class Checkout {
  private _config: CheckoutConfig;
  private _selectedPlan: PaymentPlan | null = null;
  private _selectedChain: ChainId;
  private _transactionMode: TransactionMode;
  private _hostedPaymentUrl: string;

  constructor(config: CheckoutConfig) {
    this._config = {
      supportedChains: ['bitcoin', 'ethereum', 'solana', 'polygon', 'bsc'],
      ...config,
    };

    this._transactionMode = this._config.transactionMode || 'hosted';
    this._hostedPaymentUrl = this._config.hostedPaymentUrl || DEFAULT_HOSTED_PAYMENT_URL;

    // Set default selected plan
    if (this._config.plans?.length) {
      this._selectedPlan = this._config.plans.find(p => p.selected) || this._config.plans[0];
    }

    this._selectedChain = this._config.fixedChain || 'bitcoin';
  }

  // ----------------------------------------
  // Getters
  // ----------------------------------------

  get config(): Readonly<CheckoutConfig> {
    return this._config;
  }

  get receiver(): Readonly<ReceiverInfo> {
    return this._config.receiver;
  }

  get mode(): PaymentMode {
    return this._config.mode;
  }

  get plans(): ReadonlyArray<PaymentPlan> {
    return this._config.plans || [];
  }

  get selectedPlan(): PaymentPlan | null {
    return this._selectedPlan;
  }

  get selectedChain(): ChainId {
    return this._selectedChain;
  }

  get transactionMode(): TransactionMode {
    return this._transactionMode;
  }

  get hostedPaymentUrl(): string {
    return this._hostedPaymentUrl;
  }

  get supportedChains(): ReadonlyArray<ChainId> {
    return this._config.supportedChains || [];
  }

  // ----------------------------------------
  // Plan Selection
  // ----------------------------------------

  selectPlan(planId: string): PaymentPlan {
    const plan = this._config.plans?.find(p => p.id === planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    this._selectedPlan = plan;
    return plan;
  }

  // ----------------------------------------
  // Chain Selection
  // ----------------------------------------

  selectChain(chain: ChainId): void {
    if (!this._config.supportedChains?.includes(chain)) {
      throw new Error(`Chain not supported: ${chain}`);
    }
    this._selectedChain = chain;
  }

  // ----------------------------------------
  // Amount Calculation
  // ----------------------------------------

  getAmount(): number {
    switch (this._config.mode) {
      case 'fixed': {
        const fixed = this._config.fixedAmount;
        if (typeof fixed === 'number' && fixed > 0) return fixed;
        const planPrice = this._selectedPlan?.price;
        if (typeof planPrice === 'number' && planPrice > 0) return planPrice;
        return 0;
      }
      case 'plans':
      case 'multi': {
        const price = this._selectedPlan?.price;
        if (typeof price === 'number' && price > 0) return price;
        return 0;
      }
      case 'custom':
        return 0;
      default:
        return 0;
    }
  }

  getCurrency(): string {
    switch (this._config.mode) {
      case 'fixed':
        return this._config.fixedCurrency || 'USD';
      case 'plans':
      case 'multi':
        return this._selectedPlan?.currency || 'USD';
      case 'custom':
        return this._config.fixedCurrency || 'USD';
      default:
        return 'USD';
    }
  }

  // ----------------------------------------
  // Generate Payment Link
  // ----------------------------------------

  generatePaymentLink(address: string, customAmount?: number, signingKey?: string): string {
    const amount = this._config.mode === 'custom' ? (customAmount || 0) : this.getAmount();
    if (amount <= 0) {
      throw new Error('Payment amount must be positive');
    }
    const currency = this.getCurrency();
    const nonce = this._generateNonce();

    const params = new URLSearchParams({
      receiver: this._config.receiver.name,
      amount: String(amount),
      currency,
      chain: this._selectedChain,
      address,
      nonce,
    });

    if (this._selectedPlan) {
      params.set('plan', this._selectedPlan.id);
    }

    if (this._config.description) {
      params.set('description', this._config.description);
    }

    if (this._config.plans?.length) {
      params.set('plans', JSON.stringify(this._config.plans));
    }

    if (this._config.metadata) {
      for (const [key, value] of Object.entries(this._config.metadata)) {
        params.set(`meta_${key}`, value);
      }
    }

    // Add HMAC signature to prevent tampering
    if (signingKey) {
      const mac = hmacSha256(
        new TextEncoder().encode(signingKey),
        new TextEncoder().encode(params.toString())
      );
      params.set('sig', bytesToHex(mac));
    }

    if (this._transactionMode === 'hosted') {
      return `${this._hostedPaymentUrl}?${params.toString()}`;
    }

    return `ghostpay:payment?${params.toString()}`;
  }

  /**
   * Open the payment page in a new window/tab (hosted mode only)
   */
  openPaymentPage(address: string, customAmount?: number, signingKey?: string): string {
    const link = this.generatePaymentLink(address, customAmount, signingKey);
    if (this._transactionMode === 'hosted' && typeof window !== 'undefined') {
      window.open(link, '_blank');
    }
    return link;
  }

  // ----------------------------------------
  // Build Checkout Data
  // ----------------------------------------

  buildCheckoutData(address: string, customAmount?: number): CheckoutData {
    const amount = this._config.mode === 'custom' ? (customAmount || 0) : this.getAmount();
    const currency = this.getCurrency();
    const nonce = this._generateNonce();

    return {
      receiver: { ...this._config.receiver },
      plan: this._selectedPlan ? { ...this._selectedPlan } : null,
      amount,
      currency,
      chain: this._selectedChain,
      address,
      paymentLink: this.generatePaymentLink(address, customAmount),
      nonce,
      timestamp: Date.now(),
      metadata: this._config.metadata ? { ...this._config.metadata } : undefined,
      transactionMode: this._transactionMode,
    };
  }

  // ----------------------------------------
  // Webhook Notification
  // ----------------------------------------

  /**
   * Send a webhook notification when payment status changes
   * Requires webhookUrl and webhookSecret in checkout config
   */
  async notifyWebhook(
    event: 'payment.confirmed' | 'payment.pending' | 'payment.failed',
    data: {
      txHash: string;
      amount: bigint;
      from: string;
      to: string;
      confirmations: number;
    }
  ): Promise<{ success: boolean; statusCode?: number }> {
    if (!this._config.webhookUrl || !this._config.webhookSecret) {
      throw new Error('Webhook not configured. Set webhookUrl and webhookSecret in checkout config.');
    }

    const client = new WebhookClient({
      url: this._config.webhookUrl,
      secret: this._config.webhookSecret,
    });

    return await client.notify(event, {
      txHash: data.txHash,
      chain: this._selectedChain,
      amount: data.amount,
      currency: this.getCurrency(),
      from: data.from,
      to: data.to,
      confirmations: data.confirmations,
      receiver: this._config.receiver.name,
      plan: this._selectedPlan?.id || null,
      nonce: this._generateNonce(),
    });
  }

  // ----------------------------------------
  // Validation
  // ----------------------------------------

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this._config.receiver?.name) {
      errors.push('Receiver name is required');
    }

    if (this._config.mode === 'plans' || this._config.mode === 'multi') {
      if (!this._config.plans?.length) {
        errors.push('At least one plan is required for plans mode');
      } else {
        for (const plan of this._config.plans) {
          if (!plan.id) errors.push(`Plan missing id: ${JSON.stringify(plan)}`);
          if (!plan.name) errors.push(`Plan "${plan.id}" missing name`);
          if (plan.price < 0) errors.push(`Plan "${plan.id}" has negative price`);
        }
      }
    }

    if (this._config.mode === 'fixed') {
      if (!this._config.fixedAmount || this._config.fixedAmount <= 0) {
        errors.push('Fixed amount must be positive');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ----------------------------------------
  // Utility
  // ----------------------------------------

  private _generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  // ----------------------------------------
  // Serialization
  // ----------------------------------------

  toJSON(): CheckoutConfig {
    return { ...this._config };
  }

  static fromJSON(json: CheckoutConfig): Checkout {
    return new Checkout(json);
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a checkout with fixed amount (e.g., pay exactly 0.5 BTC)
 */
export function createFixedCheckout(
  receiver: ReceiverInfo,
  amount: number,
  currency: string,
  chain: ChainId = 'bitcoin'
): Checkout {
  return new Checkout({
    receiver,
    mode: 'fixed',
    fixedAmount: amount,
    fixedCurrency: currency,
    fixedChain: chain,
  });
}

/**
 * Create a checkout with plans/tiers (e.g., Monthly $12, Annual $10)
 */
export function createPlanCheckout(
  receiver: ReceiverInfo,
  plans: PaymentPlan[]
): Checkout {
  return new Checkout({
    receiver,
    mode: 'plans',
    plans,
  });
}

/**
 * Create a checkout with custom amount (user enters how much to pay)
 */
export function createCustomCheckout(
  receiver: ReceiverInfo,
  currency: string = 'USD',
  supportedChains: ChainId[] = ['bitcoin', 'ethereum']
): Checkout {
  return new Checkout({
    receiver,
    mode: 'custom',
    fixedCurrency: currency,
    supportedChains,
  });
}
