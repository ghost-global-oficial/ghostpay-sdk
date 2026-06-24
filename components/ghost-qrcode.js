import QRCode from 'qrcode';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-qr-bg: #000;
      --ghost-qr-modules: #fff;
      display: block;
    }

    .qr-container {
      background: var(--ghost-qr-bg);
      padding: 16px;
      display: inline-block;
    }

    canvas {
      display: block;
    }

    :host([size="sm"]) canvas { width: 100px; height: 100px; }
    :host([size="md"]) canvas { width: 160px; height: 160px; }
    :host([size="lg"]) canvas { width: 240px; height: 240px; }
    :host(:not([size])) canvas { width: 160px; height: 160px; }
  </style>
  <div class="qr-container" part="container">
    <canvas part="canvas"></canvas>
  </div>
`;

class GhostQRCode extends HTMLElement {
  static get observedAttributes() {
    return ['data', 'size'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._canvas = this.shadowRoot.querySelector('canvas');
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'data' || name === 'size') {
      this._render();
    }
  }

  async _render() {
    const data = this.getAttribute('data');
    if (!data) return;

    try {
      await QRCode.toCanvas(this._canvas, data, {
        width: this._getSize(),
        margin: 0,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      });
    } catch (err) {
      console.error('QR Code generation failed:', err);
    }
  }

  _getSize() {
    const sizeAttr = this.getAttribute('size');
    switch (sizeAttr) {
      case 'sm': return 100;
      case 'lg': return 240;
      default: return 160;
    }
  }
}

customElements.define('ghost-qrcode', GhostQRCode);
export default GhostQRCode;
