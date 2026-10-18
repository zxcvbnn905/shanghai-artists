// /api/* 鉴权接口。逻辑移植自原 server.js，把 bcrypt 换成 PBKDF2、内存 session 换成签名 token。
//
// token 吊销（kver）：auth 文档里存一个版本号 kver，管理员 token 上带签发时的版本号。
// 任何密码变更 / 删除管理员都会把 kver+1，让所有旧的管理员 token 立即失效；
// 同时响应里回发一张新 token，让正在操作的管理员无缝续上（否则会把后台弄坏）。
// 访客的 access token 不做版本校验（/data/* 请求量极大，逐次读 KV 不划算），只靠有效期兜底。
import { hashPassword, verifyPassword } from './crypto.js';
import { issueToken, verifyToken } from './tokens.js';

const KV_KEY = 'auth';

async function loadAuth(env) {
  const data = await env.AUTH_KV.get(KV_KEY, { type: 'json' });
  return data || { accessPasswordHash: null, admins: [], kver: 1 };
}

async function issueAdminToken(env, auth, role, username) {
  const exp = nowSec() + Number(env.ADMIN_TOKEN_TTL || 28800);
  const token = await issueToken(env.TOKEN_SECRET, { r: role, s: username, e: exp, kv: auth.kver || 1 });
  return { token, role, exp };
}

async function saveAuth(env, data) {
  await env.AUTH_KV.put(KV_KEY, JSON.stringify(data));
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

// token 优先取 Authorization: Bearer，兼容旧的 body/query 传法
function tokenFrom(request, url, body) {
  const auth = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (match) return match[1].trim();
  if (body && body.token) return body.token;
  return url.searchParams.get('token') || '';
}

export async function handleAuth(request, env, url, cors) {
  const path = url.pathname;
  const method = request.method;

  let body = {};
  if (method === 'POST') {
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }
  }

  // ---------- 公开接口 ----------
  if (path === '/api/verify-access' && method === 'POST') {
    const auth = await loadAuth(env);
    const ok = await verifyPassword(body.password || '', auth.accessPasswordHash);
    if (!ok) return json({ ok: false }, cors);
    const exp = nowSec() + Number(env.ACCESS_TOKEN_TTL || 43200);
    const token = await issueToken(env.TOKEN_SECRET, { r: 'access', e: exp });
    // Mapbox 令牌随登录下发，避免硬编码进公开仓库
    return json({ ok: true, token, exp, mapboxToken: env.MAPBOX_TOKEN || '' }, cors);
  }

  if (path === '/api/admin/login' && method === 'POST') {
    const auth = await loadAuth(env);
    const admin = (auth.admins || []).find((a) => a.username === body.username);
    if (!admin) return json({ ok: false }, cors);
    const ok = await verifyPassword(body.password || '', admin.passwordHash);
    if (!ok) return json({ ok: false }, cors);
    return json({ ok: true, ...(await issueAdminToken(env, auth, admin.role, admin.username)) }, cors);
  }

  if (path === '/api/verify-token' && method === 'POST') {
    const payload = await verifyToken(env.TOKEN_SECRET, tokenFrom(request, url, body));
    if (!payload || payload.r !== 'access') {
      return json({ ok: false, error: 'invalid_token' }, cors);
    }
    return json({ ok: true, exp: payload.e }, cors);
  }

  // ---------- 需要管理员 token ----------
  const payload = await verifyToken(env.TOKEN_SECRET, tokenFrom(request, url, body));
  if (!payload || (payload.r !== 'admin' && payload.r !== 'super_admin')) {
    return json({ ok: false, error: 'invalid_token' }, cors);
  }

  const auth = await loadAuth(env);
  // 版本号校验：任何密码 / 管理员变更都会让旧券立即失效
  if ((payload.kv || 1) !== (auth.kver || 1)) {
    return json({ ok: false, error: 'stale_token' }, cors);
  }

  if (path === '/api/admin/logout') {
    return json({ ok: true }, cors); // 无状态：客户端自行丢弃 token
  }

  if (path === '/api/admin/list') {
    const admins = (auth.admins || []).map((a) => ({ username: a.username, role: a.role }));
    return json({ ok: true, admins, currentRole: payload.r }, cors);
  }

  if (path === '/api/change-access-pw' && method === 'POST') {
    if (!body.newPassword) return json({ ok: false, error: 'empty_password' }, cors);
    auth.accessPasswordHash = await hashPassword(body.newPassword);
    auth.kver = (auth.kver || 1) + 1;
    await saveAuth(env, auth);
    return json({ ok: true, ...(await issueAdminToken(env, auth, payload.r, payload.s)) }, cors);
  }

  if (path === '/api/change-admin-pw' && method === 'POST') {
    if (!body.curPw || !body.newPw) return json({ ok: false, error: 'empty_password' }, cors);
    const admin = (auth.admins || []).find((a) => a.username === payload.s);
    if (!admin) return json({ ok: false, error: 'not_found' }, cors);
    const valid = await verifyPassword(body.curPw, admin.passwordHash);
    if (!valid) return json({ ok: false, error: 'wrong_current_password' }, cors);
    admin.passwordHash = await hashPassword(body.newPw);
    auth.kver = (auth.kver || 1) + 1;
    await saveAuth(env, auth);
    return json({ ok: true, ...(await issueAdminToken(env, auth, payload.r, payload.s)) }, cors);
  }

  if (path === '/api/admin/add' && method === 'POST') {
    if (payload.r !== 'super_admin') return json({ ok: false, error: 'permission_denied' }, cors);
    if (!body.username || !body.password) return json({ ok: false, error: 'empty_fields' }, cors);
    if ((auth.admins || []).some((a) => a.username === body.username)) {
      return json({ ok: false, error: 'account_exists' }, cors);
    }
    auth.admins.push({ username: body.username, passwordHash: await hashPassword(body.password), role: 'admin' });
    await saveAuth(env, auth);
    return json({ ok: true }, cors);
  }

  if (path === '/api/admin/delete' && method === 'POST') {
    if (payload.r !== 'super_admin') return json({ ok: false, error: 'permission_denied' }, cors);
    if (!body.username) return json({ ok: false, error: 'empty_username' }, cors);
    if (body.username === payload.s) return json({ ok: false, error: 'self_delete' }, cors);
    const idx = (auth.admins || []).findIndex((a) => a.username === body.username);
    if (idx === -1) return json({ ok: false, error: 'not_found' }, cors);
    const target = auth.admins[idx];
    const superAdminCount = auth.admins.filter((a) => a.role === 'super_admin').length;
    if (target.role === 'super_admin' && superAdminCount <= 1) {
      return json({ ok: false, error: 'last_super_admin' }, cors);
    }
    auth.admins.splice(idx, 1);
    auth.kver = (auth.kver || 1) + 1;
    await saveAuth(env, auth);
    return json({ ok: true, ...(await issueAdminToken(env, auth, payload.r, payload.s)) }, cors);
  }

  return json({ ok: false, error: 'not_found' }, cors, 404);
}
