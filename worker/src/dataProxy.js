// /data/* → R2 直通。路径 1:1 映射到对象键（上传时不带额外的 data/ 前缀）。
// 例：/data/artist_pictures/7/a.jpg → 键 artist_pictures/7/a.jpg
import { contentTypeFor, isImage } from './mime.js';

export async function handleData(request, env, url, cors) {
  let key;
  try {
    key = decodeURIComponent(url.pathname.replace(/^\/data\//, ''));
  } catch (e) {
    return new Response('Bad path', { status: 400, headers: cors });
  }

  // 安全：拒绝空键与路径穿越
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\')) {
    return new Response('Bad path', { status: 400, headers: cors });
  }

  const obj = await env.DATA_BUCKET.get(key);
  if (!obj) {
    return new Response('Not found', { status: 404, headers: cors });
  }

  const headers = new Headers(cors);
  headers.set('Content-Type', contentTypeFor(key));
  // 必须 private：绝不能进共享边缘缓存，否则鉴权内容可能被缓存后外泄
  headers.set('Cache-Control', isImage(key) ? 'private, max-age=86400' : 'private, max-age=300');
  headers.set('Content-Disposition', 'inline');
  if (obj.httpEtag) headers.set('ETag', obj.httpEtag);

  return new Response(obj.body, { headers });
}
