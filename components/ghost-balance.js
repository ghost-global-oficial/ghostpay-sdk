const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-balance-color: #fff;
      --ghost-balance-font: 'Space Mono', monospace;
      display: block;
      font-family: var(--ghost-balance-font);
    }

    .balance {
      color: var(--ghost-balance-color);
    }

    .label {
      color: #666;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 4px;
    }

    .amount-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .amount {
      font-size: 32px;
      font-weight: 700;
      transition: opacity 0.15s;
    }

    .currency {
      font-size: 14px;
      color: #666;
    }

    .converted {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }

    .switch-btn {
      background: none;
      border: 1px solid #333;
      color: #fff;
      padding: 4px 8px;
      font-family: inherit;
      font-size: 10px;
      text-transform: uppercase;
      cursor: pointer;
      margin-left: 8px;
      transition: all 0.15s;
    }

    .switch-btn:hover {
      border-color: #fff;
    }

    :host([size="sm"]) .amount { font-size: 20px; }
    :host([size="lg"]) .amount { font-size: 48px; }
  </style>
  <div class="balance" part="balance">
    <div class="label" part="label"></div>
    <div class="amount-row">
      <span class="amount" part="amount"></span>
      <span class="currency" part="currency"></span>
      <button class="switch-btn" part="switch">USD</button>
    </div>
    <div class="converted" part="converted"></div>
  </div>
`;

class GhostBalance extends HTMLElement {
  static get observedAttributes() {
    return ['amount', 'currency', 'converted', 'label', 'show-switch'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._amount = this.shadowRoot.querySelector('.amount');
    this._currency = this.shadowRoot.querySelector('.currency');
    this._converted = this.shadowRoot.querySelector('.converted');
    this._label = this.shadowRoot.querySelector('.label');
    this._switchBtn = this.shadowRoot.querySelector('.switch-btn');
    this._showUSD = true;
  }

  connectedCallback() {
    this._switchBtn.addEventListener('click', () => this._toggle());
  }

  attributeChangedCallback(name, oldVal, newVal) {
    switch (name) {
      case 'amount':
        this._animateValue(newVal || '0');
        break;
      case 'currency':
        this._currency.textContent = newVal || 'BTC';
        break;
      case 'converted':
        this._converted.textContent = newVal ? `≈ ${newVal}` : '';
        break;
      case 'label':
        this._label.textContent = newVal || 'Balance';
        break;
      case 'show-switch':
        this._switchBtn.style.display = newVal !== null ? 'inline-block' : 'none';
        break;
    }
  }

  _animateValue(newVal) {
    const numValue = parseFloat(newVal) || 0;
    this._amount.style.opacity = '0.5';
    requestAnimationFrame(() => {
      this._amount.textContent = this._formatNumber(numValue);
      this._amount.style.opacity = '1';
    });
  }

  _formatNumber(num) {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    });
  }

  _toggle() {
    this._showUSD = !this._showUSD;
    this._switchBtn.textContent = this._showUSD ? 'CRYPTO' : 'USD';
    this.dispatchEvent(new CustomEvent('ghost-toggle', {
      detail: { mode: this._showUSD ? 'usd' : 'crypto' },
      bubbles: true
    }));
  }
}

customElements.define('ghost-balance', GhostBalance);
export default GhostBalance;
