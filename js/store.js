// 性别模式下 zoom 小于该值时使用 lite 简化图标（地图标点与图例共用）
window.GENDER_LITE_MAX_ZOOM = 19;

window.GlobalStore = Vue.reactive({
    isSidebarVisible: false,
    selectedArtist: null,
    isViewerOpen: false,
    viewerSrc: '',
    language: window.currentLanguage || 'zh',
    isPopupOpen: false,
    currentStyle: 'map_1',
    isFilterListExpanded: false,
    isLeftPanelOpen: !window.matchMedia('(max-width: 768px), (max-height: 500px)').matches,
    activeLayerMode: 'position',
    attributeDisplayMode: null,
    mapZoom: 11
});

// ===== 后端地址表：两套后端（Cloudflare Worker / 腾讯云 CloudBase）可切换 =====
// 两边实现同一套 HTTP 契约（/api/* 与 /data/*），所以切换只是换个地址。
// 留空 = 使用相对路径（本地开发，配合 vite 代理与本地 Express），行为与改造前一致。
// 部署后分别填入各自地址，例如：
//   cloudflare: 'https://shanghai-artist-api.xxx.workers.dev'
//   cloudbase: 'https://xxx.service.tcloudbase.com'
window.BACKENDS = {
    cloudflare: '',
    cloudbase: 'https://shanghai-artists-d5ehlire4962965-1502318280.ap-shanghai.app.tcloudbase.com'
};

(function () {
    var DEFAULT_BACKEND = 'cloudbase';
    var LS_KEY = 'artist_map_backend';
    var SS_ACTIVE = 'artist_map_backend_active';

    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get('backend');
    var chosen;
    if (fromUrl && window.BACKENDS[fromUrl] !== undefined) {
        chosen = fromUrl;
        try { localStorage.setItem(LS_KEY, chosen); } catch (e) {}
    } else {
        try { chosen = localStorage.getItem(LS_KEY); } catch (e) { chosen = null; }
        if (!chosen || window.BACKENDS[chosen] === undefined) chosen = DEFAULT_BACKEND;
    }

    // 两套后端的签名密钥不同，旧后端的 token 在新后端一律无效：
    // 一旦检测到后端变了，就丢掉旧令牌，避免莫名其妙的 401。
    try {
        if (sessionStorage.getItem(SS_ACTIVE) !== chosen) {
            sessionStorage.removeItem('artist_map_access_token');
            sessionStorage.removeItem('artist_map_admin_session');
            sessionStorage.removeItem('artist_map_mapbox_token');
            // 令牌已失效，同时作废地图页的一次性通行标记，强制回首页重新验证
            sessionStorage.removeItem('artist_map_active');
            sessionStorage.setItem(SS_ACTIVE, chosen);
        }
    } catch (e) {}

    window.BACKEND = chosen;
    window.API_BASE = window.BACKENDS[chosen] || '';
})();

// 访问口令 token：登录成功后由 auth.js 写入 sessionStorage
window.getAccessToken = function () {
    try { return sessionStorage.getItem('artist_map_access_token') || ''; } catch (e) { return ''; }
};

// 拼接 /api/... 接口地址
window.apiUrl = function (path) {
    return (window.API_BASE || '') + path;
};

// 需要鉴权的请求头：文本数据与 API 请求优先用 Authorization，避免 token 进 URL
window.authHeaders = function () {
    var token = window.getAccessToken();
    return token ? { Authorization: 'Bearer ' + token } : {};
};

// 数据文件地址（不含 token）：供 fetch/文本读取使用，配合 authHeaders()
window.dataFetchUrl = function (path) {
    if (!window.API_BASE) return path;
    return window.API_BASE + '/' + path;
};

// 数据文件地址（含 query token）：仅用于 <img> 等无法自定义请求头的场景。
// 文本请求请改用 dataFetchUrl + authHeaders。
window.dataUrl = function (path) {
    if (!window.API_BASE) return path;
    var token = window.getAccessToken();
    var sep = path.indexOf('?') === -1 ? '?' : '&';
    return window.API_BASE + '/' + path + (token ? sep + 'token=' + encodeURIComponent(token) : '');
};
