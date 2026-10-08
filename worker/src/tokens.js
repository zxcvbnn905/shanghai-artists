// 无状态 token：base64url(JSON).base64url(HMAC-SHA256)。
// 取代原 Express 服务的内存 session —— Worker isolate 是分布且短暂的，memory 里存不住。
import { b64u, b64uDecode } from './crypto.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKey = null;
let cachedSecret = null;

async function hmacKey(secret) {
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  cachedSecret = secret;
  return cachedKey;
}

export async function issueToken(secret, payload) {
  const body = b64u(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return body + '.' + b64u(sig);
}

// 校验签名与过期时间；通过返回 payload，否则返回 null
export async function verifyToken(secret, token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64uDecode(sig), encoder.encode(body));
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(decoder.decode(b64uDecode(body)));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.e !== 'number') return null;
  if (payload.e < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
