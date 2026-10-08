(function(window) {
    if (typeof window === 'undefined') return;

    let fuse = null;
    window.lastSearchArtists = null;
    let fuseInitRetryTimer = null;

    const initFuse = (allowRetry = false) => {
        const allPoints = (window.artists || []).concat(window.studios || []);
        if (allPoints.length > 0) {
            fuse = new Fuse(allPoints, {
                includeScore: true,
                keys: ['Name_CN', 'Name_EN'],
                threshold: 0.4
            });
            return true;
        } else {
            if (allowRetry && !fuseInitRetryTimer) {
                fuseInitRetryTimer = setTimeout(() => {
                    fuseInitRetryTimer = null;
                    initFuse(true);
                }, 500);
            }
        }
        return false;
    };

    const performSearch = (artistParam = null) => {
        if (!window.artists) return;

        const lang = window.currentLanguage || 'zh';

        if (window.MigratoryRoute) {
            window.MigratoryRoute.clearArrowConnections();
        }

        if (artistParam && typeof artistParam === 'object' && artistParam.ID) {
            if (window.LayerControl) window.LayerControl.updateState({ isSearchActive: true });

            const coordinates = [parseFloat(artistParam.Co_Long), parseFloat(artistParam.Co_Lat)];
            if (!isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
                if (window.updateMarkers) {
                    window.updateMarkers([artistParam]);
                }

                if (window.GlobalStore) {
                    window.GlobalStore.selectedArtist = artistParam;
                }

                window.currentSelectedMarker = artistParam.ID;

                if (window.map) {
                    window.map.flyTo({
                        center: coordinates,
                        zoom: 16,
                        pitch: 0,
                        bearing: 0
                    });
                }
                if (window.updateSidebar) {
                    window.updateSidebar(artistParam);
                }

                if (window.currentPopup) window.currentPopup.remove();
                const name = lang === 'zh' ? (artistParam.Name_CN || artistParam.Name_EN) : (artistParam.Name_EN || artistParam.Name_CN);
                if (name && window.map) {
                    window.currentPopup = new mapboxgl.Popup({
                        offset: [0, -10],
                        closeButton: false,
                        className: 'artist-name-popup'
                    })
                    .setLngLat(coordinates)
                    .setHTML('<strong>' + name + '</strong>')
                    .addTo(window.map);
                }
            }
            return;
        }

        const query = (artistParam && typeof artistParam === 'string') ? artistParam.trim() : '';
        if (!query) {
            resetSearch();
            return;
        }

        if (!fuse) initFuse(false);

        const allPoints = (window.artists || []).concat(window.studios || []);
        let exactMatches = allPoints.filter(a =>
            (a.Name_CN && a.Name_CN.trim() === query) ||
            (a.Name_EN && a.Name_EN.trim().toLowerCase() === query.toLowerCase())
        );

        let matchedPoints;
        if (exactMatches.length > 0) {
            matchedPoints = exactMatches;
        } else if (fuse) {
            const results = fuse.search(query);
            matchedPoints = results.length > 0 ? [results[0].item] : [];
        } else {
            matchedPoints = [];
        }

        const matchedArtists = matchedPoints.filter(p => (p._type || 'artist') === 'artist');
        const matchedStudios = matchedPoints.filter(p => p._type === 'studio');
        window.currentFilteredStudios = matchedStudios;

        if (matchedPoints.length > 0) {
            window.lastSearchArtists = matchedArtists;
            if (window.LayerControl) window.LayerControl.updateState({ isSearchActive: true });

            if (window.updateMarkers) {
                window.updateMarkers(matchedArtists);
            }

            const allSamePerson = matchedArtists.length > 0 && matchedArtists.every(a =>
                (a.Name_CN === matchedArtists[0].Name_CN) && (a.Name_EN === matchedArtists[0].Name_EN)
            );

            if (allSamePerson && window.GlobalStore) {
                window.GlobalStore.selectedArtist = matchedArtists[0];
            }

            if (matchedPoints.length === 1 && matchedArtists.length === 1) {
                const topArtist = matchedArtists[0];
                const coordinates = [parseFloat(topArtist.Co_Long), parseFloat(topArtist.Co_Lat)];

                if (window.map && !isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
                    window.map.flyTo({
                        center: coordinates,
                        zoom: 16,
                        pitch: 0,
                        bearing: 0
                    });
                }

                if (window.updateSidebar) window.updateSidebar(topArtist);
                window.currentSelectedMarker = topArtist.ID;

                if (window.currentPopup) window.currentPopup.remove();
                const name = lang === 'zh' ? (topArtist.Name_CN || topArtist.Name_EN) : (topArtist.Name_EN || topArtist.Name_CN);
                if (name && window.map && !isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
                    window.currentPopup = new mapboxgl.Popup({
                        offset: [0, -10],
                        closeButton: false,
                        className: 'artist-name-popup'
                    })
                    .setLngLat(coordinates)
                    .setHTML('<strong>' + name + '</strong>')
                    .addTo(window.map);
                }
            } else {
                const bounds = new mapboxgl.LngLatBounds();
                let hasValid = false;
                matchedPoints.forEach(a => {
                     const c = [parseFloat(a.Co_Long), parseFloat(a.Co_Lat)];
                     if (!isNaN(c[0]) && !isNaN(c[1])) {
                         bounds.extend(c);
                         hasValid = true;
                     }
                });
                if (hasValid && window.map) {
                    window.map.fitBounds(bounds, { padding: 50 });
                }

                if (window.MigratoryRoute && matchedArtists.length > 0) {
                    window.MigratoryRoute.drawArrowConnections(matchedArtists);
                }

                if (allSamePerson) {
                    if (window.updateSidebar) window.updateSidebar(matchedArtists[0]);
                } else {
                    if (window.GlobalStore) {
                        window.GlobalStore.isSidebarVisible = false;
                    }
                    if (typeof window.checkAndResetMapSelection === 'function') {
                        window.checkAndResetMapSelection();
                    }
                }
            }
        }
    };

    const resetSearch = () => {
        window.lastSearchArtists = null;

        if (window.MigratoryRoute) {
            window.MigratoryRoute.clearArrowConnections();
        }

        if (window.LayerControl) window.LayerControl.updateState({ isSearchActive: false });

        if (typeof window.applyFilters === 'function') {
            window.applyFilters();
        } else if (window.updateMarkers) {
            window.updateMarkers(window.artists || []);
        }

        if (window.GlobalStore) {
            window.GlobalStore.isSidebarVisible = false;
        }

        if (typeof window.closePopup === 'function') {
            window.closePopup();
        }
        if (typeof window.checkAndResetMapSelection === 'function') {
            window.checkAndResetMapSelection();
        }

        if (window.map) {
            window.map.flyTo({
                center: [121.4737, 31.2304],
                zoom: 11,
                pitch: 0,
                bearing: 0
            });
        }
    };

    window.resetSearch = resetSearch;

    window.restoreSearchVisuals = function() {
        if (!window.map) return;
        if (window.LayerControl) window.LayerControl.applyLayerRules();
        if (window.lastSearchArtists && window.MigratoryRoute) {
            window.MigratoryRoute.drawArrowConnections(window.lastSearchArtists);
        }
    };

    window.clearSearchVisuals = function() {
        if (window.MigratoryRoute) window.MigratoryRoute.clearArrowConnections();
        if (window.LayerControl) window.LayerControl.updateState({ isSearchActive: false });
    };

    window.triggerSearchByArtistName = function(artistName) {
        if (!window.artists) return;
        performSearch(artistName);
    };

    const mountApp = () => {
        initFuse(true);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountApp);
    } else {
        mountApp();
    }

})(window);
