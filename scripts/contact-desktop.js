(function() {
    function scrollViewportToElement(viewport, element) {
        if (!viewport || !element) return;
        var elementTop = element.getBoundingClientRect().top;
        var viewportTop = viewport.getBoundingClientRect().top;
        var delta = elementTop - viewportTop;
        var maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        var targetScrollTop = viewport.scrollTop + delta;
        var cappedScrollTop = Math.min(Math.max(0, targetScrollTop), maxScrollTop);
        viewport.scrollTo({ top: cappedScrollTop, behavior: 'smooth' });
    }

    function initDesktopContact(options) {
        options = options || {};
        var navBar = options.navBar;
        var clearCaseSelection = options.clearCaseSelection || function() {};
        if (!navBar) return null;

        var contactBtn = document.createElement('div');
        contactBtn.className = 'nav-bar-contact';
        contactBtn.style.cursor = 'pointer';

        var dcBtnText = document.createElement('span');
        dcBtnText.className = 'btn-text';
        dcBtnText.textContent = 'Contact';

        var dcBtnWhiteWrapper = document.createElement('span');
        dcBtnWhiteWrapper.className = 'btn-text-white-wrapper';
        var dcBtnWhite = document.createElement('span');
        dcBtnWhite.className = 'btn-text-white';
        dcBtnWhite.textContent = 'Contact';
        dcBtnWhiteWrapper.appendChild(dcBtnWhite);

        contactBtn.appendChild(dcBtnText);
        contactBtn.appendChild(dcBtnWhiteWrapper);
        navBar.appendChild(contactBtn);

        var dcController = null;
        var contactFormEl = document.getElementById('contact-form');
        if (typeof window.createAnimatedFormSubmitController === 'function' && contactFormEl) {
            dcController = window.createAnimatedFormSubmitController({
                form: contactFormEl,
                button: contactBtn,
                textEl: dcBtnText,
                whiteTextEl: dcBtnWhite,
                classNames: {
                    sending: 'dc-sending',
                    animating: 'dc-animating',
                    sent: 'dc-sent',
                    sentFade: 'dc-sent-fade',
                    resetting: 'dc-resetting'
                },
                labels: {
                    idle: 'Contact',
                    sent: 'sent'
                },
                timings: {
                    sentTriggerTime: 604.5,
                    sentDuration: 5000,
                    greenDuration: 800
                },
                getIdleLabel: function() {
                    var resetPanel = document.querySelector('.contact');
                    var isStillOpen = resetPanel && resetPanel.classList.contains('contact--open');
                    return isStillOpen ? 'send' : 'Contact';
                }
            });
        }

        function isDesktopContactBusy() {
            return !!dcController && (dcController.isSending() || dcController.isSent());
        }

        function dcSubmit() {
            if (!dcController) return;
            dcController.submit();
        }

        contactBtn.addEventListener('click', function(e) {
            var isDesktop = window.matchMedia('(min-width: 1024px)').matches;
            if (!isDesktop) {
                clearCaseSelection();
                var contactTab = document.querySelector('.contact-tab');
                var viewport = document.querySelector('.page-slider-viewport');
                if (window.snapToPage) window.snapToPage(0);
                scrollViewportToElement(viewport, contactTab);
                return;
            }

            e.stopPropagation();
            if (isDesktopContactBusy()) return;
            var panel = document.querySelector('.contact');
            if (!panel) return;
            var isOpen = panel.classList.contains('contact--open');
            if (!isOpen) {
                panel.classList.add('contact--open');
                dcBtnText.textContent = 'send';
                dcBtnWhite.textContent = 'send';
            } else {
                dcSubmit();
            }
        });

        var panel = document.querySelector('.contact');
        if (panel) {
            panel.addEventListener('click', function(e) { e.stopPropagation(); });
        }

        document.addEventListener('click', function() {
            if (!window.matchMedia('(min-width: 1024px)').matches) return;
            if (isDesktopContactBusy()) return;
            var p = document.querySelector('.contact');
            if (!p || !p.classList.contains('contact--open')) return;
            p.classList.remove('contact--open');
            dcBtnText.textContent = 'Contact';
            dcBtnWhite.textContent = 'Contact';
        });

        var contactTab = document.querySelector('.contact-tab');
        if (contactTab) {
            contactTab.style.cursor = 'pointer';
            contactTab.addEventListener('click', function() {
                scrollViewportToElement(document.querySelector('.page-slider-viewport'), contactTab);
            });
        }

        return { button: contactBtn };
    }

    window.initDesktopContact = initDesktopContact;
})();
