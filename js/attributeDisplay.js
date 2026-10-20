// 按属性显示：分类配置（标点图片与图例的单一数据源）+ 右下角图例 Vue 应用
(function () {
    'use strict';

    var G = 'assets/gender/svg/';
    var N = 'assets/nationality/svg/';
    var O = 'assets/origin/svg/';
    var STAMP = { zh: 'assets/others/stamp_CN.svg', en: 'assets/others/stamp_EN.svg' };

    window.AttrDisplayConfig = {
        gender: {
            titleKey: 'sex',
            background: 'assets/gender/background.png',
            categories: [
                { key: 'male', labelKey: 'male',
                  match: function (a) { return (a.Sex || '').trim().toLowerCase() === 'm'; },
                  img: { zh: G + 'male_CN.svg', en: G + 'male_EN.svg' },
                  liteImg: G + 'male_lite.svg' },
                { key: 'female', labelKey: 'female',
                  match: function (a) { return (a.Sex || '').trim().toLowerCase() === 'f'; },
                  img: { zh: G + 'female_CN.svg', en: G + 'female_EN.svg' },
                  liteImg: G + 'female_lite.svg' },
                { key: 'unknown', labelKey: 'unknown',
                  match: function () { return true; },
                  img: { zh: G + 'unknown_CN.svg', en: G + 'unknown_EN.svg' },
                  liteImg: G + 'unknown_lite.svg' }
            ],
            fallbackKey: 'unknown'
        },
        nationality: {
            titleKey: 'nationality',
            background: 'assets/nationality/background.png',
            // 精确匹配 Natl_CN（names 数组）；国籍素材仅一套（img 为字符串），
            // liteImg 为缩放分级用的简化色块（与性别标点同一套逻辑）
            categories: [
                { key: '中国',     names: ['中国'],     label: { zh: '中国',     en: 'China' },          img: N + '中国.svg',     liteImg: N + '中国_lite.svg' },
                { key: '日本',     names: ['日本'],     label: { zh: '日本',     en: 'Japan' },          img: N + '日本.svg',     liteImg: N + '日本_lite.svg' },
                { key: '朝鲜',     names: ['朝鲜'],     label: { zh: '朝鲜',     en: 'Korea' },          img: N + '朝鲜.svg',     liteImg: N + '朝鲜_lite.svg' },
                { key: '美国',     names: ['美国'],     label: { zh: '美国',     en: 'USA' },            img: N + '美国.svg',     liteImg: N + '美国_lite.svg' },
                { key: '奥地利',   names: ['奥地利'],   label: { zh: '奥地利',   en: 'Austria' },        img: N + '奥地利.svg',   liteImg: N + '奥地利_lite.svg' },
                { key: '英国',     names: ['英国'],     label: { zh: '英国',     en: 'UK' },             img: N + '英国.svg',     liteImg: N + '英国_lite.svg' },
                { key: '法国',     names: ['法国'],     label: { zh: '法国',     en: 'France' },         img: N + '法国.svg',     liteImg: N + '法国_lite.svg' },
                { key: '德国',     names: ['德国'],     label: { zh: '德国',     en: 'Germany' },        img: N + '德国.svg',     liteImg: N + '德国_lite.svg' },
                { key: '葡萄牙',   names: ['葡萄牙'],   label: { zh: '葡萄牙',   en: 'Portugal' },       img: N + '葡萄牙.svg',   liteImg: N + '葡萄牙_lite.svg' },
                { key: '比利时',   names: ['比利时'],   label: { zh: '比利时',   en: 'Belgium' },        img: N + '比利时.svg',   liteImg: N + '比利时_lite.svg' },
                { key: '俄国',     names: ['俄国', '俄罗斯'], label: { zh: '俄国', en: 'Russia' },       img: N + '俄国.svg',     liteImg: N + '俄国_lite.svg' },
                { key: '苏联',     names: ['苏联'],     label: { zh: '苏联',     en: 'USSR' },           img: N + '苏联.svg',     liteImg: N + '苏联_lite.svg' },
                { key: '捷克',     names: ['捷克'],     label: { zh: '捷克',     en: 'Czechoslovakia' }, img: N + '捷克.svg',     liteImg: N + '捷克_lite.svg' },
                { key: '拉脱维亚', names: ['拉脱维亚'], label: { zh: '拉脱维亚', en: 'Latvia' },         img: N + '拉脱维亚.svg', liteImg: N + '拉脱维亚_lite.svg' },
                { key: '希腊',     names: ['希腊'],     label: { zh: '希腊',     en: 'Greece' },         img: N + '希腊.svg',     liteImg: N + '希腊_lite.svg' },
                { key: '波兰',     names: ['波兰'],     label: { zh: '波兰',     en: 'Poland' },         img: N + '波兰.svg',     liteImg: N + '波兰_lite.svg' },
                { key: '不详',     names: ['不详', '无国籍'], label: { zh: '不详', en: 'Unknown' },      img: N + '不详.svg',     liteImg: N + '不详_lite.svg' }
            ],
            fallbackKey: '不详',
            // 图例分栏（栏间分隔线、栏内两列网格由 CSS .legend-nationality 控制）
            legendGroups: [
                { label: { zh: '中国', en: 'China' },          keys: ['中国'] },
                { label: { zh: '东亚', en: 'East Asia' },      keys: ['日本', '朝鲜'] },
                { label: { zh: '北美', en: 'North America' },  keys: ['美国'] },
                { label: { zh: '西欧', en: 'Western Europe' }, keys: ['奥地利', '英国', '法国', '德国', '葡萄牙', '比利时'] },
                { label: { zh: '东欧/南欧/欧亚大陆', en: 'Eastern & Southern Europe, Eurasia' },
                  keys: ['俄国', '苏联', '捷克', '拉脱维亚', '希腊', '波兰'] },
                { label: { zh: '其他', en: 'Others' },         keys: ['不详'] }
            ]
        },
        origin: {
            titleKey: 'origin',
            background: 'assets/origin/background.png',
            // 按 Origin_CH 有序关键词 includes 匹配，分类与籍贯筛选完全一致；
            // 上海仅接收明确写"上海"的值，旧江苏县名归江苏（与筛选的民国区划约定相同）
            categories: [
                { key: '上海', keywords: ['上海'],
                  label: { zh: '上海', en: 'Shanghai' },
                  img: { zh: O + '上海.svg', en: O + 'shanghai.svg' }, liteImg: O + '上海_lite.svg' },
                { key: '江苏',
                  // 含今属上海的旧县名；杭州/吴县/南通为无省名前缀的城市别名
                  keywords: ['江苏', '吴县', '南通',
                             '松江', '淞江', '崇明', '川沙', '青浦', '宝山', '南汇', '金山', '嘉定', '奉贤', '华亭', '浦东'],
                  label: { zh: '江苏', en: 'Jiangsu' },
                  img: { zh: O + '江苏.svg', en: O + 'jiangsu.svg' }, liteImg: O + '江苏_lite.svg' },
                { key: '浙江', keywords: ['浙江', '杭州'],
                  label: { zh: '浙江', en: 'Zhejiang' },
                  img: { zh: O + '浙江.svg', en: O + 'zhejiang.svg' }, liteImg: O + '浙江_lite.svg' },
                { key: '安徽', keywords: ['安徽'],
                  label: { zh: '安徽', en: 'Anhui' },
                  img: { zh: O + '安徽.svg', en: O + 'anhui.svg' }, liteImg: O + '安徽_lite.svg' },
                { key: '广东', keywords: ['广东'],
                  label: { zh: '广东', en: 'Guangdong' },
                  img: { zh: O + '广东.svg', en: O + 'guangdong.svg' }, liteImg: O + '广东_lite.svg' },
                { key: '福建', keywords: ['福建'],
                  label: { zh: '福建', en: 'Fujian' },
                  img: { zh: O + '福建.svg', en: O + 'fujian.svg' }, liteImg: O + '福建_lite.svg' },
                { key: '湖南', keywords: ['湖南'],
                  label: { zh: '湖南', en: 'Hunan' },
                  img: { zh: O + '湖南.svg', en: O + 'hunan.svg' }, liteImg: O + '湖南_lite.svg' },
                { key: '湖北', keywords: ['湖北'],
                  label: { zh: '湖北', en: 'Hubei' },
                  img: { zh: O + '湖北.svg', en: O + 'hubei.svg' }, liteImg: O + '湖北_lite.svg' },
                { key: '四川', keywords: ['四川'],
                  label: { zh: '四川', en: 'Sichuan' },
                  img: { zh: O + '四川.svg', en: O + 'sichuan.svg' }, liteImg: O + '四川_lite.svg' },
                { key: '江西', keywords: ['江西'],
                  label: { zh: '江西', en: 'Jiangxi' },
                  img: { zh: O + '江西.svg', en: O + 'jiangxi.svg' }, liteImg: O + '江西_lite.svg' },
                { key: '山东', keywords: ['山东'],
                  label: { zh: '山东', en: 'Shandong' },
                  img: { zh: O + '山东.svg', en: O + 'shandong.svg' }, liteImg: O + '山东_lite.svg' },
                { key: '山西', keywords: ['山西'],
                  label: { zh: '山西', en: 'Shanxi' },
                  img: { zh: O + '山西.svg', en: O + 'shanxi.svg' }, liteImg: O + '山西_lite.svg' },
                { key: '陕西', keywords: ['陕西'],
                  label: { zh: '陕西', en: 'Shaanxi' },
                  img: { zh: O + '陕西.svg', en: O + 'shaanxi.svg' }, liteImg: O + '陕西_lite.svg' },
                { key: '河南', keywords: ['河南'],
                  label: { zh: '河南', en: 'Henan' },
                  img: { zh: O + '河南.svg', en: O + 'henan.svg' }, liteImg: O + '河南_lite.svg' },
                { key: '河北', keywords: ['河北'],
                  label: { zh: '河北', en: 'Hebei' },
                  img: { zh: O + '河北.svg', en: O + 'hebei.svg' }, liteImg: O + '河北_lite.svg' },
                { key: '广西', keywords: ['广西'],
                  label: { zh: '广西', en: 'Guangxi' },
                  img: { zh: O + '广西.svg', en: O + 'guangxi.svg' }, liteImg: O + '广西_lite.svg' },
                { key: '贵州', keywords: ['贵州'],
                  label: { zh: '贵州', en: 'Guizhou' },
                  img: { zh: O + '贵州.svg', en: O + 'guizhou.svg' }, liteImg: O + '贵州_lite.svg' },
                { key: '云南', keywords: ['云南'],
                  label: { zh: '云南', en: 'Yunnan' },
                  img: { zh: O + '云南.svg', en: O + 'yunnan.svg' }, liteImg: O + '云南_lite.svg' },
                { key: '辽宁', keywords: ['辽宁', '辽西'],
                  label: { zh: '辽宁', en: 'Liaoning' },
                  img: { zh: O + '辽宁.svg', en: O + 'liaoning.svg' }, liteImg: O + '辽宁_lite.svg' },
                { key: '台湾', keywords: ['台湾'],
                  label: { zh: '台湾', en: 'Taiwan' },
                  img: { zh: O + '台湾.svg', en: O + 'taiwan.svg' }, liteImg: O + '台湾_lite.svg' },
                { key: '天津', keywords: ['天津'],
                  label: { zh: '天津', en: 'Tianjin' },
                  img: { zh: O + '天津.svg', en: O + 'tianjin.svg' }, liteImg: O + '天津_lite.svg' },
                { key: '不详', keywords: ['不详'],
                  label: { zh: '不详', en: 'Unknown' },
                  img: { zh: O + '不详.svg', en: O + 'unknown.svg' }, liteImg: O + '不详_lite.svg' }
            ],
            // 仅控制图例展示顺序（按设计稿），不改变分类匹配与筛选顺序
            legendGroups: [
                { label: { zh: '', en: '' }, keys: [
                    '上海', '浙江',
                    '广东', '河南',
                    '湖南', '江西',
                    '山东', '山西',
                    '云南', '贵州',
                    '河北', '湖北',
                    '陕西', '四川',
                    '江苏', '福建',
                    '辽宁', '安徽',
                    '广西', '台湾',
                    '天津', '不详'
                ] }
            ],
            fallbackKey: '不详'
        }
    };

    window.AttrDisplay = {
        getCategory: function (mode, artist) {
            var conf = window.AttrDisplayConfig[mode];
            if (!conf) return null;
            var cats = conf.categories, i;
            if (artist) {
                var natl = (artist.Natl_CN || '').trim();
                var origin = (artist.Origin_CH || '').trim();
                for (i = 0; i < cats.length; i++) {
                    var c = cats[i];
                    if (c.match) {
                        if (c.match(artist)) return c;
                    } else if (c.names) {
                        if (c.names.indexOf(natl) !== -1) return c;
                    } else if (c.keywords && origin) {
                        for (var k = 0; k < c.keywords.length; k++) {
                            if (origin.indexOf(c.keywords[k]) !== -1) return c;
                        }
                    }
                }
            }
            for (i = 0; i < cats.length; i++) {
                if (cats[i].key === conf.fallbackKey) return cats[i];
            }
            return cats[cats.length - 1];
        },
        categoryImage: function (cat, lang, lite) {
            if (!cat) return '';
            var img = (lite && cat.liteImg) ? cat.liteImg : cat.img;
            return typeof img === 'string' ? img : (lang === 'en' ? img.en : img.zh);
        },
        categoryLabel: function (cat, lang) {
            if (!cat) return '';
            if (cat.labelKey) return window.t ? window.t(cat.labelKey) : cat.labelKey;
            return lang === 'en' ? cat.label.en : cat.label.zh;
        },
        getImage: function (mode, artist, lang, lite) {
            return this.categoryImage(this.getCategory(mode, artist), lang, lite);
        }
    };

    document.addEventListener('DOMContentLoaded', function () {
        var mount = document.getElementById('vue-legend-app');
        if (!mount || typeof Vue === 'undefined' || !window.GlobalStore) return;

        Vue.createApp({
            setup: function () {
                // 用 languageChanged 事件驱动而非 GlobalStore.language：
                // setLanguage 先改 store 再异步加载语言包，事件保证 t() 可用时才重算
                var currentLang = Vue.ref(window.currentLanguage || 'zh');
                var langHandler = function () { currentLang.value = window.currentLanguage || 'zh'; };

                Vue.onMounted(function () { document.addEventListener('languageChanged', langHandler); });
                Vue.onUnmounted(function () { document.removeEventListener('languageChanged', langHandler); });

                var activeConf = Vue.computed(function () {
                    var mode = window.GlobalStore.attributeDisplayMode;
                    return mode ? window.AttrDisplayConfig[mode] : null;
                });

                var legendTitle = Vue.computed(function () {
                    if (!activeConf.value) return '';
                    currentLang.value;
                    return window.t ? window.t(activeConf.value.titleKey) : activeConf.value.titleKey;
                });

                var legendBg = Vue.computed(function () {
                    return activeConf.value ? activeConf.value.background : '';
                });

                var legendGroups = Vue.computed(function () {
                    if (!activeConf.value) return [];
                    var lang = currentLang.value;
                    var conf = activeConf.value;
                    // 图例与地图标点同步：性别/国籍/籍贯模式下 zoom 小于阈值时显示 lite 图标
                    var mode = window.GlobalStore.attributeDisplayMode;
                    var lite = (mode === 'gender' || mode === 'nationality' || mode === 'origin') &&
                        window.GlobalStore.mapZoom < window.ATTR_LITE_MAX_ZOOM;
                    var toItem = function (c) {
                        return {
                            key: c.key,
                            icon: window.AttrDisplay.categoryImage(c, lang, lite),
                            lite: lite && !!c.liteImg,
                            label: window.AttrDisplay.categoryLabel(c, lang)
                        };
                    };
                    if (!conf.legendGroups) {
                        return [{ label: '', items: conf.categories.map(toItem) }];
                    }
                    var byKey = {};
                    conf.categories.forEach(function (c) { byKey[c.key] = c; });
                    return conf.legendGroups.map(function (g) {
                        return {
                            label: lang === 'en' ? g.label.en : g.label.zh,
                            items: g.keys.map(function (k) { return byKey[k]; }).filter(Boolean).map(toItem)
                        };
                    });
                });

                return {
                    GlobalStore: window.GlobalStore,
                    activeConf: activeConf,
                    legendTitle: legendTitle,
                    legendBg: legendBg,
                    legendGroups: legendGroups
                };
            }
        }).mount('#vue-legend-app');
    });
})();
