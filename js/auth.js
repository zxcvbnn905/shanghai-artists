// AuthUtils - 认证模块（调用后端 API）
// 密码哈希由服务端 bcrypt 管理，前端只持有 session token

(function () {
  'use strict';

  var ADMIN_SESSION_KEY = 'artist_map_admin_session';

  // ========== HTTP 请求 ==========
  async function apiPost(url, body) {
    var res = await fetch(window.apiUrl ? window.apiUrl(url) : url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  async function apiGet(url) {
    var res = await fetch(window.apiUrl ? window.apiUrl(url) : url);
    return res.json();
  }

  // ========== 访问密码 ==========
  async function verifyAccessPassword(password) {
    var result = await apiPost('/api/verify-access', { password: password });
    if (result && result.ok === true) {
      try {
        if (result.token) sessionStorage.setItem('artist_map_access_token', result.token);
        if (result.mapboxToken) sessionStorage.setItem('artist_map_mapbox_token', result.mapboxToken);
      } catch (e) {}
      return true;
    }
    return false;
  }

  // ========== 解锁状态（sessionStorage） ==========
  function isUnlocked() {
    return sessionStorage.getItem('artist_map_unlocked') === 'true';
  }

  function setUnlocked() {
    sessionStorage.setItem('artist_map_unlocked', 'true');
  }

  // ========== 管理员会话 ==========
  function getAdminSession() {
    var raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function setAdminSession(username, role, token) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
      username: username,
      role: role,
      token: token,
      loginTime: Date.now()
    }));
  }

  function clearAdminSession() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  }

  // 服务端在改密码 / 删管理员后会回发一张新 token（旧 token 会被作废），
  // 这里立刻同步到本地会话，避免正在操作的管理员被自己的改动踢出去。
  function refreshAdminSession(result) {
    if (result && result.token) {
      var s = getAdminSession();
      if (s) setAdminSession(s.username, result.role || s.role, result.token);
    }
    return result;
  }

  function getAdminToken() {
    var s = getAdminSession();
    return s ? s.token : '';
  }

  // ========== 管理员登录/登出 ==========
  async function adminLogin(username, password) {
    var result = await apiPost('/api/admin/login', { username: username, password: password });
    return result; // { ok, token, role }
  }

  async function adminLogout(token) {
    return apiPost('/api/admin/logout', { token: token });
  }

  // ========== 管理操作 ==========
  async function changeAccessPassword(token, newPassword) {
    return refreshAdminSession(await apiPost('/api/change-access-pw', { token: token, newPassword: newPassword }));
  }

  async function changeAdminPassword(token, curPw, newPw) {
    return refreshAdminSession(await apiPost('/api/change-admin-pw', { token: token, curPw: curPw, newPw: newPw }));
  }

  async function getAdminList(token) {
    return apiGet('/api/admin/list?token=' + encodeURIComponent(token));
  }

  async function addAdmin(token, username, password) {
    return refreshAdminSession(await apiPost('/api/admin/add', { token: token, username: username, password: password }));
  }

  async function deleteAdmin(token, username) {
    return refreshAdminSession(await apiPost('/api/admin/delete', { token: token, username: username }));
  }

  // ========== 超级管理员检查 ==========
  function isSuperAdmin(username) {
    return username === 'admin';
  }

  // 暴露到全局
  window.AuthUtils = {
    verifyAccessPassword: verifyAccessPassword,
    isUnlocked: isUnlocked,
    setUnlocked: setUnlocked,
    getAdminSession: getAdminSession,
    setAdminSession: setAdminSession,
    clearAdminSession: clearAdminSession,
    getAdminToken: getAdminToken,
    refreshAdminSession: refreshAdminSession,
    adminLogin: adminLogin,
    adminLogout: adminLogout,
    changeAccessPassword: changeAccessPassword,
    changeAdminPassword: changeAdminPassword,
    getAdminList: getAdminList,
    addAdmin: addAdmin,
    deleteAdmin: deleteAdmin,
    isSuperAdmin: isSuperAdmin
  };
})();
