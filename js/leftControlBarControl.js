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

    // 中国艺术家的英文名固定为「姓, 名」格式；去掉标点和空格后再比较，
    // 使 "YanShian"、"Yan Shian" 都能匹配 "Yan, Shi'an"
    const normalizeEnName = (value) => (value || '')
        .toLowerCase()
        .replace(/[’'`]/g, '')
        .replace(/[.,\s]/g, '');

    const isChineseArtist = (artist) =>
        (artist.Natl_EN || '').trim().toUpperCase() === 'CHN' ||
        (artist.Natl_CN || '').trim() === '中国';

    const enNameNorm = (artist) => {
        if (!isChineseArtist(artist)) return '';
        if (artist._Name_EN_norm === undefined) {
            artist._Name_EN_norm = normalizeEnName(artist.Name_EN);
        }
        return artist._Name_EN_norm;
    };

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
            // Natl: 已勾选的 Natl_CN 数组；空数组 = 所有国籍（value 与语言无关）
            // PlaceType: all = 艺术家 + studio；residence = 仅艺术家；studio = 仅 studio
            const filters = reactive({ Natl: [], Origin: 'all', Sex: 'all', PlaceType: 'all' });
            const nameFilter = ref('');

            const natlPanelOpen = ref(false);
            const natlPanelRef = ref(null);
            const natlTriggerRef = ref(null);
            const natlDropdownRef = ref(null);
            const natlDropdownStyle = ref({});
            let natlInitialized = false;
            // studio 模式下中国被临时排除，离开时按进入前的状态恢复
            let restoreChinaAfterStudio = false;

            const natlOptions = ref([]);
            const originOptions = ref([]);
            const yearOptions = Array.from({length: 37}, (_, i) => 1912 + i);
            const resultCount = ref(0);
            // 密度图可用性：住宅/全部类型按艺术家数量，工作室类型按 studio 数量
            const densityCount = ref(0);

            const currentLang = ref(window.currentLanguage || 'zh');

            const isChineseNatl = () => filters.Natl.length === 1 && filters.Natl[0] === '中国';

            const isSocialDisabled = computed(() => !isChineseNatl());

            const isDensityHidden = computed(() => densityCount.value < 10);

            const isNatlDisabled = computed(() => filters.Origin !== 'all');

            const isOriginDisabled = computed(() => !isChineseNatl());

            const t = (key) => {
                currentLang.value;
                // 翻译 JSON 异步加载完成后 _i18nTick 自增，据此让摘要文案重新求值
                if (window._i18nTick) window._i18nTick.n;
                return window.t ? window.t(key) : key;
            };

            // studio 模式下中国不可选：全部国籍 = 除中国以外的所有国家
            const natlSelectableOptions = computed(() =>
                filters.PlaceType === 'studio'
                    ? natlOptions.value.filter(o => o.value !== '中国')
                    : natlOptions.value
            );

            const isAllNatl = computed(() => {
                const opts = natlSelectableOptions.value;
                return opts.length > 0 && opts.every(o => filters.Natl.includes(o.value));
            });

            const isPartialNatl = computed(() => {
                const opts = natlSelectableOptions.value;
                const count = opts.filter(o => filters.Natl.includes(o.value)).length;
                return count > 0 && count < opts.length;
            });

            const natlSummary = computed(() => {
                const opts = natlSelectableOptions.value;
                const sel = filters.Natl.filter(v => opts.some(o => o.value === v));
                if (opts.length === 0 || sel.length === opts.length) {
                    return t('all_natl');
                }
                if (sel.length === 0) return t('no_natl_selected');
                if (sel.length === 1) {
                    const opt = opts.find(o => o.value === sel[0]);
                    return opt ? opt.label : sel[0];
                }
                return t('selected_natl_count').replace('{count}', String(sel.length));
            });

            const setLayerMode = (mode) => {
                if (!window.GlobalStore) return;
                window.GlobalStore.activeLayerMode = mode;
                applyLayerMode(mode);
            };

            const applyLayerMode = (mode) => {
                if (!window.map) return;
                try {
                    // 任何模式切换都先清掉点击菜单遗留的迁徙态，让图层规则重新接管
                    window._clickMenuActive = false;
                    if (window.MigratoryRoute && typeof window.MigratoryRoute.clearArrowConnections === 'function') {
                        window.MigratoryRoute.clearArrowConnections();
                    }
                    window.temporaryVisibleArtists = [];
                    if (typeof window.updateMarkers === 'function' && window.currentFilteredArtists) {
                        window.updateMarkers(window.currentFilteredArtists);
                    }
                    if (window.LayerControl && typeof window.LayerControl.applyLayerRules === 'function') {
                        window.LayerControl.applyLayerRules();
                    }

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
                    // 密度图开关同步道路名颜色（开启时恢复原色，关闭时统一灰绿）
                    if (typeof window.applyRoadLabelColor === 'function') {
                        window.applyRoadLabelColor();
                    }
                } catch(e) { console.error('applyLayerMode error:', e); }
            };

            const setLayerVis = (layerId, visible) => {
                if (!layerId || !window.map || !window.map.getLayer(layerId)) return;
                window.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
            };

            // 模糊搜索：前两名得分接近时不猜测，回退到子串匹配；否则返回同名记录集合
            const pickFuzzyMatches = (fuseInstance, query, items) => {
                const results = fuseInstance.search(query);
                // null = 没有可信的模糊结果，交给调用方做子串回退
                if (results.length === 0) return null;
                if (results.length >= 2 && (results[1].score - results[0].score) < 0.05) return null;
                const top = results[0].item;
                const sameName = items.filter(a =>
                    (a.Name_CN || '') === (top.Name_CN || '') &&
                    (a.Name_EN || '') === (top.Name_EN || '')
                );
                return new Set(sameName.map(a => a.ID));
            };

            const applyFilters = () => {
                if (!window.artists) return;

                const sYear = parseInt(startYear.value, 10);
                const eYear = parseInt(endYear.value, 10);
                const nameQuery = nameFilter.value.trim().toLowerCase();
                const normNameQuery = normalizeEnName(nameFilter.value);
                const selectedNatl = filters.Natl;

                // 去掉标点和空格后完全一致的中国艺术家姓名优先于模糊匹配
                const normalizedMatchIds = normNameQuery
                    ? new Set(window.artists.filter(a => enNameNorm(a) === normNameQuery).map(a => a.ID))
                    : null;

                const fuzzyMatchIds = (nameQuery && fuse)
                    ? pickFuzzyMatches(fuse, nameQuery, window.artists)
                    : null;

                let filteredArtists = window.artists.filter(artist => {
                    // CSV 中 Sex 为大写 M/F/Unknown，下拉框值为小写；空值按"不详"处理
                    const sex = (artist.Sex || '').trim().toLowerCase() || 'unknown';
                    if (filters.Sex !== 'all' && sex !== filters.Sex) return false;
                    if (!selectedNatl.includes(natlKey((artist.Natl_CN || '').trim()))) return false;
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
                        if (normalizedMatchIds && normalizedMatchIds.size > 0) {
                            if (!normalizedMatchIds.has(artist.ID)) return false;
                        } else if (fuzzyMatchIds) {
                            if (!fuzzyMatchIds.has(artist.ID)) return false;
                        } else {
                            const cn = (artist.Name_CN || '').toLowerCase();
                            const en = (artist.Name_EN || '').toLowerCase();
                            const enNorm = enNameNorm(artist);
                            const enMatch = en.includes(nameQuery) ||
                                (normNameQuery && enNorm.includes(normNameQuery));
                            if (!cn.includes(nameQuery) && !enMatch) return false;
                        }
                    }

                    return true;
                });

                let filteredStudios = (window.studios || []).filter(s => {
                    if (selectedNatl.length === 0) return false;
                    const text = (s['艺术ists_Information_CN'] || '');
                    if (!selectedNatl.some(n => (NATL_MATCH_TERMS[n] || [n]).some(term => text.includes(term)))) return false;

                    // 性别按成员包含原则作用于 studio（任一成员符合即可），
                    // 全部类型与工作室类型下均生效
                    if (filters.Sex !== 'all' &&
                        !(s._sexSet && s._sexSet.has(filters.Sex))) return false;

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

                // 按姓名搜索时保留成员姓名命中的 studio（全部类型与工作室类型）
                if (nameQuery) {
                    filteredStudios = filteredStudios.filter(s =>
                        (s._artistEntries || []).some(e => {
                            const cn = (e.name_cn || '').toLowerCase();
                            const en = (e.name_en || '').toLowerCase();
                            if (cn.includes(nameQuery) || en.includes(nameQuery)) return true;
                            return !!(normNameQuery && normalizeEnName(e.name_en).includes(normNameQuery));
                        })
                    );
                }

                // 地点类型：住宅只显示艺术家，工作室只显示 studio；
                // 全部类型下，姓名命中的艺术家与其所在 studio 一并显示
                const placeType = filters.PlaceType;
                const visibleArtists = placeType === 'studio' ? [] : filteredArtists;
                const visibleStudios = placeType === 'residence' ? [] : filteredStudios;
                window.currentFilteredStudios = visibleStudios;

                // 当前选中的艺术家/工作室被筛掉时，关闭侧栏并清理选中态
                const selectedArtist = window.GlobalStore && window.GlobalStore.selectedArtist;
                const artistFilteredOut = selectedArtist && !visibleArtists.some(a => a.ID === selectedArtist.ID);
                const selectedStudioId = window.currentSelectedStudio;
                const studioFilteredOut = selectedStudioId && !visibleStudios.some(s => s.ID === selectedStudioId);
                if ((artistFilteredOut || studioFilteredOut) && typeof window.resetMapSelection === 'function') {
                    if (window.GlobalStore) window.GlobalStore.isSidebarVisible = false;
                    // skipReapply：当前正在 applyFilters 中，避免递归
                    window.resetMapSelection(true);
                }

                densityCount.value = placeType === 'studio'
                    ? visibleStudios.length
                    : visibleArtists.length;
                resultCount.value = visibleArtists.length + visibleStudios.length;

                requestAnimationFrame(() => {
                    if (typeof window.updateMarkers === 'function') {
                        window.updateMarkers(visibleArtists);
                    }

                    if (!isNaN(sYear) && !isNaN(eYear) && sYear <= eYear) {
                        if (window.ArtistRelationship && typeof window.ArtistRelationship.updateRelationships === 'function') {
                            window.ArtistRelationship.updateRelationships(sYear, eYear, visibleArtists);
                        }
                    } else {
                        if (window.ArtistRelationship && typeof window.ArtistRelationship.updateRelationships === 'function') {
                            window.ArtistRelationship.updateRelationships(null, null, visibleArtists);
                        }
                    }
                });

                document.dispatchEvent(new CustomEvent('filterChanged', { detail: { filteredArtists: visibleArtists, densityCount: densityCount.value } }));

                if (densityCount.value < 10 && window.GlobalStore && window.GlobalStore.activeLayerMode === 'density') {
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
                if (filters.PlaceType === 'studio') {
                    // studio 模式下中国不可选，确保它不会留在已选集合里；
                    // 籍贯筛选依赖中国籍，同样不可用
                    if (filters.Natl.indexOf('中国') !== -1) {
                        filters.Natl = filters.Natl.filter(v => v !== '中国');
                    }
                    if (filters.Origin !== 'all') {
                        filters.Origin = 'all';
                        natlPanelOpen.value = false;
                    }
                } else if (filters.Origin !== 'all') {
                    filters.Natl = ['中国']; // 国籍 value 语言无关
                    natlPanelOpen.value = false;
                }
                if (!isChineseNatl()) {
                    filters.Origin = 'all';
                    // 与籍贯筛选一致：国籍非中国单选时退出"按籍贯显示"
                    if (window.GlobalStore && window.GlobalStore.attributeDisplayMode === 'origin') {
                        window.GlobalStore.attributeDisplayMode = null;
                        if (typeof window.updateAllMarkerStyles === 'function') {
                            window.updateAllMarkerStyles();
                        }
                    }
                    // 社交关系只支持中国单选，条件不再满足时自动退回"仅位置"
                    if (window.GlobalStore && window.GlobalStore.activeLayerMode === 'social') {
                        setLayerMode('position');
                    }
                }
                debouncedApplyFilters();
            };

            const onPlaceTypeChange = () => {
                if (filters.PlaceType === 'studio') {
                    restoreChinaAfterStudio = filters.Natl.includes('中国');
                    // 原本只选了中国（如按籍贯筛选后切换）：中国被排除后自动选上其余国家，
                    // 避免进入工作室类型后没有任何国籍可选
                    if (restoreChinaAfterStudio) {
                        filters.Natl = filters.Natl.filter(v => v !== '中国');
                        if (filters.Natl.length === 0) {
                            const all = natlSelectableOptions.value.map(o => o.value);
                            if (all.length > 0) filters.Natl = all;
                        }
                    }
                } else if (restoreChinaAfterStudio) {
                    // 回到其他类型时恢复被临时排除的中国国籍
                    if (!filters.Natl.includes('中国') &&
                        natlOptions.value.some(o => o.value === '中国')) {
                        filters.Natl = filters.Natl.concat('中国');
                    }
                    restoreChinaAfterStudio = false;
                }
                onFilterChange();
            };

            const closeNatlPanel = (focusTrigger = false) => {
                if (!natlPanelOpen.value) return;
                natlPanelOpen.value = false;
                if (focusTrigger && natlTriggerRef.value) natlTriggerRef.value.focus();
            };

            // 面板 teleport 到 body 并用 fixed 定位，避免撑高侧栏或被 overflow 裁切
            const updateNatlDropdownPosition = () => {
                const trigger = natlTriggerRef.value;
                if (!trigger) return;
                const rect = trigger.getBoundingClientRect();
                const control = natlPanelRef.value;
                const margin = 6;
                const edge = 10;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const controlWidth = control ? control.getBoundingClientRect().width : rect.width;
                const width = Math.min(Math.max(controlWidth, 200), vw - edge * 2);
                const left = Math.min(Math.max(edge, rect.left), vw - width - edge);
                const spaceBelow = vh - rect.bottom - margin - edge;
                const spaceAbove = rect.top - margin - edge;
                const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
                const maxHeight = Math.max(100, Math.min(200, openUp ? spaceAbove : spaceBelow));
                natlDropdownStyle.value = {
                    position: 'fixed',
                    left: left + 'px',
                    width: width + 'px',
                    maxHeight: maxHeight + 'px',
                    top: openUp ? 'auto' : (rect.bottom + margin) + 'px',
                    bottom: openUp ? (vh - rect.top + margin) + 'px' : 'auto'
                };
            };

            const toggleNatlPanel = () => {
                if (isNatlDisabled.value) return;
                if (natlPanelOpen.value) {
                    natlPanelOpen.value = false;
                    return;
                }
                updateNatlDropdownPosition();
                natlPanelOpen.value = true;
            };

            let natlPositionRaf = 0;
            const onDocumentScroll = () => {
                if (!natlPanelOpen.value || natlPositionRaf) return;
                natlPositionRaf = requestAnimationFrame(() => {
                    natlPositionRaf = 0;
                    updateNatlDropdownPosition();
                });
            };

            const onWindowResize = () => {
                if (natlPanelOpen.value) updateNatlDropdownPosition();
            };

            const selectAllNationalities = () => {
                const all = natlSelectableOptions.value.map(o => o.value);
                const allSelected = all.length > 0 && all.every(v => filters.Natl.includes(v));
                filters.Natl = allSelected ? [] : all;
                onFilterChange();
            };

            const onDocumentClick = (event) => {
                if (!natlPanelOpen.value) return;
                const root = natlPanelRef.value;
                const dropdown = natlDropdownRef.value;
                if (root && root.contains(event.target)) return;
                if (dropdown && dropdown.contains(event.target)) return;
                closeNatlPanel(false);
            };

            const onDocumentKeydown = (event) => {
                if (event.key === 'Escape') closeNatlPanel(true);
            };

            const onNameFilterInput = () => {
                if (!nameFilter.value.trim()) applyFilters();
                else debouncedApplyFilters();
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

            // 籍贯筛选的省级归类以属性图例配置为单一数据源，保证筛选与显示归组一致；
            // 末尾保留「其他」兜底项，用于无匹配关键词的值（当前数据量为 0）
            const ORIGIN_PROVINCES = ((window.AttrDisplayConfig && window.AttrDisplayConfig.origin)
                ? window.AttrDisplayConfig.origin.categories.map(c => ({
                      zh: c.key,
                      en: c.label.en,
                      kw: c.keywords || []
                  }))
                : []).concat([{ zh: '其他', en: 'Others', kw: [] }]);

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

            // 奥匈帝国并入奥地利：筛选项统一用「奥地利」的 value/label
            const NATL_ALIAS = { '奥匈帝国': '奥地利' };
            const NATL_MATCH_TERMS = { '奥地利': ['奥地利', '奥匈帝国'] };
            const natlKey = (cn) => NATL_ALIAS[cn] || cn;

            // 英文国籍名以国籍图例（attributeDisplay.js）为单一数据源；
            // 图例未收录的值用全称兜底（CSV 里的 Natl_EN 多为 CHN/JPN 这类缩写）。
            const NATL_EN_FALLBACK = {
                '印度': 'India'
            };

            const getNatlLabel = (cn, rawEn) => {
                const conf = window.AttrDisplayConfig && window.AttrDisplayConfig.nationality;
                if (conf && conf.categories) {
                    const cat = conf.categories.find(c => c.names && c.names.indexOf(cn) !== -1);
                    if (cat && cat.label && cat.label.en) return cat.label.en;
                }
                return NATL_EN_FALLBACK[cn] || rawEn || cn;
            };

            const populateOptions = (artists) => {
                const lang = window.currentLanguage || 'zh';

                const natlMap = new Map(); // Natl_CN -> 按语言的显示标签
                const provSet = new Set();
                artists.forEach(a => {
                    const cn = (a.Natl_CN || '').trim();
                    const key = natlKey(cn);
                    if (key && !natlMap.has(key)) {
                        natlMap.set(key, lang === 'zh' ? key : getNatlLabel(key, (a.Natl_EN || '').trim()));
                    }
                    a._originProv = getOriginProvince(a);
                    // 籍贯选项仅统计中国籍艺术家（语言无关的 Natl_CN 判断）
                    if (cn === '中国') provSet.add(a._originProv);
                });
                // 国籍 value 语言无关；中文把「不详」置底，其余按标签排序
                natlOptions.value = Array.from(natlMap.entries())
                    .map(([value, label]) => ({ value, label }))
                    .sort((x, y) => {
                        if (lang === 'zh') {
                            if (x.value === '不详' && y.value !== '不详') return 1;
                            if (y.value === '不详' && x.value !== '不详') return -1;
                        }
                        return x.label < y.label ? -1 : x.label > y.label ? 1 : 0;
                    });
                // 首次加载默认全选；之后（如切换语言）不覆盖用户已做的选择
                if (!natlInitialized && natlOptions.value.length > 0) {
                    filters.Natl = natlOptions.value.map(o => o.value);
                    natlInitialized = true;
                }
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
                document.addEventListener('click', onDocumentClick);
                document.addEventListener('keydown', onDocumentKeydown);
                document.addEventListener('scroll', onDocumentScroll, true);
                window.addEventListener('resize', onWindowResize);

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
                    natlPanelOpen.value = false;
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
                document.removeEventListener('click', onDocumentClick);
                document.removeEventListener('keydown', onDocumentKeydown);
                document.removeEventListener('scroll', onDocumentScroll, true);
                window.removeEventListener('resize', onWindowResize);
                const mapEl = document.getElementById('map');
                if (mapEl) mapEl.removeEventListener('click', mapClickHandler);
            });

            function closePanel() {
                natlPanelOpen.value = false;
                if (window.GlobalStore) {
                    window.GlobalStore.isLeftPanelOpen = false;
                }
            }

            return {
                startYear, endYear, filters, nameFilter,
                natlOptions, originOptions, yearOptions,
                resultCount,
                isSocialDisabled, isDensityHidden,
                isNatlDisabled, isOriginDisabled,
                natlPanelOpen, natlPanelRef, natlTriggerRef,
                natlDropdownRef, natlDropdownStyle,
                isAllNatl, isPartialNatl, natlSummary,
                toggleNatlPanel, selectAllNationalities,
                t, setLayerMode, onStartYearChange, onEndYearChange, onFilterChange, onPlaceTypeChange,
                onNameFilterInput, onNameFilterEnter,
                toggleAttrDisplay, restoreUnifiedSymbol,
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
