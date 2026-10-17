(function() {
    const { createApp, ref, reactive, computed, onMounted, onUnmounted } = Vue;

    const debounce = (fn, delay) => {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    };

    let fuse = null;

    const initFuse = () => {
        if (window.artists && window.artists.length > 0) {
            fuse = new Fuse(window.artists, {
                includeScore: true,
                keys: ['Name_CN', 'Name_EN'],
                threshold: 0.4
            });
        }
    };

    const leftPanelApp = createApp({
        setup() {
            const startYear = ref(1912);
            const endYear = ref(1948);
            const filters = reactive({ Natl: 'all', Origin: 'all', Sex: 'all' });
            const nameFilter = ref('');

            const natlOptions = ref([]);
            const originOptions = ref([]);
            const yearOptions = Array.from({length: 37}, (_, i) => 1912 + i);
            const resultCount = ref(0);

            const currentLang = ref(window.currentLanguage || 'zh');

            const isChineseNatl = () => filters.Natl === '中国';

            const isSocialDisabled = computed(() => !isChineseNatl());

            const isDensityDisabled = computed(() => {
                return window.GlobalStore && window.GlobalStore.attributeDisplayMode !== null;
            });

            const isDensityHidden = computed(() => resultCount.value < 10);

            const isNatlDisabled = computed(() => filters.Origin !== 'all');

            const isOriginDisabled = computed(() => !isChineseNatl());

            const t = (key) => {
                currentLang.value;
                return window.t ? window.t(key) : key;
            };

            const setLayerMode = (mode) => {
                if (!window.GlobalStore) return;
                window.GlobalStore.activeLayerMode = mode;
                applyLayerMode(mode);
            };

            const applyLayerMode = (mode) => {
                if (!window.map) return;
                try {
                    if (mode === 'position') {
                        setLayerVis('relationships-layer', false);
                        setLayerVis('density-heatmap', false);
                        window.forceShowAllRelationships = false;
                        if (window.ArtistRelationship && typeof window.ArtistRelationship.clearArtistRelationships === 'function') {
                            window.ArtistRelationship.clearArtistRelationships();
                        }
                    } else if (mode === 'social') {
                        setLayerVis('density-heatmap', false);
                        setLayerVis('relationships-layer', true);
                        window.forceShowAllRelationships = true;
                        if (window.ArtistRelationship && typeof window.ArtistRelationship.filterRelationshipsToVisible === 'function') {
                            window.ArtistRelationship.filterRelationshipsToVisible();
                        }
                    } else if (mode === 'density') {
                        setLayerVis('relationships-layer', false);
                        window.forceShowAllRelationships = false;
                        if (window.ArtistRelationship && typeof window.ArtistRelationship.clearArtistRelationships === 'function') {
                            window.ArtistRelationship.clearArtistRelationships();
                        }
                        setLayerVis('density-heatmap', true);
                    }
                } catch(e) { console.error('applyLayerMode error:', e); }
            };

            const setLayerVis = (layerId, visible) => {
                if (!layerId || !window.map || !window.map.getLayer(layerId)) return;
                window.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
            };

            const applyFilters = () => {
                if (!window.artists) return;

                const sYear = parseInt(startYear.value, 10);
                const eYear = parseInt(endYear.value, 10);
                const nameQuery = nameFilter.value.trim().toLowerCase();

                let fuzzyMatchIds = null;
                if (nameQuery && fuse) {
                    const results = fuse.search(nameQuery);
                    if (results.length === 0) {
                        fuzzyMatchIds = new Set();
                    } else if (results.length >= 2 && (results[1].score - results[0].score) < 0.05) {
                        fuzzyMatchIds = null;
                    } else {
                        const top = results[0].item;
                        const sameNameArtists = window.artists.filter(a =>
                            (a.Name_CN || '') === (top.Name_CN || '') &&
                            (a.Name_EN || '') === (top.Name_EN || '')
                        );
                        fuzzyMatchIds = new Set(sameNameArtists.map(a => a.ID));
                    }
                }

                const filteredArtists = window.artists.filter(artist => {
                    // CSV 中 Sex 为大写 M/F/Unknown，下拉框值为小写；空值按"不详"处理
                    const sex = (artist.Sex || '').trim().toLowerCase() || 'unknown';
                    if (filters.Sex !== 'all' && sex !== filters.Sex) return false;
                    if (filters.Natl !== 'all' && (artist.Natl_CN || '').trim() !== filters.Natl) return false;
                    if (filters.Origin !== 'all' && artist._originProv !== filters.Origin) return false;

                    if (!isNaN(sYear) && !isNaN(eYear)) {
                        const ys = artist._yearSet;
                        if (!ys || ys.size === 0) {
                            // 无年份数据：仅在最大区间 1912-1948 时显示
                            if (sYear !== 1912 || eYear !== 1948) return false;
                        } else {
                            let periodMatch = false;
                            for (let year = sYear; year <= eYear; year++) {
                                if (ys.has(year)) { periodMatch = true; break; }
                            }
                            if (!periodMatch) return false;
                        }
                    }

                    if (nameQuery) {
                        if (fuzzyMatchIds) {
                            if (!fuzzyMatchIds.has(artist.ID)) return false;
                        } else {
                            const cn = (artist.Name_CN || '').toLowerCase();
                            const en = (artist.Name_EN || '').toLowerCase();
                            if (!cn.includes(nameQuery) && !en.includes(nameQuery)) return false;
                        }
                    }

                    return true;
                });

                const filteredStudios = (window.studios || []).filter(s => {
                    if (filters.Natl !== 'all') {
                        const text = (s['艺术ists_Information_CN'] || '');
                        if (!text.includes(filters.Natl)) return false;
                    }

                    if (!isNaN(sYear) && !isNaN(eYear)) {
                        const ys = s._yearSet;
                        if (!ys || ys.size === 0) {
                            if (sYear !== 1912 || eYear !== 1948) return false;
                        } else {
                            let m = false;
                            for (let y = sYear; y <= eYear; y++) {
                                if (ys.has(y)) { m = true; break; }
                            }
                            if (!m) return false;
                        }
                    }
                    return true;
                });
                window.currentFilteredStudios = filteredStudios;

                resultCount.value = filteredArtists.length;

                requestAnimationFrame(() => {
                    if (typeof window.updateMarkers === 'function') {
                        window.updateMarkers(filteredArtists);
                    }

                    if (!isNaN(sYear) && !isNaN(eYear) && sYear <= eYear) {
                        if (window.ArtistRelationship && typeof window.ArtistRelationship.updateRelationships === 'function') {
                            window.ArtistRelationship.updateRelationships(sYear, eYear, filteredArtists);
                        }
                    } else {
                        if (window.ArtistRelationship && typeof window.ArtistRelationship.updateRelationships === 'function') {
                            window.ArtistRelationship.updateRelationships(null, null, filteredArtists);
                        }
                    }
                });

                document.dispatchEvent(new CustomEvent('filterChanged', { detail: { filteredArtists } }));

                if (resultCount.value < 10 && window.GlobalStore && window.GlobalStore.activeLayerMode === 'density') {
                    setLayerMode('position');
                }
            };

            window.applyFilters = applyFilters;
            const debouncedApplyFilters = debounce(applyFilters, 150);
            window.applyFilters = debouncedApplyFilters;

            const onStartYearChange = () => {
                const s = parseInt(startYear.value, 10);
                const e = parseInt(endYear.value, 10);
                if (!isNaN(s) && !isNaN(e) && s > e) {
                    endYear.value = startYear.value;
                }
                onYearRangeChange();
            };

            const onEndYearChange = () => {
                const s = parseInt(startYear.value, 10);
                const e = parseInt(endYear.value, 10);
                if (!isNaN(s) && !isNaN(e) && e < s) {
                    startYear.value = endYear.value;
                }
                onYearRangeChange();
            };

            const onYearRangeChange = () => {
                if (startYear.value && endYear.value && startYear.value === endYear.value) {
                    if (typeof checkAndSwitchMapByYear === 'function') {
                        checkAndSwitchMapByYear(startYear.value);
                    }
                }
                debouncedApplyFilters();
            };

            const onFilterChange = () => {
                if (filters.Origin !== 'all') {
                    filters.Natl = '中国'; // 国籍 value 语言无关
                }
                if (!isChineseNatl()) {
                    filters.Origin = 'all';
                    // 与籍贯筛选一致：国籍非中国时退出"按籍贯显示"
                    if (window.GlobalStore && window.GlobalStore.attributeDisplayMode === 'origin') {
                        window.GlobalStore.attributeDisplayMode = null;
                        if (typeof window.updateAllMarkerStyles === 'function') {
                            window.updateAllMarkerStyles();
                        }
                    }
                }
                debouncedApplyFilters();
            };

            const onNameFilterEnter = () => {
                debouncedApplyFilters();
            };

            const toggleAttrDisplay = (mode) => {
                if (!window.GlobalStore) return;
                if (window.GlobalStore.attributeDisplayMode === mode) {
                    window.GlobalStore.attributeDisplayMode = null;
                } else {
                    window.GlobalStore.attributeDisplayMode = mode;
                    if (window.GlobalStore.activeLayerMode === 'density') {
                        setLayerMode('position');
                    }
                }
                if (typeof window.updateAllMarkerStyles === 'function') {
                    window.updateAllMarkerStyles();
                }
            };

            const restoreUnifiedSymbol = () => {
                if (!window.GlobalStore) return;
                window.GlobalStore.attributeDisplayMode = null;
                if (typeof window.updateAllMarkerStyles === 'function') {
                    window.updateAllMarkerStyles();
                }
            };

            // 籍贯筛选的省级归类表（按声明顺序展示；不详/其他置底）。
            // "今属上海"约定与 attributeDisplay.js 中 origin 显示归组保持一致（当前按民国区划：
            // 含"上海"字样→上海，旧江苏县名→江苏）。若切换那边上海组的 keywords 开关，
            // 需同步把下方江苏条目中的县名关键词（松江…浦东）移入上海条目。
            const ORIGIN_PROVINCES = [
                { zh: '上海', en: 'Shanghai', kw: ['上海'] },
                { zh: '江苏', en: 'Jiangsu',  kw: ['江苏', '吴县', '南通',
                    '松江', '淞江', '崇明', '川沙', '青浦', '宝山', '南汇', '金山', '嘉定', '奉贤', '华亭', '浦东'] },
                { zh: '浙江', en: 'Zhejiang', kw: ['浙江', '杭州'] },
                { zh: '安徽', en: 'Anhui',    kw: ['安徽'] },
                { zh: '广东', en: 'Guangdong', kw: ['广东'] },
                { zh: '福建', en: 'Fujian',   kw: ['福建'] },
                { zh: '湖南', en: 'Hunan',    kw: ['湖南'] },
                { zh: '湖北', en: 'Hubei',    kw: ['湖北'] },
                { zh: '四川', en: 'Sichuan',  kw: ['四川'] },
                { zh: '江西', en: 'Jiangxi',  kw: ['江西'] },
                { zh: '山东', en: 'Shandong', kw: ['山东'] },
                { zh: '山西', en: 'Shanxi',   kw: ['山西'] },
                { zh: '陕西', en: 'Shaanxi',  kw: ['陕西'] },
                { zh: '河南', en: 'Henan',    kw: ['河南'] },
                { zh: '河北', en: 'Hebei',    kw: ['河北'] },
                { zh: '广西', en: 'Guangxi',  kw: ['广西'] },
                { zh: '贵州', en: 'Guizhou',  kw: ['贵州'] },
                { zh: '云南', en: 'Yunnan',   kw: ['云南'] },
                { zh: '辽宁', en: 'Liaoning', kw: ['辽宁', '辽西'] },
                { zh: '台湾', en: 'Taiwan',   kw: ['台湾'] },
                { zh: '天津', en: 'Tianjin',  kw: ['天津'] },
                { zh: '不详', en: 'Unknown',  kw: ['不详'] },
                { zh: '其他', en: 'Others',   kw: [] }
            ];

            const getOriginProvince = (a) => {
                const o = (a.Origin_CH || '').trim();
                if (o) {
                    for (const p of ORIGIN_PROVINCES) {
                        for (const k of p.kw) {
                            if (o.indexOf(k) !== -1) return p.zh;
                        }
                    }
                }
                return '其他';
            };

            const populateOptions = (artists) => {
                const lang = window.currentLanguage || 'zh';

                const natlMap = new Map(); // Natl_CN -> 按语言的显示标签
                const provSet = new Set();
                artists.forEach(a => {
                    const cn = (a.Natl_CN || '').trim();
                    if (cn && !natlMap.has(cn)) {
                        natlMap.set(cn, lang === 'zh' ? cn : ((a.Natl_EN || '').trim() || cn));
                    }
                    a._originProv = getOriginProvince(a);
                    // 籍贯选项仅统计中国籍艺术家（语言无关的 Natl_CN 判断）
                    if (cn === '中国') provSet.add(a._originProv);
                });
                // 国籍 value 恒为 Natl_CN（语言无关，切换语言不失配），label 按语言显示
                natlOptions.value = Array.from(natlMap.entries())
                    .map(([value, label]) => ({ value, label }))
                    .sort((x, y) => (x.label < y.label ? -1 : x.label > y.label ? 1 : 0));
                // 按 ORIGIN_PROVINCES 声明顺序，只列出数据中出现的省份
                originOptions.value = ORIGIN_PROVINCES
                    .filter(p => provSet.has(p.zh))
                    .map(p => ({ value: p.zh, label: lang === 'zh' ? p.zh : p.en }));
            };

            let langHandler, artistsHandler, mapClickHandler;

            onMounted(() => {
                langHandler = () => {
                    currentLang.value = window.currentLanguage || 'zh';
                    // 语言切换只重建选项标签（value 语言无关），不重置筛选项
                    if (window.artists) {
                        populateOptions(window.artists);
                    }
                    debouncedApplyFilters();
                };
                document.addEventListener('languageChanged', langHandler);

                artistsHandler = () => {
                    populateOptions(window.artists);
                    initFuse();
                    applyFilters();

                    const urlParams = new URLSearchParams(window.location.search);
                    const initialYear = urlParams.get('year');
                    const initialArtist = urlParams.get('artist');

                    if (initialYear) {
                        startYear.value = initialYear;
                        endYear.value = initialYear;
                        if (typeof checkAndSwitchMapByYear === 'function') {
                            checkAndSwitchMapByYear(initialYear);
                        }
                        applyFilters();
                    } else if (initialArtist) {
                        applyFilters();
                        nameFilter.value = initialArtist;
                        if (typeof window.triggerSearchByArtistName === 'function') {
                            setTimeout(() => {
                                window.triggerSearchByArtistName(initialArtist);
                            }, 500);
                        }
                    }
                };
                document.addEventListener('artistsLoaded', artistsHandler);

                mapClickHandler = () => {
                    if (window.GlobalStore && window.GlobalStore.isLeftPanelOpen) {
                        window.GlobalStore.isLeftPanelOpen = false;
                    }
                };

                if (window.artists && window.artists.length > 0) {
                    populateOptions(window.artists);
                    initFuse();
                    applyFilters();
                }

                document.getElementById('map').addEventListener('click', mapClickHandler);
            });

            onUnmounted(() => {
                document.removeEventListener('languageChanged', langHandler);
                document.removeEventListener('artistsLoaded', artistsHandler);
                const mapEl = document.getElementById('map');
                if (mapEl) mapEl.removeEventListener('click', mapClickHandler);
            });

            function closePanel() {
                if (window.GlobalStore) {
                    window.GlobalStore.isLeftPanelOpen = false;
                }
            }

            return {
                startYear, endYear, filters, nameFilter,
                natlOptions, originOptions, yearOptions,
                resultCount,
                isSocialDisabled, isDensityDisabled, isDensityHidden,
                isNatlDisabled, isOriginDisabled,
                t, setLayerMode, onStartYearChange, onEndYearChange, onFilterChange,
                onNameFilterEnter, toggleAttrDisplay, restoreUnifiedSymbol,
                closePanel,
                GlobalStore: window.GlobalStore
            };
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        leftPanelApp.mount('#vue-sidebar-app');


    });

    window.checkAndSwitchMapByYear = function(year) {
        if (!year) return;
        var yearNum = parseInt(year, 10);
        if (isNaN(yearNum)) return;
        var targetStyle = yearNum < 1942 ? 'map_1' : 'map_2';
        if (typeof window.switchMapStyle === 'function') {
            window.switchMapStyle(targetStyle);
        }
    };

})();
