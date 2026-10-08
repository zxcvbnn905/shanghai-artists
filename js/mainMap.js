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

// Mapbox 访问令牌由后端在登录时下发、存入 sessionStorage（见 js/auth.js），不硬编码在仓库里。
// 用户必经 index.html 的密码门，所以这里同步读取即可。
mapboxgl.accessToken = (function () { try { return sessionStorage.getItem('artist_map_mapbox_token') || ''; } catch (e) { return ''; } })();

// 根据URL参数确定初始地图样式，避免加载后不必要的样式切换
var _initParams = new URLSearchParams(window.location.search);
var _initYear = _initParams.get('year');
var _initLang = _initParams.get('lang') || window.currentLanguage || 'zh';

var _MAP_URLS = {
    map_1: 'mapbox://styles/atlaskwok/cmngsotw5000n01qwe1t4aylb',
    map_2: 'mapbox://styles/atlaskwok/cmngsotw5000n01qwe1t4aylb',
    map_3_zh: 'mapbox://styles/atlaskwok/cmmg9kmya005e01ryfshv8yft',
    map_3_en: 'mapbox://styles/atlaskwok/cmngsa8a700cm01qq8o71bqy1'
};

var _initStyleName = 'map_3';
var _initStyleUrl = _initLang === 'zh' ? _MAP_URLS.map_3_zh : _MAP_URLS.map_3_en;

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
};

window.map.on('load', async () => {
    window.map.touchZoomRotate.disableRotation();
    window.force2D();

    // 使用新的函数来设置初始语言
    window.updateMapLanguage(window.currentLanguage || 'zh');

    async function loadCachedCSV(filename) {
        const cacheKey = 'csv_' + filename.replace(/[^a-zA-Z0-9]/g, '_');
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch(e) {}
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

        // studio 记录：打类型标记、补齐姓名别名、预计算活跃年份集合
        window.studios.forEach(function(studio) {
            studio._type = 'studio';
            studio.Name_CN = studio['Studio Name_CN'];
            studio.Name_EN = studio['Studio Name_EN'];
            const yearSet = new Set();
            for (let year = 1912; year <= 1948; year++) {
                if (studio['Yr_' + year] === '1') yearSet.add(year);
            }
            studio._yearSet = yearSet;
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

        const loader = document.getElementById('main-map-loader');
        if (loader) {
            loader.style.display = 'none';
        }
        sessionStorage.removeItem('fromIndex');

    } catch (error) {
        console.error("An error occurred during map load:", error);
        const loader = document.getElementById('main-map-loader');
        if (loader) {
            loader.style.display = 'none';
        }
        sessionStorage.removeItem('fromIndex');
    }
});

