const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-input-bg: #000;
      --ghost-input-color: #fff;
      --ghost-input-border: 2px solid #333;
      --ghost-input-focus-border: #fff;
      --ghost-input-error-border: #ff3333;
      --ghost-input-font: 'Space Mono', monospace;
      display: block;
      font-family: var(--ghost-input-font);
    }

    .input-wrapper {
      position: relative;
    }

    .input {
      width: 100%;
      background: var(--ghost-input-bg);
      color: var(--ghost-input-color);
      border: var(--ghost-input-border);
      border-radius: 0;
      padding: 12px 16px;
      font-family: inherit;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s ease;
    }

    .input:focus {
      border-color: var(--ghost-input-focus-border);
    }

    .input::placeholder {
      color: #666;
    }

    :host([type="password"]) .input {
      font-size: 18px;
      letter-spacing: 4px;
    }

    :host([error]) .input {
      border-color: var(--ghost-input-error-border);
    }

    :host([disabled]) .input {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .label {
      display: block;
      color: #999;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }

    .error-msg {
      color: #ff3333;
      font-size: 11px;
      margin-top: 4px;
      display: none;
    }

    :host([error]) .error-msg {
      display: block;
    }

    ::slotted(*) {
      display: contents;
    }
  </style>
  <div class="input-wrapper">
    <label class="label" part="label"></label>
    <input class="input" part="input" type="text" />
    <div class="error-msg" part="error"></div>
  </div>
`;

class GhostInput extends HTMLElement {
  static get observedAttributes() {
    return ['type', 'placeholder', 'value', 'disabled', 'error', 'label'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._input = this.shadowRoot.querySelector('.input');
    this._label = this.shadowRoot.querySelector('.label');
    this._errorMsg = this.shadowRoot.querySelector('.error-msg');
  }

  connectedCallback() {
    this._input.addEventListener('input', this._handleInput.bind(this));
    this._input.addEventListener('blur', this._handleBlur.bind(this));
    this._input.addEventListener('focus', this._handleFocus.bind(this));
  }

  attributeChangedCallback(name, oldVal, newVal) {
    switch (name) {
      case 'type':
        this._input.type = newVal || 'text';
        break;
      case 'placeholder':
        this._input.placeholder = newVal || '';
        break;
      case 'value':
        this._input.value = newVal || '';
        break;
      case 'disabled':
        this._input.disabled = newVal !== null;
        break;
      case 'error':
        this._errorMsg.textContent = newVal || '';
        break;
      case 'label':
        this._label.textContent = newVal || '';
        break;
    }
  }

  _handleInput(e) {
    this.dispatchEvent(new CustomEvent('ghost-input', {
      detail: { value: e.target.value },
      bubbles: true
    }));
  }

  _handleBlur() {
    this.dispatchEvent(new CustomEvent('ghost-blur', { bubbles: true }));
  }

  _handleFocus() {
    this.dispatchEvent(new CustomEvent('ghost-focus', { bubbles: true }));
  }

  get value() {
    return this._input.value;
  }

  set value(val) {
    this._input.value = val;
  }
}

customElements.define('ghost-input', GhostInput);
export default GhostInput;
