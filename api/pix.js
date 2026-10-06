import { getGateway } from './_admin.js';
const SHARPIFY_BASE_URL = 'https://sharpify-pay.com';
const BLACKCAT_API_URL = process.env.BLACKCAT_API_URL || 'https://api.blackcatoficial.com/api/sales/create-sale';


function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function findDeep(obj, keys, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return undefined;
  const direct = pick(obj, keys);
  if (direct !== undefined) return direct;
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findDeep(value, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-sharpify-client-id': process.env.SHARPIFY_CLIENT_ID || '',
    'x-sharpify-client-secret': process.env.SHARPIFY_CLIENT_SECRET || ''
  };
}

function sharpifyConfigured() {
  return !!(process.env.SHARPIFY_CLIENT_ID && process.env.SHARPIFY_CLIENT_SECRET);
}

async function createSharpify(input, amount) {
  if (!sharpifyConfigured()) {
    throw new Error('SHARPIFY_CLIENT_ID e SHARPIFY_CLIENT_SECRET não configurados no ambiente da Vercel.');
  }

  const webhook = process.env.SHARPIFY_WEBHOOK_URL
    ? { callbackURL: process.env.SHARPIFY_WEBHOOK_URL }
    : undefined;

  const payload = {
    name: input.product_name || 'Recarga de Celular - Recarga Fácil',
    description: buildDescription(input),
    amount,
    gatewayMethod: 'PIX',
    ...(webhook ? { webhook } : {})
  };

  const response = await fetch(`${SHARPIFY_BASE_URL}/api/v1/gateway/payment/create-paymnet`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Sharpify retornou HTTP ${response.status}.`);
  }

  const paymentLinkId = findDeep(data, ['paymentLinkId', 'payment_link_id', 'linkId', 'id']);
  const copyPaste = findDeep(data, ['copyPaste', 'copyAndPaste', 'pixCopyPaste', 'pixCode', 'qrCode']);
  const qrCodeBase64 = findDeep(data, ['qrCodeBase64', 'qr_code_base64', 'pixQrCodeBase64']);
  const qrCode = findDeep(data, ['qrCode', 'qr_code']);
  const paymentUrl = findDeep(data, ['paymentUrl', 'paymentURL', 'checkoutUrl', 'checkoutURL', 'url', 'link']);

  if (!paymentLinkId && !copyPaste && !paymentUrl) {
    throw new Error('Sharpify criou a solicitação, mas a resposta não trouxe paymentLinkId, PIX ou link de pagamento.');
  }

  return {
    success: true,
    data: {
      paymentData: {
        copyPaste: typeof copyPaste === 'string' ? copyPaste : '',
        qrCodeBase64: typeof qrCodeBase64 === 'string' ? qrCodeBase64 : null,
        qrCode: typeof qrCode === 'string' ? qrCode : ''
      },
      transactionId: paymentLinkId || null,
      paymentLinkId: paymentLinkId || null,
      paymentUrl: typeof paymentUrl === 'string' ? paymentUrl : null,
      status: normalizeStatus(findDeep(data, ['status', 'paymentStatus', 'state'])) || 'PENDING',
      amount: amount * 100,
      amountDisplay: amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      gateway: 'sharpify',
      raw: data
    }
  };
}

function buildDescription(input) {
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const parts = [
    input.product_name || 'Recarga de celular',
    metadata.operadora ? `Operadora: ${metadata.operadora}` : '',
    metadata.telefone ? `Telefone: ${metadata.telefone}` : ''
  ].filter(Boolean);
  return parts.join(' | ').slice(0, 500);
}

function normalizeStatus(status) {
  if (!status) return null;
  const s = String(status).trim().toUpperCase();
  const map = {
    APPROVED: 'PAID', CONFIRMED: 'PAID', PAID: 'PAID', COMPLETED: 'PAID',
    CANCELED: 'CANCELLED', CANCELLED: 'CANCELLED', EXPIRED: 'CANCELLED',
    FAILED: 'FAILED', REFUNDED: 'REFUNDED',
    PENDING: 'PENDING', WAITING: 'PENDING', PROCESSING: 'PENDING'
  };
  return map[s] || s;
}

async function createBlackcat(input, amount) {
  if (!process.env.BLACKCAT_API_KEY) {
    throw new Error('BLACKCAT_API_KEY não configurada no ambiente da Vercel.');
  }
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const payload = {
    amount: Math.round(amount * 100), currency: 'BRL', paymentMethod: 'pix',
    items: [{ title: input.product_name || 'Recarga de Celular - Recarga Fácil', quantity: 1, tangible: false }],
    customer: {
      name: process.env.BLACKCAT_CLIENT_NAME || 'Recarga Fácil',
      email: process.env.BLACKCAT_CLIENT_EMAIL || 'contato@recargatodahora.online',
      phone: String(metadata.telefone || '11999999999'),
      document: { number: process.env.BLACKCAT_CLIENT_DOCUMENT || '', type: 'cpf' }
    },
    pix: { expiresInDays: 1 }, metadata,
    ...(process.env.BLACKCAT_POSTBACK_URL ? { postbackUrl: process.env.BLACKCAT_POSTBACK_URL } : {}),
    externalRef: `RTH-${new Date().toISOString().slice(0,10).replaceAll('-', '')}-${crypto.randomUUID().slice(0,8)}`
  };

  const response = await fetch(BLACKCAT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.BLACKCAT_API_KEY },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data?.data?.paymentData) {
    throw new Error(data?.message || data?.error || 'A API BlackCat não retornou um Pix válido.');
  }
  return {
    success: true,
    data: {
      paymentData: {
        copyPaste: data.data.paymentData.copyPaste || '',
        qrCodeBase64: data.data.paymentData.qrCodeBase64 || null,
        qrCode: data.data.paymentData.qrCode || ''
      },
      transactionId: data.data.transactionId || null,
      status: data.data.status || 'PENDING',
      amount: data.data.amount || Math.round(amount * 100),
      amountDisplay: amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      invoiceUrl: data.data.invoiceUrl || null,
      gateway: 'blackcat'
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Método não permitido' });

  const input = req.body || {};
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 1000) {
    return res.status(400).json({ success: false, message: 'amount deve ser um número entre 0,01 e 1.000.' });
  }

  try {
    const result = (await getGateway()) === 'sharpify'
      ? await createSharpify(input, amount)
      : await createBlackcat(input, amount);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Gateway create payment:', error);
    return res.status(502).json({ success: false, message: error.message || 'Não foi possível criar o pagamento.' });
  }
}
