const { createApp, ref, computed, onMounted, nextTick } = Vue;

const PopupApp = {
    setup() {
        const currentTab = ref('historical');
        const tooltipVisible = ref(false);
        const toggleTooltip = () => { tooltipVisible.value = !tooltipVisible.value; };
        const showTooltip = () => { tooltipVisible.value = true; };
        const hideTooltip = () => { tooltipVisible.value = false; };
        const langCounter = ref(1);
        const currentLanguage = ref(window.currentLanguage || 'zh');

        const artistManifest = ref(null);
        const studioManifest = ref(null);
        const manifestLoaded = ref(false);
        const currentArtist = ref(null);

        const carouselIndex = ref(0);
        let closePopupTimer = null;

        const clearClosePopupTimer = () => {
            if (closePopupTimer) {
                clearTimeout(closePopupTimer);
                closePopupTimer = null;
            }
        };

        const t_local = (key) => {
            const dummy = langCounter.value;
            return typeof window.t === 'function' ? window.t(key) : key;
        };

        const loadManifest = async () => {
            // 远程后端需先通过门禁校验，避免伪造 token 时提前发数据请求
            if (window.__gatePromise) {
                let gateOk = false;
                try { gateOk = await window.__gatePromise; } catch (e) { gateOk = false; }
                if (gateOk === false) return;
            }
            const [artistRes, studioRes] = await Promise.allSettled([
                fetch(window.dataFetchUrl('data/buildingPicture_manifest.json'), { headers: window.authHeaders() }),
                fetch(window.dataFetchUrl('data/studioPicture_manifest.json'), { headers: window.authHeaders() })
            ]);

            if (artistRes.status === 'fulfilled' && artistRes.value.ok) {
                try {
                    artistManifest.value = await artistRes.value.json();
                } catch (error) {
                    console.error('Error loading artist picture manifest:', error);
                }
            } else {
                console.error('Failed to load artist picture manifest');
            }

            if (studioRes.status === 'fulfilled' && studioRes.value.ok) {
                try {
                    studioManifest.value = await studioRes.value.json();
                } catch (error) {
                    console.error('Error loading studio picture manifest:', error);
                }
            } else {
                console.error('Failed to load studio picture manifest');
            }

            manifestLoaded.value = true;
        };

        const closePopup = () => {
            window.GlobalStore.isPopupOpen = false;
            clearClosePopupTimer();
            closePopupTimer = setTimeout(() => {
                closePopupTimer = null;
                currentArtist.value = null;
                carouselIndex.value = 0;
                if (typeof window.checkAndResetMapSelection === 'function') {
                    window.checkAndResetMapSelection();
                }
            }, 1000);
        };

        const setTab = (tab) => {
            currentTab.value = tab;
            carouselIndex.value = 0;
        };

        const openViewer = (src) => {
            window.GlobalStore.viewerSrc = src;
            window.GlobalStore.isViewerOpen = true;
        };

        const closeViewer = () => {
            window.GlobalStore.isViewerOpen = false;
            window.GlobalStore.viewerSrc = '';
        };

        const nextPhoto = () => {
            const max = buildingPhotos.value.length - 1;
            carouselIndex.value = carouselIndex.value >= max ? 0 : carouselIndex.value + 1;
        };

        const prevPhoto = () => {
            const max = buildingPhotos.value.length - 1;
            carouselIndex.value = carouselIndex.value <= 0 ? max : carouselIndex.value - 1;
        };

        const parsedEntityData = computed(() => {
            if (!currentArtist.value || !currentArtist.value.ID || !manifestLoaded.value) {
                return { mainId: null, actualSubId: null, imagePaths: [], baseFolder: 'data/artist_pictures', isStudio: false };
            }
            const type = currentArtist.value._type || 'artist';
            const isStudio = type === 'studio';
            const manifest = isStudio ? studioManifest.value : artistManifest.value;
            const baseFolder = isStudio ? 'data/studio_pictures' : 'data/artist_pictures';

            const idParts = currentArtist.value.ID.split('-');
            const mainId = idParts[0];
            const subId = idParts.length > 1 ? idParts[1] : '1';

            const entityImages = manifest ? manifest[mainId] : null;
            let imagePaths = [];
            let actualSubId = subId;

            if (entityImages) {
                if (entityImages[subId]) {
                    imagePaths = entityImages[subId];
                } else if (entityImages['1']) {
                    imagePaths = entityImages['1'];
                    actualSubId = '1';
                }
            }
            return { mainId, actualSubId, imagePaths, baseFolder, isStudio };
        });

        const histAddressText = computed(() => {
            const dummy = langCounter.value;
            if (!currentArtist.value) return '';
            const raw = window.currentLanguage === 'en' ? currentArtist.value.Hist_Add_E : currentArtist.value.Hist_Add_C;
            if (!raw) return '';
            return t_local('historical_address') + ': ' + raw;
        });

        const currAddressText = computed(() => {
            const dummy = langCounter.value;
            if (!currentArtist.value) return '';
            const isStudio = (currentArtist.value._type || 'artist') === 'studio';
            const raw = window.currentLanguage === 'en'
                ? (isStudio ? currentArtist.value.Curr_Add_E : currentArtist.value.Curr_Addr_E)
                : (isStudio ? currentArtist.value.Curr_Add_C : currentArtist.value.Curr_Addr_C);
            if (!raw) return '';
            return t_local('current_address') + ': ' + raw;
        });

        const popupModeClass = computed(() => {
            if (!manifestLoaded.value || !currentArtist.value || !currentArtist.value.ID) {
                return ['mode-message-only'];
            }
            if (currentTab.value === 'historical') {
                return historicalImgSrc.value ? ['mode-fixed-height'] : ['mode-map-replace'];
            }
            if (currentTab.value === 'contemporary') {
                if (!contemporaryHistoryImg.value && !contemporaryPresentImg.value) {
                    return ['mode-message-only'];
                }
                return contemporaryMode.value === 'compare' ? ['mode-fixed-width'] : ['mode-fixed-width', 'mode-present-only'];
            }
            if (currentTab.value === 'photo') {
                if (buildingPhotos.value.length > 0) return ['mode-fixed-height'];
                return ['mode-message-only'];
            }
            return [];
        });

        const helpTooltipKey = computed(() => {
            if (currentTab.value === 'historical') return 'tab_help_historical';
            if (currentTab.value === 'contemporary') return 'tab_help_contemporary';
            if (currentTab.value === 'photo') return 'tab_help_building';
            return '';
        });

        const tooltipPadding = computed(() => {
            const isEn = currentLanguage.value === 'en';
            if (currentTab.value === 'photo') {
                return '20px 22px';
            }
            return isEn ? '44px 24px' : '22px 22px';
        });

        // tab 帮助提示框文案长短：历史/当代为长文，建筑照片为短文（用于切换底图）
        const isLongTab = computed(() =>
            currentTab.value === 'historical' || currentTab.value === 'contemporary');

        const historicalImgSrc = computed(() => {
            const paths = parsedEntityData.value.imagePaths;
            const match = paths.find(p => p.toLowerCase().endsWith('history.jpg'));
            if (match) {
                return window.dataUrl(`${parsedEntityData.value.baseFolder}/${parsedEntityData.value.mainId}/${parsedEntityData.value.actualSubId}/${match}`);
            }
            return null;
        });

        const contemporaryHistoryImg = computed(() => {
            const paths = parsedEntityData.value.imagePaths;
            const match = paths.find(p => p.toLowerCase().endsWith('history.jpg'));
            if (match) {
                return window.dataUrl(`${parsedEntityData.value.baseFolder}/${parsedEntityData.value.mainId}/${parsedEntityData.value.actualSubId}/${match}`);
            }
            return null;
        });

        const contemporaryPresentImg = computed(() => {
            const paths = parsedEntityData.value.imagePaths;
            const match = paths.find(p => p.toLowerCase().endsWith('present.jpg'));
            if (match) {
                return window.dataUrl(`${parsedEntityData.value.baseFolder}/${parsedEntityData.value.mainId}/${parsedEntityData.value.actualSubId}/${match}`);
            }
            return null;
        });

        const contemporaryMode = computed(() => {
            if (contemporaryHistoryImg.value) return 'compare';
            if (contemporaryPresentImg.value) return 'present-only';
            return 'none';
        });

        const buildingPhotos = computed(() => {
            const paths = parsedEntityData.value.imagePaths.filter(p => !p.toLowerCase().endsWith('history.jpg') && !p.toLowerCase().endsWith('present.jpg'));
            return paths.map(p => window.dataUrl(`${parsedEntityData.value.baseFolder}/${parsedEntityData.value.mainId}/${parsedEntityData.value.actualSubId}/${p}`));
        });

        const handleImgError = (e) => {
            e.target.onerror = null;
            e.target.src = 'assets/mapReplace.jpg';
        };

        onMounted(() => {
            loadManifest();
            document.addEventListener('languageChanged', () => {
                currentLanguage.value = window.currentLanguage || 'zh';
                langCounter.value++;
            });
        });

        window.closePopup = closePopup;

        let frameResizeObserver = null;

        // 外框底图整幅尺寸 : 底图内可放内容的留白区尺寸（popupWindowBackground.png）
        // 使内白区精确贴合 #popup-window，且整幅底图等比铺满外框
        const FRAME_IMG_W = 2504, FRAME_INNER_W = 1851;
        const FRAME_IMG_H = 1625, FRAME_INNER_H = 1174;

        const updateFrameSize = () => {
            const frame = document.getElementById('popup-frame');
            const win = document.getElementById('popup-window');
            if (!frame || !win) return;
            const rect = win.getBoundingClientRect();
            frame.style.width = (rect.width * FRAME_IMG_W / FRAME_INNER_W) + 'px';
            frame.style.height = (rect.height * FRAME_IMG_H / FRAME_INNER_H) + 'px';
        };

        window.showImagePopup = async (artist) => {
            // 取消上一个关闭定时器，避免 1 秒内重新打开时被旧定时器清空
            clearClosePopupTimer();
            currentArtist.value = artist;
            carouselIndex.value = 0;
            window.GlobalStore.isPopupOpen = true;
            await nextTick();
            if (!frameResizeObserver) {
                const win = document.getElementById('popup-window');
                if (win) {
                    frameResizeObserver = new ResizeObserver(() => updateFrameSize());
                    frameResizeObserver.observe(win);
                }
            }
            updateFrameSize();
        };
        window.openPopup = window.showImagePopup;

        window.openViewer = openViewer;

        return {
            GlobalStore: window.GlobalStore,
            currentTab, currentLanguage, currentArtist, manifestLoaded,
            carouselIndex, t: t_local,
            closePopup, setTab, openViewer, closeViewer, nextPhoto, prevPhoto,
            tooltipVisible, toggleTooltip, showTooltip, hideTooltip,
            popupModeClass, helpTooltipKey, tooltipPadding, isLongTab, historicalImgSrc,
            contemporaryHistoryImg, contemporaryPresentImg, contemporaryMode,
            buildingPhotos, histAddressText, currAddressText,
            handleImgError
        };
    }
};

createApp(PopupApp).mount('#vue-popup-app');
