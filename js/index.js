// 背景图预加载，加载完成后触发从左往右展开动画
(function () {
    var img = new Image();
    img.src = 'assets/others/loginBackground.jpg';
    function reveal() {
        requestAnimationFrame(function () {
            document.body.classList.add('reveal');
        });
    }
    if (img.complete) {
        reveal();
    } else {
        img.onload = reveal;
        img.onerror = reveal;
    }
    // 兜底：2 秒后无论是否加载完成都触发
    setTimeout(function () {
        if (!document.body.classList.contains('reveal')) {
            reveal();
        }
    }, 2000);
})();

// ========== 背景音乐控制 ==========
(function () {
    var audio = document.getElementById('bgm-audio');
    var toggle = document.getElementById('bgm-toggle');

    if (!audio || !toggle) return;

    var isPlaying = false;

    function setPlaying() {
        isPlaying = true;
        toggle.classList.remove('muted');
        toggle.setAttribute('title', '静音');
        toggle.setAttribute('aria-label', '静音');
    }

    function setMuted() {
        isPlaying = false;
        toggle.classList.add('muted');
        toggle.setAttribute('title', '播放背景音乐');
        toggle.setAttribute('aria-label', '播放背景音乐');
    }

    // 页面加载时尝试自动播放
    audio.play().then(function () {
        setPlaying();
    }).catch(function () {
        setMuted();
    });

    // 点击切换
    toggle.addEventListener('click', function () {
        if (isPlaying) {
            audio.pause();
            setMuted();
        } else {
            audio.play().then(function () {
                setPlaying();
            }).catch(function (err) {
                console.warn('BGM 播放被阻止:', err);
            });
        }
    });
})();

document.getElementById('loading-overlay').style.display = 'none';

// ========== 密码门禁 ==========
Vue.createApp({
    setup() {
        const password = Vue.ref('');
        const errorMsg = Vue.ref('');
        const showError = Vue.ref(false);
        const pwInput = Vue.ref(null);
        const loading = Vue.ref(false);

        const t = (key) => {
            void (window._i18nTick && window._i18nTick.n);
            if (window.I18N && window.I18N.t) return window.I18N.t(key);
            return window.t ? window.t(key) : key;
        };


        Vue.onMounted(() => {
            var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
            if (!isMobile) return;

            const el = pwInput.value;
            const titleHero = document.getElementById('title-hero');
            if (!el || !titleHero) return;

            var focused = false;

            function hideTitle() { focused = true; titleHero.style.top = '-200px'; }
            function restoreTitle() { focused = false; titleHero.style.top = (window.innerHeight * 0.45) + 'px'; }

            el.addEventListener('focus', hideTitle);
            el.addEventListener('blur', restoreTitle);

            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', function () {
                    if (!focused && window.visualViewport.height >= window.innerHeight * 0.9) restoreTitle();
                });
            }
        });

        const checkPassword = async () => {
            if (!password.value || loading.value) return;
            loading.value = true;
            try {
                const ok = await window.AuthUtils.verifyAccessPassword(password.value);
                if (ok) {
                    window.AuthUtils.setUnlocked();
                    const lang = window.currentLanguage || 'zh';
                    sessionStorage.setItem('fromIndex', 'true');
                    window.location.href = `mainMap.html?lang=${lang}`;
                } else {
                    errorMsg.value = t('password_incorrect');
                    showError.value = true;
                    password.value = '';
                    setTimeout(() => { showError.value = false; }, 500);
                    if (pwInput.value) pwInput.value.focus();
                }
            } catch (e) {
                errorMsg.value = 'Server error, please try again';
                showError.value = true;
                setTimeout(() => { showError.value = false; }, 2000);
            }
            loading.value = false;
        };

        return { password, errorMsg, showError, pwInput, loading, t, checkPassword };
    }
}).mount('#password-gate-app');

// ========== 首页信息图标（移动端点击切换） ==========
(function () {
    var wrap = document.getElementById('title-info');
    if (!wrap) return;
    wrap.addEventListener('click', function (e) {
        e.stopPropagation();
        wrap.classList.toggle('visible');
    });
    document.addEventListener('click', function () {
        wrap.classList.remove('visible');   // 点击其它处关闭
    });
})();

