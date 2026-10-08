const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Papa = require('papaparse');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const AUTH_FILE = path.join(__dirname, 'data', 'auth.json');
const SALT_ROUNDS = 10;

// ========== 数据持久化 ==========
function readAuthData() {
    if (!fs.existsSync(AUTH_FILE)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
}

function writeAuthData(data) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function initAuthData() {
    let data = readAuthData();
    if (!data) {
        const accessHash = await bcrypt.hash('1234', SALT_ROUNDS);
        const adminHash = await bcrypt.hash('123456', SALT_ROUNDS);
        data = {
            accessPasswordHash: accessHash,
            admins: [
                { username: 'admin', passwordHash: adminHash, role: 'super_admin' }
            ]
        };
        writeAuthData(data);
        console.log('[init] 已创建默认认证数据 (访问密码: 1234, 管理员: admin/123456)');
    }
    return data;
}

// ========== Token 会话管理（内存） ==========
const sessions = new Map(); // token → { username, role, createdAt }

function createSession(username, role) {
    const token = uuidv4();
    sessions.set(token, { username, role, createdAt: Date.now() });
    return token;
}

function getSession(token) {
    return sessions.get(token) || null;
}

function destroySession(token) {
    return sessions.delete(token);
}

// ========== 中间件：验证 token ==========
function requireAuth(req, res, next) {
    const token = (req.body && req.body.token) || req.query.token;
    if (!token) {
        return res.json({ ok: false, error: 'missing_token' });
    }
    const session = getSession(token);
    if (!session) {
        return res.json({ ok: false, error: 'invalid_token' });
    }
    req.session = session;
    next();
}

// ========== API 路由 ==========

// 验证访问密码
app.post('/api/verify-access', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.json({ ok: false });
    const data = readAuthData();
    const ok = await bcrypt.compare(password, data.accessPasswordHash);
    res.json({ ok });
});

// 管理员登录
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ ok: false });
    const data = readAuthData();
    const admin = data.admins.find(a => a.username === username);
    if (!admin) return res.json({ ok: false });
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.json({ ok: false });
    const token = createSession(admin.username, admin.role);
    res.json({ ok: true, token, role: admin.role });
});

// 管理员退出
app.post('/api/admin/logout', requireAuth, (req, res) => {
    const token = req.body.token;
    destroySession(token);
    res.json({ ok: true });
});

// 修改访问密码
app.post('/api/change-access-pw', requireAuth, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) return res.json({ ok: false, error: 'empty_password' });
    const data = readAuthData();
    data.accessPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    writeAuthData(data);
    res.json({ ok: true });
});

// 修改自己的管理员密码
app.post('/api/change-admin-pw', requireAuth, async (req, res) => {
    const { curPw, newPw } = req.body;
    if (!curPw || !newPw) return res.json({ ok: false, error: 'empty_password' });
    const data = readAuthData();
    const admin = data.admins.find(a => a.username === req.session.username);
    if (!admin) return res.json({ ok: false, error: 'not_found' });
    const valid = await bcrypt.compare(curPw, admin.passwordHash);
    if (!valid) return res.json({ ok: false, error: 'wrong_current_password' });
    admin.passwordHash = await bcrypt.hash(newPw, SALT_ROUNDS);
    writeAuthData(data);
    res.json({ ok: true });
});

// 管理员列表
app.get('/api/admin/list', requireAuth, (req, res) => {
    const data = readAuthData();
    const list = data.admins.map(a => ({ username: a.username, role: a.role }));
    res.json({ ok: true, admins: list, currentRole: req.session.role });
});

// 添加管理员
app.post('/api/admin/add', requireAuth, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ ok: false, error: 'empty_fields' });
    const data = readAuthData();
    if (data.admins.some(a => a.username === username)) {
        return res.json({ ok: false, error: 'account_exists' });
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    data.admins.push({ username, passwordHash: hash, role: 'admin' });
    writeAuthData(data);
    res.json({ ok: true });
});

// 删除管理员
app.post('/api/admin/delete', requireAuth, (req, res) => {
    // 只有超级管理员可以删除
    if (req.session.role !== 'super_admin') {
        return res.json({ ok: false, error: 'permission_denied' });
    }
    const { username } = req.body;
    if (!username) return res.json({ ok: false, error: 'empty_username' });
    if (username === 'admin') return res.json({ ok: false, error: 'cannot_delete_super_admin' });
    const data = readAuthData();
    const idx = data.admins.findIndex(a => a.username === username);
    if (idx === -1) return res.json({ ok: false, error: 'not_found' });
    if (data.admins.length <= 1) return res.json({ ok: false, error: 'last_admin' });
    data.admins.splice(idx, 1);
    writeAuthData(data);
    res.json({ ok: true });
});

// ========== 艺术家 CSV 数据缓存 ==========
const CSV_PATH = path.join(__dirname, 'data', 'Full_list_2026.1.23_website.CSV');
let artistsCache = null;

function parseArtistsCSV() {
    return new Promise((resolve, reject) => {
        const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
        Papa.parse(csvText, {
            header: true,
            complete: function(results) {
                resolve(results.data);
            },
            error: function(err) {
                reject(err);
            }
        });
    });
}

app.get('/api/artists', (req, res) => {
    res.json(artistsCache);
});

// ========== Studio CSV 数据缓存 ==========
const STUDIO_CSV_PATH = path.join(__dirname, 'data', 'studio.csv');
let studiosCache = null;

function parseStudiosCSV() {
    return new Promise((resolve, reject) => {
        const csvText = fs.readFileSync(STUDIO_CSV_PATH, 'utf-8');
        Papa.parse(csvText, {
            header: true,
            complete: function(results) {
                resolve(results.data);
            },
            error: function(err) {
                reject(err);
            }
        });
    });
}

app.get('/api/studios', (req, res) => {
    res.json(studiosCache);
});

// ========== 启动 ==========
const PORT = 3001;
initAuthData().then(() => {
    console.log('Parsing artist & studio CSV...');
    return Promise.all([parseArtistsCSV(), parseStudiosCSV()]);
}).then(([artists, studios]) => {
    artistsCache = artists;
    studiosCache = studios;
    console.log(`Artist CSV parsed: ${artists.length} records cached`);
    console.log(`Studio CSV parsed: ${studios.length} records cached`);
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to parse CSV:', err);
    process.exit(1);
});
