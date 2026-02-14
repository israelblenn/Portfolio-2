/**
 * Sets --vh on the document root from the Visual Viewport API.
 * Keeps full-height elements (e.g. nav, viewport) in sync when the mobile
 * browser UI (address bar, etc.) shows or hides. Modern browsers use 100dvh
 * in CSS; this script provides a fallback for older mobile browsers.
 */
(function () {
    function setViewportHeight() {
        var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        document.documentElement.style.setProperty('--vh', (h * 0.01) + 'px');
    }

    setViewportHeight();

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setViewportHeight);
        window.visualViewport.addEventListener('scroll', setViewportHeight);
    }
    window.addEventListener('resize', setViewportHeight);
})();
