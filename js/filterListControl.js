(function () {
    const { createApp, ref, onMounted, onUnmounted } = Vue;

    const FilterListApp = {
        setup() {
            const filteredArtists = ref([]);
            const isHidden = ref(true);
            const currentLang = ref(window.currentLanguage || 'zh');

            const getArtistName = (artist) => {
                const nameField = currentLang.value === 'zh' ? 'Name_CN' : 'Name_EN';
                return artist[nameField] || artist['Name_EN'];
            };

            const selectArtist = (artist) => {
                const fullArtistData = window.allArtistsData ? window.allArtistsData[artist.ID] : null;
                if (fullArtistData && fullArtistData.marker) {
                    console.log('Artist selected from list:', fullArtistData);
                    const coordinates = fullArtistData.marker.getLngLat();
                    if (window.map) {
                        window.map.flyTo({
                            center: coordinates,
                            zoom: 15
                        });
                    }
                    if (typeof window.updateSidebar === 'function') {
                        window.updateSidebar(fullArtistData);
                    }
                } else {
                    console.error('Could not find marker for artist:', artist);
                }
            };

            const toggleList = () => {
                isHidden.value = !isHidden.value;
                if (window.GlobalStore) {
                    window.GlobalStore.isFilterListExpanded = !isHidden.value;
                }
            };

            window.vueFilterListApp = {
                updateFilterList: (artists) => {
                    filteredArtists.value = artists;
                }
            };

            let langHandler;

            onMounted(() => {
                langHandler = () => {
                    currentLang.value = window.currentLanguage || 'zh';
                };
                document.addEventListener('languageChanged', langHandler);
            });

            // 组件卸载时清理事件监听
            onUnmounted(() => {
                document.removeEventListener('languageChanged', langHandler);
            });

            return {
                filteredArtists,
                isHidden,
                getArtistName,
                selectArtist,
                toggleList
            };
        }
    };

    createApp(FilterListApp).mount('#vue-filter-list-app');
})();

window.updateFilterList = function(artists) {
    if (window.vueFilterListApp) {
        window.vueFilterListApp.updateFilterList(artists);
    }
};