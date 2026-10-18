function updateMarkersOnScreen() {
    if (!window.map || !window.map.getSource('artists')) {
        for (const id in window.markersOnScreen) {
            window.markersOnScreen[id].remove();
        }
        window.markersOnScreen = {};
        for (const id in window.studioMarkersOnScreen) {
            window.studioMarkersOnScreen[id].remove();
        }
        window.studioMarkersOnScreen = {};
        return;
    }

    const features = window.map.querySourceFeatures('artists', {
        filter: ['!', ['has', 'point_count']]
    });

    const uniqueFeatures = {};
    features.forEach(feature => {
        const type = feature.properties.type || 'artist';
        uniqueFeatures[type + '::' + feature.properties.id] = feature;
    });

    // 标记当前可见的 key（type::id）
    const visibleKeys = new Set(Object.keys(uniqueFeatures));

    for (const id in window.markersOnScreen) {
        if (!visibleKeys.has('artist::' + id)) {
            window.markersOnScreen[id].remove();
            delete window.markersOnScreen[id];
        }
    }
    for (const id in window.studioMarkersOnScreen) {
        if (!visibleKeys.has('studio::' + id)) {
            window.studioMarkersOnScreen[id].remove();
            delete window.studioMarkersOnScreen[id];
        }
    }

    for (const key in uniqueFeatures) {
        const feature = uniqueFeatures[key];
        const type = feature.properties.type || 'artist';
        const id = feature.properties.id;

        if (type === 'studio') {
            if (!window.studioMarkersOnScreen[id]) {
                const studio = window.allStudiosData[id];

                const studioMarker = new mapboxgl.Marker({ scale: 0.8 })
                    .setLngLat(feature.geometry.coordinates)
                    .addTo(window.map);
                const studioEl = studioMarker.getElement();
                studioEl.classList.add('studio-marker');
                studioMarker._studioId = id;
                window.studioMarkersOnScreen[id] = studioMarker;

                studioEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleStudioClick(studio, studioMarker);
                });

                // 悬浮显示侧边栏逻辑
                let studioHoverTimeout;
                studioEl.addEventListener('mouseenter', () => {
                    window.currentHoveredMarker = id;
                    if (window.LayerControl) window.LayerControl.updateState({ hasHoveredMarker: true });

                    studioEl.style.width = "45px";
                    studioEl.style.height = "45px";
                    studioEl.style.transition = "width 0.2s, height 0.2s";

                    studioHoverTimeout = setTimeout(() => {
                        if (window.updateStudioSidebar) {
                            window.updateStudioSidebar(studio);
                        }
                        if (window.GlobalStore && window.GlobalStore.isPopupOpen) {
                            window.GlobalStore.isPopupOpen = false;
                        }
                    }, 400);
                });

                studioEl.addEventListener('mouseleave', () => {
                    window.currentHoveredMarker = null;
                    if (window.LayerControl) window.LayerControl.updateState({ hasHoveredMarker: false });

                    studioEl.style.width = "35px";
                    studioEl.style.height = "35px";

                    if (studioHoverTimeout) {
                        clearTimeout(studioHoverTimeout);
                    }

                    if (window.currentSelectedStudio !== id && window.GlobalStore) {
                        window.GlobalStore.isSidebarVisible = false;
                    }
                });

                if (window.LayerControl && window.LayerControl.markersVisible === false) {
                    studioEl.style.display = 'none';
                }
                if (typeof window.updateStudioMarkerStyle === 'function') {
                    window.updateStudioMarkerStyle(studioMarker);
                }

                // 如果该点被选中，应用选中样式
                if (window.currentSelectedStudio === id) {
                    studioEl.classList.add('selected-marker');
                }
            }
            continue;
        }

        if (!window.markersOnScreen[id]) {
            const artist = window.allArtistsData[id];

            const el = document.createElement('div');
            el.className = 'mapboxgl-marker mapboxgl-marker-anchor-center';
            const marker = new mapboxgl.Marker({ scale: 0.8 })
                .setLngLat(feature.geometry.coordinates)
                .addTo(window.map);
            
            marker.getElement().classList.add('artist-marker');
            marker._artistId = id;
            marker.getElement().addEventListener('click', (e) => {
                e.stopPropagation();
                handleMarkerClick(artist, marker);
            });

            // 悬浮显示侧边栏逻辑
            let hoverTimeout;
            marker.getElement().addEventListener('mouseenter', () => {
                window.currentHoveredMarker = id;
                if (window.LayerControl) window.LayerControl.updateState({ hasHoveredMarker: true });

                marker.getElement().style.width = "45px";
                marker.getElement().style.height = "45px";
                marker.getElement().style.transition = "width 0.2s, height 0.2s";

                hoverTimeout = setTimeout(() => {
                    if (window.updateSidebar) {
                        window.updateSidebar(artist);
                    }
                    if (window.GlobalStore && window.GlobalStore.isPopupOpen) {
                        window.GlobalStore.isPopupOpen = false;
                    }
                }, 400);
            });

            marker.getElement().addEventListener('mouseleave', () => {
                window.currentHoveredMarker = null;
                if (window.LayerControl) window.LayerControl.updateState({ hasHoveredMarker: false });

                marker.getElement().style.width = "35px";
                marker.getElement().style.height = "35px";

                if (hoverTimeout) {
                    clearTimeout(hoverTimeout);
                }

                if (window.currentSelectedMarker !== id && window.GlobalStore) {
                    window.GlobalStore.isSidebarVisible = false;
                }
            });

            window.markersOnScreen[id] = marker;

            if (typeof window.updateMarkerStyle === 'function') {
                window.updateMarkerStyle(marker);
            }
            
            // 如果该点被选中，应用选中样式
            if (window.currentSelectedMarker === id) {
                marker.getElement().classList.add('selected-marker');
            }

            if (window.LayerControl && window.LayerControl.markersVisible === false) {
                marker.getElement().style.display = 'none';
            }
        }
    }
}

