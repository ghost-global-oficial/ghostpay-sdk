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
  CatalogProduct,
  CatalogItem,
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
  private _catalogProducts: CatalogProduct[];
  private _selectedItems: CatalogItem[] = [];

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

    this._catalogProducts = this._config.catalogProducts || [];
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
  // Catalog
  // ----------------------------------------

  get catalogProducts(): ReadonlyArray<CatalogProduct> {
    return this._catalogProducts;
  }

  get selectedItems(): ReadonlyArray<CatalogItem> {
    return this._selectedItems;
  }

  get catalogTotal(): number {
    return this._selectedItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }

  addCatalogItem(productId: string, quantity = 1): CatalogItem {
    const product = this._catalogProducts.find(p => p.id === productId);
    if (!product) throw new Error(`Product not found: ${productId}`);
    if (product.inStock === false) throw new Error(`Product out of stock: ${product.name}`);

    const existing = this._selectedItems.find(i => i.product.id === productId);
    if (existing) {
      existing.quantity += quantity;
      return existing;
    }

    const item: CatalogItem = { product, quantity };
    this._selectedItems.push(item);
    return item;
  }

  removeCatalogItem(productId: string): void {
    this._selectedItems = this._selectedItems.filter(i => i.product.id !== productId);
  }

  setCatalogItemQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeCatalogItem(productId);
      return;
    }
    const item = this._selectedItems.find(i => i.product.id === productId);
    if (!item) throw new Error(`Product not found in cart: ${productId}`);
    item.quantity = quantity;
  }

  clearCatalog(): void {
    this._selectedItems = [];
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
      case 'catalog':
        return this.catalogTotal;
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
      case 'catalog':
        return this._selectedItems[0]?.product.currency || this._config.fixedCurrency || 'USD';
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

    // Add timestamp + TTL for link expiration (default 5 minutes)
    const timestamp = String(Date.now());
    const ttl = String(300_000);

    const params = new URLSearchParams({
      receiver: this._config.receiver.name,
      amount: String(amount),
      currency,
      chain: this._selectedChain,
      address,
      nonce,
      timestamp,
      ttl,
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
    } else if (this._transactionMode === 'hosted') {
      // Warn: hosted mode without signing key is vulnerable to tampering
      console.warn(
        '[GhostPay] SECURITY WARNING: No signingKey provided for hosted payment link. ' +
        'Without HMAC signature, the payment amount can be tampered with. ' +
        'Pass a signingKey to generatePaymentLink() to enable tamper protection.'
      );
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
      catalogItems: this._selectedItems.map(i => ({ ...i, product: { ...i.product } })),
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

    if (this._config.mode === 'catalog') {
      if (!this._config.catalogProducts?.length) {
        errors.push('At least one product is required for catalog mode');
      } else {
        for (const product of this._config.catalogProducts) {
          if (!product.id) errors.push(`Product missing id: ${JSON.stringify(product)}`);
          if (!product.name) errors.push(`Product "${product.id}" missing name`);
          if (product.price < 0) errors.push(`Product "${product.id}" has negative price`);
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

/**
 * Create a checkout with a product catalog (for small stores)
 */
export function createCatalogCheckout(
  receiver: ReceiverInfo,
  products: CatalogProduct[],
  supportedChains: ChainId[] = ['bitcoin', 'ethereum']
): Checkout {
  return new Checkout({
    receiver,
    mode: 'catalog',
    catalogProducts: products,
    supportedChains,
  });
}
