// 扩展名 → Content-Type。优先按扩展名判断（比 R2 上传时记录的元数据可靠），
// 且把扩展名统一转小写，因为存在 Full_list_2026.1.23_website.CSV 这种大写后缀。
const TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  json: 'application/json; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  geojson: 'application/geo+json',
  txt: 'text/plain; charset=utf-8',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf'
};

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

function ext(key) {
  const m = String(key).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function contentTypeFor(key) {
  return TYPES[ext(key)] || 'application/octet-stream';
}

export function isImage(key) {
  return IMAGE_EXT.includes(ext(key));
}
