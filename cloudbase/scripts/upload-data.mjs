// 把网站运行需要的数据上传到 CloudBase 云存储。
//
// 白名单方式：只上传下列条目，绝不误传 上海市_高德路网/、*.gdb、auth.json、*.csv~ 等。
// 云存储路径不带 data/ 前缀（要和网站里 /data/... 之后的部分对上）。
//
// 用法（在 cloudbase/ 目录下）：
//   npm run upload:data            # 真上传
//   npm run upload:data -- --dry-run   # 只列出要传什么，不实际上传
//
// 前置：已经 tcb login，且 cloudbaserc.json 里的 envId 正确。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLOUDBASE_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(CLOUDBASE_DIR, '..', 'data');

// 白名单：只传这些（目录或文件），云存储路径 = 名字本身
const ITEMS = [
  'artist_pictures',
  'studio_pictures',
  'SH1937_street.geojson',
  'SH1947_street.geojson',
  'roadTranslation1937.csv',
  'roadTranslation1947.csv',
  'buildingPicture_manifest.json',
  'studioPicture_manifest.json',
  'artistPicture_manifest.json',
  'Relationships_original_ID.csv',
  'studio_artists_list.csv',
  'Full_list_2026.1.23_website.CSV',
  'studio.csv'
];

const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(DATA_DIR)) {
  console.error(`找不到数据目录：${DATA_DIR}`);
  process.exit(1);
}

console.log(`数据目录：${DATA_DIR}`);
console.log(`模式：${dryRun ? 'DRY-RUN（不实际上传）' : '正式上传'}\n`);

let okCount = 0;
const failed = [];

for (const item of ITEMS) {
  const local = path.join(DATA_DIR, item);
  if (!fs.existsSync(local)) {
    console.log(`跳过（本地不存在）：${item}`);
    continue;
  }
  const kind = fs.statSync(local).isDirectory() ? '目录' : '文件';
  console.log(`\n>>> [${kind}] ${item}  →  云存储 ${item}`);
  if (dryRun) continue;

  const res = spawnSync(
    'npx',
    ['tcb', 'storage', 'upload', local, item, '--times', '3'],
    { stdio: 'inherit', shell: true, cwd: CLOUDBASE_DIR }
  );
  if (res.status === 0) {
    okCount++;
  } else {
    failed.push(item);
    console.error(`!! 上传失败：${item}`);
  }
}

console.log(`\n===== 完成 =====`);
console.log(`成功：${okCount} 项`);
if (failed.length) {
  console.log(`失败：${failed.length} 项 → ${failed.join(', ')}`);
  process.exit(1);
}
if (!dryRun) {
  console.log('\n下一步：到云存储里随便复制一个文件的 fileID，取其前缀填进 cloudbaserc.json 的 STORAGE_PREFIX。');
}
