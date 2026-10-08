(function(window) {
    const LayerControl = {
        state: {
            isSearchActive: false,
            hasSelectedMarker: false,
            hasHoveredMarker: false,
            zoom: 11
        },

        updateState: function (newState) {
            Object.assign(this.state, newState);
            this.applyLayerRules();
        },

        applyLayerRules: function () {
            const layerMode = window.GlobalStore ? window.GlobalStore.activeLayerMode : 'position';
            const skipClickMenuLayers = window._clickMenuActive === true;

            this.setLayerVisibility('density-heatmap', layerMode === 'density');

            if (!skipClickMenuLayers) {
                const showRoutes = this.state.isSearchActive;
                if (window.MigratoryRoute && window.MigratoryRoute.config) {
                    this.setLayerVisibility(window.MigratoryRoute.config.connectionLayerId, showRoutes);
                } else {
                    this.setLayerVisibility('search-connection-line', showRoutes);
                }
                var textContainer = document.getElementById('period-text-container');
                if (textContainer) textContainer.style.display = showRoutes ? '' : 'none';
                if (!showRoutes && window.MigratoryRoute && typeof window.MigratoryRoute.renderMigrationDim === 'function') {
                    window.MigratoryRoute.renderMigrationDim(null);
                }
            }

            if (!skipClickMenuLayers) {
                const showRelationships = layerMode === 'social' || window.forceShowAllRelationships;

                if (showRelationships) {
                    if (window.ArtistRelationship && typeof window.ArtistRelationship.filterRelationshipsToVisible === 'function') {
                        window.ArtistRelationship.filterRelationshipsToVisible();
                    }
                }

                this.setLayerVisibility('relationships-layer', showRelationships);
            }

            this.setLayerVisibility('clusters', true);
            this.setLayerVisibility('cluster-count', true);
            this.toggleMarkers(true);
        },

        setLayerVisibility: function (layerId, visible) {
            if (!layerId) return;
            if (window.map && window.map.getLayer(layerId)) {
                window.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
            }
        },

        toggleMarkers: function (visible) {
            this.markersVisible = visible;
            const display = visible ? 'block' : 'none';
            if (window.markersOnScreen) {
                for (const id in window.markersOnScreen) {
                    const el = window.markersOnScreen[id].getElement();
                    if (el) {
                        el.style.display = display;
                    }
                }
            }
            if (window.studioMarkersOnScreen) {
                for (const id in window.studioMarkersOnScreen) {
                    const el = window.studioMarkersOnScreen[id].getElement();
                    if (el) {
                        el.style.display = display;
                    }
                }
            }
        }
    };

    LayerControl.markersVisible = true;
    window.LayerControl = LayerControl;

})(window);
