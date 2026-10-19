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
            // 精确匹配 Natl_CN（names 数组）；国籍素材仅一套（img 为字符串）；
            // 朝鲜无素材，约定用默认印章图（分 CN/EN），图例中同样以印章示意
            categories: [
                { key: '中国',     names: ['中国'],     label: { zh: '中国',     en: 'China' },          img: N + '中国.svg' },
                { key: '日本',     names: ['日本'],     label: { zh: '日本',     en: 'Japan' },          img: N + '日本.svg' },
                { key: '朝鲜',     names: ['朝鲜'],     label: { zh: '朝鲜',     en: 'Korea' },          img: N + '朝鲜.svg' },
                { key: '美国',     names: ['美国'],     label: { zh: '美国',     en: 'USA' },            img: N + '美国.svg' },
                { key: '奥地利',   names: ['奥地利'],   label: { zh: '奥地利',   en: 'Austria' },        img: N + '奥地利.svg' },
                { key: '英国',     names: ['英国'],     label: { zh: '英国',     en: 'UK' },             img: N + '英国.svg' },
                { key: '法国',     names: ['法国'],     label: { zh: '法国',     en: 'France' },         img: N + '法国.svg' },
                { key: '德国',     names: ['德国'],     label: { zh: '德国',     en: 'Germany' },        img: N + '德国.svg' },
                { key: '葡萄牙',   names: ['葡萄牙'],   label: { zh: '葡萄牙',   en: 'Portugal' },       img: N + '葡萄牙.svg' },
                { key: '比利时',   names: ['比利时'],   label: { zh: '比利时',   en: 'Belgium' },        img: N + '比利时.svg' },
                { key: '俄国',     names: ['俄国', '俄罗斯'], label: { zh: '俄国', en: 'Russia' },       img: N + '俄国.svg' },
                { key: '苏联',     names: ['苏联'],     label: { zh: '苏联',     en: 'USSR' },           img: N + '苏联.svg' },
                { key: '捷克',     names: ['捷克'],     label: { zh: '捷克',     en: 'Czechoslovakia' }, img: N + '捷克.svg' },
                { key: '拉脱维亚', names: ['拉脱维亚'], label: { zh: '拉脱维亚', en: 'Latvia' },         img: N + '拉脱维亚.svg' },
                { key: '希腊',     names: ['希腊'],     label: { zh: '希腊',     en: 'Greece' },         img: N + '希腊.svg' },
                { key: '波兰',     names: ['波兰'],     label: { zh: '波兰',     en: 'Poland' },         img: N + '波兰.svg' },
                { key: '不详',     names: ['不详', '无国籍'], label: { zh: '不详', en: 'Unknown' },      img: N + '不详.svg' }
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
            // 按 Origin_CH 有序关键词 includes 匹配；上海组排最前（先于省名匹配）
            categories: [
                { key: 'shanghai',
                  // 今属上海地区的归属开关：当前按民国区划，仅明确写"上海"的值归上海组，
                  // 旧江苏县名（松江/崇明/川沙…）由下方浙江江苏组接收。
                  // 若要改回"今属上海即归上海"，用下面这行替换生效的 keywords 即可
                  // （上海组先匹配，会直接捕获所有含县名的值，无需改动浙江江苏组）：
                  // keywords: ['上海', '松江', '淞江', '崇明', '川沙', '青浦', '宝山', '南汇', '金山', '嘉定', '奉贤', '华亭', '浦东'],
                  keywords: ['上海'],
                  label: { zh: '上海', en: 'Shanghai' },
                  img: { zh: O + '上海.svg', en: O + 'shanghai.svg' } },
                { key: 'zhejiang_jiangsu',
                  // 含今属上海的旧县名，接住"松江娄县""浦东南汇"等无省名前缀的值；
                  // 杭州/吴县/南通为无省名前缀的城市别名
                  keywords: ['浙江', '江苏', '杭州', '吴县', '南通',
                             '松江', '淞江', '崇明', '川沙', '青浦', '宝山', '南汇', '金山', '嘉定', '奉贤', '华亭', '浦东'],
                  label: { zh: '浙江江苏', en: 'Zhejiang & Jiangsu' },
                  img: { zh: O + '浙江江苏.svg', en: O + 'zhejiang_jiangsu.svg' } },
                { key: 'guangdong_fujian', keywords: ['广东', '福建'],
                  label: { zh: '广东福建', en: 'Guangdong & Fujian' },
                  img: { zh: O + '广东福建.svg', en: O + 'guangdong_fujian.svg' } },
                { key: 'henan_hebei', keywords: ['河南', '河北'],
                  label: { zh: '河南河北', en: 'Henan & Hebei' },
                  img: { zh: O + '河南河北.svg', en: O + 'henan_hebei.svg' } },
                { key: 'hunan_hubei', keywords: ['湖南', '湖北'],
                  label: { zh: '湖南湖北', en: 'Hunan & Hubei' },
                  img: { zh: O + '湖南湖北.svg', en: O + 'hunan_hubei.svg' } },
                { key: 'jiangxi', keywords: ['江西'],
                  label: { zh: '江西', en: 'Jiangxi' },
                  img: { zh: O + '江西.svg', en: O + 'jiangxi.svg' } },
                { key: 'shandong', keywords: ['山东'],
                  label: { zh: '山东', en: 'Shandong' },
                  img: { zh: O + '山东.svg', en: O + 'shandong.svg' } },
                { key: 'shanxi_shanxi', keywords: ['山西', '陕西'],
                  label: { zh: '山西陕西', en: 'Shanxi & Shaanxi' },
                  img: { zh: O + '山西陕西.svg', en: O + 'shanxi_shanxi.svg' } },
                { key: 'yunnan_sichuan_guizhou', keywords: ['云南', '四川', '贵州'],
                  label: { zh: '云南四川贵州', en: 'Yunnan, Sichuan & Guizhou' },
                  img: { zh: O + '云南四川贵州.svg', en: O + 'yunnan_sichuan_guizhou.svg' } },
                // 兜底：安徽、不详、广西/台湾/辽宁/天津 等零星值
                { key: 'others', keywords: [],
                  label: { zh: '其他', en: 'Others' },
                  img: { zh: O + '其他.svg', en: O + 'others.svg' } }
            ],
            fallbackKey: 'others'
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
                    // 图例与地图标点同步：性别模式下 zoom 小于阈值时显示 lite 图标
                    var lite = window.GlobalStore.attributeDisplayMode === 'gender' &&
                        window.GlobalStore.mapZoom < window.GENDER_LITE_MAX_ZOOM;
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
