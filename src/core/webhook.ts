/**
 * Ghost Pay SDK - Webhook Module (Production)
 * Stateless webhook notifications for payment confirmations
 *
 * How it works:
 * 1. Dev configures webhookUrl + webhookSecret in Checkout
 * 2. When payment is confirmed, SDK sends POST to the webhook URL
 * 3. Dev's server validates HMAC signature and processes the notification
 * 4. No state stored in SDK — dev's server is the source of truth
 */

import { hmacSha256, bytesToHex } from './crypto.js';
import type { WebhookPayload, WebhookConfig, ChainId } from '../types/index.js';

// ============================================
// Webhook Client
// ============================================

export class WebhookClient {
  private config: WebhookConfig;
  private lastSent = new Map<string, number>();
  private static readonly RATE_LIMIT_MS = 5000; // 5 seconds between same event types

  constructor(config: WebhookConfig) {
    this.config = {
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };
  }

  /**
   * Send a webhook notification
   */
  async notify(
    event: WebhookPayload['event'],
    data: {
      txHash: string;
      chain: ChainId;
      amount: bigint;
      currency: string;
      from: string;
      to: string;
      confirmations: number;
      receiver: string;
      plan: string | null;
      nonce: string;
    }
  ): Promise<{ success: boolean; statusCode?: number }> {
    // Rate limiting: prevent duplicate events within 5 seconds
    const rateKey = `${event}:${data.txHash}`;
    const now = Date.now();
    const lastTime = this.lastSent.get(rateKey);
    if (lastTime && now - lastTime < WebhookClient.RATE_LIMIT_MS) {
      return { success: true, statusCode: 0 }; // Silently skip
    }
    this.lastSent.set(rateKey, now);

    const payload = this.buildPayload(event, data);
    return await this.sendWithRetry(payload);
  }

  /**
   * Build and sign a webhook payload
   */
  private buildPayload(
    event: WebhookPayload['event'],
    data: {
      txHash: string;
      chain: ChainId;
      amount: bigint;
      currency: string;
      from: string;
      to: string;
      confirmations: number;
      receiver: string;
      plan: string | null;
      nonce: string;
    }
  ): WebhookPayload {
    const timestamp = Date.now();

    const payload: Omit<WebhookPayload, 'signature'> = {
      event,
      transaction: {
        hash: data.txHash,
        chain: data.chain,
        amount: data.amount.toString(),
        currency: data.currency,
        from: data.from,
        to: data.to,
        confirmations: data.confirmations,
      },
      checkout: {
        receiver: data.receiver,
        plan: data.plan,
        nonce: data.nonce,
      },
      timestamp,
    };

    const signature = this.sign(payload);
    return { ...payload, signature };
  }

  /**
   * Sign a webhook payload with HMAC-SHA256
   */
  private sign(payload: Omit<WebhookPayload, 'signature'>): string {
    const body = JSON.stringify(payload);
    const mac = hmacSha256(
      new TextEncoder().encode(this.config.secret),
      new TextEncoder().encode(body)
    );
    return bytesToHex(mac);
  }

  /**
   * Send webhook with retry logic
   */
  private async sendWithRetry(
    payload: WebhookPayload
  ): Promise<{ success: boolean; statusCode?: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts!; attempt++) {
      try {
        const response = await fetch(this.config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-GhostPay-Signature': payload.signature,
            'X-GhostPay-Event': payload.event,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return { success: true, statusCode: response.status };
        }

        // Don't retry on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          return { success: false, statusCode: response.status };
        }

        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.config.retryAttempts!) {
        const delay = this.config.retryDelay! * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Webhook failed after retries — silently return failure
    return { success: false };
  }
}

// ============================================
// Webhook Verifier (for dev's server)
// ============================================

/**
 * Utility for developers to verify incoming webhooks on their server.
 *
 * Example usage in Node.js:
 * ```typescript
 * import { WebhookVerifier } from '@ghostpay/sdk';
 *
 * const verifier = new WebhookVerifier('your-webhook-secret');
 *
 * // In your webhook handler:
 * app.post('/ghostpay-webhook', async (req, res) => {
 *   const signature = req.headers['x-ghostpay-signature'];
 *   const isValid = verifier.verify(req.body, signature);
 *
 *   if (!isValid) {
 *     return res.status(401).json({ error: 'Invalid signature' });
 *   }
 *
 *   // Process the payment confirmation
 *   const { event, transaction, checkout } = req.body;
 *   // ...
 *   res.status(200).json({ received: true });
 * });
 * ```
 */
export class WebhookVerifier {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  /**
   * Verify a webhook payload signature (constant-time)
   */
  verify(payload: Omit<WebhookPayload, 'signature'>, signature: string): boolean {
    const body = JSON.stringify(payload);
    const mac = hmacSha256(
      new TextEncoder().encode(this.secret),
      new TextEncoder().encode(body)
    );
    const expectedSignature = bytesToHex(mac);

    // Constant-time comparison (no early return on length mismatch)
    const maxLen = Math.max(expectedSignature.length, signature.length);
    let result = 0;
    for (let i = 0; i < maxLen; i++) {
      const a = i < expectedSignature.length ? expectedSignature.charCodeAt(i) : 0;
      const b = i < signature.length ? signature.charCodeAt(i) : 0;
      result |= a ^ b;
    }
    return result === 0 && expectedSignature.length === signature.length;
  }

  /**
   * Verify a raw request body and signature (constant-time)
   */
  verifyRaw(body: string, signature: string): boolean {
    const mac = hmacSha256(
      new TextEncoder().encode(this.secret),
      new TextEncoder().encode(body)
    );
    const expectedSignature = bytesToHex(mac);

    // Constant-time comparison (no early return on length mismatch)
    const maxLen = Math.max(expectedSignature.length, signature.length);
    let result = 0;
    for (let i = 0; i < maxLen; i++) {
      const a = i < expectedSignature.length ? expectedSignature.charCodeAt(i) : 0;
      const b = i < signature.length ? signature.charCodeAt(i) : 0;
      result |= a ^ b;
    }
    return result === 0 && expectedSignature.length === signature.length;
  }
}