function handleMarkerClick(artist, marker) {
    if (!artist) return;

    const artistId = artist.ID;

    if (!marker && window.markersOnScreen && window.markersOnScreen[artistId]) {
        marker = window.markersOnScreen[artistId];
    }

    if (window.currentSelectedMarker === artistId) {
        window.resetMapSelection();
        hideMarkerActionMenu();
        if (window.GlobalStore) {
            window.GlobalStore.isSidebarVisible = false;
        }
        return;
    }

    window.resetMapSelection();

    window.currentSelectedMarker = artistId;
    if (window.LayerControl) window.LayerControl.updateState({ hasSelectedMarker: true });
    if (window.GlobalStore) window.GlobalStore.selectedArtist = artist;

    if (marker) {
        marker.getElement().classList.add('selected-marker');
    }

    if (window.currentPopup) {
        window.currentPopup.remove();
        window.currentPopup = null;
    }

    const lang = window.currentLanguage || 'zh';
    const name = lang === 'zh' ? (artist.Name_CN || artist.Name_EN) : (artist.Name_EN || artist.Name_CN);

    let coordinates;
    if (marker) {
        const lngLat = marker.getLngLat();
        coordinates = [lngLat.lng, lngLat.lat];
    } else {
        coordinates = [parseFloat(artist.Co_Long), parseFloat(artist.Co_Lat)];
    }

    const isMobile = window.innerWidth <= 768;
    const offset = isMobile ? [0, 0] : [-(window.innerWidth * 0.22), 0];
    window.map.flyTo({
        center: coordinates,
        offset: offset,
        zoom: 16,
        speed: 0.8
    });

    if (typeof updateSidebar === 'function') updateSidebar(artist);
    showMarkerActionMenu(artist, marker, coordinates);
}

function handleStudioClick(studio, marker) {
    if (!studio) return;

    const studioId = studio.ID;

    if (!marker && window.studioMarkersOnScreen && window.studioMarkersOnScreen[studioId]) {
        marker = window.studioMarkersOnScreen[studioId];
    }

    if (window.currentSelectedStudio === studioId) {
        window.resetMapSelection();
        if (window.GlobalStore) {
            window.GlobalStore.isSidebarVisible = false;
        }
        return;
    }

    window.resetMapSelection();

    window.currentSelectedStudio = studioId;
    if (window.LayerControl) window.LayerControl.updateState({ hasSelectedMarker: true });

    if (marker) {
        marker.getElement().classList.add('selected-marker');
    }

    if (window.currentPopup) {
        window.currentPopup.remove();
        window.currentPopup = null;
    }

    let coordinates;
    if (marker) {
        const lngLat = marker.getLngLat();
        coordinates = [lngLat.lng, lngLat.lat];
    } else {
        coordinates = [parseFloat(studio.Co_Long), parseFloat(studio.Co_Lat)];
    }

    const isMobile = window.innerWidth <= 768;
    const offset = isMobile ? [0, 0] : [-(window.innerWidth * 0.22), 0];
    window.map.flyTo({
        center: coordinates,
        offset: offset,
        zoom: 16,
        speed: 0.8
    });

    if (typeof updateStudioSidebar === 'function') updateStudioSidebar(studio);
    showStudioActionMenu(studio, marker, coordinates);
}

