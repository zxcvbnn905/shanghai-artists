(function(window) {
    // 关系连线可配置参数区
    const Config = {
        sourceId: 'relationships',
        dimOpacity: 0.35    // 背景滤镜变暗的透明度
    };

    // 注入悬浮样式
    if (!document.getElementById('artist-popup-hover-style')) {
        const style = document.createElement('style');
        style.id = 'artist-popup-hover-style';
        style.innerHTML = `
            .mapboxgl-popup.artist-name-popup:hover {
                z-index: 99999 !important;
            }
            .mapboxgl-popup.artist-name-popup .mapboxgl-popup-content {
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(style);
    }

    // 内部状态封装，避免污染全局 window 变量
    const State = {
        allActive: [],
        active: [],
        isDrawing: false,
        needsRedraw: false,
        popups: []
    };

    function clearRelationshipPopups() {
        if (State.popups) {
            State.popups.forEach(p => p.remove());
        }
        State.popups = [];
    }

    function updateRelationships(startYear, endYear, filteredArtists) {
        if (!window.map || !window.map.getSource(Config.sourceId)) return;

        if (!startYear || !endYear || !window.relationshipsData) {
            State.allActive = [];
            State.active = [];
            drawRelationships();
            return;
        }

        const seen = new Set();
        const validRels = [];
        for (let y = startYear; y <= endYear; y++) {
            const colName = `R${y}`;
            window.relationshipsData.forEach(rel => {
                const key = rel.Figure + '|' + rel.Friends;
                if (!seen.has(key) && (String(rel[colName]) === '1' || String(rel[colName]) === '1.0')) {
                    seen.add(key);
                    validRels.push(rel);
                }
            });
        }

        const activeBatch = [];

        validRels.forEach(rel => {
            const figureName = rel.Figure;
            const friendName = rel.Friends;

            if (!figureName || !friendName) return;

            const figures = filteredArtists.filter(a => a.Name_CN === figureName);
            const friends = filteredArtists.filter(a => a.Name_CN === friendName);

            figures.forEach(fig => {
                friends.forEach(fri => {
                    activeBatch.push({fig, fri});
                });
            });
        });

        State.allActive = activeBatch;

        if (typeof filterRelationshipsToVisible === 'function') {
            filterRelationshipsToVisible();
        } else {
            State.active = activeBatch;
            drawRelationships();
        }
    }

    function filterRelationshipsToVisible() {
        if (!State.allActive) return;

        if (window.forceShowAllRelationships) {
            State.active = [...State.allActive];
        } else {
            State.active = [];
        }
        drawRelationships();
    }

    function drawRelationships() {
        if (!window.map || !window.map.getSource(Config.sourceId)) return;

        if (State.isDrawing) {
            State.needsRedraw = true;
            return;
        }

        if (!State.active || State.active.length === 0) {
            window.map.getSource(Config.sourceId).setData({
                type: 'FeatureCollection',
                features: []
            });
            clearRelationshipPopups();
            toggleDimming(false);
            return;
        }

        State.isDrawing = true;
        State.needsRedraw = false;

        const displayCoords = {};

        const unclustered = window.map.querySourceFeatures('artists', { filter: ['!', ['has', 'point_count']] });
        unclustered.forEach(f => {
            if (f.properties.id && f.properties.type !== 'studio') {
                displayCoords[f.properties.id] = f.geometry.coordinates;
            }
        });

        const neededIds = new Set();
        State.active.forEach(rel => {
            if (rel.fig && !(rel.fig.ID in displayCoords)) neededIds.add(String(rel.fig.ID));
            if (rel.fri && !(rel.fri.ID in displayCoords)) neededIds.add(String(rel.fri.ID));
        });

        const fallbackToRawCoords = () => {
            State.active.forEach(rel => {
                if (rel.fig && !(rel.fig.ID in displayCoords)) displayCoords[rel.fig.ID] = [parseFloat(rel.fig.Co_Long), parseFloat(rel.fig.Co_Lat)];
                if (rel.fri && !(rel.fri.ID in displayCoords)) displayCoords[rel.fri.ID] = [parseFloat(rel.fri.Co_Long), parseFloat(rel.fri.Co_Lat)];
            });
            renderLines(displayCoords);
            updateRelationshipPopups(displayCoords);
            State.isDrawing = false;
            if (State.needsRedraw) {
                drawRelationships();
            }
        };

        const clusters = window.map.querySourceFeatures('artists', { filter: ['has', 'point_count'] });

        let pendingClusters = clusters.length;

        if (pendingClusters === 0 || neededIds.size === 0) {
            fallbackToRawCoords();
            return;
        }

        clusters.forEach(cluster => {
            window.map.getSource('artists').getClusterLeaves(
                cluster.properties.cluster_id,
                9999,
                0,
                (err, leaves) => {
                    if (!err && leaves) {
                        leaves.forEach(leaf => {
                            if (leaf.properties.id && leaf.properties.type !== 'studio') {
                                displayCoords[leaf.properties.id] = cluster.geometry.coordinates;
                            }
                        });
                    }
                    pendingClusters--;
                    if (pendingClusters === 0) {
                        fallbackToRawCoords();
                    }
                }
            );
        });
    }

    function renderLines(displayCoords) {
        const lines = [];
        State.active.forEach(rel => {
            const figCoords = displayCoords[rel.fig.ID];
            const friCoords = displayCoords[rel.fri.ID];
            
            if (figCoords && friCoords && !isNaN(figCoords[0]) && !isNaN(figCoords[1]) && !isNaN(friCoords[0]) && !isNaN(friCoords[1])) {
                lines.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [figCoords, friCoords]
                    },
                    properties: {
                        patternType: (() => {
                            const str = (rel.fig.Name_CN || '') + '|' + (rel.fri.Name_CN || '');
                            let h = 0;
                            for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
                            return Math.abs(h) % 3 + 1;
                        })()
                    }
                });
            }
        });

        if (window.map && window.map.getSource(Config.sourceId)) {
            window.map.getSource(Config.sourceId).setData({
                type: 'FeatureCollection',
                features: lines
            });
            toggleDimming(lines.length > 0);
        }
    }

    function toggleDimming(enable) {
        if (!window.map) return;

        if (window.map.getLayer('dim-layer')) {
            window.map.setPaintProperty('dim-layer', 'fill-opacity', enable ? Config.dimOpacity : 0);
        }
        if (window.map.getLayer('dim-background')) {
            window.map.setPaintProperty('dim-background', 'background-opacity', enable ? Config.dimOpacity : 0);
        }

        if (enable) {
            document.body.classList.add('relationships-active');
            const activeIds = new Set();
            State.active.forEach(rel => {
                if (rel.fig) activeIds.add(String(rel.fig.ID));
                if (rel.fri) activeIds.add(String(rel.fri.ID));
            });
            
            if (window.markersOnScreen) {
                for (const id in window.markersOnScreen) {
                    const markerEl = window.markersOnScreen[id].getElement();
                    if (activeIds.has(String(id))) {
                        markerEl.classList.add('active-relationship');
                    } else {
                        markerEl.classList.remove('active-relationship');
                    }
                }
            }
        } else {
            document.body.classList.remove('relationships-active');
            if (window.markersOnScreen) {
                for (const id in window.markersOnScreen) {
                    window.markersOnScreen[id].getElement().classList.remove('active-relationship');
                }
            }
        }
    }

    function updateRelationshipPopups(displayCoords) {
        clearRelationshipPopups();
        if (!State.active || State.active.length === 0) return;

        const uniqueArtists = new Map();
        State.active.forEach(rel => {
            if (rel.fig) uniqueArtists.set(String(rel.fig.ID), rel.fig);
            if (rel.fri) uniqueArtists.set(String(rel.fri.ID), rel.fri);
        });

        const lang = window.currentLanguage || 'zh';

        uniqueArtists.forEach((artist, id) => {
            const coords = displayCoords[id];
            if (!coords || isNaN(coords[0])) return;

            if (String(window.currentSelectedMarker) === id) {
                if (window.currentPopup && window.currentPopup.isOpen()) {
                    return;
                }
            }

            const name = lang === 'zh' ? (artist.Name_CN || artist.Name_EN) : (artist.Name_EN || artist.Name_CN);
            
            if (name) {
                const popup = new mapboxgl.Popup({
                    offset: [0, -35],
                    closeButton: false,
                    closeOnClick: false,
                    className: 'artist-name-popup'
                })
                .setLngLat(coords)
                .setHTML(`<strong>${name}</strong>`)
                .addTo(window.map);

                State.popups.push(popup);
            }
        });
    }

    function showArtistRelationships(artist) {
        if (!artist || !window.relationshipsData) {
            State.active = [];
            drawRelationships();
            return;
        }

        const figureName = artist.Name_CN;
        if (!figureName) {
            State.active = [];
            drawRelationships();
            return;
        }

        const visibleArtists = window.currentFilteredArtists || window.artists || [];

        const activeBatch = [];
        window.relationshipsData.forEach(rel => {
            const fig = rel.Figure;
            const fri = rel.Friends;
            if (!fig || !fri) return;

            if (fig === figureName || fri === figureName) {
                const figures = visibleArtists.filter(a => a.Name_CN === fig);
                const friends = visibleArtists.filter(a => a.Name_CN === fri);
                figures.forEach(f => {
                    friends.forEach(r => {
                        activeBatch.push({fig: f, fri: r});
                    });
                });
            }
        });

        State.active = activeBatch;
        drawRelationships();
    }

    function clearArtistRelationships() {
        State.active = [];
        drawRelationships();
    }

    // 暴露核心控制对象及老旧API对接
    window.ArtistRelationship = {
        config: Config,
        updateRelationships,
        filterRelationshipsToVisible,
        drawRelationships,
        showArtistRelationships,
        clearArtistRelationships
    };

})(window);
