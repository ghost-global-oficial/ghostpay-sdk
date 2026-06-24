const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-modal-overlay-bg: rgba(0,0,0,0.9);
      --ghost-modal-content-bg: #111;
      --ghost-modal-border: 2px solid #fff;
      --ghost-modal-font: 'Space Mono', monospace;
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 10000;
      font-family: var(--ghost-modal-font);
    }

    :host([open]) {
      display: block;
    }

    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--ghost-modal-overlay-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      animation: fadeIn 0.2s ease forwards;
    }

    .content {
      background: var(--ghost-modal-content-bg);
      border: var(--ghost-modal-border);
      max-width: 480px;
      width: 90%;
      max-height: 90vh;
      overflow: auto;
      position: relative;
      transform: scale(0.95) translateY(20px);
      animation: slideIn 0.2s ease forwards;
    }

    .close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      background: none;
      border: none;
      color: #fff;
      font-size: 24px;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
      opacity: 0.7;
      transition: opacity 0.15s;
      font-family: inherit;
    }

    .close-btn:hover {
      opacity: 1;
    }

    .header {
      padding: 24px 24px 0;
    }

    .title {
      color: #fff;
      font-size: 18px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin: 0;
      padding-right: 40px;
    }

    .body {
      padding: 24px;
    }

    @keyframes fadeIn {
      to { opacity: 1; }
    }

    @keyframes slideIn {
      to { transform: scale(1) translateY(0); }
    }

    ::slotted([slot="header"]) {
      display: none;
    }

    ::slotted([slot="body"]) {
      display: none;
    }
  </style>
  <div class="overlay" part="overlay">
    <div class="content" part="content">
      <button class="close-btn" part="close">&times;</button>
      <div class="header">
        <h2 class="title" part="title"></h2>
      </div>
      <div class="body">
        <slot name="body"></slot>
      </div>
    </div>
  </div>
`;

class GhostModal extends HTMLElement {
  static get observedAttributes() {
    return ['open', 'title'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._overlay = this.shadowRoot.querySelector('.overlay');
    this._content = this.shadowRoot.querySelector('.content');
    this._closeBtn = this.shadowRoot.querySelector('.close-btn');
    this._title = this.shadowRoot.querySelector('.title');
  }

  connectedCallback() {
    this._closeBtn.addEventListener('click', () => this.close());
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });
    this._keydownHandler = (e) => {
      if (e.key === 'Escape' && this.hasAttribute('open')) this.close();
    };
    document.addEventListener('keydown', this._keydownHandler);
  }

  disconnectedCallback() {
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'title') {
      this._title.textContent = newVal || '';
    }
  }

  open() {
    this.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.removeAttribute('open');
    document.body.style.overflow = '';
    this.dispatchEvent(new CustomEvent('ghost-close', { bubbles: true }));
  }
}

customElements.define('ghost-modal', GhostModal);
export default GhostModal;
