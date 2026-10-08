(function () {
    const { createApp, ref, reactive, onMounted, onUnmounted, nextTick } = Vue;

    const FilterApp = {
        setup() {
            const sexOptions = ref([]);
            const natlOptions = ref([]);
            const singleYearOptions = Array.from({length: 1948 - 1912 + 1}, (_, i) => 1912 + i);

            const filters = reactive({
                Sex: 'all',
                Natl: 'all'
            });

            const startYear = ref('');
            const endYear = ref('');
            const singleYear = ref('');

            const currentLang = ref(window.currentLanguage || 'zh');

            window.vueFilterApp = {
                setFilters: (opts) => {
                    if (opts.startYear !== undefined) startYear.value = opts.startYear;
                    if (opts.endYear !== undefined) endYear.value = opts.endYear;
                    if (opts.singleYear !== undefined) singleYear.value = opts.singleYear;
                    if (opts.filters) {
                        if (opts.filters.Sex !== undefined) filters.Sex = opts.filters.Sex;
                        if (opts.filters.Natl !== undefined) filters.Natl = opts.filters.Natl;
                    }
                },
                initOptions: (artists) => {
                    const sexSet = new Set();
                    const natlSet = new Set();
                    artists.forEach(a => {
                        if (a.Sex) sexSet.add(a.Sex);
                        if (a.Natl) natlSet.add(a.Natl);
                    });
                    sexOptions.value = Array.from(sexSet).sort();
                    natlOptions.value = Array.from(natlSet).sort();
                }
            };

            const t_local = (key) => {
                currentLang.value;
                return typeof window.t === 'function' ? window.t(key) : key;
            };

            const getSexOptionText = (val) => {
                currentLang.value;
                const map = { 'f': 'female', 'm': 'male', 'unknown': 'unknown' };
                const k = map[val.toLowerCase()];
                return k ? t_local(k) : val;
            };

            const applyFilters = () => {
                const sYear = parseInt(startYear.value, 10);
                const eYear = parseInt(endYear.value, 10);

                if (isNaN(sYear) && isNaN(eYear)) {
                    const filteredArtists = window.artists.filter(artist => {
                        let isMatch = true;
                        if (filters.Sex !== 'all' && artist.Sex !== filters.Sex) isMatch = false;
                        if (filters.Natl !== 'all' && artist.Natl !== filters.Natl) isMatch = false;
                        return isMatch;
                    });
                    updateMarkers(filteredArtists);
                    updateFilterList(filteredArtists);
                    if (window.ArtistRelationship) {
                        window.ArtistRelationship.updateRelationships(null, filteredArtists);
                    }
                    document.dispatchEvent(new CustomEvent('filterChanged', { detail: { filteredArtists } }));
                    return;
                }

                const startYearVal = isNaN(sYear) ? 1912 : sYear;
                const endYearVal = isNaN(eYear) ? 1948 : eYear;

                const filteredArtists = window.artists.filter(artist => {
                    let isMatch = true;
                    if (filters.Sex !== 'all' && artist.Sex !== filters.Sex) isMatch = false;
                    if (filters.Natl !== 'all' && artist.Natl !== filters.Natl) isMatch = false;
                    if (!isMatch) return false;

                    let periodMatch = false;
                    for (let year = startYearVal; year <= endYearVal; year++) {
                        if (artist[`Yr_${year}`] === '1') {
                            periodMatch = true;
                            break;
                        }
                    }
                    return periodMatch;
                });

                updateMarkers(filteredArtists);
                updateFilterList(filteredArtists);

                const isSingleYear = startYearVal === endYearVal && singleYear.value == startYearVal;
                if (window.ArtistRelationship) {
                    window.ArtistRelationship.updateRelationships(isSingleYear ? startYearVal : null, filteredArtists);
                }

                document.dispatchEvent(new CustomEvent('filterChanged', { detail: { filteredArtists } }));
            };

            window.applyFilters = applyFilters;

            const onRangeChange = () => {
                if (startYear.value && endYear.value && startYear.value === endYear.value) {
                    singleYear.value = startYear.value;
                    checkAndSwitchMapByYear(startYear.value);
                } else {
                    singleYear.value = '';
                }
                applyFilters();
            };

            const handleSingleYearChange = () => {
                if (singleYear.value) {
                    startYear.value = singleYear.value;
                    endYear.value = singleYear.value;
                    checkAndSwitchMapByYear(singleYear.value);
                } else {
                    startYear.value = '';
                    endYear.value = '';
                }
                applyFilters();
            };

            const resetFilters = () => {
                filters.Sex = 'all';
                filters.Natl = 'all';
                startYear.value = '';
                endYear.value = '';
                singleYear.value = '';

                const currentStyle = window.GlobalStore ? window.GlobalStore.currentStyle : '';

                if (currentStyle !== 'map_3' && typeof switchMapStyle === 'function') {
                    switchMapStyle('map_3');
                }

                if (typeof window.resetSearch === 'function') {
                    window.resetSearch();
                } else {
                    applyFilters();
                }
            };

            let langHandler, artistsHandler;

            onMounted(() => {
                langHandler = () => {
                    currentLang.value = window.currentLanguage || 'zh';
                    if (window.artists) {
                        createFilters(window.artists);
                    }
                };
                document.addEventListener('languageChanged', langHandler);

                artistsHandler = () => {
                    createFilters(window.artists);

                    const urlParams = new URLSearchParams(window.location.search);
                    const initialYear = urlParams.get('year');
                    const initialArtist = urlParams.get('artist');

                    if (initialYear) {
                        singleYear.value = initialYear;
                        startYear.value = initialYear;
                        endYear.value = initialYear;

                        if (typeof checkAndSwitchMapByYear === 'function') {
                            checkAndSwitchMapByYear(initialYear);
                        }
                        applyFilters();
                    } else if (initialArtist) {
                        applyFilters();
                        if (typeof window.triggerSearchByArtistName === 'function') {
                            setTimeout(() => {
                                window.triggerSearchByArtistName(initialArtist);
                            }, 500);
                        }
                    } else {
                        applyFilters();
                    }
                };
                document.addEventListener('artistsLoaded', artistsHandler);
            });

            // 组件卸载时清理事件监听
            onUnmounted(() => {
                document.removeEventListener('languageChanged', langHandler);
                document.removeEventListener('artistsLoaded', artistsHandler);
            });

            return {
                GlobalStore: window.GlobalStore,
                sexOptions, natlOptions, singleYearOptions,
                filters, startYear, endYear, singleYear,
                applyFilters, onRangeChange, handleSingleYearChange, resetFilters,
                getSexOptionText, t: t_local
            };
        }
    };

    createApp(FilterApp).mount('#vue-filter-app');
})();

function createFilters(artists) {
    const lang = window.currentLanguage || 'zh';
    const natlField = lang === 'zh' ? 'Natl_CN' : 'Natl_EN';

    artists.forEach(artist => {
        artist.Natl = artist[natlField];
    });

    if (window.vueFilterApp) {
        window.vueFilterApp.initOptions(artists);
    }
}



function checkAndSwitchMapByYear(year) {
    if (!year) return;
    var yearNum = parseInt(year, 10);
    if (isNaN(yearNum)) return;
    var targetStyle = yearNum < 1942 ? 'map_1' : 'map_2';
    if (typeof switchMapStyle === 'function') {
        switchMapStyle(targetStyle);
    }
}