// ========== 项目介绍弹窗 ==========
(function () {
    var overlay = document.getElementById('about-overlay');
    var button = document.getElementById('about-button');
    var closeBtn = document.getElementById('about-close');
    var content = document.getElementById('about-content');
    var dotsBox = document.getElementById('about-dots');

    if (!overlay || !button) return;

    var cache = {};   // lang -> html 字符串
    var modalHistoryPushed = false;

    function currentLang() {
        return window.currentLanguage === 'en' ? 'en' : 'zh';
    }

    function isOpen() {
        return overlay.classList.contains('visible');
    }

    // ===== 翻页轮播 =====
    var slides = [];
    var current = 0;
    var AUTOPLAY_INTERVAL = 20000;
    var COMPACT_AUTOPLAY_INTERVAL = 10000;
    var autoplayTimer = null;

    function restartAutoplay() {
        if (autoplayTimer) clearInterval(autoplayTimer);
        autoplayTimer = setInterval(function () {
            if (!isOpen() || slides.length < 2) return;
            goTo((current + 1) % slides.length);
        }, isCompactMode() ? COMPACT_AUTOPLAY_INTERVAL : AUTOPLAY_INTERVAL);
    }

    // ===== 移动端压缩模式：按可用高度自动拆分为更多页 =====
    function isCompactMode() {
        return window.matchMedia('(max-width: 768px), (max-height: 500px)').matches;
    }

    function newSlideEl() {
        var s = document.createElement('section');
        s.className = 'about-slide';
        return s;
    }

    function isOverflow(page) {
        return page.scrollHeight > page.clientHeight + 1;
    }

    function isHeading(el) {
        var t = el.tagName ? el.tagName.toLowerCase() : '';
        return t === 'h1' || t === 'h2';
    }

    // 拆分句子：中文按句末标点；英文仅在「标点+空格+大写字母开头的词」处切，避免拆散 P. Y. Zhang 等缩写
    function splitSentences(text) {
        var parts;
        if (/[一-鿿]/.test(text)) {
            parts = text.match(/[^。；！？]*[。；！？]?/g);
        } else {
            parts = text.split(/(?<=[^A-Z][.!?])\s+(?=[A-Z][a-z])/);
        }
        var out = [];
        if (parts) {
            for (var i = 0; i < parts.length; i++) {
                if (parts[i] && parts[i].trim().length > 0) out.push(parts[i]);
            }
        }
        return out.length ? out : [text];
    }

    function splitParagraph(block) {
        var sents = splitSentences(block.textContent);
        if (sents.length <= 1) return null;
        var pieces = [];
        for (var i = 0; i < sents.length; i++) {
            var p = document.createElement('p');
            if (block.className) p.className = block.className;
            p.textContent = sents[i];
            pieces.push(p);
        }
        return pieces;
    }

    function listStart(block) {
        var s = block.getAttribute('start');
        return s ? parseInt(s, 10) : 1;
    }

    function splitList(block) {
        var items = [];
        for (var i = 0; i < block.children.length; i++) items.push(block.children[i]);
        if (items.length === 0) return null;
        var isOl = block.tagName.toLowerCase() === 'ol';

        function makeItem(liContent, start) {
            var sub = document.createElement(isOl ? 'ol' : 'ul');
            if (isOl) sub.setAttribute('start', String(start));
            sub.style.margin = '0';
            sub.appendChild(liContent);
            return sub;
        }

        if (items.length === 1) {
            // 单个 li 仍超高：按句子拆其文本
            var sents = splitSentences(items[0].textContent);
            if (sents.length <= 1) return null;
            var out = [];
            for (var k = 0; k < sents.length; k++) {
                var newLi = document.createElement('li');
                newLi.textContent = sents[k];
                out.push(makeItem(newLi, listStart(block)));
            }
            return out;
        }

        var pieces = [];
        for (var j = 0; j < items.length; j++) {
            pieces.push(makeItem(items[j].cloneNode(true), listStart(block) + j));
        }
        return pieces;
    }

    function splitBlock(block) {
        var tag = block.tagName ? block.tagName.toLowerCase() : '';
        if (tag === 'ol' || tag === 'ul') return splitList(block);
        if (tag === 'p') return splitParagraph(block);
        return null;
    }

    function paginateCompact() {
        var sections = content.querySelectorAll('.about-slide');
        if (sections.length === 0) return;

        var blocks = [];
        for (var i = 0; i < sections.length; i++) {
            var sec = sections[i];
            while (sec.firstChild) {
                var node = sec.firstChild;
                sec.removeChild(node);
                if (node.nodeType === 1) blocks.push(node);
            }
        }
        content.innerHTML = '';

        if (!content.clientHeight) {
            // 无法测量高度：还原为原始分页
            for (var r = 0; r < blocks.length; r++) {
                var s2 = newSlideEl();
                s2.appendChild(blocks[r]);
                content.appendChild(s2);
            }
            return;
        }

        var page = newSlideEl();
        content.appendChild(page);
        var queue = blocks;

        while (queue.length) {
            var block = queue.shift();

            // h1/h2 必须在一页开头：非空页则另起新页
            if (isHeading(block) && page.childNodes.length > 0) {
                page = newSlideEl();
                content.appendChild(page);
            }

            page.appendChild(block);
            if (!isOverflow(page)) continue;

            page.removeChild(block);

            // 可拆分的块先拆成小块，让小块继续填充当前页剩余空间，避免过早换页产生稀疏页
            var pieces = splitBlock(block);
            if (pieces && pieces.length > 1) {
                queue = pieces.concat(queue);
                continue;
            }

            // 不可拆分的块：放不下就换到新页
            if (page.childNodes.length > 0) {
                page = newSlideEl();
                content.appendChild(page);
            }
            page.appendChild(block);
        }
    }

    // 按可用高度整体缩放正文字号（子元素均用 em，随基准字号联动），
    // 让固定分页在小屏上也能装下、不与密码框重叠。装不下时返回 false，交给重新分页兜底。
    var BASE_FONT = 14;
    var MIN_FONT = 10;   // 低于此仍装不下就改用重新分页兜底

    function worstSlideHeight() {
        var secs = content.querySelectorAll('.about-slide');
        var need = 0;
        for (var i = 0; i < secs.length; i++) {
            if (secs[i].clientHeight > 0) need = Math.max(need, secs[i].scrollHeight);
        }
        return { need: need, avail: secs.length ? secs[0].clientHeight : 0 };
    }

    function fitsAt(fs) {
        content.style.fontSize = fs + 'px';
        var m = worstSlideHeight();
        // scrollHeight 不会小于 clientHeight，故 need<=avail 等价于「没有溢出」
        return !!m.avail && m.need <= m.avail;
    }

    function fitContentScale() {
        if (isCompactMode()) return true;   // 小屏走媒体查询里的 12px + 重新分页

        content.style.fontSize = '';
        var m0 = worstSlideHeight();
        if (!m0.avail) return true;         // 内容尚未就绪，无需缩放
        if (m0.need <= m0.avail) return true;

        // 字号越大内容越高，单调；二分找「装得下的最大字号」
        if (!fitsAt(MIN_FONT)) { content.style.fontSize = ''; return false; }
        var lo = MIN_FONT, hi = BASE_FONT;
        for (var i = 0; i < 12; i++) {
            var mid = (lo + hi) / 2;
            if (fitsAt(mid)) lo = mid; else hi = mid;
        }
        content.style.fontSize = lo.toFixed(2) + 'px';
        return true;
    }

    function buildCarousel() {
        // 先尝试缩放字号保持既有分页；仍装不下才按可用高度重新分页
        if (isCompactMode() || !fitContentScale()) {
            content.style.fontSize = '';
            paginateCompact();
        }
        slides = content.querySelectorAll('.about-slide');
        current = 0;
        if (dotsBox) dotsBox.innerHTML = '';
        for (var i = 0; i < slides.length; i++) {
            (function (idx) {
                var b = document.createElement('button');
                b.className = 'about-dot';
                b.setAttribute('aria-label', (idx + 1) + ' / ' + slides.length);
                b.addEventListener('click', function () { goTo(idx); restartAutoplay(); });
                dotsBox.appendChild(b);
            })(i);
        }
        var showNav = slides.length > 1;
        if (dotsBox) dotsBox.style.display = showNav ? '' : 'none';
        updateSlide();
        restartAutoplay();
    }

    function updateSlide() {
        for (var i = 0; i < slides.length; i++) {
            slides[i].classList.toggle('active', i === current);
        }
        if (dotsBox) {
            var dots = dotsBox.querySelectorAll('.about-dot');
            for (var j = 0; j < dots.length; j++) {
                dots[j].classList.toggle('active', j === current);
            }
        }
    }

    function goTo(i) {
        if (i < 0 || i >= slides.length || i === current) return;
        current = i;
        updateSlide();
    }

    function renderContent() {
        var lang = currentLang();
        if (cache[lang]) {
            content.innerHTML = cache[lang];
            buildCarousel();
            return;
        }
        content.innerHTML = '<p style="text-align:center; padding:30px 0;">Loading...</p>';
        buildCarousel();
        fetch('locales/' + lang + '.html')
            .then(function (res) {
                if (!res.ok) throw new Error('Failed to load about content: ' + res.status);
                return res.text();
            })
            .then(function (html) {
                cache[lang] = html;
                if (currentLang() === lang) {
                    content.innerHTML = html;
                    buildCarousel();
                }
            })
            .catch(function (err) {
                console.error(err);
                content.innerHTML = '<p style="text-align:center; padding:30px 0;">加载失败，请稍后重试。</p>';
                buildCarousel();
            });
    }

    function open() {
        if (!isOpen()) {
            renderContent();
        }
        overlay.classList.add('visible');
        if (!modalHistoryPushed) {
            history.pushState({ aboutModal: true }, '');
            modalHistoryPushed = true;
        }
    }

    function close() {
        overlay.classList.remove('visible');
    }

    button.addEventListener('click', function () {
        if (isOpen()) {
            close();
        } else {
            open();
        }
    });

    closeBtn.addEventListener('click', close);

    // 触摸滑动翻页
    var touchX = 0;
    content.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    content.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) {
            if (dx < 0) { goTo(current + 1); } else { goTo(current - 1); }
            restartAutoplay();
        }
    }, { passive: true });

    // 鼠标滚轮翻页
    var wheelCooldown = false;
    content.addEventListener('wheel', function (e) {
        if (!isOpen() || slides.length < 2) return;
        e.preventDefault();
        if (wheelCooldown || e.deltaY === 0) return;
        wheelCooldown = true;
        if (e.deltaY > 0) { goTo(current + 1); } else { goTo(current - 1); }
        restartAutoplay();
        setTimeout(function () { wheelCooldown = false; }, 600);
    }, { passive: false });

    // 点击遮罩空白处关闭
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            close();
        }
    });

    // Esc 关闭
    document.addEventListener('keydown', function (e) {
        if (!isOpen()) return;
        if (e.key === 'Escape') {
            close();
        } else if (e.key === 'ArrowLeft') {
            goTo(current - 1);
            restartAutoplay();
        } else if (e.key === 'ArrowRight') {
            goTo(current + 1);
            restartAutoplay();
        }
    });

    // 移动端返回键 / 浏览器后退：关闭弹窗
    window.addEventListener('popstate', function () {
        modalHistoryPushed = false;
        if (isOpen()) {
            close();
        }
    });

    // 弹窗打开时切换语言，重新加载内容
    document.addEventListener('languageChanged', function () {
        if (isOpen()) {
            content.innerHTML = '';
            renderContent();
        }
    });

    // 屏幕尺寸变化（如旋转）时，弹窗打开则按新高度重新分页
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        if (!isOpen()) return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if (isOpen()) renderContent();
        }, 200);
    });
})();
