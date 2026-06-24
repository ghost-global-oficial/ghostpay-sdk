const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-tx-bg: transparent;
      --ghost-tx-border: 1px solid #222;
      --ghost-tx-color: #fff;
      --ghost-tx-font: 'Space Mono', monospace;
      display: block;
      font-family: var(--ghost-tx-font);
    }

    .tx {
      background: var(--ghost-tx-bg);
      border: var(--ghost-tx-border);
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      transition: border-color 0.15s;
    }

    .tx:hover {
      border-color: #444;
    }

    .type-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }

    :host([type="sent"]) .type-icon {
      background: #1a1a1a;
      border: 1px solid #333;
    }

    :host([type="received"]) .type-icon {
      background: #0a2a0a;
      border: 1px solid #1a3a1a;
    }

    .details {
      flex: 1;
      min-width: 0;
    }

    .address {
      color: var(--ghost-tx-color);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 4px;
    }

    .timestamp {
      color: #666;
      font-size: 10px;
    }

    .amount-wrapper {
      text-align: right;
      flex-shrink: 0;
    }

    .amount {
      font-size: 14px;
      font-weight: 700;
    }

    :host([type="sent"]) .amount { color: #ff4444; }
    :host([type="received"]) .amount { color: #44ff44; }

    .status {
      display: inline-block;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 2px 6px;
      margin-top: 4px;
    }

    :host([status="confirmed"]) .status {
      background: #1a1a1a;
      border: 1px solid #333;
      color: #666;
    }

    :host([status="pending"]) .status {
      background: #2a2a00;
      border: 1px solid #4a4a00;
      color: #aaaa00;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
  <div class="tx" part="tx">
    <div class="type-icon" part="icon"></div>
    <div class="details">
      <div class="address" part="address"></div>
      <div class="timestamp" part="timestamp"></div>
    </div>
    <div class="amount-wrapper">
      <div class="amount" part="amount"></div>
      <div class="status" part="status"></div>
    </div>
  </div>
`;

class GhostTransaction extends HTMLElement {
  static get observedAttributes() {
    return ['type', 'address', 'amount', 'timestamp', 'status'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._icon = this.shadowRoot.querySelector('.type-icon');
    this._address = this.shadowRoot.querySelector('.address');
    this._amount = this.shadowRoot.querySelector('.amount');
    this._timestamp = this.shadowRoot.querySelector('.timestamp');
    this._status = this.shadowRoot.querySelector('.status');
  }

  connectedCallback() {
    this._updateIcon();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    switch (name) {
      case 'type':
        this._updateIcon();
        break;
      case 'address':
        this._address.textContent = this._truncate(newVal || '');
        break;
      case 'amount':
        this._amount.textContent = this._formatAmount(newVal || '0');
        break;
      case 'timestamp':
        this._timestamp.textContent = this._formatTime(newVal);
        break;
      case 'status':
        this._status.textContent = newVal || 'confirmed';
        break;
    }
  }

  _updateIcon() {
    const type = this.getAttribute('type') || 'sent';
    this._icon.textContent = type === 'sent' ? '↑' : '↓';
  }

  _truncate(addr) {
    if (!addr || addr.length < 20) return addr || '';
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  }

  _formatAmount(amt) {
    const num = parseFloat(amt) || 0;
    const sign = this.getAttribute('type') === 'sent' ? '-' : '+';
    return `${sign}${num.toFixed(8)}`;
  }

  _formatTime(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

customElements.define('ghost-transaction', GhostTransaction);
export default GhostTransaction;
