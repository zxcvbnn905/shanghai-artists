// studio 标点样式：只做标点样式与语言切换；标点创建在 mapControl.js 的 updateMarkersOnScreen 中
window.studioMarkersOnScreen = {};

window.updateStudioMarkerStyle = function(marker) {
    const lang = window.currentLanguage || 'zh';
    const src = lang === 'en' ? 'assets/others/studio_EN.svg' : 'assets/others/studio_CN.svg';

    const el = marker.getElement();
    el.style.cursor = 'pointer';
    el.style.pointerEvents = 'auto';
    el.style.backgroundImage = `url('${src}')`;
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
    el.style.width = '30px';
    el.style.height = '30px';

    const svg = el.querySelector('svg');
    if (svg) svg.style.display = 'none';
};

window.updateAllStudioMarkerStyles = function() {
    for (const id in window.studioMarkersOnScreen) {
        window.updateStudioMarkerStyle(window.studioMarkersOnScreen[id]);
    }
};

document.addEventListener('languageChanged', () => {
    if (typeof window.updateAllStudioMarkerStyles === 'function') {
        window.updateAllStudioMarkerStyles();
    }
});
