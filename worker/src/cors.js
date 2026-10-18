// 前端在 *.github.io，Worker 在 *.workers.dev，属跨域。
// ALLOWED_ORIGIN 支持逗号分隔的白名单；只有命中的来源才回 Access-Control-Allow-Origin。
export function corsHeaders(origin, allowedOrigins) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  const allow = String(allowedOrigins || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && allow.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
