const translations = {};
window.currentLanguage = 'zh';

// 响应式翻译触发器 — Vue 应用通过读取此值建立依赖，翻译加载后自动重新渲染
if (typeof Vue !== 'undefined' && Vue.reactive) {
    window._i18nTick = Vue.reactive({ n: 0 });
} else {
    window._i18nTick = { n: 0 };
}

async function setLanguage(lang) {
    if (lang === currentLanguage && translations[lang]) {
        return;
    }
    currentLanguage = lang;
    // 同步响应式全局语言状态，各组件通过此属性自动响应
    if (window.GlobalStore) {
        window.GlobalStore.language = lang;
    }
    const response = await fetch(`locales/${lang}.json`);
    translations[lang] = await response.json();
    updateContent();

    if (window.map && typeof window.updateMapLanguage === 'function') {
        window.updateMapLanguage(lang);
    }
}

function t(key) {
    return translations[currentLanguage]?.[key] || key;
}

window.t = t;

function updateContent() {
    document.querySelectorAll('[data-i18n-key]').forEach(element => {
        const key = element.getAttribute('data-i18n-key');
        if (element.tagName === 'INPUT' && element.hasAttribute('placeholder')) {
            element.placeholder = t(key);
        } else if (element.classList.contains('tab-help-tooltip')) {
            element.innerHTML = t(key);
        } else {
            element.textContent = t(key);
        }
    });
    document.title = t('title') || document.title;

    const favicon = document.getElementById('favicon');
    if (favicon) {
        favicon.href = `assets/others/stamp_${currentLanguage === 'en' ? 'EN' : 'CN'}.svg`;
    }

    document.documentElement.lang = currentLanguage;
    document.body.setAttribute('data-lang', currentLanguage);

    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('visible')) {
        if (window.lastStudio && typeof window.updateStudioSidebar === 'function') {
            window.updateStudioSidebar(window.lastStudio);
        } else if (window.lastArtist) {
            window.updateSidebar(window.lastArtist);
        }
    }

    const searchInput = document.getElementById('search-input') || document.getElementById('artist-search');
    if (searchInput && searchInput.value) {
        searchInput.dispatchEvent(new Event('input'));
    }

    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: currentLanguage } }));
    try {
        if (window.vueApp && window.vueApp.config.globalProperties.$i18n) {
            window.vueApp.config.globalProperties.$i18n.locale = currentLanguage;
        }
    } catch (e) {
        console.error('Error updating translations:', e);
    }

    if (typeof window.vueRightSidebarUpdateLang === 'function') {
        window.vueRightSidebarUpdateLang(currentLanguage);
    }

    document.documentElement.setAttribute('data-vue-lang-trigger', new Date().getTime());

    // 通知 Vue 应用翻译已加载，触发重新渲染
    window._i18nTick.n++;

    const url = new URL(window.location.href);
    url.searchParams.set('lang', currentLanguage);
    window.history.replaceState({}, '', url);
}

document.addEventListener('DOMContentLoaded', () => {
    initVueLanguageApp();
    initVueInfoControlFloat();

    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam === 'en') {
        setLanguage('en');
    } else if (langParam === 'zh') {
        setLanguage('zh');
    } else {
        const browserLang = navigator.language || '';
        if (browserLang.toLowerCase().startsWith('zh')) {
            setLanguage('zh');
        } else {
            setLanguage('en');
        }
    }
});

function initVueLanguageApp() {
    if (typeof Vue !== 'undefined') {
        const mountPoint = document.getElementById('vue-language-app');
        if (mountPoint) {
            const { createApp, ref, computed, onMounted, watch } = Vue;
            createApp({
                setup() {
                    const isEnglish = ref(window.currentLanguage === 'en');

                    const langIconSrc = computed(() => {
                        return isEnglish.value
                            ? 'assets/others/languageSwitch_EN.svg'
                            : 'assets/others/languageSwitch_CN.svg';
                    });

                    function toggleLanguage() {
                        isEnglish.value = !isEnglish.value;
                    }

                    watch(isEnglish, (newVal) => {
                        const newLang = newVal ? 'en' : 'zh';
                        if (window.currentLanguage !== newLang) {
                            setLanguage(newLang);
                        }
                    });

                    onMounted(() => {
                        document.addEventListener('languageChanged', (e) => {
                            isEnglish.value = e.detail.language === 'en';
                        });
                    });

                    return {
                        isEnglish,
                        langIconSrc,
                        toggleLanguage
                    };
                }
            }).mount('#vue-language-app');
        }
    }
}

function initVueInfoControlFloat() {
    if (typeof Vue !== 'undefined') {
        const mountPoint = document.getElementById('vue-info-control-float-app');
        if (mountPoint) {
            const { createApp } = Vue;
            createApp({
                setup() {
                    function toggleLeftPanel() {
                        if (window.GlobalStore) {
                            window.GlobalStore.isLeftPanelOpen = !window.GlobalStore.isLeftPanelOpen;
                            if (window.GlobalStore.isLeftPanelOpen && window.innerWidth <= 768) {
                                window.GlobalStore.isSidebarVisible = false;
                            }
                        }
                    }

                    return {
                        GlobalStore: window.GlobalStore,
                        toggleLeftPanel
                    };
                }
            }).mount('#vue-info-control-float-app');
        }
    }
}
