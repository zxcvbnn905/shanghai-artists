(function(window) {
    //密度图可配置参数区
    const Config = {
        layerId: 'density-heatmap',
        sourceId: 'artists-unclustered'
    };

    const heatmapColor = [
        'interpolate', ['linear'], ['heatmap-density'],
        // 当前生效的配色方案
        0, "rgba(255, 255, 255 ,0)",
        0.1, 'rgba(219, 208, 183, 0.9)',
        0.4, 'rgba(181, 180, 156, 0.9)',
        0.8, 'rgba(138, 147, 131, 0.9)',
        0.99, 'rgb(233, 202, 196)',
        1, 'rgb(247, 235, 233)'
    ];

    function getPaintConfig() {
        return {
            //版本1
            'heatmap-weight': 1,
            'heatmap-intensity': [
                'interpolate', ['exponential', 1.5], ['zoom'],
                0, 0.05, 9, 0.2, 13, 0.8, 15, 1.5
            ],
            'heatmap-color': heatmapColor,
            'heatmap-opacity': [
                'interpolate', ['linear'], ['zoom'],
                12, 0.8, 17, 0.05
            ],
            'heatmap-radius': [
                'interpolate', ['exponential', 2], ['zoom'],
                0, 2, 12, 70, 15, 110
            ]
        };
    }

    function updateHeatmapPaint(count) {
        if (!window.map || !window.map.getLayer(Config.layerId)) return;

        const paint = getPaintConfig();

        Object.keys(paint).forEach(key => {
            window.map.setPaintProperty(Config.layerId, key, paint[key]);
        });
    }

    function addDensityLayer() {
        if (!window.map) return;
        if (!window.map.getSource(Config.sourceId)) return;
        if (window.map.getLayer(Config.layerId)) return;

        let beforeId = undefined;
        if (window.map.getLayer('clusters')) {
            beforeId = 'clusters';
        } else if (window.map.getLayer('cluster-count')) {
            beforeId = 'cluster-count';
        }

        const count = (window.currentFilteredArtists && window.currentFilteredArtists.length) || 0;
        const paint = getPaintConfig();

        window.map.addLayer({
            id: Config.layerId,
            type: 'heatmap',
            source: Config.sourceId,
            paint: Object.assign({}, paint)
        }, beforeId);

        window.map.setLayoutProperty(Config.layerId, 'visibility', 'none');
    }

    // 暴露核心控制对象
    window.DensityMapControl = {
        config: Config,

        forceUpdatePaint: function(count) {
            if (window.map && window.map.isStyleLoaded()) {
                updateHeatmapPaint(count);
            } else if (window.map) {
                window.map.once('idle', () => updateHeatmapPaint(count));
            }
        },

        init: addDensityLayer
    };

    // 兼容原有的全局调用（如 mapControl.js 切换样式后重新添加地图的需求）
    window.addDensityLayer = window.DensityMapControl.init;

    // 原有事件监听，保持数据加载时的平滑过度
    document.addEventListener('artistsLoaded', window.DensityMapControl.init);

    document.addEventListener('filterChanged', function(e) {
        const count = (e.detail && e.detail.filteredArtists && e.detail.filteredArtists.length) || 0;
        window.DensityMapControl.forceUpdatePaint(count);
    });

})(window);
