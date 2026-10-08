(function() {
    'use strict';

    var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (!isMobile) return;

    var html = document.documentElement;
    var body = document.body;
    var hideAttempted = false;
    var restoreTimer = null;
    var rafId = null;

    var originalOverflow;
    var originalHeight;
    var originalBodyOverflow;
    var originalBodyHeight;
    var originalBodyMinHeight;

    function restoreOverflow() {
        html.style.overflow = originalOverflow || '';
        html.style.height = originalHeight || '';
        body.style.overflow = originalBodyOverflow || '';
        body.style.height = originalBodyHeight || '';
        body.style.minHeight = originalBodyMinHeight || '';
        window.scrollTo(0, 0);
        restoreTimer = null;
    }

    function triggerAddressBarHide() {
        if (hideAttempted) return;
        hideAttempted = true;

        var rotateHint = document.getElementById('rotate-hint');
        if (rotateHint) {
            var hintStyle = window.getComputedStyle(rotateHint);
            if (hintStyle.display !== 'none') {
                hideAttempted = false;
                return;
            }
        }

        originalOverflow = html.style.overflow;
        originalHeight = html.style.height;
        originalBodyOverflow = body.style.overflow;
        originalBodyHeight = body.style.height;
        originalBodyMinHeight = body.style.minHeight;

        html.style.overflow = 'visible';
        html.style.height = 'auto';
        body.style.overflow = 'visible';
        body.style.height = 'auto';
        body.style.minHeight = (window.innerHeight + 1) + 'px';

        body.offsetHeight;
        window.scrollTo(0, 1);

        if (restoreTimer) clearTimeout(restoreTimer);
        restoreTimer = setTimeout(restoreOverflow, 250);

        rafId = requestAnimationFrame(function() {
            rafId = requestAnimationFrame(function() {
                if (restoreTimer === null) return;
                restoreOverflow();
            });
        });
    }

    function setupVisualViewportListener() {
        if (!window.visualViewport) return;

        var lastHeight = window.visualViewport.height;
        window.visualViewport.addEventListener('resize', function() {
            var newHeight = window.visualViewport.height;
            if (Math.abs(newHeight - lastHeight) > 50) {
                lastHeight = newHeight;
                if (window.map && typeof window.map.resize === 'function') {
                    window.map.resize();
                }
            }
        });
    }

    function setupFullscreenButton() {
        var btn = document.createElement('button');
        btn.id = 'fs-toggle-btn';
        btn.innerHTML = '⛶';
        btn.title = 'Fullscreen';
        btn.setAttribute('aria-label', 'Toggle fullscreen mode');

        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            zIndex: '9999',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0,0,0,0.35)',
            color: '#fff',
            fontSize: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0.5',
            transition: 'opacity 0.2s',
            WebkitTapHighlightColor: 'transparent',
            padding: '0'
        });

        btn.addEventListener('pointerenter', function() { btn.style.opacity = '1'; });
        btn.addEventListener('pointerleave', function() { btn.style.opacity = '0.5'; });

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            } else {
                var el = document.documentElement;
                if (el.requestFullscreen) {
                    el.requestFullscreen().catch(function() {});
                } else if (el.webkitRequestFullscreen) {
                    el.webkitRequestFullscreen();
                }
            }
        });

        document.body.appendChild(btn);

        var onFsChange = function() {
            if (window.map && typeof window.map.resize === 'function') {
                setTimeout(function() { window.map.resize(); }, 350);
            }
        };
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
    }

    function setupOrientationListener() {
        var getOrientation = function() {
            return window.screen.orientation
                ? window.screen.orientation.type
                : (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
        };
        var lastOrientation = getOrientation();

        var onOrientationChange = function() {
            var newOrientation = getOrientation();
            if (newOrientation === lastOrientation) return;
            lastOrientation = newOrientation;

            hideAttempted = false;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            if (restoreTimer) {
                clearTimeout(restoreTimer);
                restoreTimer = null;
            }

            setTimeout(function() {
                if (window.innerWidth > window.innerHeight) {
                    triggerAddressBarHide();
                }
                if (window.map && typeof window.map.resize === 'function') {
                    setTimeout(function() { window.map.resize(); }, 300);
                }
            }, 400);
        };

        window.addEventListener('orientationchange', onOrientationChange);
        if (window.screen.orientation && window.screen.orientation.addEventListener) {
            window.screen.orientation.addEventListener('change', onOrientationChange);
        }
    }

    function init() {
        setupVisualViewportListener();
        setupFullscreenButton();
        setupOrientationListener();

        if (document.readyState === 'complete') {
            setTimeout(triggerAddressBarHide, 300);
        } else {
            window.addEventListener('load', function() {
                setTimeout(triggerAddressBarHide, 300);
            });
        }
    }

    init();
})();
