'use strict';
// 腾讯云开发 CloudBase 云函数 —— 鉴权接口。
// 对应 Cloudflare Worker 的 /api/*，行为完全一致，使前端可在两套后端间切换：
// 同样的路由、同样的返回结构、同样的 token 格式、同样的 kver 失效机制。
//
// 注意：云函数运行环境是 CommonJS，不能用 import/export。
// 需要在控制台「函数配置 → 环境变量」设置：TOKEN_SECRET、ALLOWED_ORIGIN
// （可选）ACCESS_TOKEN_TTL、ADMIN_TOKEN_TTL

const cloud = require('@cloudbase/node-sdk');
const lib = require('./lib');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

const COLLECTION = 'config';
const DOC_ID = 'auth';
const AUTH_DEFAULT = { accessPasswordHash: null, admins: [], kver: 1 };

const TOKEN_SECRET = process.env.TOKEN_SECRET || '';
if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) {
  // 空密钥会让所有人伪造 token；缺失/过短时直接拒绝启动，而不是带病运行
  throw new Error('[api] TOKEN_SECRET 未配置或过短（至少 32 个字符），已拒绝启动');
}
const ACCESS_TOKEN_TTL = Number(process.env.ACCESS_TOKEN_TTL || 43200);
const ADMIN_TOKEN_TTL = Number(process.env.ADMIN_TOKEN_TTL || 28800);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
// Mapbox 令牌由后端下发，避免硬编码进公开仓库（前端通过 verify-access 拿到）
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || '';

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

async function issueAdminToken(auth, role, username) {
  const exp = nowSec() + ADMIN_TOKEN_TTL;
  const token = lib.issueToken(TOKEN_SECRET, { r: role, s: username, e: exp, kv: auth.kver || 1 });
  return { token: token, role: role, exp: exp };
}

// ================= 认证数据（云数据库 config/auth） =================
async function loadAuth() {
  try {
    const res = await db.collection(COLLECTION).doc(DOC_ID).get();
    const list = res && res.data;
    const doc = Array.isArray(list) ? list[0] : list;
    if (!doc) return Object.assign({}, AUTH_DEFAULT);
    const out = Object.assign({}, AUTH_DEFAULT);
    for (const k of Object.keys(doc)) if (k !== '_id') out[k] = doc[k];
    return out;
  } catch (e) {
    return Object.assign({}, AUTH_DEFAULT);   // 文档不存在时按默认（未初始化）
  }
}

async function saveAuth(data) {
  await db.collection(COLLECTION).doc(DOC_ID).set(data);
}

// ================= HTTP 辅助 =================
function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  const allow = String(ALLOWED_ORIGIN).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (origin && allow.indexOf(origin) !== -1) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(obj, cors, status) {
  return {
    statusCode: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors),
    body: JSON.stringify(obj)
  };
}

function tokenFrom(qs, body) {
  if (body && body.token) return body.token;
  return (qs && qs.token) || '';
}