function renderActionMenu(items, coordinates) {
    hideMarkerActionMenu();

    const menu = document.createElement('div');
    menu.className = 'marker-action-menu';
    menu.id = 'marker-action-menu';

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'marker-action-item';
        const icon = document.createElement('img');
        icon.className = 'marker-action-icon';
        icon.src = item.icon;
        el.appendChild(icon);
        const text = document.createElement('span');
        text.textContent = item.label;
        el.appendChild(text);
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            item.action();
            hideMarkerActionMenu();
        });
        menu.appendChild(el);
    });

    document.body.appendChild(menu);

    const updateMenuPosition = () => {
        const pt = window.map.project(coordinates);
        menu.style.left = (pt.x + 20) + 'px';
        menu.style.top = (pt.y - 10) + 'px';
    };
    updateMenuPosition();
    window.map.on('move', updateMenuPosition);

    window._actionMenu = menu;
    window._actionMenuUpdater = updateMenuPosition;

    setTimeout(() => {
        const closeMenu = function(e) {
            if (menu && !menu.contains(e.target)) {
                hideMarkerActionMenu();
                document.removeEventListener('click', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);
    }, 0);
}

function showMarkerActionMenu(artist, marker, coordinates) {
    const lang = window.currentLanguage || 'zh';
    const t = window.t || function(k) { return k; };

    const items = [
        { key: 'residence', icon: 'assets/others/choiceBuilding.svg', label: t('click_residence'), action: () => {
            if (typeof showImagePopup === 'function') showImagePopup(artist);
            if (window.GlobalStore) window.GlobalStore.isPopupOpen = true;
        }},
        { key: 'social', icon: 'assets/others/choiceRelationship.svg', label: t('click_social'), action: () => {
            window._clickMenuActive = true;
            if (window.ArtistRelationship && typeof window.ArtistRelationship.showArtistRelationships === 'function') {
                window.ArtistRelationship.showArtistRelationships(artist);
            }
            setLayerVisInternal('relationships-layer', true);
            setLayerVisInternal('relationships-particles', true);
            setLayerVisInternal('relationships-glow', true);
        }},
        { key: 'migration', icon: 'assets/others/choiceRoute.svg', label: t('click_migration'), action: () => {
            window._clickMenuActive = true;
            const a = artist;
            const nameToMatch = window.currentLanguage === 'en' ? a.Name_EN : a.Name_CN;
            const points = [];
            if (window.allArtistsData) {
                Object.values(window.allArtistsData).forEach(temp => {
                    const matchName = window.currentLanguage === 'en' ? temp.Name_EN : temp.Name_CN;
                    if (matchName === nameToMatch) points.push(temp);
                });
            }
            window.temporaryVisibleArtists = points;
            if (typeof window.applyFilters === 'function') window.applyFilters();
            if (window.MigratoryRoute && typeof window.MigratoryRoute.drawArrowConnections === 'function') {
                window.MigratoryRoute.drawArrowConnections(points);
            }
            setLayerVisInternal('search-connection-line', true);
            setLayerVisInternal('search-arrow-text-layer', true);
        }}
    ];

    renderActionMenu(items, coordinates);
}

function showStudioActionMenu(studio, marker, coordinates) {
    const lang = window.currentLanguage || 'zh';
    const t = window.t || function(k) { return k; };

    const items = [
        { key: 'residence', icon: 'assets/others/choiceBuilding.svg', label: t('click_residence'), action: () => {
            if (typeof showImagePopup === 'function') showImagePopup(studio);
            if (window.GlobalStore) window.GlobalStore.isPopupOpen = true;
        }}
    ];

    renderActionMenu(items, coordinates);
}

function hideMarkerActionMenu() {
    if (window._actionMenuUpdater) {
        window.map.off('move', window._actionMenuUpdater);
        window._actionMenuUpdater = null;
    }
    if (window._actionMenu) {
        window._actionMenu.remove();
        window._actionMenu = null;
    }
}

function setLayerVisInternal(layerId, visible) {
    if (!layerId || !window.map || !window.map.getLayer(layerId)) return;
    window.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
}

function generateFeaturesWithOffsets(points) {
    const features = [];
    const coordMap = {};

    points.forEach(point => {
         let lon = parseFloat(point.Co_Long);
         let lat = parseFloat(point.Co_Lat);
         if (!isNaN(lon) && !isNaN(lat)) {
              const key = lon.toFixed(6) + ',' + lat.toFixed(6);

              if (coordMap[key] === undefined) {
                  coordMap[key] = 0;
              } else {
                  coordMap[key]++;

                  const count = coordMap[key];
                  const angle = count * 1.2;
                  const dist = 0.0001 * (1 + Math.floor(count / 10));

                  lon += Math.cos(angle) * dist;
                  lat += Math.sin(angle) * dist;
              }

              features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat]
                },
                properties: {
                    id: point.ID,
                    name_cn: point.Name_CN,
                    name_en: point.Name_EN,
                    type: point._type || 'artist'
                }
            });
         }
    });
    return features;
}

