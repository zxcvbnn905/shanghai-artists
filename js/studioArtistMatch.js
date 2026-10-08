// 将排除名单（studio_artists_list.csv）中的艺术家富化到对应 studio，
// 供 studio 右侧边栏逐条内联展示（含可折叠详情与图片）。
// 匹配依据：名字 + period + 地址（数据存在表述出入，做容错）。

(function () {
    'use strict';

    // ---------- 工具函数 ----------

    // 去掉（…）与 (…) 注解（如「名仅存首字母…」「(surname spelling uncertain…)」）
    function stripAnnotation(s) {
        return (s || '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
    }

    // 归一化名字：小写，只保留字母/数字/中文，去掉空白与标点
    function normalizeName(s) {
        return stripAnnotation(s).toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
    }

    // 英文姓氏：逗号前部分，仅保留字母（"Sanzetti, Sam. M. L." -> "sanzetti"）
    function surnameOf(s) {
        if (!s) return '';
        const first = s.split(',')[0];
        return first.toLowerCase().replace(/[^a-z]/g, '');
    }

    function normalizeAddr(s) {
        return (s || '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
    }

    function addressMatch(e, s) {
        const a = normalizeAddr(e.Hist_Add_C);
        const b = normalizeAddr(s.Hist_Add_C);
        if (!a || !b) return false;
        if (a === b) return true;
        if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
        return false;
    }

    function coordMatch(e, s) {
        const elon = parseFloat(e.Co_Long), elat = parseFloat(e.Co_Lat);
        const slon = parseFloat(s.Co_Long), slat = parseFloat(s.Co_Lat);
        if (isNaN(elon) || isNaN(slon)) return false;
        return Math.abs(elon - slon) <= 0.0005 && Math.abs(elat - slat) <= 0.0005;
    }

    function parseYears(period) {
        const m = (period || '').match(/\d{4}/g) || [];
        if (m.length === 0) return null;
        return [parseInt(m[0], 10), parseInt(m[m.length - 1], 10)];
    }

    function periodOverlap(a, b) {
        const pa = parseYears(a), pb = parseYears(b);
        if (!pa || !pb) return false;
        return pa[0] <= pb[1] && pb[0] <= pa[1];
    }

    // 名字匹配强度：4=全文精确，3=包含，2=英文姓氏相同
    function nameMatchStrength(row, entry) {
        const rEn = normalizeName(row.Name_EN), eEn = normalizeName(entry.name_en);
        const rCn = normalizeName(row.Name_CN), eCn = normalizeName(entry.name_cn);
        if (rEn && eEn && rEn === eEn) return 4;
        if (rCn && eCn && rCn === eCn) return 4;
        if (rEn && eEn && (rEn.includes(eEn) || eEn.includes(rEn))) return 3;
        if (rCn && eCn && (rCn.includes(eCn) || eCn.includes(rCn))) return 3;
        const rSur = surnameOf(row.Name_EN), eSur = surnameOf(entry.name_en);
        if (rSur && eSur && rSur === eSur && rSur.length >= 3) return 2;
        return 0;
    }

    // ---------- 解析 studio 艺术家列表 ----------

    function splitLines(text) {
        if (!text) return [];
        return text.split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .map(l => {
                const stripped = l.replace(/^\s*\d+\s*[.、,]\s*/, '');
                const name = stripped.split('|')[0].trim();
                return { name: name, summary: stripped };
            });
    }

    function buildEntries(studio) {
        const cnLines = splitLines(studio['艺术ists_Information_CN']);
        const enLines = splitLines(studio['Artists_Information_EN']);
        const n = Math.max(cnLines.length, enLines.length);
        const entries = [];
        for (let i = 0; i < n; i++) {
            const cn = cnLines[i] || {};
            const en = enLines[i] || {};
            entries.push({
                name_cn: cn.name || '',
                name_en: en.name || '',
                summary_cn: cn.summary || '',
                summary_en: en.summary || '',
                excluded: false,
                detail: null
            });
        }
        return entries;
    }

    // ---------- 匹配 ----------

    function nameMatchInStudio(row, studio) {
        for (const entry of studio._artistEntries) {
            if (nameMatchStrength(row, entry) >= 2) return true;
        }
        return false;
    }

    function findBestStudio(row, studios) {
        let best = null, bestScore = 0;
        for (const s of studios) {
            const addr = addressMatch(row, s);
            const coord = coordMatch(row, s);
            // 必须在地理上接近（地址或坐标），避免仅凭同名把不同地点的同一位艺术家挂到错误 studio
            if (!addr && !coord) continue;
            let score = 0;
            if (addr) score += 3;
            if (coord) score += 2;
            if (periodOverlap(row.Period, s.Period)) score += 1;
            if (nameMatchInStudio(row, s)) score += 3;
            if (score > bestScore) { bestScore = score; best = s; }
        }
        return best;
    }

    // 在指定 studio 内找未占用的、强度 >= minStrength 的条目
    function findEntry(row, studio, minStrength) {
        let best = null, bestStrength = 0;
        for (const entry of studio._artistEntries) {
            if (entry.excluded) continue;
            const st = nameMatchStrength(row, entry);
            if (st >= minStrength && st > bestStrength) {
                bestStrength = st;
                best = entry;
            }
        }
        return best;
    }

    function buildSummary(row, lang) {
        if (lang === 'cn') {
            return [row.Name_CN, row.Sex, row.YOB_YOD, row.Natl_CN].filter(Boolean).join(' | ');
        }
        return [row.Name_EN, row.Sex, row.YOB_YOD, row.Natl_EN].filter(Boolean).join(' | ');
    }

    function claim(entry, row) {
        entry.excluded = true;
        entry.detail = row;
        entry.name_cn = row.Name_CN || entry.name_cn;
        entry.name_en = row.Name_EN || entry.name_en;
    }

    function appendEntry(studio, row) {
        studio._artistEntries.push({
            name_cn: row.Name_CN || '',
            name_en: row.Name_EN || '',
            summary_cn: buildSummary(row, 'cn'),
            summary_en: buildSummary(row, 'en'),
            excluded: true,
            detail: row
        });
    }

    window.enrichStudios = function (studios, excludedArtists) {
        if (!studios || !excludedArtists) return;

        studios.forEach(function (s) {
            s._artistEntries = buildEntries(s);
        });

        const rows = (excludedArtists || []).filter(function (r) { return r && r.ID; });
        const unmatched = [];
        const attached = new Set();

        // 第一遍：优先精确全文匹配（避免同姓把更具体的条目抢占）
        rows.forEach(function (row) {
            const studio = findBestStudio(row, studios);
            if (!studio) return;
            const entry = findEntry(row, studio, 4);
            if (entry) {
                claim(entry, row);
                attached.add(row.ID);
            }
        });

        // 第二遍：剩余行用姓氏匹配，或作为追加条目
        rows.forEach(function (row) {
            if (attached.has(row.ID)) return;
            const studio = findBestStudio(row, studios);
            if (!studio) {
                unmatched.push(row);
                return;
            }
            const entry = findEntry(row, studio, 2);
            if (entry) {
                claim(entry, row);
            } else {
                appendEntry(studio, row);
            }
        });

        window.unmatchedExcluded = unmatched;
        unmatched.forEach(function (row) {
            console.warn('[studioArtistMatch] 未匹配到 studio，保留原 artist 标点：',
                row.Name_CN || row.Name_EN, '| ID=', row.ID, '| 地址=', row.Hist_Add_C);
        });
        console.log('[studioArtistMatch] 富化完成，未匹配数量：', unmatched.length);
    };
})();
