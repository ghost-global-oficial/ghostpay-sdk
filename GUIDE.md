# Ghost Pay SDK - Guia de Implementação

Guia completo para integrar pagamentos cripto na tua aplicação.

---

## Índice

- [Instalação](#instalação)
- [Configuração Inicial](#configuração-inicial)
- [Criar Checkout](#criar-checkout)
  - [Catálogo (Lojas Pequenas)](#catálogo-lojas-pequenas)
- [Receber Pagamentos](#receber-pagamentos)
- [Verificar Pagamentos](#verificar-pagamentos)
- [Webhooks](#webhooks)
- [Mesh Intents](#mesh-intents)
- [Integração Android](#integração-android)
- [Exemplos Reais](#exemplos-reais)
- [Solução de Problemas](#solução-de-problemas)

---

## Instalação

### npm

```bash
npm install @ghostpay/sdk
```

### CDN (script tag)

```html
<script src="https://unpkg.com/@ghostpay/sdk/dist/umd/ghostpay-sdk.js"></script>
```

### Local

```bash
git clone https://github.com/ghostpay/sdk.git
cd sdk
npm install
npm run build
```

---

## Configuração Inicial

### TypeScript / ES Modules

```typescript
import { Wallet, Checkout, WebhookClient, WebhookVerifier } from '@ghostpay/sdk';
```

### JavaScript (UMD)

```html
<script src="ghostpay-sdk.js"></script>
<script>
  const { Wallet, Checkout, WebhookClient, WebhookVerifier } = window.GhostPaySDK;
</script>
```

---

## Criar Checkout

### Pagamento Fixo (produto único)

```typescript
const checkout = Checkout.fromJSON({
  receiver: {
    name: 'Minha Loja',
    email: 'vendas@minhaloja.com',
  },
  mode: 'fixed',
  plans: [
    {
      id: 'produto-1',
      name: 'Curso de Cripto',
      description: 'Acesso vitalício ao curso',
      price: 49.99,
      currency: 'USD',
      selected: true,
    },
  ],
  supportedChains: ['bitcoin', 'ethereum', 'solana', 'polygon', 'bsc'],
});
```

### Planos (múltiplas opções)

```typescript
const checkout = Checkout.fromJSON({
  receiver: { name: 'Minha Loja' },
  mode: 'plans',
  plans: [
    {
      id: 'monthly',
      name: 'Mensal',
      price: 9.99,
      currency: 'USD',
      period: '/mês',
    },
    {
      id: 'annual',
      name: 'Anual',
      price: 7.99,
      currency: 'USD',
      period: '/mês',
      selected: true,
    },
  ],
  supportedChains: ['bitcoin', 'ethereum'],
});
```

### Valor Personalizado (doação)

```typescript
const checkout = Checkout.fromJSON({
  receiver: { name: 'Minha Loja' },
  mode: 'custom',
  supportedChains: ['bitcoin', 'ethereum'],
});
```

### Catálogo (Lojas Pequenas)

Permite definir uma lista de produtos com imagens, preços e descrições. O utilizador seleciona produtos e quantidades através de um modal.

```typescript
import { createCatalogCheckout } from '@ghostpay/sdk';

const checkout = createCatalogCheckout(
  { name: 'Minha Loja' },
  [
    { id: '1', name: 'T-Shirt', price: 25.00, image: 'https://...', description: 'Algodão, tam S-XL' },
    { id: '2', name: 'Boné', price: 15.00, image: 'https://...', description: 'Ajustável' },
    { id: '3', name: 'Stickers', price: 5.00, inStock: false },
  ]
);

// Adicionar itens ao carrinho
checkout.addCatalogItem('1', 2);  // 2x T-Shirt = $50
checkout.addCatalogItem('2', 1);  // 1x Boné = $15

// Ver total
console.log(checkout.catalogTotal);  // 65
console.log(checkout.selectedItems); // [{ product: ..., quantity: 2 }, ...]

// Atualizar quantidade
checkout.setCatalogItemQuantity('1', 3);  // 3x T-Shirt = $75

// Remover item
checkout.removeCatalogItem('2');

// Limpar carrinho
checkout.clearCatalog();

// Gerar link de pagamento
const link = checkout.generatePaymentLink('bc1q...');
```

#### Como funciona na UI

Quando o pagamento é aberto com `?mode=catalog`, a página de pagamento mostra:

1. Um botão "Abrir Catálogo"
2. Um modal sobreposto com grid de produtos
3. Cada produto tem imagem, nome, descrição, preço
4. Controlos de quantidade (+/−) por produto
5. Indicador de "esgotado" para produtos sem stock
6. Total calculado em tempo real
7. Botão "Confirmar Seleção"

#### Via URL (para partilhar)

```typescript
const products = [
  { id: '1', name: 'T-Shirt', price: 25.00, image: 'https://...' },
  { id: '2', name: 'Boné', price: 15.00 },
];

// Produtos disponíveis
const url = `https://ghostpay-systems.vercel.app/payment?receiver=Minha+Loja&catalog=${JSON.stringify(products)}`;

// Produtos já selecionados (carrinho)
const urlWithItems = `https://ghostpay-systems.vercel.app/payment?receiver=Minha+Loja&catalog=${JSON.stringify(products)}&items=1:2,2:1`;
// → T-Shirt x2 + Boné x1 já aparecem na lista à esquerda
```

#### Formato do parâmetro `items=`

```
items=productId:quantity,productId:quantity
```

Exemplos:
- `items=1:2` → Produto "1", quantidade 2
- `items=tshirt:2,cap:1` → T-Shirt x2 + Boné x1
- `items=a:5,b:3,c:1` → 3 produtos diferentes

**Útil para lojas online com carrinho:** O backend gera o link com `items=` já preenchido, e o utilizador vê os itens na payment page sem precisar abrir o catálogo.

#### Na Ghost Wallet (Android)

A app detecta QR codes com parâmetro `catalog` e abre automaticamente o modal de produtos. Ao confirmar, gera a URL com `items=` para pré-selecionar os itens na payment page.

---

## Gerar Payment Link

### Link simples

```typescript
const link = checkout.generatePaymentLink('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
// → ghostpay:payment?receiver=Minha+Loja&amount=49.99&currency=USD&chain=bitcoin&address=bc1q...&nonce=a1b2c3...&sig=...
```

### Link com assinatura HMAC

```typescript
const signingKey = 'minha-chave-secreta-123';
const link = checkout.generatePaymentLink('bc1q...', undefined, signingKey);
// → ghostpay:payment?receiver=...&amount=49.99&sig=hmac-sha256-do-signingkey...
```

### Mostrar QR Code

```html
<ghost-qrcode data="ghostpay:payment?receiver=..." size="lg"></ghost-qrcode>
```

### Copiar link

```typescript
await navigator.clipboard.writeText(link);
```

---

## Receber Pagamentos

### 1. Página de Pagamento Hosted

A forma mais fácil é redirecionar para a página hosted no Vercel:

```typescript
const paymentUrl = `https://ghostpay-systems.vercel.app/payment?receiver=Minha+Loja&amount=49.99&currency=USD&chain=bitcoin&address=bc1q...&sig=...`;
window.location.href = paymentUrl;
```

### 2. Página Própria (integração manual)

```typescript
// 1. Criar checkout
const checkout = Checkout.fromJSON({ ... });

// 2. Gerar link
const link = checkout.generatePaymentLink('bc1q...');

// 3. Mostrar QR code
document.getElementById('qr').setAttribute('data', link);

// 4. Escutar confirmação (polling)
setInterval(async () => {
  const stored = localStorage.getItem('ghost_transactions');
  if (stored) {
    const transactions = JSON.parse(stored);
    const confirmed = transactions.find(t => t.status === 'completed');
    if (confirmed) {
      alert('Pagamento confirmado!');
    }
  }
}, 5000);
```

### 3. No servidor (Node.js)

```typescript
// Receber pagamento via webhook
const express = require('express');
const { WebhookVerifier } = require('@ghostpay/sdk');

const app = express();
app.use(express.json());

app.post('/api/ghostpay-webhook', (req, res) => {
  const signature = req.headers['x-ghostpay-signature'];
  const secret = process.env.GHOSTPAY_WEBHOOK_SECRET;

  // Verificar assinatura
  const isValid = WebhookVerifier.verify(
    JSON.stringify(req.body),
    signature,
    secret
  );

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Processar pagamento
  const { event, data } = req.body;
  
  if (event === 'payment.confirmed') {
    console.log('Pagamento confirmado:', data);
    // Ativar produto/serviço
  }

  res.json({ received: true });
});

app.listen(3000);
```

---

## Verificar Pagamentos

### Verificar assinatura HMAC

```typescript
import { WebhookVerifier } from '@ghostpay/sdk';

const payload = JSON.stringify({
  event: 'payment.confirmed',
  data: { txHash: 'abc123...', amount: 4999 }
});

const signature = 'hmac-sha256-do-payload...';
const secret = 'minha-chave-secreta';

const isValid = WebhookVerifier.verify(payload, signature, secret);
// → true ou false
```

### Verificar transação na blockchain

```typescript
import { TransactionValidator } from '@ghostpay/sdk';

const validator = new TransactionValidator();

// Verificar se transação é válida
const isValid = await validator.verify({
  hash: 'abc123...',
  chain: 'bitcoin',
  amount: 4999,
  to: 'bc1q...',
  confirmations: 3,
});
```

---

## Webhooks

### Enviar webhook

```typescript
import { WebhookClient } from '@ghostpay/sdk';

const client = new WebhookClient({
  url: 'https://minhaloja.com/api/ghostpay-webhook',
  secret: 'minha-chave-secreta',
});

// Notificar pagamento confirmado
await client.notify('payment.confirmed', {
  txHash: 'abc123...',
  chain: 'bitcoin',
  amount: 4999,
  from: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  confirmations: 3,
});
```

### Receber webhook (Express)

```typescript
app.post('/api/ghostpay-webhook', (req, res) => {
  const { event, data, timestamp } = req.body;

  switch (event) {
    case 'payment.confirmed':
      // Ativar produto
      activateProduct(data.userId, data.productId);
      break;
    case 'payment.pending':
      // Enviar email de confirmação
      sendConfirmationEmail(data.email);
      break;
    case 'payment.failed':
      // Notificar admin
      notifyAdmin(data);
      break;
  }

  res.json({ received: true });
});
```

---

## Mesh Intents

Quando o checkout precisa funcionar com coordenação descentralizada, a API de mesh pode guardar
intenções de pagamento como eventos locais e replicáveis.

```typescript
import { MeshIntentManager } from '@ghostpay/sdk';

const mesh = new MeshIntentManager();

const intent = mesh.create({
  receiver: 'Minha Loja',
  amount: 49.99,
  currency: 'USD',
  chain: 'bitcoin',
  address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  nonce: 'n-123',
  nodeId: 'ghost-wallet-local',
});

console.log(mesh.list());
mesh.sync(intent.id);
```

Use esta API quando:
- o dispositivo da Ghost Wallet atua como nó local
- não existe backend central teu
- a mesh precisa registrar o estado do pagamento antes da liquidação on-chain

---

## Integração Android

### Deep Links

A Ghost Wallet app regista o scheme `ghostpay://`. Quando um QR code é escaneado com `ghostpay:payment?...`, a app abre automaticamente a página de pagamento hosted.

### No React Native (Expo)

```typescript
import { Linking } from 'react-native';

// Ao escanear QR code
const handleQRCode = (data: string) => {
  if (data.startsWith('ghostpay:payment?')) {
    const queryString = data.replace('ghostpay:payment?', '');
    const paymentUrl = `https://ghostpay-systems.vercel.app/payment?${queryString}`;
    Linking.openURL(paymentUrl);
  }
};
```

### No app.json (Expo)

```json
{
  "expo": {
    "scheme": "ghostpay",
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [
            {
              "scheme": "ghostpay",
              "host": "payment"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

---

## Exemplos Reais

### Exemplo 1: Loja Online

```typescript
// 1. Configurar checkout
const checkout = Checkout.fromJSON({
  receiver: { name: 'Tech Store' },
  mode: 'fixed',
  plans: [{
    id: 'laptop',
    name: 'MacBook Pro',
    price: 1999.00,
    currency: 'USD',
    selected: true,
  }],
  supportedChains: ['bitcoin', 'ethereum'],
});

// 2. Gerar link com HMAC
const paymentLink = checkout.generatePaymentLink(
  'bc1q...',
  undefined,
  process.env.GHOSTPAY_SIGNING_KEY
);

// 3. Redirecionar para página hosted
window.location.href = `https://ghostpay-systems.vercel.app/payment?${new URL(paymentLink.replace('ghostpay:payment?', '')).searchParams.toString()}`;
```

### Exemplo 2: App de Doações

```typescript
// 1. Checkout personalizado
const checkout = Checkout.fromJSON({
  receiver: { name: 'ONG Esperança' },
  mode: 'custom',
  supportedChains: ['bitcoin', 'ethereum', 'solana'],
});

// 2. Usuário define valor
const amount = parseFloat(document.getElementById('amount').value);

// 3. Gerar link
const link = checkout.generatePaymentLink('bc1q...', amount);

// 4. Mostrar QR code
document.querySelector('ghost-qrcode').setAttribute('data', link);
```

### Exemplo 3: Loja com Catálogo

```typescript
// 1. Configurar catálogo
const checkout = createCatalogCheckout(
  { name: 'Loja de Merch' },
  [
    { id: 'tshirt', name: 'T-Shirt Ghost Pay', price: 25.00, image: 'https://...' },
    { id: 'cap', name: 'Boné Ghost Pay', price: 15.00, image: 'https://...' },
    { id: 'sticker', name: 'Pack de Stickers', price: 5.00 },
  ],
  ['bitcoin', 'ethereum', 'solana']
);

// 2. Gerar link para partilhar
const products = checkout.catalogProducts;
const shareUrl = `https://ghostpay-systems.vercel.app/payment?receiver=Loja+de+Merch&catalog=${JSON.stringify(products)}`;

// 3. Abrir página de pagamento
window.location.href = shareUrl;

// 4. Ou gerar QR code
const qrData = `ghostpay:payment?receiver=Loja+de+Merch&catalog=${encodeURIComponent(JSON.stringify(products))}`;
document.querySelector('ghost-qrcode').setAttribute('data', qrData);
```

### Exemplo 4: SaaS com Webhooks

```typescript
// 1. Criar checkout com webhook
const checkout = Checkout.fromJSON({
  receiver: { name: 'SaaS App' },
  mode: 'plans',
  plans: [
    { id: 'pro', name: 'Pro', price: 29.00, currency: 'USD', period: '/mês' },
  ],
  webhookUrl: 'https://api.mysaas.com/ghostpay-webhook',
  webhookSecret: process.env.WEBHOOK_SECRET,
});

// 2. Webhook handler (no servidor)
app.post('/ghostpay-webhook', async (req, res) => {
  const { event, data } = req.body;

  if (event === 'payment.confirmed') {
    // Ativar subscription do usuário
    await db.subscriptions.create({
      userId: data.metadata.userId,
      plan: data.metadata.planId,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
  }

  res.json({ received: true });
});
```

---

## Solução de Problemas

### SDK não carrega

```html
<!-- Verificar se o SDK foi carregado -->
<script>
  if (typeof window.GhostPaySDK === 'undefined') {
    console.error('SDK não carregado');
  }
</script>
```

### QR Code não aparece

```html
<!-- Verificar se o componente está registrado -->
<script src="/components/ghost-qrcode.js"></script>
<ghost-qrcode data="ghostpay:payment?..." size="lg"></ghost-qrcode>
```

### Pagamento não é detectado

```typescript
// Verificar se a transação está no localStorage
const stored = localStorage.getItem('ghost_transactions');
console.log('Transações:', JSON.parse(stored || '[]'));
```

### Webhook não recebe dados

```typescript
// Verificar se o servidor está a receber requests
app.post('/webhook', (req, res) => {
  console.log('Webhook recebido:', req.body);
  res.json({ received: true });
});
```

### Erro de CORS

```typescript
// No servidor, adicionar headers CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-GhostPay-Signature');
  next();
});
```

---

## URLs de Referência

| Recurso | URL |
|---------|-----|
| Checkout hosted | `https://ghostpay-systems.vercel.app/payment` |
| Scanner hosted | `https://ghostpay-systems.vercel.app/scan` |
| SDK UMD | `https://unpkg.com/@ghostpay/sdk/dist/umd/ghostpay-sdk.js` |
| GitHub | `https://github.com/ghostpay/sdk` |
| NPM | `https://www.npmjs.com/package/@ghostpay/sdk` |

---

## Suporte

- **Issues**: https://github.com/ghostpay/sdk/issues
- **Discord**: https://discord.gg/ghostpay
- **Twitter**: https://twitter.com/ghostpay

---

MIT License