// 添加聚合图层的函数
function addClusteredLayers() {
    if (window.map.getSource('artists')) return;

    const initialPoints = (window.currentFilteredArtists || []).concat(window.currentFilteredStudios || window.studios || []);
    const features = generateFeaturesWithOffsets(initialPoints);

    const geojsonData = {
        type: 'FeatureCollection',
        features: features
    };

    window.map.addSource('artists', {
        type: 'geojson',
        data: geojsonData,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 65,
        clusterMinPoints: 8,
        buffer: 512
    });

    window.map.addSource('artists-unclustered', {
        type: 'geojson',
        data: geojsonData
    });

    // 聚合图层（圆圈）
    window.map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'artists',
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': [
                'step',
                ['get', 'point_count'],
                '#ab947f',
                10,
                '#a9774b',
                50,
                '#ab5b13'
            ],
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                15,
                10,
                20,
                50,
                25
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff'
        }
    });

    // 聚合数量标签
    window.map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'artists',
        filter: ['has', 'point_count'],
        layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12
        },
        paint: {
            'text-color': '#ffffff'
        }
    });

    if (!window.map.getSource('relationships')) {
        window.map.addSource('relationships', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        // Add dim background layer
        window.map.addLayer({
            id: 'dim-background',
            type: 'background',
            paint: {
                'background-color': 'rgba(245,238,222,0.45)',
                'background-opacity': 0,
                'background-opacity-transition': { duration: 300 }
            }
        });

        window.map.addLayer({
            id: 'dim-layer',
            type: 'fill',
            source: {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]
                    }
                }
            },
            paint: {
                'fill-color': 'rgb(245,238,222)',
                'fill-opacity': 0,
                'fill-opacity-transition': { duration: 300 }
            }
        });

        // Load relationship line SVG patterns via Canvas (SVG viewBox is ~1px tall, need to re-render at proper height)
        async function loadSvgAsPattern(id, url, patternHeight) {
            const resp = await fetch(url);
            const svgText = await resp.text();
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgEl = svgDoc.querySelector('svg');
            if (!svgEl) throw new Error('SVG not found in ' + url);
            const viewBoxAttr = svgEl.getAttribute('viewBox');
            if (!viewBoxAttr) throw new Error('SVG missing viewBox: ' + url);
            const viewBox = viewBoxAttr.split(/\s+/).map(Number);
            const vbW = viewBox[2];
            const vbH = viewBox[3];
            const scale = patternHeight / vbH;
            const contentWidth = Math.round(vbW * scale);
            const canvasWidth = 256;

            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = patternHeight;
            const ctx = canvas.getContext('2d');

            const offsetX = Math.round((canvasWidth - contentWidth) / 2);

            const paths = svgDoc.querySelectorAll('path');
            ctx.fillStyle = '#000';
            paths.forEach(path => {
                const d = path.getAttribute('d');
                const p = new Path2D(d);
                ctx.save();
                ctx.translate(offsetX, 0);
                ctx.scale(scale, scale);
                ctx.fill(p);
                ctx.restore();
            });

            const imageData = ctx.getImageData(0, 0, canvasWidth, patternHeight);
            return { id, image: imageData, width: canvasWidth, height: patternHeight };
        }

        const PATTERN_HEIGHT = 6;

        Promise.all([
            loadSvgAsPattern(1, 'assets/others/relationshipLine1.svg', PATTERN_HEIGHT),
            loadSvgAsPattern(2, 'assets/others/relationshipLine2.svg', PATTERN_HEIGHT),
            loadSvgAsPattern(3, 'assets/others/relationshipLine3.svg', PATTERN_HEIGHT)
        ]).then(patterns => {
            patterns.forEach(p => {
                if (!window.map.hasImage(`relationship-pattern-${p.id}`)) {
                    window.map.addImage(`relationship-pattern-${p.id}`, p.image, { pixelRatio: 1 });
                }
            });

            window.map.addLayer({
                id: 'relationships-layer',
                type: 'line',
                source: 'relationships',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-pattern': [
                        'match', ['get', 'patternType'],
                        1, 'relationship-pattern-1',
                        2, 'relationship-pattern-2',
                        3, 'relationship-pattern-3',
                        'relationship-pattern-1'
                    ],
                    'line-width': PATTERN_HEIGHT,
                    'line-opacity': 0.9
                }
            });
        }).catch(err => {
            console.error('关系连线图案加载失败', err);
        });
    }
}

