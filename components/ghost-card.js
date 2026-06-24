const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --ghost-card-bg: #111;
      --ghost-card-border: 2px solid #333;
      --ghost-card-hover-border: #fff;
      --ghost-card-transition: 0.2s ease;
      display: block;
    }

    .card {
      background: var(--ghost-card-bg);
      border: var(--ghost-card-border);
      transition: border-color var(--ghost-card-transition), transform var(--ghost-card-transition), box-shadow var(--ghost-card-transition);
      padding: 24px;
      box-sizing: border-box;
    }

    .card:hover {
      border-color: var(--ghost-card-hover-border);
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(255,255,255,0.1);
    }

    :host([flat]) .card:hover {
      transform: none;
      box-shadow: none;
    }

    ::slotted(*) {
      display: block;
    }
  </style>
  <div class="card" part="card">
    <slot></slot>
  </div>
`;

class GhostCard extends HTMLElement {
  static get observedAttributes() {
    return ['flat'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
}

customElements.define('ghost-card', GhostCard);
export default GhostCard;
