import crypto from 'node:crypto';

const COOKIE = 'recarga_admin';
const KEY = 'recarga-facil:payment-gateway';

function secret() {
  return process.env.ADMIN_SECRET || '';
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

export function makeSession() {
  const value = `admin.${Date.now()}`;
  return `${value}.${sign(value)}`;
}

export function validSession(req) {
  if (!secret()) return false;
  const header = req.headers.cookie || '';
  const match = header.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
  if (!match) return false;
  const token = decodeURIComponent(match.slice(COOKIE.length + 1));
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const value = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!signature || !value.startsWith('admin.')) return false;
  const expected = sign(value);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function sessionCookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

async function redis(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(`${url}/${command.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
  const data = await response.json();
  return data.result;
}

export async function getGateway() {
  try {
    const stored = await redis(['GET', KEY]);
    if (stored === 'sharpify' || stored === 'blackcat') return stored;
  } catch (error) {
    console.error('Gateway config read:', error);
  }
  return String(process.env.PAYMENT_GATEWAY || 'blackcat').trim().toLowerCase() === 'sharpify' ? 'sharpify' : 'blackcat';
}

export async function setGateway(gateway) {
  if (gateway !== 'sharpify' && gateway !== 'blackcat') throw new Error('Gateway inválido.');
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Configure KV_REST_API_URL e KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN) para permitir a troca pelo painel.');
  }
  await redis(['SET', KEY, gateway]);
  return gateway;
}

export { COOKIE };