window.resetMapSelection = function(skipReapply) {
    window._clickMenuActive = false;
    if (window.currentSelectedMarker && window.markersOnScreen[window.currentSelectedMarker]) {
         window.markersOnScreen[window.currentSelectedMarker].getElement().classList.remove('selected-marker');
    }
    window.currentSelectedMarker = null;
    if (window.currentSelectedStudio && window.studioMarkersOnScreen[window.currentSelectedStudio]) {
        window.studioMarkersOnScreen[window.currentSelectedStudio].getElement().classList.remove('selected-marker');
    }
    window.currentSelectedStudio = null;
    window.lastStudio = null;
    if (window.LayerControl) window.LayerControl.updateState({ hasSelectedMarker: false });
    if (window.GlobalStore) window.GlobalStore.selectedArtist = null;

    if (window.currentPopup) {
        window.currentPopup.remove();
        window.currentPopup = null;
    }

    hideMarkerActionMenu();

    if (window.ArtistRelationship && typeof window.ArtistRelationship.clearArtistRelationships === 'function') {
        window.ArtistRelationship.clearArtistRelationships();
    }

    if (window.MigratoryRoute && typeof window.MigratoryRoute.clearArrowConnections === 'function') {
        window.MigratoryRoute.clearArrowConnections();
    }
    window.temporaryVisibleArtists = [];
    // skipReapply：由 applyFilters 内部调用时避免递归
    if (!skipReapply && typeof window.applyFilters === 'function') {
        window.applyFilters();
    }

    setLayerVisInternal('search-connection-line', false);
    setLayerVisInternal('search-arrow-text-layer', false);

    const layerMode = window.GlobalStore ? window.GlobalStore.activeLayerMode : 'position';
    const showRel = layerMode === 'social';
    setLayerVisInternal('relationships-layer', showRel);
    setLayerVisInternal('relationships-particles', showRel);
    setLayerVisInternal('relationships-glow', showRel);
};

window.checkAndResetMapSelection = function() {
    const isSidebarOpen = window.GlobalStore ? window.GlobalStore.isSidebarVisible : false;
    const isPopupOpen = window.GlobalStore ? window.GlobalStore.isPopupOpen : false;

    if (!isSidebarOpen && !isPopupOpen) {
        window.resetMapSelection();
    }
};

let currentActiveStyleName = (window._initialMapStyle && window._initialMapStyle.name) || 'map_3'

document.addEventListener('languageChanged', (e) => {
    if (window.currentPopup && window.currentPopup.isOpen() && window.currentSelectedMarker) {
        const artist = window.allArtistsData[window.currentSelectedMarker];
        if (artist) {
            const lang = window.currentLanguage || 'zh';
            const name = lang === 'zh' ? (artist.Name_CN || artist.Name_EN) : (artist.Name_EN || artist.Name_CN);
            if (name) {
                window.currentPopup.setHTML(`<strong>${name}</strong>`);
            }
        }
    }

    if (window.ArtistRelationship && typeof window.ArtistRelationship.drawRelationships === 'function') {
        window.ArtistRelationship.drawRelationships();
    }

    // 中英文切换时更新当前地图样式
    const lang = e.detail ? e.detail.language : (window.currentLanguage || 'zh');
    if (currentActiveStyleName) {
        if (typeof mapStyles[currentActiveStyleName] === 'object') {
            switchMapStyle(currentActiveStyleName, lang);
        }
    }

    // 统一刷新标点样式：印章 CN/EN 与性别属性图 CN/EN 均随语言切换
    if (typeof window.updateAllMarkerStyles === 'function') {
        window.updateAllMarkerStyles();
    }
});

function updateMarkers(filteredArtists) {
    let combinedArtists = [...filteredArtists];
    if (window.temporaryVisibleArtists && window.temporaryVisibleArtists.length > 0) {
        window.temporaryVisibleArtists.forEach(ta => {
            if (!combinedArtists.some(a => a.ID === ta.ID)) {
                combinedArtists.push(ta);
            }
        });
    }

    window.currentFilteredArtists = filteredArtists;

    if (!window.map.getSource('artists')) return;

    const combinedPoints = combinedArtists.concat(window.currentFilteredStudios || window.studios || []);
    const features = generateFeaturesWithOffsets(combinedPoints);

    window.map.getSource('artists').setData({
        type: 'FeatureCollection',
        features: features
    });

    if (window.map.getSource('artists-unclustered')) {
        window.map.getSource('artists-unclustered').setData({
            type: 'FeatureCollection',
            features: features
        });
    }

    window.map.once('idle', updateMarkersOnScreen);
}

const mapStyles = {
    'map_1': 'mapbox://styles/atlaskwok/cmngsotw5000n01qwe1t4aylb',
    'map_2': 'mapbox://styles/atlaskwok/cmngsotw5000n01qwe1t4aylb',
    'map_3': {
        'zh': 'mapbox://styles/atlaskwok/cmmg9kmya005e01ryfshv8yft',
        'en': 'mapbox://styles/atlaskwok/cmngsa8a700cm01qq8o71bqy1'
    }
};

// 样式切换期间 addSource/addLayer 会失败；等待 style.load 或 idle（带超时兜底）
function waitForMapStyleReady() {
    if (!window.map || !window.map.isStyleLoaded || window.map.isStyleLoaded()) {
        return Promise.resolve();
    }
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (window.map) {
                window.map.off('style.load', finish);
                window.map.off('idle', finish);
            }
            resolve();
        };
        const timer = setTimeout(finish, 4000);
        window.map.once('style.load', finish);
        window.map.once('idle', finish);
    });
}

