const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-btn-bg: #fff;
      --ghost-btn-color: #000;
      --ghost-btn-border: 2px solid #fff;
      --ghost-btn-radius: 0;
      --ghost-btn-font: 'Space Mono', monospace;
      display: inline-block;
    }

    :host([variant="secondary"]) {
      --ghost-btn-bg: transparent;
      --ghost-btn-color: #fff;
      --ghost-btn-border: 2px solid #fff;
    }

    :host([variant="ghost"]) {
      --ghost-btn-bg: transparent;
      --ghost-btn-color: #fff;
      --ghost-btn-border: 2px solid transparent;
    }

    :host([size="sm"]) .btn { padding: 6px 12px; font-size: 12px; }
    :host([size="md"]) .btn { padding: 10px 20px; font-size: 14px; }
    :host([size="lg"]) .btn { padding: 14px 28px; font-size: 16px; }

    :host([disabled]) { opacity: 0.5; pointer-events: none; }

    .btn {
      background: var(--ghost-btn-bg);
      color: var(--ghost-btn-color);
      border: var(--ghost-btn-border);
      border-radius: var(--ghost-btn-radius);
      font-family: var(--ghost-btn-font);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      justify-content: center;
    }

    .btn:hover {
      background: #000;
      color: #fff;
      border-color: #fff;
    }

    :host([variant="primary"]) .btn:hover {
      background: #fff;
      color: #000;
    }

    :host([variant="secondary"]) .btn:hover {
      background: #fff;
      color: #000;
    }

    :host([variant="ghost"]) .btn:hover {
      background: rgba(255,255,255,0.1);
    }

    .btn:active {
      transform: scale(0.98);
    }

    .btn.loading {
      pointer-events: none;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    ::slotted(*) {
      display: contents;
    }
  </style>
  <button class="btn" part="button">
    <span class="spinner" part="spinner"></span>
    <slot></slot>
  </button>
`;

class GhostButton extends HTMLElement {
  static get observedAttributes() {
    return ['loading', 'disabled', 'variant', 'size'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._btn = this.shadowRoot.querySelector('.btn');
    this._spinner = this.shadowRoot.querySelector('.spinner');
    this._spinner.style.display = 'none';
    this._boundClick = this._handleClick.bind(this);
  }

  connectedCallback() {
    this._btn.addEventListener('click', this._boundClick);
  }

  disconnectedCallback() {
    this._btn.removeEventListener('click', this._boundClick);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'loading') {
      this._spinner.style.display = newVal !== null ? 'block' : 'none';
      this._btn.classList.toggle('loading', newVal !== null);
    }
    if (name === 'disabled') {
      this._btn.disabled = newVal !== null;
    }
  }

  _handleClick(e) {
    if (this.hasAttribute('loading') || this.hasAttribute('disabled')) {
      e.stopPropagation();
    }
  }
}

customElements.define('ghost-button', GhostButton);
export default GhostButton;
