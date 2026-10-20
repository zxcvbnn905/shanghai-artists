window.map = null;
window.artists = [];
window.relationshipsData = [];
window.markers = {};
window.markersOnScreen = {};
window.allArtistsData = {};
window.currentSelectedMarker = null;
window.currentPopup = null;
window.currentFilteredArtists = [];
window.studios = [];
window.allStudiosData = {};
window.studioMarkersOnScreen = {};
window.currentFilteredStudios = [];

// 语言包可能尚未加载，此时回退到中英双语提示
function mapErrorText(key, fallback) {
    const value = window.t ? window.t(key) : key;
    return value === key ? fallback : value;
}

// 地图或数据加载失败时不要让用户永久卡在加载遮罩上
window.showMapLoadError = function(message) {
    const loader = document.getElementById('main-map-loader');
    if (!loader) return;
    loader.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText = 'max-width:80%;font-size:20px;line-height:1.6;text-align:center;color:#333;';
    box.textContent = message ||
        mapErrorText('map_load_failed', '地图加载失败，请刷新页面或返回首页重新验证 / Failed to load the map. Please refresh or sign in again.');
    loader.appendChild(box);
    loader.style.display = 'flex';
    loader.style.cursor = 'default';
};

if (typeof mapboxgl === 'undefined') {
    console.error('Mapbox GL JS failed to load.');
    window.showMapLoadError(mapErrorText('map_library_missing', '地图组件加载失败，请检查网络后刷新 / Failed to load the map library. Please check your connection and refresh.'));
    throw new Error('Mapbox GL JS is not available');
}

// 生产：Mapbox 访问令牌由后端在登录时下发、存入 sessionStorage（见 js/auth.js）。
// 开发：Vite dev server 注入不受 URL 限制的公开 token（见 vite.config.js），优先使用。
mapboxgl.accessToken = window.__DEV_MAPBOX_TOKEN__ || (function () { try { return sessionStorage.getItem('artist_map_mapbox_token') || ''; } catch (e) { return ''; } })();

// 根据URL参数确定初始地图样式，避免加载后不必要的样式切换
var _initParams = new URLSearchParams(window.location.search);
var _initYear = _initParams.get('year');

var _MAP_URLS = {
    map_1: 'mapbox://styles/atlaskwok/cmngsotw5000n01qwe1t4aylb',
    map_2: 'mapbox://styles/atlaskwok/cmngsotw5000n01qwe1t4aylb',
    map_3_zh: 'mapbox://styles/atlaskwok/cmmg9kmya005e01ryfshv8yft',
    map_3_en: 'mapbox://styles/atlaskwok/cmngsa8a700cm01qq8o71bqy1'
};

// 默认打开 1937 年历史地图；带 ?year= 时仍按年份选择
var _initStyleName = 'map_1';
var _initStyleUrl = _MAP_URLS.map_1;

if (_initYear) {
    var _y = parseInt(_initYear, 10);
    if (!isNaN(_y)) {
        _initStyleName = _y < 1942 ? 'map_1' : 'map_2';
        _initStyleUrl = _MAP_URLS[_initStyleName];
    }
}

if (window.GlobalStore) {
    window.GlobalStore.currentStyle = _initStyleName;
}

window._initialMapStyle = { name: _initStyleName, url: _initStyleUrl };

//上海市边界范围
const shanghaiBounds = [
    120.51, 30.40,
    122.25, 31.95
];

var _mapReady = false;
var _mapLoadWatchdog = setTimeout(function() {
    if (_mapReady) return;
    console.error('Map load timed out before the initial load event.');
    window.showMapLoadError(mapErrorText('map_load_timeout', '地图加载超时，请检查网络后刷新 / Map load timed out. Please check your connection and refresh.'));
}, 15000);
var _dataLoadWatchdog = null;

if (!mapboxgl.accessToken) {
    clearTimeout(_mapLoadWatchdog);
    console.error('Missing Mapbox access token; map cannot start.');
    window.showMapLoadError(mapErrorText('map_token_missing', '地图凭证缺失，请返回首页重新验证 / Map access token is missing. Please sign in again.'));
    throw new Error('Missing Mapbox access token');
}

