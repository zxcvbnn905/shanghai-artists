// 入口：CORS 预检 → /api/*（鉴权）→ /data/*（校验 token 后从 R2 取数）→ 404
import { corsHeaders } from './cors.js';
import { handleAuth } from './authRoutes.js';
import { handleData } from './dataProxy.js';
import { verifyToken } from './tokens.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    // 密钥缺失时令牌签名/校验都不可信，直接以明确错误拒绝服务
    if (!env.TOKEN_SECRET || env.TOKEN_SECRET.length < 32) {
      console.error('TOKEN_SECRET is missing or shorter than 32 characters.');
      return new Response('Server misconfigured', { status: 500, headers: cors });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname.startsWith('/api/')) {
      return handleAuth(request, env, url, cors);
    }

    if (url.pathname.startsWith('/data/')) {
      const auth = request.headers.get('Authorization') || '';
      const match = /^Bearer\s+(.+)$/i.exec(auth);
      const token = (match ? match[1].trim() : '') || url.searchParams.get('token') || '';
      const payload = await verifyToken(env.TOKEN_SECRET, token);
      if (!payload) {
        return new Response('Unauthorized', { status: 401, headers: cors });
      }
      return handleData(request, env, url, cors);
    }

    return new Response('Not found', { status: 404, headers: cors });
  }
};