// ================= 入口 =================
exports.main = async function (event) {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';
  const cors = corsHeaders(origin);
  const method = event.httpMethod || 'GET';
  const qs = event.queryStringParameters || {};

  // HTTP 访问服务会把服务前缀 /api 剥掉，函数实际收到的是 /verify-access。
  // 这里两种情况都归一化成 /api/xxx，路由判断才和 Cloudflare 版一致。
  let path = event.path || '';
  if (path.indexOf('/api/') !== 0) path = '/api' + (path.charAt(0) === '/' ? path : '/' + path);

  if (method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  let body = {};
  if (method === 'POST') {
    let raw = event.body || '';
    if (event.isBase64Encoded === true || event.isBase64Encoded === 'true') {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    }
    try {
      body = JSON.parse(raw || '{}');
    } catch (e) {
      body = {};
    }
  }

  // ---------- 公开接口 ----------
  if (path === '/api/verify-access' && method === 'POST') {
    const auth = await loadAuth();
    if (!lib.verifyPassword(body.password || '', auth.accessPasswordHash)) {
      return json({ ok: false }, cors);
    }
    const exp = nowSec() + ACCESS_TOKEN_TTL;
    return json({
      ok: true,
      token: lib.issueToken(TOKEN_SECRET, { r: 'access', e: exp }),
      exp: exp,
      mapboxToken: MAPBOX_TOKEN
    }, cors);
  }

  if (path === '/api/admin/login' && method === 'POST') {
    const auth = await loadAuth();
    const admin = (auth.admins || []).find(function (a) { return a.username === body.username; });
    if (!admin) return json({ ok: false }, cors);
    if (!lib.verifyPassword(body.password || '', admin.passwordHash)) return json({ ok: false }, cors);
    return json(Object.assign({ ok: true }, await issueAdminToken(auth, admin.role, admin.username)), cors);
  }

  // ---------- 需要管理员 token ----------
  const payload = lib.verifyToken(TOKEN_SECRET, tokenFrom(qs, body));
  if (!payload || (payload.r !== 'admin' && payload.r !== 'super_admin')) {
    return json({ ok: false, error: 'invalid_token' }, cors);
  }

  const auth = await loadAuth();
  if ((payload.kv || 1) !== (auth.kver || 1)) {
    return json({ ok: false, error: 'stale_token' }, cors);
  }

  if (path === '/api/admin/logout') {
    return json({ ok: true }, cors);   // 无状态：客户端自行丢弃 token
  }

  if (path === '/api/admin/list') {
    const admins = (auth.admins || []).map(function (a) { return { username: a.username, role: a.role }; });
    return json({ ok: true, admins: admins, currentRole: payload.r }, cors);
  }

  if (path === '/api/change-access-pw' && method === 'POST') {
    if (!body.newPassword) return json({ ok: false, error: 'empty_password' }, cors);
    auth.accessPasswordHash = lib.hashPassword(body.newPassword);
    auth.kver = (auth.kver || 1) + 1;
    await saveAuth(auth);
    return json(Object.assign({ ok: true }, await issueAdminToken(auth, payload.r, payload.s)), cors);
  }

  if (path === '/api/change-admin-pw' && method === 'POST') {
    if (!body.curPw || !body.newPw) return json({ ok: false, error: 'empty_password' }, cors);
    const admin = (auth.admins || []).find(function (a) { return a.username === payload.s; });
    if (!admin) return json({ ok: false, error: 'not_found' }, cors);
    if (!lib.verifyPassword(body.curPw, admin.passwordHash)) {
      return json({ ok: false, error: 'wrong_current_password' }, cors);
    }
    admin.passwordHash = lib.hashPassword(body.newPw);
    auth.kver = (auth.kver || 1) + 1;
    await saveAuth(auth);
    return json(Object.assign({ ok: true }, await issueAdminToken(auth, payload.r, payload.s)), cors);
  }

  if (path === '/api/admin/add' && method === 'POST') {
    if (!body.username || !body.password) return json({ ok: false, error: 'empty_fields' }, cors);
    if ((auth.admins || []).some(function (a) { return a.username === body.username; })) {
      return json({ ok: false, error: 'account_exists' }, cors);
    }
    auth.admins.push({ username: body.username, passwordHash: lib.hashPassword(body.password), role: 'admin' });
    await saveAuth(auth);
    return json({ ok: true }, cors);
  }

  if (path === '/api/admin/delete' && method === 'POST') {
    if (payload.r !== 'super_admin') return json({ ok: false, error: 'permission_denied' }, cors);
    if (!body.username) return json({ ok: false, error: 'empty_username' }, cors);
    if (body.username === 'admin') return json({ ok: false, error: 'cannot_delete_super_admin' }, cors);
    const idx = (auth.admins || []).findIndex(function (a) { return a.username === body.username; });
    if (idx === -1) return json({ ok: false, error: 'not_found' }, cors);
    if (auth.admins.length <= 1) return json({ ok: false, error: 'last_admin' }, cors);
    auth.admins.splice(idx, 1);
    auth.kver = (auth.kver || 1) + 1;
    await saveAuth(auth);
    return json(Object.assign({ ok: true }, await issueAdminToken(auth, payload.r, payload.s)), cors);
  }

  return json({ ok: false, error: 'not_found' }, cors, 404);
};