async function loadShanghaiMap1937() {
    try {
        let beforeLayerId1937 = undefined;
        if (window.map.getLayer('density-heatmap')) {
            beforeLayerId1937 = 'density-heatmap';
        } else if (window.map.getLayer('clusters')) {
            beforeLayerId1937 = 'clusters';
        }

        if (window.map.getSource('shanghai-1937-street-source')) {
        } else {
            const [geojsonRes, csvRes] = await Promise.all([
                fetch(window.dataUrl('data/SH1937_street.geojson')),
                fetch(window.dataUrl('data/roadTranslation1937.csv'))
            ]);
            const geojson = await geojsonRes.json();
            const csvText = await csvRes.text();

            const lookup = {};
            const lines = csvText.trim().split('\n');
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                const street = cols[0].trim();
                const translation = cols[1] ? cols[1].trim() : '';
                if (street && translation) {
                    lookup[street] = translation;
                }
            }

            geojson.features.forEach(f => {
                f.properties.name_en = lookup[f.properties.street] || null;
            });

            window._1937RoadGeoJSON = geojson;

            await waitForMapStyleReady();
            window.map.addSource('shanghai-1937-street-source', {
                type: 'geojson',
                data: geojson
            });
        }

        await waitForMapStyleReady();
        if (!window.map.getLayer('shanghai-1937-street-layer')) {
            window.map.addLayer({
                'id': 'shanghai-1937-street-layer',
                'type': 'line',
                'source': 'shanghai-1937-street-source',
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#ffffff',
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10, 1,
                        14, 3.5,
                        18, 10,
                        22, 20                    ],
                    'line-opacity': 0.7
                }
            }, beforeLayerId1937);
        }

        if (!window.map.getLayer('shanghai-1937-street-labels')) {
            window.map.addLayer({
                'id': 'shanghai-1937-street-labels',
                'type': 'symbol',
                'source': 'shanghai-1937-street-source',
                'layout': {
                    'visibility': 'visible',
                    'text-field': ['get', 'street'],
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-size': 12,
                    'symbol-placement': 'line',
                    'text-anchor': 'center'
                },
                'paint': {
                    'text-color': '#4a4a4a',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2
                }
            }, beforeLayerId1937);
        }

    } catch (error) {
        console.error("Failed to load Shanghai 1937 map:", error);
    }
}

async function loadShanghaiMap1947() {
    try {
        let beforeLayerId1947 = undefined;
        if (window.map.getLayer('density-heatmap')) {
            beforeLayerId1947 = 'density-heatmap';
        } else if (window.map.getLayer('clusters')) {
            beforeLayerId1947 = 'clusters';
        }

        if (window.map.getSource('shanghai-1947-street-source')) {
        } else {
            const [geojsonRes, csvRes] = await Promise.all([
                fetch(window.dataUrl('data/SH1947_street.geojson')),
                fetch(window.dataUrl('data/roadTranslation1947.csv'))
            ]);
            const geojson = await geojsonRes.json();
            const csvText = await csvRes.text();

            const lookup = {};
            const lines = csvText.trim().split('\n');
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                const street = cols[0].trim();
                const translation = cols[1] ? cols[1].trim() : '';
                if (street && translation) {
                    lookup[street] = translation;
                }
            }

            geojson.features.forEach(f => {
                f.properties.name_en = lookup[f.properties.street] || null;
            });

            window._1947RoadGeoJSON = geojson;

            await waitForMapStyleReady();
            window.map.addSource('shanghai-1947-street-source', {
                type: 'geojson',
                data: geojson
            });
        }

        await waitForMapStyleReady();
        if (!window.map.getLayer('shanghai-1947-street-layer')) {
            window.map.addLayer({
                'id': 'shanghai-1947-street-layer',
                'type': 'line',
                'source': 'shanghai-1947-street-source',
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#ffffff',
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10, 1,
                        14, 3.5,
                        18, 10,
                        22, 20
                    ],
                    'line-opacity': 0.7
                }
            }, beforeLayerId1947);
        }

        if (!window.map.getLayer('shanghai-1947-street-labels')) {
            window.map.addLayer({
                'id': 'shanghai-1947-street-labels',
                'type': 'symbol',
                'source': 'shanghai-1947-street-source',
                'layout': {
                    'visibility': 'visible',
                    'text-field': ['get', '原名'],
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-size': 12,
                    'symbol-placement': 'line',
                    'text-anchor': 'center'
                },
                'paint': {
                    'text-color': '#4a4a4a',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2
                }
            }, beforeLayerId1947);
        }

    } catch (error) {
        console.error("Failed to load Shanghai 1947 map:", error);
    }
}