try {
    window.map = new mapboxgl.Map({
        container: 'map',
        style: _initStyleUrl,
        center: [121.4737, 31.2304],
        zoom: 11,
        projection: 'mercator',
        maxBounds: shanghaiBounds,
        pitch: 0,
        maxPitch: 0,
        minPitch: 0,
        bearing: 0,
        dragRotate: false,
        dragPitch: false,
        touchPitch: false,
        localIdeographFontFamily: false
    });
} catch (err) {
    clearTimeout(_mapLoadWatchdog);
    console.error('Failed to initialize map:', err);
    window.showMapLoadError(mapErrorText('map_init_failed', '地图初始化失败，请返回首页重新验证 / Failed to initialize the map. Please sign in again.'));
    throw err;
}

// 门禁校验期间 body 为 display:none，Mapbox 初始化时容器尺寸为 0；
// body 显示后容器尺寸变化，必须通知 Mapbox 重算画布（否则只渲染在左上角，需按 F12 才恢复）
if (typeof ResizeObserver !== 'undefined') {
    const mapContainerEl = document.getElementById('map');
    if (mapContainerEl) {
        new ResizeObserver(function() {
            if (window.map && typeof window.map.resize === 'function') {
                window.map.resize();
            }
        }).observe(mapContainerEl);
    }
}

window.force2D = function() {
    if (!window.map) return;

    // 设置投影为Mercator
    if (window.map.setProjection) {
        try {
            window.map.setProjection('mercator');
        } catch (e) {
            console.log('setProjection string failed, trying object');
             try {
                window.map.setProjection({name: 'mercator'});
            } catch (e2) {}
        }
    }

    if (window.map.setTerrain) {
        window.map.setTerrain(null);
    }
    if (window.map.setFog) {
        window.map.setFog(null);
    }

    window.map.setPitch(0);
    window.map.setBearing(0);
    window.map.setMaxPitch(0);
    window.map.setMinPitch(0);

    window.map.dragRotate.disable();
    window.map.touchZoomRotate.disableRotation();
};

window.map.on('style.load', () => {
    window.force2D();
});

window.map.on('idle', () => {
    if (window.map.getProjection().name !== 'mercator') {
        window.force2D();
    }
});

window.map.on('styledata', () => {
    const pitch = window.map.getPitch();
    if (pitch > 0) {
        window.map.setPitch(0);
    }
});

// Mapbox 账户中已上传的青柯本悦宋字体名（map_3_en 样式的道路标签即用它）
var ROAD_LABEL_FONT_EN = 'FZQingKeBenYueSongS-R-GB Regular';
var ROAD_LABEL_FONT_FALLBACK = 'Arial Unicode MS Regular';
var _roadLabelFontOriginals = {};

function isRoadLabelLayer(layer) {
    if (!layer || layer.type !== 'symbol') return false;
    var id = layer.id;
    return id.indexOf('road-label') === 0 ||
        id === 'path-pedestrian-label' ||
        /^shanghai-(1937|1947)-street-labels$/.test(id);
}

// 英文模式下把道路名换成与全站一致的青柯本悦宋；回到中文时还原样式自带字体
function applyRoadLabelFont(lang) {
    var style;
    try {
        style = window.map.getStyle();
    } catch (e) {
        return;
    }
    if (!style || !style.layers) return;

    var cacheKey = window.currentMapStyleUrl || 'default';
    var originals = _roadLabelFontOriginals[cacheKey];
    if (!originals) {
        originals = _roadLabelFontOriginals[cacheKey] = {};
    }

    style.layers.forEach(function(layer) {
        if (!isRoadLabelLayer(layer)) return;
        if (lang === 'en') {
            if (!originals[layer.id] && layer.layout && layer.layout['text-font']) {
                originals[layer.id] = layer.layout['text-font'];
            }
            window.map.setLayoutProperty(layer.id, 'text-font', [ROAD_LABEL_FONT_EN, ROAD_LABEL_FONT_FALLBACK]);
        } else if (originals[layer.id]) {
            window.map.setLayoutProperty(layer.id, 'text-font', originals[layer.id]);
        }
    });
}

