let artworkManifest = {};

// manifest 到达前就打开侧栏时，作品图会缺失；到达后重渲染当前侧栏
function refreshOpenSidebarForManifest() {
    if (!window.GlobalStore || !window.GlobalStore.isSidebarVisible) return;
    if (window.lastStudio && typeof window.updateStudioSidebar === 'function') {
        window.updateStudioSidebar(window.lastStudio);
    } else if (window.lastArtist && typeof window.updateSidebar === 'function') {
        window.updateSidebar(window.lastArtist);
    }
}

(async function loadArtworkManifest() {
    // 远程后端需先通过门禁校验，避免伪造 token 时提前发数据请求
    if (window.__gatePromise) {
        let gateOk = false;
        try { gateOk = await window.__gatePromise; } catch (e) { gateOk = false; }
        if (gateOk === false) return;
    }
    fetch(window.dataFetchUrl('data/artistPicture_manifest.json'), { headers: window.authHeaders() })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            artworkManifest = data;
            refreshOpenSidebarForManifest();
        })
        .catch(error => console.error('Error loading artwork manifest:', error));
})();

(function() {
    const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

    const rightSidebarApp = createApp({
        setup() {
            const artist = ref(null);

            const tlImg = ref('');
            const trImg = ref('');
            const blImg = ref('');
            const brImg = ref('');

            const mode = ref('artist');
            const studio = ref(null);
            const expanded = ref(new Set());

            const gridClasses = computed(() => {
                let classes = '';
                if (!blImg.value && !brImg.value) classes += ' single-row';
                if (!trImg.value) classes += ' no-tr';
                return classes.trim();
            });

            const isHidden = computed(() => !tlImg.value && !trImg.value && !blImg.value && !brImg.value);

            const lang = ref(window.currentLanguage || 'zh');

            window.vueRightSidebarUpdateLang = (newLang) => {
                lang.value = newLang;
            };

            const isChinese = computed(() => lang.value === 'zh');

            const langTrigger = ref(0);
            let langChangeHandler;

            // 组件挂载时注册语言监听（使用 document 与其他组件保持一致）
            onMounted(() => {
                langChangeHandler = () => {
                    langTrigger.value++;
                };
                document.addEventListener('languageChanged', langChangeHandler);
            });

            // 组件卸载时移除语言监听
            onUnmounted(() => {
                if (langChangeHandler) {
                    document.removeEventListener('languageChanged', langChangeHandler);
                }
            });

            const t = (key) => {
                langTrigger.value;
                return window.t ? window.t(key) : key;
            };

            const updateSidebar = (newArtist) => {
                if (!newArtist || !newArtist.ID) return;

                mode.value = 'artist';
                studio.value = null;
                window.lastStudio = null;

                lang.value = window.currentLanguage || 'zh';

                artist.value = newArtist;
                window.lastArtist = newArtist;

                const artistId = newArtist.ID.split('-')[0];
                const allArtistFiles = artworkManifest ? (artworkManifest[artistId] || []) : [];

                const profileImages = allArtistFiles.filter(name => name.toLowerCase().startsWith('profile'));
                const artworkImages = allArtistFiles.filter(name => name.toLowerCase().includes('artwork'));

                tlImg.value = profileImages.length > 0 ? window.dataUrl(`data/artist_pictures/${artistId}/${profileImages[0]}`) : 'assets/profileReplace.jpg';
                trImg.value = '';
                blImg.value = '';
                brImg.value = '';

                if (artworkImages.length === 1) {
                    trImg.value = window.dataUrl(`data/artist_pictures/${artistId}/${artworkImages[0]}`);
                } else if (artworkImages.length === 2) {
                    blImg.value = window.dataUrl(`data/artist_pictures/${artistId}/${artworkImages[0]}`);
                    brImg.value = window.dataUrl(`data/artist_pictures/${artistId}/${artworkImages[1]}`);
                } else if (artworkImages.length >= 3) {
                    trImg.value = window.dataUrl(`data/artist_pictures/${artistId}/${artworkImages[0]}`);
                    blImg.value = window.dataUrl(`data/artist_pictures/${artistId}/${artworkImages[1]}`);
                    brImg.value = window.dataUrl(`data/artist_pictures/${artistId}/${artworkImages[2]}`);
                }

                window.GlobalStore.isSidebarVisible = true;
                if (window.innerWidth <= 768) {
                    window.GlobalStore.isLeftPanelOpen = false;
                }
            };

            const updateStudioSidebar = (newStudio) => {
                if (!newStudio || !newStudio.ID) return;

                mode.value = 'studio';
                artist.value = null;
                window.lastArtist = null;

                lang.value = window.currentLanguage || 'zh';

                // 切换到不同 studio 时重置折叠状态，避免按索引的展开态串到别的 studio
                if (!studio.value || studio.value.ID !== newStudio.ID) {
                    expanded.value = new Set();
                }
                studio.value = newStudio;
                window.lastStudio = newStudio;

                tlImg.value = '';
                trImg.value = '';
                blImg.value = '';
                brImg.value = '';

                window.GlobalStore.isSidebarVisible = true;
                if (window.innerWidth <= 768) {
                    window.GlobalStore.isLeftPanelOpen = false;
                }
            };

            const closeSidebar = () => {
                window.GlobalStore.isSidebarVisible = false;
                if (typeof window.checkAndResetMapSelection === 'function') {
                    window.checkAndResetMapSelection();
                }
            };

            const handleImgError = (e) => {
                e.target.src = 'assets/profileReplace.jpg';
                e.target.onerror = null;
            };

            const resetImgStyle = (e) => {
                e.target.style.display = '';
            };

            const openImage = (src) => {
                if(!src) return;
                if (typeof window.openViewer === 'function') {
                    window.openViewer(src);
                } else {
                    window.GlobalStore.viewerSrc = src;
                    window.GlobalStore.isViewerOpen = true;
                }
            };

            const closeViewer = () => {
                window.GlobalStore.isViewerOpen = false;
                window.GlobalStore.viewerSrc = '';
            };

            const getSexLabel = (sex) => {
                if (sex === 'M') return t('male');
                if (sex === 'F') return t('female');
                return t('unknown');
            };

            // 英文国籍名与国籍图例保持一致；图例未收录的值用全称兜底
            const NATL_EN_FALLBACK = {
                '奥匈帝国': 'Austria-Hungary',
                '印度': 'India'
            };

            const getNationalityLabel = (a) => {
                if (!a) return '';
                const cn = (a.Natl_CN || '').trim();
                if (isChinese.value) return cn;
                const conf = window.AttrDisplayConfig && window.AttrDisplayConfig.nationality;
                if (conf && conf.categories) {
                    const cat = conf.categories.find(c => c.names && c.names.indexOf(cn) !== -1);
                    if (cat && cat.label && cat.label.en) return cat.label.en;
                }
                return NATL_EN_FALLBACK[cn] || (a.Natl_EN || '').trim() || cn;
            };

            const isChineseArtist = (a) => !!a && (a.Natl_CN || '').trim() === '中国';

            const toggleArtistEntry = (key) => {
                const next = new Set(expanded.value);
                if (next.has(key)) {
                    next.delete(key);
                } else {
                    next.add(key);
                }
                expanded.value = next;
            };

            // 为 studio 中被排除的艺术家取图片（复用 artist 侧边栏的 manifest 规则）
            const getEntryImages = (entry) => {
                const detail = entry && entry.detail;
                const id = detail && detail.ID ? detail.ID : '';
                const artistId = id.split('-')[0];
                const allFiles = (artistId && artworkManifest && artworkManifest[artistId])
                    ? artworkManifest[artistId] : [];
                const profiles = allFiles.filter(n => n.toLowerCase().startsWith('profile'));
                const artworks = allFiles.filter(n => n.toLowerCase().includes('artwork'));
                const out = { tl: '', tr: '', bl: '', br: '' };
                out.tl = profiles.length > 0
                    ? window.dataUrl(`data/artist_pictures/${artistId}/${profiles[0]}`) : 'assets/profileReplace.jpg';
                if (artworks.length === 1) {
                    out.tr = window.dataUrl(`data/artist_pictures/${artistId}/${artworks[0]}`);
                } else if (artworks.length === 2) {
                    out.bl = window.dataUrl(`data/artist_pictures/${artistId}/${artworks[0]}`);
                    out.br = window.dataUrl(`data/artist_pictures/${artistId}/${artworks[1]}`);
                } else if (artworks.length >= 3) {
                    out.tr = window.dataUrl(`data/artist_pictures/${artistId}/${artworks[0]}`);
                    out.bl = window.dataUrl(`data/artist_pictures/${artistId}/${artworks[1]}`);
                    out.br = window.dataUrl(`data/artist_pictures/${artistId}/${artworks[2]}`);
                }
                return out;
            };

            const gridClassesFor = (entry) => {
                const imgs = getEntryImages(entry);
                let classes = '';
                if (!imgs.bl && !imgs.br) classes += ' single-row';
                if (!imgs.tr) classes += ' no-tr';
                return classes.trim();
            };

            window.updateSidebar = updateSidebar;
            window.updateStudioSidebar = updateStudioSidebar;

            return {
                GlobalStore: window.GlobalStore,
                artist,
                studio,
                mode,
                tlImg, trImg, blImg, brImg,
                gridClasses,
                isHidden,
                isChinese,
                t,
                closeSidebar,
                handleImgError,
                openImage,
                closeViewer,
                getSexLabel,
                getNationalityLabel,
                isChineseArtist,
                expanded,
                toggleArtistEntry,
                getEntryImages,
                gridClassesFor
            };
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        rightSidebarApp.mount('#vue-right-sidebar-app');
    });
})();