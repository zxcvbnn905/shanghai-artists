// 一次性迁移脚本：把老的 data/auth.json（bcrypt 哈希）迁移成 KV 里的 PBKDF2 哈希。
//
// 为什么需要它：bcrypt 哈希无法离线转成 PBKDF2，必须拿「明文」重新算一遍。
// 所以脚本会逐个询问当前的明文密码，用 bcryptjs 校验它确实对得上老哈希，再生成 PBKDF2 写进 KV。
// 密码值对使用者不变 —— 只是存储形式换了。
//
// 用法（在 worker/ 目录下）：
//   npm install
//   npm run seed          # 写入线上的 KV
//   npm run seed:local    # 写入本地 wrangler 模拟的 KV
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { hashPassword } from '../src/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_JSON = path.resolve(__dirname, '..', '..', 'data', 'auth.json');
const SEED_OUT = path.resolve(__dirname, '..', 'seed.json');
const isLocal = process.argv.includes('--local');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function askCurrentPassword(label, bcryptHash) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pw = (await rl.question(`请输入「${label}」的当前明文密码：`)).trim();
    if (await bcrypt.compare(pw, bcryptHash)) return pw;
    console.log('  ✗ 与老哈希不匹配，请重试');
  }
  throw new Error(`「${label}」连续三次校验失败，已中止`);
}

async function main() {
  if (!fs.existsSync(AUTH_JSON)) {
    throw new Error(`找不到 ${AUTH_JSON}`);
  }
  const old = JSON.parse(fs.readFileSync(AUTH_JSON, 'utf-8'));

  console.log('== 迁移访问密码 ==');
  const accessPlain = await askCurrentPassword('访问密码', old.accessPasswordHash);

  const admins = [];
  for (const a of old.admins || []) {
    console.log(`== 迁移管理员：${a.username} ==`);
    const pw = await askCurrentPassword(a.username, a.passwordHash);
    admins.push({ username: a.username, role: a.role, passwordHash: await hashPassword(pw) });
  }

  const doc = {
    accessPasswordHash: await hashPassword(accessPlain),
    admins
  };

  fs.writeFileSync(SEED_OUT, JSON.stringify(doc, null, 2), 'utf-8');
  console.log(`\n已生成 PBKDF2 哈希 → ${SEED_OUT}`);

  const args = ['wrangler', 'kv', 'key', 'put', '--binding', 'AUTH_KV', 'auth', '--path', SEED_OUT];
  if (isLocal) args.push('--local');
  console.log(`\n执行：npx ${args.join(' ')}\n`);

  const res = spawnSync('npx', args, { stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.log('\n⚠ 自动写入 KV 失败。请手动执行上面的 wrangler 命令，或检查 wrangler 是否已登录（wrangler login）。');
    process.exitCode = 1;
  } else {
    console.log('\n✓ 已写入 KV 的 key「auth」。记得改掉默认口令（1234 / admin:123456）。');
  }

  rl.close();
}

main().catch((err) => {
  console.error('\n迁移失败：', err.message);
  rl.close();
  process.exit(1);
});