// 历史地图：密度图关闭时道路名统一改为 rgb(156,155,141)，开启时恢复样式原色。
// 现代地图（map_3）保持样式原色，不受密度图影响。
var ROAD_LABEL_COLOR_NO_DENSITY = 'rgb(156, 155, 141)';
var _roadLabelColorOriginals = {};

function applyRoadLabelColor() {
    if (window.GlobalStore && window.GlobalStore.currentStyle === 'map_3') return;

    var style;
    try {
        style = window.map.getStyle();
    } catch (e) {
        return;
    }
    if (!style || !style.layers) return;

    var cacheKey = window.currentMapStyleUrl || 'default';
    var originals = _roadLabelColorOriginals[cacheKey];
    if (!originals) {
        originals = _roadLabelColorOriginals[cacheKey] = {};
    }
    var densityOn = !!(window.GlobalStore && window.GlobalStore.activeLayerMode === 'density');

    style.layers.forEach(function(layer) {
        if (!isRoadLabelLayer(layer)) return;
        if (!(layer.id in originals)) {
            originals[layer.id] = (layer.paint && layer.paint['text-color'] !== undefined)
                ? layer.paint['text-color'] : null;
        }
        var target = densityOn ? originals[layer.id] : ROAD_LABEL_COLOR_NO_DENSITY;
        try {
            window.map.setPaintProperty(layer.id, 'text-color', target);
        } catch (e) {}
    });
}
window.applyRoadLabelColor = applyRoadLabelColor;

window.updateMapLanguage = function(lang) {
    const languageCode = lang === 'zh' ? 'zh-Hans' : 'en';

    // 遍历所有图层，更新文本字段以匹配所选语言
    let style;
    try {
        style = window.map.getStyle();
    } catch (e) {
        return; // map 样式未就绪，跳过语言更新
    }
    if (!style || !style.layers) return;
    const layers = style.layers;
    layers.forEach(function(layer) {
        if (layer.layout && layer.layout['text-field']) {
            if (layer.id.includes('label') || layer.id.includes('place') || layer.id.includes('poi')) {
                window.map.setLayoutProperty(layer.id, 'text-field', ['get', 'name_' + languageCode]);
            }
        }
    });

    // 处理历史街道标签图层
    const historicalLabelLayers = [
        { id: 'shanghai-1937-street-labels', chineseField: 'street' },
        { id: 'shanghai-1947-street-labels', chineseField: '原名' }
    ];
    historicalLabelLayers.forEach(function(cfg) {
        if (window.map.getLayer(cfg.id)) {
            if (lang === 'en') {
                window.map.setLayoutProperty(cfg.id, 'text-field',
                    ['get', 'name_en']);
            } else {
                window.map.setLayoutProperty(cfg.id, 'text-field',
                    ['get', cfg.chineseField]);
            }
        }
    });

    applyRoadLabelFont(lang);
    applyRoadLabelColor();
};