window.currentMapStyleUrl = (window._initialMapStyle && window._initialMapStyle.url) || null;

function ensureRoadGraphForYear(year) {
    if (window.roadGraphYear === year && window.roadGraph) return window.roadGraph;

    var geojson = year === 1937 ? window._1937RoadGeoJSON : window._1947RoadGeoJSON;
    if (!geojson) return null;

    if (typeof window.RoadGraphBuilder === 'undefined' || !window.RoadGraphBuilder.buildGraph) return null;

    try {
        var graph = window.RoadGraphBuilder.buildGraph(geojson);
        if (graph) {
            window.roadGraph = graph;
            window.roadGraphYear = year;
            console.log('Road graph built for ' + year + ': ' + graph.nodes.size + ' nodes');
        }
        return graph;
    } catch (e) {
        console.error('Failed to build road graph for ' + year + ':', e);
        return null;
    }
}

function rerenderActiveMigrationRoutes() {
    if (window.lastSearchArtists && window.MigratoryRoute && window.MigratoryRoute.drawArrowConnections) {
        window.MigratoryRoute.drawArrowConnections(window.lastSearchArtists);
    }
}

var _mapStyleGeneration = 0;

function handleHistoricalLayers(styleName, generation) {
    const setVisibility = (layerId, isVisible) => {
        if (window.map && window.map.getLayer(layerId)) {
            console.log(layerId, isVisible);
            window.map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
        }
    };

    // 等待加载期间样式可能又切换了；代次不一致时旧结果只能隐藏，不能改可见性/路网
    const isStale = () => generation !== undefined && generation !== _mapStyleGeneration;

    if (styleName === 'map_1') {
        loadShanghaiMap1937().then(() => {
            if (isStale()) {
                setVisibility('shanghai-1937-street-layer', false);
                setVisibility('shanghai-1937-street-labels', false);
                return;
            }
            setVisibility('shanghai-1937-street-layer', true);
            setVisibility('shanghai-1937-street-labels', true);
            setVisibility('shanghai-1947-street-layer', false);
            setVisibility('shanghai-1947-street-labels', false);
            if (typeof window.updateMapLanguage === 'function') {
                window.updateMapLanguage(window.currentLanguage || 'zh');
            }
            ensureRoadGraphForYear(1937);
            rerenderActiveMigrationRoutes();
        });
    } else if (styleName === 'map_2') {
        loadShanghaiMap1947().then(() => {
            if (isStale()) {
                setVisibility('shanghai-1947-street-layer', false);
                setVisibility('shanghai-1947-street-labels', false);
                return;
            }
            setVisibility('shanghai-1947-street-layer', true);
            setVisibility('shanghai-1947-street-labels', true);
            setVisibility('shanghai-1937-street-layer', false);
            setVisibility('shanghai-1937-street-labels', false);
            if (typeof window.updateMapLanguage === 'function') {
                window.updateMapLanguage(window.currentLanguage || 'zh');
            }
            ensureRoadGraphForYear(1947);
            rerenderActiveMigrationRoutes();
        });
    } else {
        setVisibility('shanghai-1937-street-layer', false);
        setVisibility('shanghai-1937-street-labels', false);
        setVisibility('shanghai-1947-street-layer', false);
        setVisibility('shanghai-1947-street-labels', false);
        window.roadGraph = null;
        window.roadGraphYear = null;
        rerenderActiveMigrationRoutes();
    }
}

var _lastInitializedStyleGeneration = 0;

// 样式加载完成后的统一初始化；按代次去重，旧代次的任务直接跳过
function runStyleInit(generation) {
    if (generation !== _mapStyleGeneration) return;
    if (generation === _lastInitializedStyleGeneration) return;
    _lastInitializedStyleGeneration = generation;

    if (typeof window.force2D === 'function') {
        window.force2D();
    }

    // 强制清除旧的marker，防止残留
    if (window.markersOnScreen) {
        for (const id in window.markersOnScreen) {
            window.markersOnScreen[id].remove();
        }
        window.markersOnScreen = {};
    }

    const currentLang = window.currentLanguage || 'zh';
    if (typeof window.updateMapLanguage === 'function') {
        window.updateMapLanguage(currentLang);
    }

    // 重新添加聚合图层
    if (typeof addClusteredLayers === 'function') {
        addClusteredLayers();
    }

    // 恢复连线图层数据
    if (typeof applyFilters === 'function') {
        try {
            applyFilters();
        } catch (e) {
            console.error('Failed to restore relationships layer:', e);
        }
    }

    // 重新添加密度图层
    if (typeof window.addDensityLayer === 'function') {
        try {
            window.addDensityLayer();
        } catch (e) {
            console.error('Failed to add density layer:', e);
        }
    }

    // 恢复搜索结果的视觉效果
    if (typeof window.restoreSearchVisuals === 'function') {
        try {
            window.restoreSearchVisuals();
        } catch (e) {
            console.error('Failed to restore search visuals:', e);
        }
    }

    handleHistoricalLayers(currentActiveStyleName, generation);
}

