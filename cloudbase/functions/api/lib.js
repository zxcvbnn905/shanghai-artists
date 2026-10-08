'use strict';
// 加密与签名工具（不依赖 CloudBase SDK，可在本地直接单测）。
// 格式与 Cloudflare Worker 版保持一致，便于两套后端行为对齐：
//   密码：pbkdf2$sha256$<迭代次数>$<saltBase64url>$<hashBase64url>
//   token：base64url(JSON payload).base64url(HMAC-SHA256)
const crypto = require('crypto');

const PBKDF2_ITER = 100000;

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, 32, 'sha256');
  return 'pbkdf2$sha256$' + PBKDF2_ITER + '$' + b64u(salt) + '$' + b64u(hash);
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = parseInt(parts[2], 10);
  const salt = b64uDecode(parts[3]);
  const expected = Buffer.from(parts[4]);        // 存储的是 base64url 文本
  const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const actualB64u = Buffer.from(b64u(actual));  // 转成同样形态再恒定时间比较
  return expected.length === actualB64u.length && crypto.timingSafeEqual(expected, actualB64u);
}

function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest();
}

function issueToken(secret, payload) {
  const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'));
  return body + '.' + b64u(sign(secret, body));
}

function verifyToken(secret, token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const body = parts[0];
  const expected = sign(secret, body);
  const got = b64uDecode(parts[1]);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  let payload;
  try {
    payload = JSON.parse(b64uDecode(body).toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.e !== 'number') return null;
  if (payload.e < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

module.exports = {
  b64u: b64u,
  b64uDecode: b64uDecode,
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  sign: sign,
  issueToken: issueToken,
  verifyToken: verifyToken
};
