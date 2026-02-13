document.addEventListener('DOMContentLoaded', function () {
    var viewport = document.querySelector('.page-slider-viewport');
    var slider = document.querySelector('.page-slider');
    var navBar = document.querySelector('.nav-bar');
    if (!viewport || !slider) return;

    // 0 = home, 1 = work
    var activeIndex = 0;
    var startX = 0;
    var startY = 0;
    var lastX = 0;
    var lastT = 0;
    var isTracking = false;
    var isHorizontal = null;

    var viewportWidth = 0;
    var navBarWidth = navBar ? navBar.getBoundingClientRect().width : 32;
    var slideWidth = 0;
    var pendingX = null;
    var rafId = null;

    var SNAP_RATIO = 0.25; // % of width dragged to trigger page change
    var VELOCITY_THRESHOLD = 0.5; // px/ms (500px/s)
    var DIRECTION_RATIO = 1.4; // horizontal must be dominant by this factor
    var INTENT_THRESHOLD = 10; // px before deciding horizontal vs vertical

    function getWidth() {
        return viewport.getBoundingClientRect().width || window.innerWidth;
    }

    function setActiveIndex(nextIndex) {
        activeIndex = nextIndex;
        if (activeIndex === 1) slider.classList.add('page-slider--work-active');
        else slider.classList.remove('page-slider--work-active');
    }

    function setTranslateX(px) {
        pendingX = px;
        if (rafId != null) return;

        var req = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
        rafId = req(function () {
            rafId = null;
            if (pendingX == null) return;
            slider.style.transform = 'translate3d(' + pendingX + 'px, 0, 0)';
        });
    }

    function snapTo(index) {
        var w = viewportWidth || getWidth();
        navBarWidth = navBar ? navBar.getBoundingClientRect().width : 32;
        slideWidth = w - navBarWidth;
        slider.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.9, 0.2, 1)';
        setActiveIndex(index);
        setTranslateX(-activeIndex * slideWidth);
    }

    // Expose snapTo so other scripts can navigate pages
    window.snapToPage = snapTo;

    // Ensure correct position after resize/orientation change
    window.addEventListener('resize', function () {
        viewportWidth = getWidth();
        navBarWidth = navBar ? navBar.getBoundingClientRect().width : 32;
        slideWidth = viewportWidth - navBarWidth;
        slider.style.transition = 'none';
        setTranslateX(-activeIndex * slideWidth);
        // Force reflow-ish timing so future snaps animate
        setTimeout(function () {
            slider.style.transition = '';
        }, 0);
    });

    viewport.addEventListener('touchstart', function (event) {
        if (!event.touches || event.touches.length !== 1) return;
        viewportWidth = getWidth();
        var touch = event.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        lastX = startX;
        lastT = performance.now ? performance.now() : Date.now();
        isTracking = true;
        isHorizontal = null;
        slider.style.transition = 'none';
    }, { passive: true });

    viewport.addEventListener('touchmove', function (event) {
        if (!isTracking || !event.touches || event.touches.length !== 1) return;

        var touch = event.touches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;

        if (isHorizontal === null) {
            var adx = Math.abs(dx);
            var ady = Math.abs(dy);
            if (adx > INTENT_THRESHOLD && adx > ady * DIRECTION_RATIO) isHorizontal = true;
            else if (ady > INTENT_THRESHOLD && ady > adx * DIRECTION_RATIO) isHorizontal = false;
        }

        if (isHorizontal !== true) return;

        event.preventDefault();

        var w = slideWidth || (viewportWidth - (navBar ? navBar.getBoundingClientRect().width : 32));
        var base = -activeIndex * w;
        var next = base + dx;

        // resistance when dragging past the edges
        if (next > 0) next = next * 0.35;
        if (next < -w) next = -w + (next + w) * 0.35;

        setTranslateX(next);

        lastX = touch.clientX;
        lastT = performance.now ? performance.now() : Date.now();
    }, { passive: false });

    viewport.addEventListener('touchend', function (event) {
        if (!isTracking) return;
        isTracking = false;

        var touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;

        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;
        if (isHorizontal !== true) return;

        var now = performance.now ? performance.now() : Date.now();
        var dt = Math.max(1, now - lastT);
        var v = (touch.clientX - lastX) / dt; // px/ms (positive = right)

        var w = slideWidth || (viewportWidth - (navBar ? navBar.getBoundingClientRect().width : 32));
        var shouldGoNext = dx < -w * SNAP_RATIO || v < -VELOCITY_THRESHOLD;
        var shouldGoPrev = dx > w * SNAP_RATIO || v > VELOCITY_THRESHOLD;

        if (activeIndex === 0 && shouldGoNext) snapTo(1);
        else if (activeIndex === 1 && shouldGoPrev) snapTo(0);
        else snapTo(activeIndex);
    }, { passive: true });

    viewport.addEventListener('touchcancel', function () {
        if (!isTracking) return;
        isTracking = false;
        snapTo(activeIndex);
    }, { passive: true });

    // Initialize transform so dragging always starts from a known position
    viewportWidth = getWidth();
    navBarWidth = navBar ? navBar.getBoundingClientRect().width : 32;
    slideWidth = viewportWidth - navBarWidth;
    snapTo(activeIndex);
});

