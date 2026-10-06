import { getGateway, setGateway, makeSession, validSession, sessionCookie, clearSessionCookie } from './_admin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && req.query?.action === 'login') {
    const password = String(req.body?.password || '');
    if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SECRET) {
      return res.status(500).json({ success: false, message: 'ADMIN_PASSWORD e ADMIN_SECRET não configurados.' });
    }
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ success: false, message: 'Senha inválida.' });
    res.setHeader('Set-Cookie', sessionCookie(makeSession()));
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && req.query?.action === 'logout') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ success: true });
  }

  if (!validSession(req)) return res.status(401).json({ success: false, message: 'Não autorizado.' });

  if (req.method === 'GET') {
    return res.status(200).json({ success: true, gateway: await getGateway() });
  }

  if (req.method === 'POST') {
    const gateway = String(req.body?.gateway || '').toLowerCase();
    try {
      const active = await setGateway(gateway);
      return res.status(200).json({ success: true, gateway: active });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  return res.status(405).json({ success: false, message: 'Método não permitido.' });
}
