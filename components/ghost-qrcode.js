const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-qr-bg: transparent;
      --ghost-qr-modules: #000;
      display: block;
    }

    .qr-container {
      background: var(--ghost-qr-bg);
      padding: 8px;
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

    if (typeof QRCode !== 'undefined') {
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
    } else {
      this._renderFallback(data);
    }
  }

  _renderFallback(data) {
    const size = this._getSize();
    const ctx = this._canvas.getContext('2d');
    this._canvas.width = size;
    this._canvas.height = size;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    ctx.font = '10px monospace';
    const lines = data.match(/.{1,20}/g) || [data];
    lines.slice(0, Math.floor(size / 12)).forEach((line, i) => {
      ctx.fillText(line, 4, 14 + i * 12);
    });
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
