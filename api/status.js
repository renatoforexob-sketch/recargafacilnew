import { getGateway } from './_admin.js';
const SHARPIFY_BASE_URL = 'https://sharpify-pay.com';
const BLACKCAT_STATUS_URL = process.env.BLACKCAT_STATUS_URL || 'https://api.blackcatpay.com.br/api/sales';


function findDeep(obj, keys, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findDeep(value, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function normalizeStatus(status) {
  if (!status) return 'PENDING';
  const s = String(status).trim().toUpperCase();
  const map = {
    APPROVED: 'PAID', CONFIRMED: 'PAID', PAID: 'PAID', COMPLETED: 'PAID',
    CANCELED: 'CANCELLED', CANCELLED: 'CANCELLED', EXPIRED: 'CANCELLED',
    FAILED: 'FAILED', REFUNDED: 'REFUNDED',
    PENDING: 'PENDING', WAITING: 'PENDING', PROCESSING: 'PENDING'
  };
  return map[s] || s;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Método não permitido' });

  const transaction = String(req.query?.transaction || '').trim();
  if (!transaction) return res.status(400).json({ success: false, message: 'transaction é obrigatória.' });

  try {
    if ((await getGateway()) === 'sharpify') {
      if (!process.env.SHARPIFY_CLIENT_ID || !process.env.SHARPIFY_CLIENT_SECRET) {
        return res.status(500).json({ success: false, message: 'Credenciais Sharpify não configuradas na Vercel.' });
      }

      const url = `${SHARPIFY_BASE_URL}/api/v1/gateway/payment/get-payment?paymentLinkId=${encodeURIComponent(transaction)}`;
      const response = await fetch(url, {
        headers: {
          'x-sharpify-client-id': process.env.SHARPIFY_CLIENT_ID,
          'x-sharpify-client-secret': process.env.SHARPIFY_CLIENT_SECRET,
          'Content-Type': 'application/json'
        }
      });
      const text = await response.text();
      let raw;
      try { raw = JSON.parse(text); } catch { raw = { raw: text }; }

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          message: raw?.message || raw?.error || `Sharpify retornou HTTP ${response.status}.`
        });
      }

      const status = normalizeStatus(findDeep(raw, ['status', 'paymentStatus', 'state']));
      return res.status(200).json({
        success: true,
        data: { status, paymentLinkId: transaction, gateway: 'sharpify', raw }
      });
    }

    if (!process.env.BLACKCAT_API_KEY) {
      return res.status(500).json({ success: false, message: 'BLACKCAT_API_KEY não configurada no ambiente da Vercel.' });
    }

    const safeTransaction = transaction.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeTransaction) return res.status(400).json({ success: false, message: 'transaction inválida.' });

    const response = await fetch(`${BLACKCAT_STATUS_URL}/${encodeURIComponent(safeTransaction)}/status`, {
      headers: { 'X-API-Key': process.env.BLACKCAT_API_KEY, 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Gateway payment status:', error);
    return res.status(502).json({ success: false, message: 'Não foi possível consultar o status do pagamento.' });
  }
}
