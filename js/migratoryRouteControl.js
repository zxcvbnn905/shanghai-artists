(function(window) {
    // ---- 迁徙路径可配置参数区 (Configuration Area) ----
    const Config = {
        footprintImageId: 'migratory-footprint',
        footprintImagePath: 'assets/others/migratoryRouteFootprint.svg',
        connectionSourceId: 'search-connection-source',
        connectionLayerId: 'search-connection-line',
        lineColor: '#f5eede',
        lineWidth: 22,
        lineOpacity: 0.8,
        snapTolerance: 100,        // 起始吸附容差（米）
        snapToleranceStep: 50,     // 每档放宽的步长（米）
        snapToleranceMinCap: 200,  // 上限的最小值（米）：直线距离更短时仍放宽到该值
        approachSnapTolerance: 200, // 路网外地址沿直线推进时，吸附道路的距离上限（米）
        approachStepMeters: 50,     // 路网外地址沿直线推进的采样步长（米）
        pathSimplifyTolerance: 0.00015,  // 约 15 米（经纬度单位），消除路径锯齿
        revealSpeed: 0.8,                 // 渐显速度（经纬度/秒），值越小越慢
        migrationDimCanvasId: 'migration-dim-canvas',
        migrationDimColor: '#f1d9a6',
        migrationDimOpacity: 0.35,
        vehicleImagePath: 'assets/others/migratoryRouteVehicle.svg',
        arrowImagePath: 'assets/others/migratoryRouteArrow.svg',
        // ---- 当代地图（map_3）迁移路径动画 ----
        // 路径线宽按 zoom 分级（[zoom, 屏幕像素]），亮带宽度同步缩放
        modernLineWidthStops: [[10, 10], [12, 13], [14, 16], [16, 21], [19, 30]],
        modernLineOpacity: 0.9,
        modernCorridorPaddingRatio: 0.32,
        modernCorridorMinPadding: 4,
        modernCorridorFeatherRatio: 0.5,
        modernArrowSize: 34,
        modernArrowMinSize: 22,
        modernArrowMaxSize: 52,
        modernLegDegPerSecond: 0.007,
        modernLegMinDuration: 1300,
        modernLegMaxDuration: 4800,
        modernStopPause: 460,
        modernFollowZoom: 16,
        modernFollowLerp: 0.12,
        modernFinalDwell: 1800,
        modernOverviewMaxZoom: 14.5,
        modernOverviewDuration: 1200,
        modernOverviewPadding: 80,
        modernDesatColor: '#8a8f98',
        modernDesatOpacity: 0.92,
        modernDimColor: '#0e141c',
        modernDimOpacity: 0.46
    };

    // 内部状态封装
    const State = {
        lastSearchArtists: null,
        revealAnimId: null,
        dimCanvas: null,
        dimCtx: null,
        dimPaths: null,
        dimMoveHandler: null,
        dimResizeHandler: null,
        periodTextContainer: null,
        periodTextLabels: null,
        periodTextFeatures: null,
        vehicleLoaded: false,
        vehicleContainer: null,
        vehicleImages: null,
        lastVehicleData: null,
        cameraTarget: null,
        // ---- 当代地图迁移动画 ----
        modernAnimId: null,
        modernPlans: null,
        modernArrowContainer: null,
        modernArrowMoveHandler: null,
        modernDismissHandler: null,
        modernCameraTarget: null,
        modernPhaseTimer: null,
        desatCanvas: null,
        desatCtx: null,
        // visitedContainer: null,
        // visitedKeys: null,
        // visitedList: null
    };

    function clearArrowLayersOnly() {
        if (State.revealAnimId) { cancelAnimationFrame(State.revealAnimId); State.revealAnimId = null; }
        cancelModernAnimation();
        removeModernDismissHandler();
        if (!window.map) return;
        clearPeriodTextLabels();
        clearVehicleHTML();
        clearModernArrows();
        if (window.map.getLayer(Config.connectionLayerId)) window.map.removeLayer(Config.connectionLayerId);
        if (window.map.getSource(Config.connectionSourceId)) window.map.removeSource(Config.connectionSourceId);
        clearMigrationDimCanvas();
        if (window.LayerControl) window.LayerControl.toggleMarkers(true);
        document.body.classList.remove('migration-active');
    }

    function clearArrowConnections() {
        clearArrowLayersOnly();
        State.lastSearchArtists = null;
        window.lastSearchArtists = null;
        document.body.classList.remove('migration-active');
    }

    // ---- 当代地图迁移动画清理 ----

    function cancelModernAnimation() {
        if (State.modernAnimId) {
            cancelAnimationFrame(State.modernAnimId);
            State.modernAnimId = null;
        }
        if (State.modernPhaseTimer) {
            clearTimeout(State.modernPhaseTimer);
            State.modernPhaseTimer = null;
        }
        State.modernCameraTarget = null;
        State.modernPlans = null;
    }

    function clearModernArrows() {
        if (window.map && State.modernArrowMoveHandler) {
            window.map.off('move', State.modernArrowMoveHandler);
        }
        State.modernArrowMoveHandler = null;
        if (State.modernArrowContainer) {
            State.modernArrowContainer.remove();
            State.modernArrowContainer = null;
        }
    }

    function ensureModernDismissHandler() {
        if (!window.map || State.modernDismissHandler) return;
        State.modernDismissHandler = function() {
            clearArrowConnections();
        };
        window.map.on('click', State.modernDismissHandler);
    }

    function removeModernDismissHandler() {
        if (window.map && State.modernDismissHandler) {
            window.map.off('click', State.modernDismissHandler);
        }
        State.modernDismissHandler = null;
    }

    function prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // ---- Canvas 遮罩渲染 ----

    function isModernStyle() {
        return !!(window.GlobalStore && window.GlobalStore.currentStyle === 'map_3');
    }

    function sizeOverlayCanvas(canvas) {
        if (!canvas) return;
        var mapContainer = window.map.getContainer();
        var rect = mapContainer.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
    }

    // 当代地图：额外一层 mix-blend-mode:saturation 画布负责降饱和，dim 画布负责降明度
    function ensureModernDesatCanvas() {
        if (State.desatCanvas) return;
        var canvas = document.createElement('canvas');
        canvas.id = 'migration-desat-canvas';
        canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;mix-blend-mode:saturation;';
        window.map.getContainer().appendChild(canvas);
        State.desatCanvas = canvas;
        State.desatCtx = canvas.getContext('2d');
        sizeOverlayCanvas(canvas);
    }

    function ensureMigrationDimCanvas() {
        if (State.dimCanvas) return;
        var mapContainer = window.map.getContainer();
        var isModern = isModernStyle();

        // 降饱和层必须先入 DOM，保持位于降明度层下方
        if (isModern) ensureModernDesatCanvas();

        var canvas = document.getElementById(Config.migrationDimCanvasId);
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = Config.migrationDimCanvasId;
            canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:' + (isModern ? '0' : '1') + ';';
            mapContainer.appendChild(canvas);
        }
        State.dimCanvas = canvas;
        State.dimCtx = canvas.getContext('2d');

        // 地图移动/缩放时重绘（保存引用，清理时必须 off，避免监听器累积）
        State.dimMoveHandler = function() { renderMigrationDim(State.dimPaths); };
        State.dimResizeHandler = function() {
            sizeOverlayCanvas(State.dimCanvas);
            sizeOverlayCanvas(State.desatCanvas);
            State.dimMoveHandler();
        };
        window.map.on('move', State.dimMoveHandler);
        window.map.on('resize', State.dimResizeHandler);
        sizeOverlayCanvas(canvas);
    }

    function strokeDimPaths(ctx, paths, width, alpha) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        for (var pi = 0; pi < paths.length; pi++) {
            var path = paths[pi];
            if (!path || path.length < 2) continue;
            ctx.beginPath();
            var pt0 = window.map.project([path[0][0], path[0][1]]);
            ctx.moveTo(pt0.x, pt0.y);
            for (var vi = 1; vi < path.length; vi++) {
                var pt = window.map.project([path[vi][0], path[vi][1]]);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
        }
    }

    function paintOverlayCanvas(canvas, ctx, color, opacity, paths, softEdge) {
        if (!canvas || !ctx) return;
        var dpr = window.devicePixelRatio || 1;
        var w = canvas.width / dpr;
        var h = canvas.height / dpr;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (!paths || paths.length === 0) return;

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);

        // 擦除路径走廊，使路径保持原始色彩与亮度
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        var zoom = window.map.getZoom();
        var corridorPx = 8 + zoom;
        var featherPx = 0;
        if (softEdge) {
            var lineWidth = modernLineWidthAtZoom(zoom);
            corridorPx = lineWidth + Math.max(Config.modernCorridorMinPadding, lineWidth * Config.modernCorridorPaddingRatio);
            featherPx = Math.max(6, lineWidth * Config.modernCorridorFeatherRatio);
            strokeDimPaths(ctx, paths, corridorPx + featherPx, 0.45);
        }
        strokeDimPaths(ctx, paths, corridorPx, 1);

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    function renderMigrationDim(paths) {
        if (!State.dimCanvas || !State.dimCtx) return;

        if (isModernStyle()) {
            ensureModernDesatCanvas();
            paintOverlayCanvas(State.desatCanvas, State.desatCtx,
                Config.modernDesatColor, Config.modernDesatOpacity, paths, true);
            paintOverlayCanvas(State.dimCanvas, State.dimCtx,
                Config.modernDimColor, Config.modernDimOpacity, paths, true);
            return;
        }

        paintOverlayCanvas(State.dimCanvas, State.dimCtx,
            Config.migrationDimColor, Config.migrationDimOpacity, paths, false);
    }

    function clearMigrationDimCanvas() {
        if (window.map) {
            if (State.dimMoveHandler) {
                window.map.off('move', State.dimMoveHandler);
                State.dimMoveHandler = null;
            }
            if (State.dimResizeHandler) {
                window.map.off('resize', State.dimResizeHandler);
                State.dimResizeHandler = null;
            }
        }
        if (State.dimCanvas) {
            var ctx = State.dimCtx;
            if (ctx) {
                var dpr = window.devicePixelRatio || 1;
                ctx.clearRect(0, 0, State.dimCanvas.width / dpr, State.dimCanvas.height / dpr);
            }
            State.dimCanvas.remove();
            State.dimCanvas = null;
            State.dimCtx = null;
        }
        if (State.desatCanvas) {
            State.desatCanvas.remove();
            State.desatCanvas = null;
            State.desatCtx = null;
        }
        State.dimPaths = null;
        clearPeriodTextLabels();
    }

    // ---- HTML 文字标签渲染（位于 dim 画布之上，z-index:2）----

    function buildLabelText(feature) {
        var isEn = window.currentLanguage === 'en';
        var period = feature.properties.period;
        var histAdd = isEn ? feature.properties.histAddE : feature.properties.histAddC;
        return { period: period, histAdd: histAdd };
    }

    function ensurePeriodTextLabels(features) {
        clearPeriodTextLabels();
        if (!features || features.length === 0) return;

        State.periodTextFeatures = features;

        var mapContainer = window.map.getContainer();
        var container = document.createElement('div');
        container.id = 'period-text-container';
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;';
        mapContainer.appendChild(container);
        State.periodTextContainer = container;

        var labels = [];
        features.forEach(function(f) {
            var text = buildLabelText(f);

            var isStart = f.properties && f.properties.isStart;
            var wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:absolute;' +
                'color:#000000;' +
                'text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff;' +
                'transform:translate(-50%,-150%);' +
                'pointer-events:none;' +
                'text-align:center;' +
                'line-height:1.2;' +
                // 限宽（em 随标签字号缩放）：历史地址中文中位 10 字、英文中位 42 字符，
                // 不限宽会在单行拖出很长一条。限宽后长地址自动折行，短地址仍单行。
                'max-width:12em;' +
                'display:none;' +
                (isStart ? 'display:table;background-color:#FFF1B3;border-radius:6px;padding:4px 8px;' : '');
            if (isStart) wrapper.style.display = 'none';

            var periodDiv = document.createElement('div');
            periodDiv.textContent = text.period;
            periodDiv.style.cssText = 'font-weight:bold;white-space:nowrap;';
            wrapper.appendChild(periodDiv);

            var histDiv = document.createElement('div');
            histDiv.className = 'period-hist-addr';
            histDiv.textContent = text.histAdd;
            wrapper.appendChild(histDiv);

            container.appendChild(wrapper);
            labels.push({ wrapper: wrapper, coords: f.geometry.coordinates, feature: f, revealed: false, isStart: isStart });
        });
        State.periodTextLabels = labels;
        repositionPeriodTextLabels();

        window.map.on('move', repositionPeriodTextLabels);
        window.addEventListener('languageChanged', onLanguageChanged);
    }

    function onLanguageChanged() {
        if (!State.periodTextLabels) return;
        State.periodTextLabels.forEach(function(label) {
            var text = buildLabelText(label.feature);
            var histDiv = label.wrapper.querySelector('.period-hist-addr');
            if (histDiv) histDiv.textContent = text.histAdd;
        });
    }

    function repositionPeriodTextLabels() {
        if (!State.periodTextLabels || !State.periodTextLabels.length) return;
        var zoom = window.map.getZoom();
        var fontSize = 12 + (zoom - 10) * 1.5;
        if (fontSize < 12) fontSize = 12;
        if (fontSize > 24) fontSize = 24;
        var histFontSize = Math.max(10, fontSize * 0.85);
        State.periodTextLabels.forEach(function(label) {
            var pt = window.map.project(label.coords);
            label.wrapper.style.left = pt.x + 'px';
            label.wrapper.style.top = pt.y + 'px';
            label.wrapper.style.fontSize = fontSize + 'px';
            label.wrapper.style.transform = 'translate(-50%,-150%)';
            var histDiv = label.wrapper.querySelector('.period-hist-addr');
            if (histDiv) histDiv.style.fontSize = histFontSize + 'px';
        });

        // 检测重叠并偏移
        var revealed = State.periodTextLabels.filter(function(l) { return l.revealed; });
        for (var pass = 0; pass < 3; pass++) {
            var moved = false;
            for (var i = 0; i < revealed.length; i++) {
                for (var j = i + 1; j < revealed.length; j++) {
                    var ra = revealed[i].wrapper.getBoundingClientRect();
                    var rb = revealed[j].wrapper.getBoundingClientRect();
                    if (ra.right <= rb.left || ra.left >= rb.right ||
                        ra.bottom <= rb.top || ra.top >= rb.bottom) continue;
                    var label = ra.top < rb.top ? revealed[i] : revealed[j];
                    var dy = ra.bottom - rb.top + 4;
                    var cur = parseFloat(label.wrapper.style.top) || 0;
                    label.wrapper.style.top = (cur - dy) + 'px';
                    moved = true;
                }
            }
            if (!moved) break;
        }
    }

    function revealNearbyLabels(vehicleData) {
        if (!State.periodTextLabels) return;
        var THRESHOLD = 0.001;
        for (var vi = 0; vi < vehicleData.length; vi++) {
            var vp = vehicleData[vi].pos;
            for (var li = 0; li < State.periodTextLabels.length; li++) {
                var label = State.periodTextLabels[li];
                if (label.revealed) continue;
                var dx = label.coords[0] - vp[0];
                var dy = label.coords[1] - vp[1];
                if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD) {
                    label.revealed = true;
                    label.wrapper.style.display = label.isStart ? 'table' : '';
                }
            }
        }
    }

    function clearPeriodTextLabels() {
        if (window.map) window.map.off('move', repositionPeriodTextLabels);
        window.removeEventListener('languageChanged', onLanguageChanged);
        State.periodTextFeatures = null;
        if (State.periodTextContainer) {
            State.periodTextContainer.remove();
            State.periodTextContainer = null;
        }
        State.periodTextLabels = null;
    }

    // ---- 当代地图：单地址切换 ----

    function findPeriodLabel(coords, period) {
        if (!State.periodTextLabels || !coords) return null;
        var fallback = null;
        for (var i = 0; i < State.periodTextLabels.length; i++) {
            var label = State.periodTextLabels[i];
            if (Math.abs(label.coords[0] - coords[0]) > 1e-7 ||
                Math.abs(label.coords[1] - coords[1]) > 1e-7) continue;
            if (period == null || String(label.feature.properties.period) === String(period)) {
                return label;
            }
            if (!fallback) fallback = label;
        }
        return fallback;
    }

    function applyModernLabelState(label, active) {
        if (!label) return;
        label.revealed = active;
        if (active) {
            label.wrapper.style.display = 'table';
            label.wrapper.style.backgroundColor = '#FFF1B3';
            label.wrapper.style.borderRadius = '6px';
            label.wrapper.style.padding = '4px 8px';
            label.wrapper.style.boxShadow = '0 2px 10px rgba(0,0,0,0.28)';
        } else {
            label.wrapper.style.display = 'none';
            label.wrapper.style.backgroundColor = '';
            label.wrapper.style.borderRadius = '';
            label.wrapper.style.padding = '';
            label.wrapper.style.boxShadow = '';
        }
    }

    function setModernActiveLabels(desired) {
        if (!State.periodTextLabels) return;
        var changed = false;
        State.periodTextLabels.forEach(function(label) {
            var active = desired.has(label);
            if (active !== !!label.revealed) {
                applyModernLabelState(label, active);
                changed = true;
            }
        });
        if (changed) repositionPeriodTextLabels();
    }

    // ---- HTML 车辆图标渲染（位于 dim 画布之上，z-index:3）----

    function repositionVehicles(vehicleData) {
        if (!State.vehicleImages || !State.vehicleContainer) return;
        if (vehicleData) State.lastVehicleData = vehicleData;
        var data = State.lastVehicleData;
        if (!data || !data.length) return;

        var zoom = window.map.getZoom();
        var iconScale = zoom <= 10 ? 0.3 : zoom >= 18 ? 1.3 : 0.3 + (zoom - 10) * (1.0 / 8);
        var baseSize = 32;
        var mapBearing = window.map.getBearing ? window.map.getBearing() : 0;

        var seen = {};
        for (var i = 0; i < data.length; i++) {
            var vd = data[i];
            var entry = State.vehicleImages[vd.name];
            if (!entry) continue;
            if (seen[vd.name]) continue;
            seen[vd.name] = true;

            var pt = window.map.project(vd.pos);
            var img = entry.img;
            img.style.left = pt.x + 'px';
            img.style.top = pt.y + 'px';
            img.style.width = (baseSize * iconScale) + 'px';
            img.style.height = 'auto';
            img.style.transform = 'translate(-50%,-50%) rotate(' + (vd.bearing - mapBearing) + 'deg)';
        }
    }

    function onVehicleMove() {
        repositionVehicles();
        // repositionAllVisited();
    }

    // function dropVisitedMarker(pos, bearing) {
    //     if (!State.visitedContainer) {
    //         var mapContainer = window.map.getContainer();
    //         var container = document.createElement('div');
    //         container.id = 'visited-container';
    //         container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3;';
    //         mapContainer.appendChild(container);
    //         State.visitedContainer = container;
    //         if (!State.visitedList) State.visitedList = [];
    //     }
    //
    //     var img = document.createElement('img');
    //     img.src = Config.vehicleImagePath;
    //     img.style.cssText = 'position:absolute;' +
    //         'pointer-events:none;';
    //     State.visitedContainer.appendChild(img);
    //     State.visitedList.push({ img: img, coords: pos, bearing: bearing });
    //     repositionVisitedMarker(img, pos, bearing);
    // }

    // function repositionVisitedMarker(img, pos, bearing) {
    //     var pt = window.map.project(pos);
    //     var zoom = window.map.getZoom();
    //     var iconScale = zoom <= 10 ? 0.3 : zoom >= 18 ? 1.3 : 0.3 + (zoom - 10) * (1.0 / 8);
    //     img.style.left = pt.x + 'px';
    //     img.style.top = pt.y + 'px';
    //     img.style.width = (32 * iconScale) + 'px';
    //     img.style.height = 'auto';
    //     img.style.transform = 'translate(-50%,-50%) rotate(' + bearing + 'deg)';
    // }

    // function repositionAllVisited() {
    //     if (!State.visitedList) return;
    //     for (var i = 0; i < State.visitedList.length; i++) {
    //         var v = State.visitedList[i];
    //         repositionVisitedMarker(v.img, v.coords, v.bearing);
    //     }
    // }

    function clearVehicleHTML() {
        if (window.map) window.map.off('move', onVehicleMove);
        State.lastVehicleData = null;
        State.cameraTarget = null;
        // State.visitedKeys = null;
        // State.visitedList = null;
        if (State.vehicleContainer) {
            State.vehicleContainer.remove();
            State.vehicleContainer = null;
        }
        State.vehicleImages = null;
        // if (State.visitedContainer) {
        //     State.visitedContainer.remove();
        //     State.visitedContainer = null;
        // }
    }

    // Douglas-Peucker 路径简化，消除节点质心偏移导致的小幅锯齿
    function runDP(points, toleranceDeg) {
        if (points.length <= 2) return points;
        var tSq = toleranceDeg * toleranceDeg;

        function dp(start, end) {
            var maxDSq = 0, maxI = start;
            var p1 = points[start], p2 = points[end];
            var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
            var segLSq = dx * dx + dy * dy;

            for (var i = start + 1; i < end; i++) {
                var dSq;
                if (segLSq === 0) {
                    var ddx = points[i][0] - p1[0], ddy = points[i][1] - p1[1];
                    dSq = ddx * ddx + ddy * ddy;
                } else {
                    var t = ((points[i][0] - p1[0]) * dx + (points[i][1] - p1[1]) * dy) / segLSq;
                    t = t < 0 ? 0 : (t > 1 ? 1 : t);
                    dSq = (points[i][0] - p1[0] - t * dx) * (points[i][0] - p1[0] - t * dx) +
                          (points[i][1] - p1[1] - t * dy) * (points[i][1] - p1[1] - t * dy);
                }
                if (dSq > maxDSq) { maxDSq = dSq; maxI = i; }
            }
            if (maxDSq <= tSq) return [points[start], points[end]];
            var left = dp(start, maxI);
            var right = dp(maxI, end);
            return left.slice(0, -1).concat(right);
        }
        return dp(0, points.length - 1);
    }

    // 自交环检测：移除路径中在同一区域来回绕的折返段
    function removeBacktracks(path) {
        if (path.length <= 5) return path;

        var CLOSE_DEG = 0.0003;    // 空间距离阈值 ~30m
        var CLOSE_DEG_SQ = CLOSE_DEG * CLOSE_DEG;
        var MIN_PATH_DEG = 0.001;  // 路径里程阈值 ~100m

        // 计算路径累计距离（经纬度平方距离）
        var cumDist = [0];
        for (var i = 1; i < path.length; i++) {
            var ddx = path[i][0] - path[i - 1][0];
            var ddy = path[i][1] - path[i - 1][1];
            cumDist.push(cumDist[i - 1] + Math.sqrt(ddx * ddx + ddy * ddy));
        }

        // 找到最佳的折返环并移除（只处理最显著的一个环）
        var bestI = -1, bestJ = -1, bestDist = 0;
        for (var i = 0; i < path.length - 5; i++) {
            for (var j = i + 5; j < path.length; j++) {
                var sdx = path[i][0] - path[j][0];
                var sdy = path[i][1] - path[j][1];
                var sDistSq = sdx * sdx + sdy * sdy;
                if (sDistSq < CLOSE_DEG_SQ) {
                    var pathDist = cumDist[j] - cumDist[i];
                    if (pathDist > MIN_PATH_DEG && pathDist > bestDist) {
                        bestDist = pathDist;
                        bestI = i;
                        bestJ = j;
                    }
                }
            }
        }

        if (bestI < 0) return path;

        // 移除 bestI+1 到 bestJ-1 之间的点（跳过环路）
        var result = [];
        for (var k = 0; k <= bestI; k++) result.push(path[k]);
        for (var k = bestJ; k < path.length; k++) result.push(path[k]);
        return result;
    }

    function simplifyPath(path, maxCoords) {
        if (path.length <= 2) return path;

        // 一段简化：15m 容差
        var result = runDP(path, Config.pathSimplifyTolerance);
        result = removeBacktracks(result);
        if (result.length <= maxCoords) return result;

        // 二段简化：50m 容差
        result = runDP(path, 0.0005);
        result = removeBacktracks(result);
        if (result.length <= maxCoords) return result;

        // 硬截断：均匀采样
        var step = Math.floor(result.length / maxCoords);
        var sampled = [];
        for (var i = 0; i < result.length; i += step) {
            sampled.push(result[i]);
        }
        // 确保包含终点
        if (sampled[sampled.length - 1] !== result[result.length - 1]) {
            sampled.push(result[result.length - 1]);
        }
        return sampled;
    }

    function loadFootprintImage(callback) {
        if (!window.map) return;
        if (window.map.hasImage(Config.footprintImageId)) {
            callback();
            return;
        }

        const patternHeight = Config.lineWidth;

        fetch(Config.footprintImagePath)
            .then(resp => resp.text())
            .then(svgText => {
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                const svgEl = svgDoc.querySelector('svg');
                if (!svgEl) throw new Error('SVG not found');

                const vb = svgEl.getAttribute('viewBox').split(/\s+/).map(Number);
                const vbX = vb[0];
                const vbY = vb[1];
                const vbW = vb[2];
                const vbH = vb[3];
                const scale = patternHeight / vbH;
                const imgW = Math.round(vbW * scale);

                const dpr = window.devicePixelRatio || 1;
                const canvas = document.createElement('canvas');
                canvas.width = imgW * dpr;
                canvas.height = patternHeight * dpr;
                const ctx = canvas.getContext('2d');

                const paths = svgDoc.querySelectorAll('path');
                ctx.fillStyle = '#897763';
                paths.forEach(path => {
                    const d = path.getAttribute('d');
                    const p = new Path2D(d);
                    ctx.save();
                    ctx.scale(scale * dpr, scale * dpr);
                    ctx.translate(-vbX, -vbY);
                    ctx.fill(p);
                    ctx.restore();
                });

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                if (!window.map.hasImage(Config.footprintImageId)) {
                    window.map.addImage(Config.footprintImageId, imageData, { pixelRatio: dpr });
                }
                callback();
            })
            .catch(err => {
                console.error('Failed to load footprint pattern:', err);
                callback();
            });
    }

    function loadVehicleImage(callback) {
        if (!window.map) return;
        if (State.vehicleLoaded) { callback(); return; }
        State.vehicleLoaded = true;
        callback();
    }

    function addVehicleMarkers(routedConnections) {
        if (!window.map) return;

        // 创建 HTML 车辆图标（位于 dim 画布之上，z-index:3）
        clearVehicleHTML();
        var vehicleMap = {};
        var initialData = [];
        var OFFSET_DEG = 0.0003;

        var mapContainer = window.map.getContainer();
        var container = document.createElement('div');
        container.id = 'vehicle-container';
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3;';
        mapContainer.appendChild(container);
        State.vehicleContainer = container;

        var zoom = window.map.getZoom();

        for (var ci = 0; ci < routedConnections.length; ci++) {
            var conn = routedConnections[ci];
            var path = conn.path;
            if (!path || path.length < 2) continue;

            var artistName = conn.start.name;
            if (vehicleMap[artistName]) continue;

            // 计算初始位置（沿路径偏移）
            var targetDist = OFFSET_DEG;
            var walked = 0;
            var pos = [path[0][0], path[0][1]];
            var bearing = 0;
            for (var vi = 0; vi < path.length - 1; vi++) {
                var segDx = path[vi + 1][0] - path[vi][0];
                var segDy = path[vi + 1][1] - path[vi][1];
                var segLen = Math.sqrt(segDx * segDx + segDy * segDy);
                if (walked + segLen >= targetDist) {
                    var t = (targetDist - walked) / segLen;
                    pos = [path[vi][0] + segDx * t, path[vi][1] + segDy * t];
                    var dLon2 = (path[vi + 1][0] - path[vi][0]) * Math.PI / 180;
                    var l1 = path[vi][1] * Math.PI / 180;
                    var l2 = path[vi + 1][1] * Math.PI / 180;
                    var by = Math.sin(dLon2) * Math.cos(l2);
                    var bx = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon2);
                    bearing = Math.atan2(by, bx) * 180 / Math.PI;
                    break;
                }
                walked += segLen;
                pos = [path[vi + 1][0], path[vi + 1][1]];
            }

            var img = document.createElement('img');
            img.src = Config.vehicleImagePath;
            img.style.cssText = 'position:absolute;' +
                'pointer-events:none;';
            container.appendChild(img);

            vehicleMap[artistName] = { img: img };
            initialData.push({ name: artistName, pos: pos, bearing: bearing });
        }
        State.vehicleImages = vehicleMap;

        repositionVehicles(initialData);
        window.map.on('move', onVehicleMove);
    }

    function startRevealAnimation(allFeatures, routedConnections) {
        if (State.revealAnimId) { cancelAnimationFrame(State.revealAnimId); State.revealAnimId = null; }

        function pathLen(path) {
            var len = 0;
            for (var i = 1; i < path.length; i++) {
                var ddx = path[i][0] - path[i - 1][0];
                var ddy = path[i][1] - path[i - 1][1];
                len += Math.sqrt(ddx * ddx + ddy * ddy);
            }
            return len;
        }

        var totalDist = 0;
        routedConnections.forEach(function(conn) { totalDist += pathLen(conn.path); });
        var duration = Math.max(totalDist / Config.revealSpeed * 100000, 1500);

        // 预计算每条连接已走过的累计距离和各段长度
        var connAcc = [];
        var cumDist = 0;
        var seenArtists = {};
        routedConnections.forEach(function(conn) {
            var segLens = [];
            for (var i = 1; i < conn.path.length; i++) {
                var ddx = conn.path[i][0] - conn.path[i - 1][0];
                var ddy = conn.path[i][1] - conn.path[i - 1][1];
                segLens.push(Math.sqrt(ddx * ddx + ddy * ddy));
            }
            var tl = cumDist + segLens.reduce(function(a,b){return a+b;}, 0);
            var artistName = conn.start.name;
            var isFirst = !seenArtists[artistName];
            seenArtists[artistName] = true;
            connAcc.push({ cumStart: cumDist, segLens: segLens, path: conn.path, totalLen: tl, endCoords: conn.end.coords, artistName: artistName, isFirst: isFirst });
            cumDist = connAcc[connAcc.length - 1].totalLen;
        });

        // 预计算每个连接的下一个标点方向
        var nextTargets = [];
        for (var ti = 0; ti < connAcc.length; ti++) {
            var ca = connAcc[ti];
            var target = null;
            for (var tj = ti + 1; tj < connAcc.length; tj++) {
                if (connAcc[tj].artistName === ca.artistName) {
                    target = connAcc[tj].endCoords;
                    break;
                }
            }
            if (target) {
                var ndLon = (target[0] - ca.endCoords[0]) * Math.PI / 180;
                var nl1 = ca.endCoords[1] * Math.PI / 180;
                var nl2 = target[1] * Math.PI / 180;
                var nby = Math.sin(ndLon) * Math.cos(nl2);
                var nbx = Math.cos(nl1) * Math.sin(nl2) - Math.sin(nl1) * Math.cos(nl2) * Math.cos(ndLon);
                target = Math.atan2(nby, nbx) * 180 / Math.PI;
            }
            nextTargets.push(target);
        }

        // if (!State.visitedKeys) State.visitedKeys = {};
        //
        // // 放置所有起点 visited 标记（指向第一段终点）
        // for (var si = 0; si < connAcc.length; si++) {
        //     if (connAcc[si].isFirst) {
        //         var ca = connAcc[si];
        //         var sdLon = (ca.endCoords[0] - ca.path[0][0]) * Math.PI / 180;
        //         var sl1 = ca.path[0][1] * Math.PI / 180;
        //         var sl2 = ca.endCoords[1] * Math.PI / 180;
        //         var sby = Math.sin(sdLon) * Math.cos(sl2);
        //         var sbx = Math.cos(sl1) * Math.sin(sl2) - Math.sin(sl1) * Math.cos(sl2) * Math.cos(sdLon);
        //         var sbearing = Math.atan2(sby, sbx) * 180 / Math.PI;
        //         dropVisitedMarker(ca.path[0], sbearing);
        //     }
        // }

        var startTime = performance.now();

        function frame(now) {
            var elapsed = now - startTime;
            var progress = Math.min(elapsed / duration, 1.0);
            var targetDist = progress * totalDist;

            var features = [];
            var partialPaths = [];

            for (var ci = 0; ci < connAcc.length; ci++) {
                var ca = connAcc[ci];
                if (targetDist <= ca.cumStart) break;

                var local = Math.min(targetDist - ca.cumStart, ca.totalLen - ca.cumStart);

                // 连接完全揭示时放置终点 visited 标记
                // if (local >= ca.totalLen - ca.cumStart && !State.visitedKeys[ci] && nextTargets[ci] !== null) {
                //     State.visitedKeys[ci] = true;
                //     dropVisitedMarker(ca.endCoords, nextTargets[ci]);
                // }

                var partialCoords = [ca.path[0]];
                var walked = 0;

                for (var si = 0; si < ca.segLens.length; si++) {
                    if (walked + ca.segLens[si] <= local) {
                        partialCoords.push(ca.path[si + 1]);
                        walked += ca.segLens[si];
                    } else {
                        var remain = local - walked;
                        var t = ca.segLens[si] > 0 ? remain / ca.segLens[si] : 0;
                        var a = ca.path[si], b = ca.path[si + 1];
                        partialCoords.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
                        break;
                    }
                }

                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: partialCoords },
                    properties: allFeatures[ci].properties
                });
                partialPaths.push(partialCoords);
            }

            // 同样处理已走完但未开始的第一段之后的所有连接
            for (var cj = features.length; cj < connAcc.length; cj++) {
                partialPaths.push([]);
            }

            if (window.map && window.map.getSource(Config.connectionSourceId)) {
                window.map.getSource(Config.connectionSourceId).setData({
                    type: 'FeatureCollection',
                    features: features
                });
            }

            // 更新 Canvas 遮罩
            State.dimPaths = partialPaths;
            renderMigrationDim(partialPaths);

            // 更新车辆位置：每人取最远已揭示的连接前端
            var seenNames = {};
            var vehicleData = [];
            for (var vci = partialPaths.length - 1; vci >= 0; vci--) {
                var pp = partialPaths[vci];
                if (!pp || pp.length < 1) continue;
                var vname = routedConnections[vci].start.name;
                if (seenNames[vname]) continue;
                seenNames[vname] = true;

                var vpos, vbearing;
                if (pp.length >= 2) {
                    vpos = pp[pp.length - 1];
                    var va = pp[pp.length - 2];
                    var vb = pp[pp.length - 1];
                    var vdLon = (vb[0] - va[0]) * Math.PI / 180;
                    var vl1 = va[1] * Math.PI / 180;
                    var vl2 = vb[1] * Math.PI / 180;
                    var vby = Math.sin(vdLon) * Math.cos(vl2);
                    var vbx = Math.cos(vl1) * Math.sin(vl2) - Math.sin(vl1) * Math.cos(vl2) * Math.cos(vdLon);
                    vbearing = Math.atan2(vby, vbx) * 180 / Math.PI;
                } else {
                    var fullPath = routedConnections[vci].path;
                    vpos = pp[0];
                    var fdLon = (fullPath[1][0] - fullPath[0][0]) * Math.PI / 180;
                    var fl1 = fullPath[0][1] * Math.PI / 180;
                    var fl2 = fullPath[1][1] * Math.PI / 180;
                    var fby = Math.sin(fdLon) * Math.cos(fl2);
                    var fbx = Math.cos(fl1) * Math.sin(fl2) - Math.sin(fl1) * Math.cos(fl2) * Math.cos(fdLon);
                    vbearing = Math.atan2(fby, fbx) * 180 / Math.PI;
                }

                vehicleData.push({ name: vname, pos: vpos, bearing: vbearing });
            }
            repositionVehicles(vehicleData);
            revealNearbyLabels(vehicleData);

            // 地图平滑跟随车辆质心
            if (vehicleData.length > 0) {
                var cx = 0, cy = 0;
                for (var vi = 0; vi < vehicleData.length; vi++) {
                    cx += vehicleData[vi].pos[0];
                    cy += vehicleData[vi].pos[1];
                }
                cx /= vehicleData.length;
                cy /= vehicleData.length;
                if (!State.cameraTarget) State.cameraTarget = [cx, cy];
                var dx = (cx - State.cameraTarget[0]) * 0.05;
                var dy = (cy - State.cameraTarget[1]) * 0.05;
                State.cameraTarget[0] += dx;
                State.cameraTarget[1] += dy;
                if (Math.abs(dx) > 0.000005 || Math.abs(dy) > 0.000005) {
                    window.map.setCenter(State.cameraTarget);
                }
            }

            if (progress < 1.0) {
                State.revealAnimId = requestAnimationFrame(frame);
            } else {
                State.revealAnimId = null;
            }
        }

        State.revealAnimId = requestAnimationFrame(frame);
    }

    // ---- 当代地图：单箭头逐段动画 ----

    function routePathLength(path) {
        var len = 0;
        for (var i = 1; i < path.length; i++) {
            var dx = path[i][0] - path[i - 1][0];
            var dy = path[i][1] - path[i - 1][1];
            len += Math.sqrt(dx * dx + dy * dy);
        }
        return len;
    }

    function clampFraction(value) {
        return value < 0 ? 0 : (value > 1 ? 1 : value);
    }

    function partialPathCoords(path, fraction) {
        if (!path || path.length === 0) return null;
        if (path.length === 1) return [path[0], path[0]];
        var total = routePathLength(path);
        var target = total * clampFraction(fraction);
        var result = [path[0]];
        if (total <= 0) return [path[0], path[0]];

        var walked = 0;
        for (var i = 0; i < path.length - 1; i++) {
            var dx = path[i + 1][0] - path[i][0];
            var dy = path[i + 1][1] - path[i][1];
            var segLen = Math.sqrt(dx * dx + dy * dy);
            if (walked + segLen <= target) {
                result.push(path[i + 1]);
                walked += segLen;
            } else {
                var t = segLen > 0 ? (target - walked) / segLen : 0;
                result.push([path[i][0] + dx * t, path[i][1] + dy * t]);
                return result.length >= 2 ? result : [path[0], result[0]];
            }
        }
        return result;
    }

    function pointAtFraction(path, fraction) {
        if (!path || path.length === 0) return null;
        if (path.length === 1) return path[0].slice();
        var total = routePathLength(path);
        if (total <= 0) return path[0].slice();
        var target = total * clampFraction(fraction);
        var walked = 0;
        for (var i = 0; i < path.length - 1; i++) {
            var dx = path[i + 1][0] - path[i][0];
            var dy = path[i + 1][1] - path[i][1];
            var segLen = Math.sqrt(dx * dx + dy * dy);
            if (walked + segLen >= target) {
                var t = segLen > 0 ? (target - walked) / segLen : 0;
                return [path[i][0] + dx * t, path[i][1] + dy * t];
            }
            walked += segLen;
        }
        var last = path[path.length - 1];
        return [last[0], last[1]];
    }

    function bearingBetween(a, b) {
        var dLon = (b[0] - a[0]) * Math.PI / 180;
        var l1 = a[1] * Math.PI / 180;
        var l2 = b[1] * Math.PI / 180;
        var by = Math.sin(dLon) * Math.cos(l2);
        var bx = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
        return Math.atan2(by, bx) * 180 / Math.PI;
    }

    function bearingAtFraction(path, fraction) {
        if (!path || path.length < 2) return 0;
        var total = routePathLength(path);
        if (total <= 0) return bearingBetween(path[0], path[path.length - 1]);
        var target = total * clampFraction(fraction);
        var walked = 0;
        for (var i = 0; i < path.length - 1; i++) {
            var dx = path[i + 1][0] - path[i][0];
            var dy = path[i + 1][1] - path[i][1];
            var segLen = Math.sqrt(dx * dx + dy * dy);
            if (walked + segLen >= target || i === path.length - 2) {
                return bearingBetween(path[i], path[i + 1]);
            }
            walked += segLen;
        }
        return 0;
    }

    function buildModernPlans(routedConnections) {
        var plans = [];
        var byName = {};

        routedConnections.forEach(function(conn, idx) {
            var name = conn.start.name;
            var plan = byName[name];
            if (!plan) {
                plan = { name: name, legs: [], arrowEl: null, arrowPos: null, arrowBearing: 0 };
                byName[name] = plan;
                plans.push(plan);
            }
            plan.legs.push({
                path: conn.path,
                featureIndex: idx,
                start: conn.start,
                end: conn.end,
                length: routePathLength(conn.path)
            });
        });

        plans.forEach(function(plan) {
            var t = 0;
            plan.legs.forEach(function(leg, i) {
                var duration = leg.length / Config.modernLegDegPerSecond * 1000;
                if (duration < Config.modernLegMinDuration) duration = Config.modernLegMinDuration;
                if (duration > Config.modernLegMaxDuration) duration = Config.modernLegMaxDuration;
                leg.startTime = t;
                leg.duration = duration;
                leg.endTime = t + duration;
                t = leg.endTime;
                if (i < plan.legs.length - 1) t += Config.modernStopPause;
            });
            plan.totalTime = plan.legs.length ? plan.legs[plan.legs.length - 1].endTime : 0;
        });

        return plans;
    }

    function modernLineWidthAtZoom(zoom) {
        var stops = Config.modernLineWidthStops;
        if (!stops || !stops.length) return 16;
        if (zoom <= stops[0][0]) return stops[0][1];
        for (var i = 1; i < stops.length; i++) {
            if (zoom <= stops[i][0]) {
                var low = stops[i - 1];
                var high = stops[i];
                var t = (zoom - low[0]) / (high[0] - low[0] || 1);
                return low[1] + (high[1] - low[1]) * t;
            }
        }
        return stops[stops.length - 1][1];
    }

    function modernWidthExpression(extra) {
        var expr = ['interpolate', ['linear'], ['zoom']];
        Config.modernLineWidthStops.forEach(function(stop) {
            expr.push(stop[0], stop[1] + (extra || 0));
        });
        return expr;
    }

    function modernArrowPixelSize(zoom) {
        var size = Config.modernArrowSize + (zoom - 13) * 3;
        if (size < Config.modernArrowMinSize) size = Config.modernArrowMinSize;
        if (size > Config.modernArrowMaxSize) size = Config.modernArrowMaxSize;
        return size;
    }

    function ensureModernArrowContainer(plans) {
        clearModernArrows();
        var mapContainer = window.map.getContainer();
        var container = document.createElement('div');
        container.id = 'modern-arrow-container';
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3;';
        mapContainer.appendChild(container);
        State.modernArrowContainer = container;

        plans.forEach(function(plan) {
            var img = document.createElement('img');
            img.src = Config.arrowImagePath;
            img.alt = '';
            img.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;display:none;' +
                'filter:drop-shadow(0 2px 5px rgba(0,0,0,0.35));will-change:transform;';
            container.appendChild(img);
            plan.arrowEl = img;
        });

        State.modernArrowMoveHandler = function() { repositionModernArrows(); };
        window.map.on('move', State.modernArrowMoveHandler);
    }

    function repositionModernArrows() {
        if (!State.modernPlans || !window.map) return;
        var zoom = window.map.getZoom();
        var size = modernArrowPixelSize(zoom);
        var mapBearing = window.map.getBearing ? window.map.getBearing() : 0;

        State.modernPlans.forEach(function(plan) {
            var img = plan.arrowEl;
            if (!img || !plan.arrowPos) return;
            var pt = window.map.project(plan.arrowPos);
            img.style.left = pt.x + 'px';
            img.style.top = pt.y + 'px';
            img.style.height = size + 'px';
            img.style.width = 'auto';
            img.style.transform = 'translate(-50%,-50%) rotate(' + (plan.arrowBearing - mapBearing) + 'deg)';
        });
    }

    function finishModernRoute(routedConnections, allFeatures) {
        var map = window.map;
        if (!map) return;

        if (map.getSource(Config.connectionSourceId)) {
            map.getSource(Config.connectionSourceId).setData({
                type: 'FeatureCollection',
                features: allFeatures
            });
        }

        clearModernArrows();
        State.modernPlans = null;
        State.modernCameraTarget = null;
        if (State.modernPhaseTimer) {
            clearTimeout(State.modernPhaseTimer);
            State.modernPhaseTimer = null;
        }
        setModernActiveLabels(new Set());

        // 走完全程后才压暗外围，路径走廊保持原始色彩与明度
        State.dimPaths = routedConnections.map(function(c) { return c.path; });
        ensureMigrationDimCanvas();
        renderMigrationDim(State.dimPaths);
    }

    function startModernRouteAnimation(routedConnections, allFeatures, bounds) {
        cancelModernAnimation();
        var plans = buildModernPlans(routedConnections);
        if (!plans.length) return;

        State.modernPlans = plans;
        ensureModernArrowContainer(plans);
        ensureModernDismissHandler();

        var map = window.map;
        var totalTime = 0;
        plans.forEach(function(plan) {
            if (plan.totalTime > totalTime) totalTime = plan.totalTime;
        });

        // 起始镜头：居中于出发点，以较大比例尺呈现局部路径
        var startLon = 0, startLat = 0;
        plans.forEach(function(plan) {
            var c = plan.legs[0].start.coords;
            startLon += c[0];
            startLat += c[1];
        });
        startLon /= plans.length;
        startLat /= plans.length;
        State.modernCameraTarget = [startLon, startLat];
        if (map) map.jumpTo({ center: [startLon, startLat], zoom: Config.modernFollowZoom });

        var dwellEndTime = totalTime + Config.modernFinalDwell;
        var overviewEndTime = dwellEndTime + Config.modernOverviewDuration;
        var overviewStarted = false;

        function startOverview() {
            if (overviewStarted) return;
            overviewStarted = true;
            if (!bounds || bounds.isEmpty() || !map) return;
            map.fitBounds(bounds, {
                padding: Config.modernOverviewPadding,
                maxZoom: Config.modernOverviewMaxZoom,
                duration: Config.modernOverviewDuration
            });
        }

        function updateModernFrame(elapsed) {
            var desired = new Set();
            var partials = new Array(routedConnections.length);
            var focusPoints = [];

            plans.forEach(function(plan) {
                var completed = 0;
                var current = null;

                for (var li = 0; li < plan.legs.length; li++) {
                    var leg = plan.legs[li];
                    if (elapsed >= leg.endTime) {
                        completed = li + 1;
                        partials[leg.featureIndex] = leg.path;
                    } else if (elapsed >= leg.startTime) {
                        var frac = leg.duration > 0 ? (elapsed - leg.startTime) / leg.duration : 1;
                        partials[leg.featureIndex] = partialPathCoords(leg.path, frac);
                        current = { leg: leg, fraction: frac };
                        break;
                    } else {
                        break;
                    }
                }

                // 始终只显示一个地址：行进中显示当前站，抵达终点后保留终点地址
                if (elapsed < plan.totalTime) {
                    var labelStop = completed === 0
                        ? plan.legs[0].start
                        : plan.legs[completed - 1].end;
                    var label = findPeriodLabel(labelStop.coords, labelStop.period);
                    if (label) desired.add(label);
                } else {
                    var lastLeg = plan.legs[plan.legs.length - 1];
                    var finalLabel = findPeriodLabel(lastLeg.end.coords, lastLeg.end.period);
                    if (finalLabel) desired.add(finalLabel);
                }

                // 箭头位置与朝向
                if (elapsed >= plan.totalTime) {
                    if (plan.arrowEl) plan.arrowEl.style.display = 'none';
                    focusPoints.push(plan.legs[plan.legs.length - 1].end.coords);
                } else if (current) {
                    plan.arrowPos = pointAtFraction(current.leg.path, current.fraction);
                    plan.arrowBearing = bearingAtFraction(current.leg.path, current.fraction);
                    if (plan.arrowEl) plan.arrowEl.style.display = '';
                    focusPoints.push(plan.arrowPos);
                } else if (completed > 0) {
                    var prev = plan.legs[completed - 1];
                    plan.arrowPos = prev.end.coords.slice();
                    plan.arrowBearing = bearingAtFraction(prev.path, 1);
                    if (plan.arrowEl) plan.arrowEl.style.display = '';
                    focusPoints.push(plan.arrowPos);
                } else {
                    focusPoints.push(plan.legs[0].start.coords);
                }
            });

            setModernActiveLabels(desired);

            // 镜头跟随箭头；抵达后平滑收束到终点，结束停留后再缩放到完整路径
            if (map && !overviewStarted && focusPoints.length) {
                var cx = 0, cy = 0;
                focusPoints.forEach(function(pt) { cx += pt[0]; cy += pt[1]; });
                cx /= focusPoints.length;
                cy /= focusPoints.length;
                if (!State.modernCameraTarget) State.modernCameraTarget = [cx, cy];
                var fdx = (cx - State.modernCameraTarget[0]) * Config.modernFollowLerp;
                var fdy = (cy - State.modernCameraTarget[1]) * Config.modernFollowLerp;
                State.modernCameraTarget[0] += fdx;
                State.modernCameraTarget[1] += fdy;
                if (Math.abs(fdx) > 0.000002 || Math.abs(fdy) > 0.000002) {
                    map.setCenter(State.modernCameraTarget);
                }
            }

            if (map.getSource(Config.connectionSourceId)) {
                var features = [];
                for (var i = 0; i < partials.length; i++) {
                    if (!partials[i]) continue;
                    features.push({
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: partials[i] },
                        properties: allFeatures[i].properties
                    });
                }
                map.getSource(Config.connectionSourceId).setData({
                    type: 'FeatureCollection',
                    features: features
                });
            }

            repositionModernArrows();

            if (!overviewStarted && elapsed >= dwellEndTime) startOverview();
        }

        if (prefersReducedMotion()) {
            var finalDesired = new Set();
            plans.forEach(function(plan) {
                var last = plan.legs[plan.legs.length - 1];
                var label = findPeriodLabel(last.end.coords, last.end.period);
                if (label) finalDesired.add(label);
            });
            setModernActiveLabels(finalDesired);
            if (map.getSource(Config.connectionSourceId)) {
                map.getSource(Config.connectionSourceId).setData({
                    type: 'FeatureCollection',
                    features: allFeatures
                });
            }
            clearModernArrows();
            State.modernPlans = null;
            if (bounds && !bounds.isEmpty() && map) {
                map.fitBounds(bounds, {
                    padding: Config.modernOverviewPadding,
                    maxZoom: Config.modernOverviewMaxZoom,
                    duration: 0
                });
            }
            State.modernPhaseTimer = setTimeout(function() {
                State.modernPhaseTimer = null;
                finishModernRoute(routedConnections, allFeatures);
            }, Config.modernFinalDwell);
            return;
        }

        var startTime = performance.now();
        function frame(now) {
            var elapsed = now - startTime;
            updateModernFrame(elapsed);
            if (elapsed >= overviewEndTime) {
                State.modernAnimId = null;
                finishModernRoute(routedConnections, allFeatures);
                return;
            }
            State.modernAnimId = requestAnimationFrame(frame);
        }
        State.modernAnimId = requestAnimationFrame(frame);
    }

    // 逐级放宽吸附容差寻路；上限为直线距离且不低于 200m
    function routeWithLadder(startCoord, endCoord) {
        var RB = window.RoadGraphBuilder;
        var straightDist = RB.haversineDist(startCoord, endCoord);
        var maxTolerance = Math.max(Config.snapToleranceMinCap, straightDist);
        for (var tol = Config.snapTolerance; ; tol = Math.min(maxTolerance, tol + Config.snapToleranceStep)) {
            var path = null;
            try {
                path = RB.findShortestPath(window.roadGraph, startCoord, endCoord, tol);
            } catch (e) {
                path = null;
            }
            if (path || tol >= maxTolerance) return path;
        }
    }

    // 路网连通分量缓存（按当前路网图缓存，换年份自动重建）
    function getRouteComponents() {
        var graph = window.roadGraph;
        if (!graph) return null;
        if (graph._routeComponentData) return graph._routeComponentData;

        var comp = new Map();
        var ids = Array.from(graph.nodes.keys());
        var cid = 0;
        for (var i = 0; i < ids.length; i++) {
            var startId = ids[i];
            if (comp.has(startId)) continue;
            var stack = [startId];
            comp.set(startId, cid);
            while (stack.length) {
                var u = stack.pop();
                var neighbors = graph.adjacency.get(u) || [];
                for (var j = 0; j < neighbors.length; j++) {
                    var v = neighbors[j].to;
                    if (!comp.has(v)) {
                        comp.set(v, cid);
                        stack.push(v);
                    }
                }
            }
            cid++;
        }
        graph._routeComponentData = { comp: comp };
        return graph._routeComponentData;
    }

    function segmentComponents(segId) {
        var graph = window.roadGraph;
        var data = getRouteComponents();
        if (!data || !graph.segments[segId]) return [];
        var key = function(c) { return c[0].toFixed(6) + ',' + c[1].toFixed(6); };
        var seg = graph.segments[segId];
        var comps = [];
        var ends = [seg.a, seg.b];
        for (var i = 0; i < ends.length; i++) {
            var nodeId = graph.coordToNode.get(key(ends[i]));
            if (nodeId === undefined) continue;
            var cid = data.comp.get(nodeId);
            if (cid !== undefined && comps.indexOf(cid) === -1) comps.push(cid);
        }
        return comps;
    }

    // 沿 from→to 直线推进，返回第一个周边 200m 内有道路的采样点；
    // 传入 targetComps 时跳过与目标路网不连通的孤立碎片
    function findApproachPoint(fromCoord, toCoord, targetComps) {
        var RB = window.RoadGraphBuilder;
        var total = RB.haversineDist(fromCoord, toCoord);
        if (!(total > 0)) return null;
        var steps = Math.ceil(total / Config.approachStepMeters);
        for (var i = 0; i <= steps; i++) {
            var along = Math.min(i * Config.approachStepMeters, total);
            var t = along / total;
            var p = [
                fromCoord[0] + (toCoord[0] - fromCoord[0]) * t,
                fromCoord[1] + (toCoord[1] - fromCoord[1]) * t
            ];
            var cp = RB.findClosestPointOnRoad(window.roadGraph, p);
            if (!cp || cp.dist > Config.approachSnapTolerance) continue;

            var comps = segmentComponents(cp.segId);
            if (targetComps && !comps.some(function(cid) { return targetComps.indexOf(cid) !== -1; })) {
                continue;
            }
            return { coord: p, along: along, comps: comps };
        }
        return null;
    }

    // 路网外地址：先沿直线推进到道路附近，再沿路网寻路；两端都在路网外时两侧同时推进
    function findPathWithApproach(startCoord, endCoord) {
        var RB = window.RoadGraphBuilder;
        var startPt = RB.findClosestPointOnRoad(window.roadGraph, startCoord);
        var endPt = RB.findClosestPointOnRoad(window.roadGraph, endCoord);
        var startOff = !startPt || startPt.dist > Config.approachSnapTolerance;
        var endOff = !endPt || endPt.dist > Config.approachSnapTolerance;
        if (!startOff && !endOff) return null;

        var startApproach = null;
        var endApproach = null;
        if (startOff && endOff) {
            startApproach = findApproachPoint(startCoord, endCoord, null);
            if (!startApproach) return null;
            endApproach = findApproachPoint(endCoord, startCoord, startApproach.comps);
            if (!endApproach) {
                endApproach = findApproachPoint(endCoord, startCoord, null);
                if (!endApproach) return null;
                startApproach = findApproachPoint(startCoord, endCoord, endApproach.comps);
                if (!startApproach) return null;
            }
        } else if (startOff) {
            startApproach = findApproachPoint(startCoord, endCoord, segmentComponents(endPt.segId));
            if (!startApproach) return null;
        } else {
            endApproach = findApproachPoint(endCoord, startCoord, segmentComponents(startPt.segId));
            if (!endApproach) return null;
        }
        if (startApproach && endApproach) {
            var total = RB.haversineDist(startCoord, endCoord);
            if (startApproach.along + endApproach.along >= total) return null;
        }

        var routeStart = startApproach ? startApproach.coord : startCoord;
        var routeEnd = endApproach ? endApproach.coord : endCoord;
        var roadPath = routeWithLadder(routeStart, routeEnd);
        if (!roadPath) return null;

        var fullPath = [];
        if (startApproach) fullPath.push(startCoord);
        for (var i = 0; i < roadPath.length; i++) fullPath.push(roadPath[i]);
        if (endApproach) fullPath.push(endCoord);
        return fullPath;
    }

    function drawArrowConnections(artists) {
        if (!window.map) return;
        
        clearArrowLayersOnly();
        State.lastSearchArtists = artists;
        window.lastSearchArtists = artists;

        if (!artists || artists.length === 0) return;

        const groups = {};
        const connections = [];

        if (artists.length >= 2) {
            artists.forEach(a => {
                const name = window.currentLanguage === 'en' ? a.Name_EN : a.Name_CN;
                const period = parseInt(a.Period);
                if (!name || isNaN(period)) return;

                if (!groups[name]) groups[name] = [];
                groups[name].push({
                    name,
                    period,
                    coords: [parseFloat(a.Co_Long), parseFloat(a.Co_Lat)],
                    origin: a
                });
            });

            for (const name in groups) {
                const pts = groups[name].sort((a, b) => a.period - b.period);
                for (let i = 0; i < pts.length - 1; i++) {
                    const start = pts[i];
                    const end = pts[i + 1];

                    if (isNaN(start.coords[0]) || isNaN(start.coords[1]) ||
                        isNaN(end.coords[0]) || isNaN(end.coords[1])) {
                        continue;
                    }
                    if (start.coords[0] === end.coords[0] && start.coords[1] === end.coords[1]) {
                        continue;
                    }

                    connections.push({ start, end });
                }
            }
        }

        // 排序确保顺序确定性：按起始 period → 结束 period
        connections.sort((a, b) => {
            if (a.start.period !== b.start.period) return a.start.period - b.start.period;
            return a.end.period - b.end.period;
        });

        // 去重：移除相同的 start/end 对
        const deduped = [];
        for (let ci = 0; ci < connections.length; ci++) {
            const c = connections[ci];
            const isDup = deduped.some(d =>
                d.start.coords[0] === c.start.coords[0] &&
                d.start.coords[1] === c.start.coords[1] &&
                d.end.coords[0] === c.end.coords[0] &&
                d.end.coords[1] === c.end.coords[1]
            );
            if (!isDup) deduped.push(c);
        }

        // 尝试通过路网图将直线替换为沿路路径
        const routedConnections = [];
        for (const conn of deduped) {
            let path = null;
            if (window.roadGraph && window.RoadGraphBuilder && window.RoadGraphBuilder.findShortestPath) {
                try {
                    path = routeWithLadder(conn.start.coords, conn.end.coords);
                    if (!path) path = findPathWithApproach(conn.start.coords, conn.end.coords);
                } catch(e) {
                    path = null;
                }
            }
            if (path && path.length >= 2) {
                var cleanPath = path.filter(function(c) {
                    return c && c.length >= 2 && isFinite(c[0]) && isFinite(c[1]);
                });
                if (cleanPath.length >= 2) {
                    routedConnections.push({ start: conn.start, end: conn.end, path: simplifyPath(cleanPath, 500) });
                } else {
                    routedConnections.push({ start: conn.start, end: conn.end, path: [conn.start.coords, conn.end.coords] });
                }
            } else {
                routedConnections.push({ start: conn.start, end: conn.end, path: [conn.start.coords, conn.end.coords] });
            }
        }

        // 没有可绘制的路线（如只有一处住址）：不要进入迁移态，避免全图变暗/标点被隐藏
        if (routedConnections.length === 0) {
            clearArrowConnections();
            return;
        }

        const map = window.map;

        // 构建完整 features 快照（用于逐帧裁剪）
        var allFeatures = routedConnections.map(function(conn) {
            return {
                geometry: { type: 'LineString', coordinates: conn.path },
                properties: { name: conn.start.name, from_period: conn.start.period, to_period: conn.end.period }
            };
        });

        // 确保 source 存在（初始为空数据）
        if (!map.getSource(Config.connectionSourceId)) {
            map.addSource(Config.connectionSourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });
        } else {
            map.getSource(Config.connectionSourceId).setData({
                type: 'FeatureCollection',
                features: []
            });
        }

        // 构建静态文字标签 features（起点+终点，始终可见）
        const textFeatures = [];
        const seenStartArtists = {};
        routedConnections.forEach(conn => {
            const artistName = conn.start.name;
            const isFirstForArtist = !seenStartArtists[artistName];
            seenStartArtists[artistName] = true;

            textFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: conn.start.coords },
                properties: {
                    period: String(conn.start.origin.Period),
                    histAddC: conn.start.origin.Hist_Add_C || '',
                    histAddE: conn.start.origin.Hist_Add_E || '',
                    isStart: isFirstForArtist
                }
            });
            textFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: conn.end.coords },
                properties: {
                    period: String(conn.end.origin.Period),
                    histAddC: conn.end.origin.Hist_Add_C || '',
                    histAddE: conn.end.origin.Hist_Add_E || '',
                    isStart: false
                }
            });
        });

        // 去重：相同坐标 + 相同内容只保留一个（isStart 取逻辑或）
        const dedupedTextFeatures = [];
        textFeatures.forEach(f => {
            const existing = dedupedTextFeatures.find(d =>
                d.geometry.coordinates[0] === f.geometry.coordinates[0] &&
                d.geometry.coordinates[1] === f.geometry.coordinates[1] &&
                d.properties.period === f.properties.period &&
                d.properties.histAddC === f.properties.histAddC &&
                d.properties.histAddE === f.properties.histAddE
            );
            if (existing) {
                existing.properties.isStart = existing.properties.isStart || f.properties.isStart;
            } else {
                dedupedTextFeatures.push(f);
            }
        });

        // 创建 HTML 文字标签（位于 dim 画布之上）
        ensurePeriodTextLabels(dedupedTextFeatures);

        const isModern = window.GlobalStore && window.GlobalStore.currentStyle === 'map_3';

        const ensureLineAndTextLayers = () => {
            if (!map.getLayer(Config.connectionLayerId)) {
                var paint = isModern ? {
                    'line-color': Config.lineColor,
                    'line-width': modernWidthExpression(0),
                    'line-opacity': Config.modernLineOpacity
                } : {
                    'line-pattern': Config.footprintImageId,
                    'line-color': '#897763',
                    'line-width': Config.lineWidth,
                    'line-opacity': Config.lineOpacity
                };
                map.addLayer({
                    id: Config.connectionLayerId,
                    type: 'line',
                    source: Config.connectionSourceId,
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: paint
                });
            }
        };

        function afterAssetsLoaded() {
            ensureLineAndTextLayers();
            document.body.classList.add('migration-active');

            // 历史地图保持原有流程：先铺遮罩，再移动到路线范围
            if (!isModern) {
                ensureMigrationDimCanvas();
                State.dimPaths = routedConnections.map(function(c) { return c.path; });
                renderMigrationDim(State.dimPaths);
            }

            var bounds = new mapboxgl.LngLatBounds();
            routedConnections.forEach(function(c) {
                bounds.extend(c.start.coords);
                bounds.extend(c.end.coords);
            });
            // 当代地图由动画自行控制镜头：先跟随箭头，结束后再缩放到完整路径
            if (!bounds.isEmpty() && !isModern) {
                window.map.jumpTo({ center: bounds.getCenter(), zoom: 14 });
            }

            if (isModern) {
                // 当代地图：单箭头逐段推进，走完后才压暗外围
                startModernRouteAnimation(routedConnections, allFeatures, bounds);
            } else {
                if (window.LayerControl) window.LayerControl.toggleMarkers(false);
                startRevealAnimation(allFeatures, routedConnections);
            }
        }

        if (isModern) {
            afterAssetsLoaded();
        } else {
            loadFootprintImage(function() {
                loadVehicleImage(function() {
                    addVehicleMarkers(routedConnections);
                    afterAssetsLoaded();
                });
            });
        }
    }

    /*
     * ---------------------------------------------------------------------------
     * Mapbox Directions API 集成方案（map_3 现在地图使用）
     * ---------------------------------------------------------------------------
     * 当切换到 map_3（现在地图）时，目前使用直线回退方案。
     * 如需在现代地图上实现沿路路径，可取消下方代码的注释，在 drawArrowConnections
     * 中当 !window.roadGraph 时调用 fetchDirectionsRoute 获取真实道路路径。
     *
     * async function fetchDirectionsRoute(start, end) {
     *     const token = '<Mapbox 令牌，运行时从后端下发获取>';
     *     const url = 'https://api.mapbox.com/directions/v5/mapbox/walking/' +
     *         start[0] + ',' + start[1] + ';' + end[0] + ',' + end[1] +
     *         '?geometries=geojson&overview=full&access_token=' + token;
     *     try {
     *         const res = await fetch(url);
     *         const data = await res.json();
     *         if (data.routes && data.routes.length > 0) {
     *             return data.routes[0].geometry.coordinates;
     *         }
     *     } catch(e) {
     *         console.warn('Mapbox Directions API failed:', e);
     *     }
     *     return null;
     * }
     *
     * 集成方式：在 drawArrowConnections 中 routedConnections 构建循环内：
     *   if (!window.roadGraph) {
     *       path = await fetchDirectionsRoute(conn.start.coords, conn.end.coords);
     *   }
     *   if (!path || path.length < 2) path = [conn.start.coords, conn.end.coords];
     *
     * 注意：API 调用会产生费用（免费额度 100,000 次/月），且返回的是现代路线。
     * ---------------------------------------------------------------------------
     */

    // 暴露公有API
    window.MigratoryRoute = {
        config: Config,
        drawArrowConnections,
        clearArrowConnections,
        clearArrowLayersOnly,
        renderMigrationDim
    };

})(window);
