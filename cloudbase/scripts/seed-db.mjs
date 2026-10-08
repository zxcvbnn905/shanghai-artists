// 生成 CloudBase 云数据库的认证文档，并**直接写入**（可重复运行）。
//
// 为什么不用 data/auth.json：里面的 bcrypt 哈希没法离线转成 PBKDF2，必须用明文重算。
// 本脚本在本地询问明文密码、算出 PBKDF2 哈希，明文只存在内存里，不会落盘也不会回显。
//
// 用法（在 cloudbase/ 目录下，任意终端都行）：
//   npm run seed:db
//
// 实现说明：调用 CloudBase CLI 时用 `node <cli入口> …` + 参数数组，绕开 shell 引号问题
// （在 cmd.exe 里单引号不是引号，直接粘贴 JSON 会解析失败）。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../../worker/src/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLOUDBASE_DIR = path.resolve(__dirname, '..');
const CLI_BIN = path.join(CLOUDBASE_DIR, 'node_modules', '@cloudbase', 'cli', 'bin', 'tcb');

let envId = '';
try {
  envId = JSON.parse(fs.readFileSync(path.join(CLOUDBASE_DIR, 'cloudbaserc.json'), 'utf-8')).envId || '';
} catch (e) {}
if (!envId) {
  console.error('读不到 envId，请先确认 cloudbase/cloudbaserc.json 存在且填了 envId。');
  process.exit(1);
}
if (!fs.existsSync(CLI_BIN)) {
  console.error(`找不到 CLI：${CLI_BIN}\n请先在 cloudbase/ 目录执行 npm install。`);
  process.exit(1);
}

const PROMPTS = [
  '访问密码（访客进入网站用的）：',
  '管理员用户名（回车默认 admin）：',
  '管理员密码：'
];

async function askAll(prompts) {
  // 交互式终端：逐条提问
  if (process.stdin.isTTY) {
    const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout });
    const answers = [];
    for (const p of prompts) answers.push((await rl.question(p)).trim());
    rl.close();
    return answers;
  }
  // 非交互（管道/重定向）：一次性读取全部行
  const lines = fs.readFileSync(0, 'utf8').split(/\r?\n/);
  return prompts.map((p, i) => {
    process.stdout.write(p + (lines[i] || '') + '\n');
    return (lines[i] || '').trim();
  });
}

const [accessPw, adminUserRaw, adminPw] = await askAll(PROMPTS);
const adminUser = adminUserRaw || 'admin';

if (!accessPw || !adminPw) {
  console.error('\n密码不能为空。');
  process.exit(1);
}

const doc = {
  _id: 'auth',
  accessPasswordHash: await hashPassword(accessPw),
  admins: [{ username: adminUser, role: 'super_admin', passwordHash: await hashPassword(adminPw) }],
  kver: 1
};

// 先删旧的 auth 文档再插入 —— 重复运行不会报"已存在"
const mgo = [
  { TableName: 'config', CommandType: 'DELETE', Command: JSON.stringify({ delete: 'config', deletes: [{ q: { _id: 'auth' }, limit: 1 }] }) },
  { TableName: 'config', CommandType: 'INSERT', Command: JSON.stringify({ insert: 'config', documents: [doc] }) }
];

console.log(`\n写入环境 ${envId} 的数据库集合 config ...\n`);

const res = spawnSync(
  process.execPath,
  [CLI_BIN, 'db', 'nosql', 'execute', '-e', envId, '--command', JSON.stringify(mgo)],
  { stdio: 'inherit', cwd: CLOUDBASE_DIR }
);

if (res.status === 0) {
  console.log('\n✓ 已写入。现在可以用上面输入的两个密码登录了。');
} else {
  console.error('\n✗ 写入失败。若提示集合不存在，先在控制台建一个名为 config 的集合再重跑。');
  process.exit(1);
}