window.map.on('load', async () => {
    // 门禁未通过前不加载任何数据（伪造 token 会在 verify-token 处被拒绝）
    if (window.__gatePromise) {
        let gateOk = false;
        try {
            gateOk = await window.__gatePromise;
        } catch (e) {
            gateOk = false;
        }
        if (gateOk === false) return;
    }

    // 门禁放行后 body 已可见，主动重算一次画布尺寸（兼容不支持 ResizeObserver 的环境）
    if (window.map && typeof window.map.resize === 'function') {
        window.map.resize();
    }

    _mapReady = true;
    clearTimeout(_mapLoadWatchdog);
    _dataLoadWatchdog = setTimeout(function() {
        window.showMapLoadError(mapErrorText('map_data_timeout', '地图数据加载超时，请检查网络后刷新 / Map data loading timed out. Please check your connection and refresh.'));
    }, 20000);

    window.map.touchZoomRotate.disableRotation();
    window.force2D();

    // 使用新的函数来设置初始语言
    window.updateMapLanguage(window.currentLanguage || 'zh');

    async function loadCachedCSV(filename) {
        const cacheKey = 'csv_' + filename.replace(/[^a-zA-Z0-9]/g, '_');
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                // 旧版本可能把失败后的空结果写进缓存，遇到空数据直接重新拉取
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                sessionStorage.removeItem(cacheKey);
            }
        } catch(e) {
            try { sessionStorage.removeItem(cacheKey); } catch(e2) {}
        }
        const data = await parseCsvData(filename);
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch(e) {}
        return data;
    }

    // 艺术家/工作室数据改为直接解析 CSV。原先的 /api/artists、/api/studios 只是后端对同一份
    // CSV 做 Papa 解析后的结果，形状一致；改用 loadCachedCSV 后，部署到 Worker 时会自动带上 token。
    try {
        const [artists, relationshipsData, studios, excludedArtists] = await Promise.all([
            loadCachedCSV('data/Full_list_2026.1.23_website.CSV'),
            loadCachedCSV('data/Relationships_original_ID.csv'),
            loadCachedCSV('data/studio.csv'),
            loadCachedCSV('data/studio_artists_list.csv')
        ]);
        window.relationshipsData = relationshipsData;
        window.studios = studios;
        window.excludedArtists = excludedArtists || [];

        // studio 记录：打类型标记、补齐姓名别名、预计算活跃年份与成员性别集合
        window.studios.forEach(function(studio) {
            studio._type = 'studio';
            studio.Name_CN = studio['Studio Name_CN'];
            studio.Name_EN = studio['Studio Name_EN'];
            const yearSet = new Set();
            for (let year = 1912; year <= 1948; year++) {
                if (studio['Yr_' + year] === '1') yearSet.add(year);
            }
            studio._yearSet = yearSet;

            // 性别筛选采用包含原则：任一成员符合即可（男性 / 女性 / 性别不详）
            const sexSet = new Set();
            (studio['艺术ists_Information_CN'] || '').split(/\r?\n/).forEach(function(line) {
                const token = (line.split('|')[1] || '').trim();
                if (!token) return;
                if (token.indexOf('男') !== -1) sexSet.add('m');
                else if (token.indexOf('女') !== -1) sexSet.add('f');
                else sexSet.add('unknown');
            });
            studio._sexSet = sexSet;
        });

        // 先将排除名单中的艺术家富化到对应 studio（供侧边栏内联展示），并得到未匹配名单
        if (typeof window.enrichStudios === 'function') {
            window.enrichStudios(window.studios, window.excludedArtists);
        }

        // 排除名单中的艺术家：彻底从艺术家图层移除（搜索/筛选/密度/关系/计数均不再出现）。
        // 仅移除成功匹配到 studio 的；未匹配的保留原 artist 标点（避免静默消失）。
        const unmatchedIds = new Set((window.unmatchedExcluded || []).map(function(r) { return r.ID; }));
        const excludedIds = new Set((window.excludedArtists || [])
            .map(function(r) { return r && r.ID; })
            .filter(function(id) { return id && !unmatchedIds.has(id); }));
        window.artists = (artists || []).filter(function(a) { return !excludedIds.has(a.ID); });

        // 预计算每位艺术家的活跃年份集合，避免筛选时每次遍历37列
        window.artists.forEach(function(artist) {
            artist._type = 'artist';
            const yearSet = new Set();
            for (let year = 1912; year <= 1948; year++) {
                if (artist['Yr_' + year] === '1') yearSet.add(year);
            }
            artist._yearSet = yearSet;
        });

        window.currentFilteredArtists = window.artists; // 初始化当前列表
        window.currentFilteredStudios = window.studios; // 初始化 studio 列表

        // 转换艺术家数据为GeoJSON格式
        window.artists.forEach(function(artist) {
            window.allArtistsData[artist.ID] = artist;
        });
        window.studios.forEach(function(studio) {
            window.allStudiosData[studio.ID] = studio;
        });

        if (typeof window.addClusteredLayers === 'function') {
            window.addClusteredLayers(); // 调用函数添加图层
        }

        // 监听移动和渲染事件
        let moveRafId = null;
        window.map.on('move', () => {
            if (moveRafId) return;
            moveRafId = requestAnimationFrame(() => {
                if (typeof window.updateMarkersOnScreen === 'function') window.updateMarkersOnScreen();
                moveRafId = null;
            });
        });
        window.map.on('moveend', () => {
             if (typeof window.updateMarkersOnScreen === 'function') window.updateMarkersOnScreen();
             if (window.ArtistRelationship && typeof window.ArtistRelationship.drawRelationships === 'function') {
                 window.ArtistRelationship.drawRelationships();
             }
        });
        window.map.on('zoomend', () => {
             if (window.ArtistRelationship && typeof window.ArtistRelationship.drawRelationships === 'function') {
                 window.ArtistRelationship.drawRelationships();
             }
             if (typeof window.syncZoomDependentMarkerStyles === 'function') {
                 window.syncZoomDependentMarkerStyles();
             }
        });

        // 聚合点点击事件：放大
        window.map.on('click', 'clusters', (e) => {
            const features = window.map.queryRenderedFeatures(e.point, {
                layers: ['clusters']
            });
            const clusterId = features[0].properties.cluster_id;
            window.map.getSource('artists').getClusterExpansionZoom(
                clusterId,
                (err, zoom) => {
                    if (err) return;

                    window.map.easeTo({
                        center: features[0].geometry.coordinates,
                        zoom: zoom
                    });
                }
            );
        });

        // 点击空白地图：关闭菜单与侧栏，并清空选中/关系/迁徙状态
        window.map.on('click', (e) => {
            if (!window.currentSelectedMarker && !window.currentSelectedStudio) return;
            if (window.map.getLayer('clusters') &&
                window.map.queryRenderedFeatures(e.point, { layers: ['clusters'] }).length > 0) {
                return;
            }
            if (window.GlobalStore) {
                window.GlobalStore.isSidebarVisible = false;
                window.GlobalStore.isPopupOpen = false;
            }
            if (typeof window.resetMapSelection === 'function') window.resetMapSelection();
        });

        // 鼠标悬停样式
        window.map.on('mouseenter', 'clusters', () => {
            window.map.getCanvas().style.cursor = 'pointer';
        });
        window.map.on('mouseleave', 'clusters', () => {
            window.map.getCanvas().style.cursor = '';
        });

        // Initialize Vue Development Zoom App
        const zoomElement = document.getElementById('dev-zoom-level');
        if (zoomElement) {
            const updateZoom = () => {
                zoomElement.textContent = window.map.getZoom().toFixed(2);
            };
            updateZoom();
            window.map.on('zoom', updateZoom);
            window.map.on('move', updateZoom);
            window.map.on('zoomend', updateZoom);
        }
        //end

        document.dispatchEvent(new CustomEvent('artistsLoaded'));

        clearTimeout(_dataLoadWatchdog);
        const loader = document.getElementById('main-map-loader');
        if (loader) {
            loader.style.display = 'none';
        }
        sessionStorage.removeItem('fromIndex');

        // 默认样式是历史地图时，叠加对应年份的街道图层（带 ?year 时由左侧栏逻辑处理）
        if (!_initYear && _initStyleName !== 'map_3' && typeof window.switchMapStyle === 'function') {
            window.switchMapStyle(_initStyleName);
        }

    } catch (error) {
        clearTimeout(_mapLoadWatchdog);
        clearTimeout(_dataLoadWatchdog);
        console.error("An error occurred during map load:", error);
        window.showMapLoadError(mapErrorText('map_data_failed', '地图数据加载失败，请刷新重试 / Failed to load map data. Please refresh and try again.'));
        sessionStorage.removeItem('fromIndex');
    }
});

