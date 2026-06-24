const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-wallet-bg: #111;
      --ghost-wallet-border: 2px solid #333;
      --ghost-wallet-color: #fff;
      --ghost-wallet-font: 'Space Mono', monospace;
      display: block;
      font-family: var(--ghost-wallet-font);
    }

    .wallet {
      background: var(--ghost-wallet-bg);
      border: var(--ghost-wallet-border);
      padding: 20px;
    }

    .label {
      color: #666;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 8px;
    }

    .address-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .address {
      color: var(--ghost-wallet-color);
      font-size: 14px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .copy-btn {
      background: none;
      border: 1px solid #444;
      color: #fff;
      padding: 6px 10px;
      font-family: inherit;
      font-size: 10px;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.15s;
    }

    .copy-btn:hover {
      border-color: #fff;
      background: #fff;
      color: #000;
    }

    .copy-btn.copied {
      border-color: #33ff33;
      color: #33ff33;
    }

    .qr-wrapper {
      margin-top: 16px;
      display: flex;
      justify-content: center;
    }

    ::slotted(ghost-qrcode) {
      display: block;
    }
  </style>
  <div class="wallet" part="wallet">
    <div class="label" part="label">Wallet Address</div>
    <div class="address-row">
      <span class="address" part="address"></span>
      <button class="copy-btn" part="copy">Copy</button>
    </div>
    <div class="qr-wrapper">
      <slot></slot>
    </div>
  </div>
`;

class GhostWallet extends HTMLElement {
  static get observedAttributes() {
    return ['address'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._address = this.shadowRoot.querySelector('.address');
    this._copyBtn = this.shadowRoot.querySelector('.copy-btn');
  }

  connectedCallback() {
    this._copyBtn.addEventListener('click', () => this._copyAddress());
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'address') {
      this._address.textContent = this._truncate(newVal || '');
    }
  }

  _truncate(addr) {
    if (!addr || addr.length < 20) return addr || '';
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  }

  async _copyAddress() {
    const fullAddress = this.getAttribute('address');
    if (!fullAddress) return;

    try {
      await navigator.clipboard.writeText(fullAddress);
      this._copyBtn.textContent = 'Copied';
      this._copyBtn.classList.add('copied');
      setTimeout(() => {
        this._copyBtn.textContent = 'Copy';
        this._copyBtn.classList.remove('copied');
      }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
}

customElements.define('ghost-wallet', GhostWallet);
export default GhostWallet;