function switchMapStyle(styleName, lang = window.currentLanguage || 'zh') {
    let styleUrl = mapStyles[styleName];
    if (typeof styleUrl === 'object') {
        styleUrl = styleUrl[lang];
    }

    if (styleUrl) {
        currentActiveStyleName = styleName;
        const generation = ++_mapStyleGeneration;

        if (window.currentMapStyleUrl !== styleUrl) {
            window.currentMapStyleUrl = styleUrl;
            window.map.setStyle(styleUrl);

            // 立即尝试强制2D
            if (typeof window.force2D === 'function') {
                window.force2D();
            }

            window.map.once('style.load', () => {
                // 期间切到别的 style URL 时由新请求负责；同一 URL 的后续切换会走下面的等待分支
                if (window.currentMapStyleUrl !== styleUrl) return;
                runStyleInit(generation);
            });
        } else {
            // map_1 / map_2 共用同一 style URL：等样式就绪后按最新代次初始化
            waitForMapStyleReady().then(() => {
                if (window.currentMapStyleUrl !== styleUrl) return;
                runStyleInit(generation);
            });
        }

        if (typeof window.vueMapSwitchHook === 'function') {
            window.vueMapSwitchHook(styleName);
        }
    }
}
window.switchMapStyle = switchMapStyle;

document.addEventListener('DOMContentLoaded', () => {
    if (typeof Vue !== 'undefined') {
        const { createApp, ref, onMounted } = Vue;
        createApp({
            setup() {

                const langTrigger = ref(1);
                document.addEventListener('languageChanged', () => {
                    langTrigger.value++;
                });

                const t = (key) => {
                    const dummy = langTrigger.value;
                    return window.t ? window.t(key) : key;
                };

                const switchStyle = (styleName) => {
                    if (typeof window.switchMapStyle === 'function') {
                        window.switchMapStyle(styleName);
                    }
                };
                
                window.vueMapSwitchHook = (styleName) => {
                    if (window.GlobalStore) {
                        window.GlobalStore.currentStyle = styleName;
                    }
                };

                return {
                    GlobalStore: window.GlobalStore,
                    switchStyle,
                    t
                };
            }
        }).mount('#vue-map-switch-app');
    }
});

window.updateMarkerStyle = function(marker) {
    if (!window.map) return;
    const markerEl = marker.getElement();

    markerEl.style.cursor = 'pointer';
    markerEl.style.pointerEvents = 'auto';

    const attrMode = window.GlobalStore ? window.GlobalStore.attributeDisplayMode : null;
    const attrConf = (attrMode && window.AttrDisplayConfig) ? window.AttrDisplayConfig[attrMode] : null;

    if (attrConf && window.AttrDisplay) {
        // 性别/国籍/籍贯：分类图片标点（朝鲜无素材，其分类 img 配置为默认印章图）
        const artist = (marker._artistId && window.allArtistsData)
            ? window.allArtistsData[marker._artistId] : null;
        const src = window.AttrDisplay.getImage(attrMode, artist, window.currentLanguage || 'zh');
        markerEl.style.backgroundImage = `url('${encodeURI(src)}')`; // 国籍/籍贯素材为中文文件名
        markerEl.style.backgroundColor = ''; // 清除统一模式的白底残留（属性图片含朝鲜印章均不加白底）
        markerEl.style.backgroundSize = 'contain'; // 素材宽高比不一，cover 会裁切
        markerEl.style.backgroundRepeat = 'no-repeat';
        markerEl.style.backgroundPosition = 'center';
        markerEl.style.borderRadius = '0';
        const svg = markerEl.querySelector('svg');
        if (svg) svg.style.display = 'none';
    } else {
        const stampLang = window.currentLanguage || 'zh';
        const stampSrc = stampLang === 'en' ? 'assets/others/stamp_EN.svg' : 'assets/others/stamp_CN.svg';
        markerEl.style.backgroundImage = `url('${stampSrc}')`;
        markerEl.style.backgroundColor = '';
        markerEl.style.backgroundSize = 'contain';
        markerEl.style.backgroundRepeat = 'no-repeat';
        markerEl.style.backgroundPosition = 'center';
        markerEl.style.borderRadius = '0';
        const svg = markerEl.querySelector('svg');
        if (svg) svg.style.display = 'none';
    }

    markerEl.style.width = "30px";
    markerEl.style.height = "30px";
    markerEl.style.transition = "width 0.2s, height 0.2s";
};

window.updateAllMarkerStyles = function() {
    for (const id in window.markersOnScreen) {
        window.updateMarkerStyle(window.markersOnScreen[id]);
    }
};
