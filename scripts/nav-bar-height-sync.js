(function() {
    function measureNavCaseInlineSize(navCase) {
        if (!navCase) return 0;
        var pm = window.pretextMeasure;
        if (!pm) return Math.ceil(navCase.getBoundingClientRect().height);
        // Vertical labels: inline-size equals horizontal text width + inline padding/border,
        // measured purely from text so we never depend on a stale DOM layout pass.
        var measured = pm.measureInlineBoxWidth(navCase);
        // Small cushion for iOS WebKit subpixel rounding that can clip the last grapheme.
        return Math.ceil(measured + 2);
    }

    function initNavBarHeightSync() {
        var navBar = document.getElementById('nav-bar');
        if (!navBar) return;
        if (window.matchMedia('(min-width: 1024px)').matches) {
            var desktopCases = navBar.querySelectorAll('.nav-bar-case');
            for (var i = 0; i < desktopCases.length; i++) desktopCases[i].style.height = '';
            return;
        }
        var homeBtn = navBar.querySelector('.nav-bar-home');
        var contactBtn = navBar.querySelector('.nav-bar-contact');
        var navCases = navBar.querySelectorAll('.nav-bar-case');
        var workCases = document.querySelectorAll('.work-case');
        var viewport = document.querySelector('.page-slider-viewport');
        if (!viewport || navCases.length !== workCases.length) return;

        var homeBtnHeight = homeBtn ? Math.ceil(homeBtn.getBoundingClientRect().height) : 0;
        var contactBtnHeight = contactBtn ? Math.ceil(contactBtn.getBoundingClientRect().height) : 0;
        var fixedHeight = homeBtnHeight + contactBtnHeight;

        var contentHeights = [];
        var sumContent = 0;

        function recomputeContentHeights() {
            contentHeights = [];
            sumContent = 0;
            for (var j = 0; j < navCases.length; j++) {
                var h = measureNavCaseInlineSize(navCases[j]);
                contentHeights.push(h);
                sumContent += h;
            }
        }

        var ticking = false;
        function sync() {
            var vv = window.visualViewport;
            var layoutHeight = document.documentElement.clientHeight;
            var height = (vv && vv.height > 0 && vv.height >= layoutHeight * 0.85) ? vv.height : layoutHeight;
            if (height > 0) navBar.style.height = Math.round(height) + 'px';
            var navBarTop = navBar.getBoundingClientRect().top;
            var remaining = Math.max(0, navBar.clientHeight - fixedHeight - sumContent);
            var currentTop = homeBtnHeight;

            for (var i = 0; i < navCases.length; i++) {
                var caseBottom = workCases[i].getBoundingClientRect().bottom;
                var maxAllowed = Math.max(0, caseBottom - (navBarTop + currentTop));
                var extra = Math.min(remaining, Math.max(0, maxAllowed - contentHeights[i]));
                var finalHeight = contentHeights[i] + extra;
                navCases[i].style.height = finalHeight + 'px';
                remaining -= extra;
                currentTop += finalHeight;
            }
            ticking = false;
        }

        function requestSync() {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(sync);
            }
        }

        function remeasureAndSync() {
            recomputeContentHeights();
            requestSync();
        }

        recomputeContentHeights();

        viewport.addEventListener('scroll', requestSync);
        window.addEventListener('resize', remeasureAndSync);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', remeasureAndSync);
            window.visualViewport.addEventListener('scroll', requestSync);
        }
        new ResizeObserver(requestSync).observe(workCases[0].parentElement);

        if (window.pretextMeasure) {
            window.pretextMeasure.onChange(remeasureAndSync);
            window.pretextMeasure.whenReady().then(remeasureAndSync);
        }

        requestSync();
    }

    window.initNavBarHeightSync = initNavBarHeightSync;
})();
