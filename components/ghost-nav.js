const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-nav-bg: #000;
      --ghost-nav-color: #666;
      --ghost-nav-active-color: #fff;
      --ghost-nav-font: 'Space Mono', monospace;
      display: block;
      font-family: var(--ghost-nav-font);
    }

    .nav {
      background: var(--ghost-nav-bg);
      border-bottom: 1px solid #222;
      display: flex;
    }

    .tab {
      flex: 1;
      padding: 16px 8px;
      text-align: center;
      cursor: pointer;
      position: relative;
      color: var(--ghost-nav-color);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      transition: color 0.15s;
      background: none;
      border: none;
      font-family: inherit;
    }

    .tab:hover {
      color: var(--ghost-nav-active-color);
    }

    .tab.active {
      color: var(--ghost-nav-active-color);
    }

    .tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: #fff;
    }

    .icon {
      display: block;
      font-size: 18px;
      margin-bottom: 4px;
    }

    .badge {
      position: absolute;
      top: 8px;
      right: 50%;
      transform: translateX(20px);
      background: #fff;
      color: #000;
      font-size: 9px;
      padding: 1px 4px;
      min-width: 14px;
    }

    :host([type="pills"]) .nav {
      border: 1px solid #222;
    }

    :host([type="pills"]) .tab {
      border-right: 1px solid #222;
    }

    :host([type="pills"]) .tab:last-child {
      border-right: none;
    }

    :host([type="pills"]) .tab.active {
      background: #fff;
      color: #000;
    }

    :host([type="pills"]) .tab.active::after {
      display: none;
    }

    ::slotted(*) {
      display: none;
    }
  </style>
  <nav class="nav" part="nav">
    <slot></slot>
  </nav>
`;

class GhostNav extends HTMLElement {
  static get observedAttributes() {
    return ['active'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._nav = this.shadowRoot.querySelector('.nav');
    this._tabs = [];
    this._boundNavClick = this._handleNavClick.bind(this);
  }

  connectedCallback() {
    this._nav.addEventListener('click', this._boundNavClick);
  }

  disconnectedCallback() {
    this._nav.removeEventListener('click', this._boundNavClick);
  }

  _handleNavClick(e) {
    const tab = e.target.closest('.tab');
    if (!tab) return;

    const index = parseInt(tab.dataset.index || '0', 10);
    this._setActive(index);

    this.dispatchEvent(new CustomEvent('ghost-change', {
      detail: { index, label: tab.textContent.trim() },
      bubbles: true
    }));
  }

  _setActive(index) {
    this._tabs.forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });
    this.setAttribute('active', index.toString());
  }

  addTab(label, icon = '', badge = null) {
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.dataset.index = this._tabs.length.toString();
    tab.innerHTML = `
      ${icon ? `<span class="icon">${icon}</span>` : ''}
      ${label}
      ${badge ? `<span class="badge">${badge}</span>` : ''}
    `;
    this._tabs.push(tab);
    this._nav.appendChild(tab);

    if (this._tabs.length === 1) {
      this._setActive(0);
    }

    return this._tabs.length - 1;
  }

  setActive(index) {
    this._setActive(index);
  }
}

customElements.define('ghost-nav', GhostNav);
export default GhostNav;
