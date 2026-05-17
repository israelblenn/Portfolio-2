(function() {
    fetch('content.json')
        .then(function(response) {
            if (!response.ok) {
                throw new Error('Failed to load content.json');
            }
            return response.json();
        })
        .then(function(content) {
            window.siteContent = content;
            window.dispatchEvent(new CustomEvent('sitecontent:loaded', { detail: content }));

            if (typeof window.applySiteContent === 'function') {
                window.applySiteContent(content);
            }

            var workCasesModule = null;
            var previewModule = null;

            if (typeof window.createDesktopPreviewModule === 'function') {
                previewModule = window.createDesktopPreviewModule({
                    getSelectedCaseIndex: function() {
                        return workCasesModule ? workCasesModule.getSelectedCaseIndex() : null;
                    },
                    getCaseByIndex: function(index) {
                        return workCasesModule ? workCasesModule.getCaseByIndex(index) : null;
                    }
                });
            }

            if (typeof window.createWorkCasesModule === 'function') {
                workCasesModule = window.createWorkCasesModule({
                    content: content,
                    previewModule: previewModule
                });
            }

            function afterContentAndFonts() {
                if (typeof window.initNavBarHeightSync === 'function') {
                    window.initNavBarHeightSync();
                }
                if (workCasesModule && typeof workCasesModule.measureNavBarWidths === 'function') {
                    workCasesModule.measureNavBarWidths();
                }
                if (previewModule && typeof previewModule.renderSelectedCase === 'function') {
                    previewModule.renderSelectedCase();
                }
                requestAnimationFrame(function() {
                    window.dispatchEvent(new Event('resize'));
                });
            }

            window.addEventListener('resize', function() {
                if (previewModule && typeof previewModule.onResize === 'function') {
                    previewModule.onResize();
                }
                if (workCasesModule && typeof workCasesModule.onResize === 'function') {
                    workCasesModule.onResize();
                }
            });

            // Wait for both fonts AND pretext so the very first measurement pass
            // already uses accurate text metrics — no post-paint correction.
            var fontsReady = (document.fonts && typeof document.fonts.ready !== 'undefined')
                ? document.fonts.ready
                : Promise.resolve();
            var pretextReady = (window.pretextMeasure && typeof window.pretextMeasure.whenReady === 'function')
                ? window.pretextMeasure.whenReady()
                : Promise.resolve();
            Promise.all([fontsReady, pretextReady]).then(afterContentAndFonts, afterContentAndFonts);
        })
        .catch(function(error) {
            console.error('Error loading content:', error);
        });
})();
