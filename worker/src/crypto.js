// 密码哈希与编码工具：全部基于 WebCrypto（Worker 原生实现，CPU 开销极低）。
// 有意不用 bcryptjs —— 纯 JS 的 bcrypt 在 Workers 免费档的 CPU 上限下会超限。
// 存储格式：pbkdf2$sha256$<迭代次数>$<saltBase64url>$<hashBase64url>

const PBKDF2_ITER = 100000;
const encoder = new TextEncoder();

export function b64u(bytes) {
  const view = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return b64u(bits);
}

export async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, saltBytes, PBKDF2_ITER);
  return `pbkdf2$sha256$${PBKDF2_ITER}$${b64u(saltBytes)}$${hash}`;
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = parseInt(parts[2], 10);
  const saltBytes = b64uDecode(parts[3]);
  const expected = parts[4];
  const actual = await pbkdf2(password, saltBytes, iterations);
  return timingSafeEqual(actual, expected);
}
