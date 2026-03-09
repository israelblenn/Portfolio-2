(function() {
    // Helper function to get nested value from object using dot notation
    function getNestedValue(obj, path) {
        return path.split('.').reduce(function(current, key) {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    }
    
    // Helper function to set text content or innerHTML
    function setContent(element, value) {
        if (value === null || value === undefined) return;
        
        // If element has data-html="true", use innerHTML, otherwise textContent
        if (element.getAttribute('data-html') === 'true') {
            element.innerHTML = value;
        } else {
            element.textContent = value;
        }
    }

    // Nav bar height sync: each nav item's bottom edge must not go below
    // the bottom edge of its corresponding work case. Items expand with
    // priority ordering (first item first, then second, etc.).
    // On desktop (nav at bottom) this sync is skipped; layout is horizontal.
    function initNavBarSync() {
        var navBar = document.getElementById('nav-bar');
        if (!navBar) return;
        if (window.matchMedia('(min-width: 1024px)').matches) {
            var navCases = navBar.querySelectorAll('.nav-bar-case');
            for (var i = 0; i < navCases.length; i++) navCases[i].style.height = '';
            return;
        }
        var homeBtn = navBar.querySelector('.nav-bar-home');
        var contactBtn = navBar.querySelector('.nav-bar-contact');
        var navCases = navBar.querySelectorAll('.nav-bar-case');
        var workCases = document.querySelectorAll('.work-case');
        var viewport = document.querySelector('.page-slider-viewport');
        if (navCases.length !== workCases.length) return;

        // Fixed heights of home and contact. Purple takes 0 when small, up to 100px when large (flex).
        var homeBtnHeight = homeBtn ? Math.ceil(homeBtn.getBoundingClientRect().height) : 0;
        var contactBtnHeight = contactBtn ? Math.ceil(contactBtn.getBoundingClientRect().height) : 0;
        var fixedHeight = homeBtnHeight + contactBtnHeight;

        // Cache content heights once (text doesn't change)
        var contentHeights = [];
        var sumContent = 0;
        for (var i = 0; i < navCases.length; i++) {
            var h = Math.ceil(navCases[i].getBoundingClientRect().height);
            contentHeights.push(h);
            sumContent += h;
        }

        var ticking = false;

        function sync() {
            var vv = window.visualViewport;
            var layoutHeight = document.documentElement.clientHeight;
            // Use visual viewport for dynamic height; when keyboard opens (visual shrinks),
            // use layout viewport so the nav bar doesn't shrink
            var height = (vv && vv.height > 0 && vv.height >= layoutHeight * 0.85)
                ? vv.height
                : layoutHeight;
            if (height > 0) { navBar.style.height = Math.round(height) + 'px'; }
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

        viewport.addEventListener('scroll', requestSync);
        window.addEventListener('resize', requestSync);
        if (window.visualViewport) { window.visualViewport.addEventListener('resize', requestSync); window.visualViewport.addEventListener('scroll', requestSync); }
        new ResizeObserver(requestSync).observe(workCases[0].parentElement);
        requestSync();
    }

    fetch('content.json?v=' + Date.now())
        .then(function(response) {
            if (!response.ok) {
                throw new Error('Failed to load content.json');
            }
            return response.json();
        })
        .then(function(content) {
            // Update page title if it has data-content attribute
            var titleElement = document.querySelector('title[data-content]');
            if (titleElement) {
                var titlePath = titleElement.getAttribute('data-content');
                var titleValue = getNestedValue(content, titlePath);
                if (titleValue) {
                    document.title = titleValue;
                }
            }
            
            // Find all elements with data-content attribute
            var elements = document.querySelectorAll('[data-content]');
            elements.forEach(function(element) {
                var path = element.getAttribute('data-content');
                var value = getNestedValue(content, path);
                
                if (value !== null && value !== undefined) {
                    setContent(element, value);
                }
            });
            
            // Handle special case: description with emphasis
            // If element has both data-content and data-content-emphasis
            var descriptionElements = document.querySelectorAll('[data-content][data-content-emphasis]');
            descriptionElements.forEach(function(element) {
                var mainPath = element.getAttribute('data-content');
                var emphasisPath = element.getAttribute('data-content-emphasis');
                var mainValue = getNestedValue(content, mainPath);
                var emphasisValue = getNestedValue(content, emphasisPath);
                
                if (mainValue && emphasisValue) {
                    element.innerHTML = mainValue + ' <em>' + emphasisValue + '</em>';
                } else if (mainValue) {
                    setContent(element, mainValue);
                }
            });
            
            // Handle list generation from arrays
            // If element has data-content-list, populate it as a list
            var listElements = document.querySelectorAll('[data-content-list]');
            listElements.forEach(function(listElement) {
                var arrayPath = listElement.getAttribute('data-content-list');
                var fieldName = listElement.getAttribute('data-content-list-field') || 'name';
                var array = getNestedValue(content, arrayPath);
                
                if (Array.isArray(array)) {
                    listElement.innerHTML = '';
                    array.forEach(function(item) {
                        var li = document.createElement('li');
                        var value = typeof item === 'object' ? item[fieldName] : item;
                        if (value) {
                            li.textContent = value;
                            listElement.appendChild(li);
                        }
                    });
                }
            });

            // Populate Work page with case blocks
            var workCasesContainer = document.getElementById('work-cases');
            if (workCasesContainer && Array.isArray(content.cases)) {
                workCasesContainer.innerHTML = '';

                content.cases.forEach(function(caseItem) {
                    if (!caseItem || typeof caseItem !== 'object') return;

                    var card = document.createElement('div');
                    card.className = 'work-case';
                    if (caseItem.colour) {
                        card.style.backgroundColor = caseItem.colour;
                    }

                    var desc = document.createElement('p');
                    desc.textContent = caseItem.description || '';
                    card.appendChild(desc);

                    if (caseItem.image) {
                        var img = document.createElement('img');
                        img.src = caseItem.image;
                        img.alt = '';
                        img.loading = 'lazy';
                        card.appendChild(img);
                    }

                    workCasesContainer.appendChild(card);
                });
            }

            // Populate nav bar with home button + a div per case
            var navBar = document.getElementById('nav-bar');
            if (navBar && Array.isArray(content.cases)) {
                navBar.innerHTML = '';

                // Home button at the top
                var homeBtn = document.createElement('div');
                homeBtn.className = 'nav-bar-home';
                homeBtn.textContent = '\u00BF';
                homeBtn.addEventListener('click', function() {
                    var viewport = document.querySelector('.page-slider-viewport');
                    if (window.snapToPage) {
                        window.snapToPage(0);
                    }
                    if (viewport) {
                        viewport.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                });
                navBar.appendChild(homeBtn);

                content.cases.forEach(function(caseItem, index) {
                    if (!caseItem || typeof caseItem !== 'object') return;
                    var caseNav = document.createElement('div');
                    caseNav.className = 'nav-bar-case';
                    if (caseItem.colour) {
                        caseNav.style.backgroundColor = caseItem.colour;
                    }
                    caseNav.textContent = caseItem.name || '';
                    if (index === 0) caseNav.classList.add('nav-bar-case--selected');
                    caseNav.style.cursor = 'pointer';
                    caseNav.addEventListener('click', function() {
                        var viewport = document.querySelector('.page-slider-viewport');
                        var workCases = document.querySelectorAll('.work-case');
                        if (window.matchMedia('(min-width: 1024px)').matches) {
                            navBar.querySelectorAll('.nav-bar-case').forEach(function(el) {
                                el.classList.remove('nav-bar-case--selected');
                            });
                            caseNav.classList.add('nav-bar-case--selected');
                        }
                        if (window.snapToPage) {
                            window.snapToPage(1);
                        }
                        if (viewport && workCases[index]) {
                            var caseTop = workCases[index].getBoundingClientRect().top;
                            var viewportTop = viewport.getBoundingClientRect().top;
                            var delta = caseTop - viewportTop;
                            var maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
                            var targetScrollTop = viewport.scrollTop + delta;
                            var cappedScrollTop = Math.min(Math.max(0, targetScrollTop), maxScrollTop);
                            viewport.scrollTo({ top: cappedScrollTop, behavior: 'smooth' });
                        }
                    });
                    navBar.appendChild(caseNav);
                });

                // Contact button at the bottom
                var contactBtn = document.createElement('div');
                contactBtn.className = 'nav-bar-contact';
                contactBtn.textContent = 'Contact';
                contactBtn.addEventListener('click', function() {
                    if (window.matchMedia('(min-width: 1024px)').matches) return; /* deactivated on desktop */
                    var contactTab = document.querySelector('.contact-tab');
                    var viewport = document.querySelector('.page-slider-viewport');
                    if (window.snapToPage) {
                        window.snapToPage(0);
                    }
                    if (contactTab && viewport) {
                        var tabTop = contactTab.getBoundingClientRect().top;
                        var viewportTop = viewport.getBoundingClientRect().top;
                        var delta = tabTop - viewportTop;
                        var maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
                        var targetScrollTop = viewport.scrollTop + delta;
                        var cappedScrollTop = Math.min(Math.max(0, targetScrollTop), maxScrollTop);
                        viewport.scrollTo({ top: cappedScrollTop, behavior: 'smooth' });
                    }
                });
                navBar.appendChild(contactBtn);
            }

            // Populate test expand bar from cases
            var testBar = document.getElementById('test-expand-bar');
            if (testBar && Array.isArray(content.cases)) {
                testBar.innerHTML = '';

                // Home button (matches nav-bar-home behaviour)
                var testHome = document.createElement('div');
                testHome.className = 'test-expand-bar-home';
                testHome.textContent = '\u00BF';
                testHome.style.cursor = 'pointer';
                testHome.addEventListener('click', function() {
                    if (window.snapToPage) window.snapToPage(0);
                    var viewport = document.querySelector('.page-slider-viewport');
                    if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
                });
                testBar.appendChild(testHome);

                // Description paragraph shown above the bar on desktop
                var testDesc = document.createElement('p');
                testDesc.id = 'test-case-description';
                document.body.appendChild(testDesc);

                function updateDeadZone() {
                    if (!window.matchMedia('(min-width: 1024px)').matches) return;
                    var rect = testDesc.getBoundingClientRect();
                    window.lifeExtraDeadZones = [{ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }];
                    if (window.lifeRefreshDeadZones) window.lifeRefreshDeadZones();
                }

                var validCases = content.cases.filter(function(c) { return c && typeof c === 'object'; });
                if (validCases[0]) testDesc.textContent = validCases[0].description || '';

                // Computes the final left edge of case[index] using measured collapsed widths.
                // Called at click time so the paragraph animates in sync with the bar.
                var caseItems = [];
                function descLeftForIndex(index) {
                    var homeEl = testBar.querySelector('.test-expand-bar-home');
                    var left = homeEl ? homeEl.getBoundingClientRect().width : 0;
                    for (var j = 0; j < index; j++) {
                        var w = parseFloat(caseItems[j].style.getPropertyValue('--collapsed-basis'));
                        left += isNaN(w) ? caseItems[j].getBoundingClientRect().width : w;
                    }
                    return left;
                }

                validCases.forEach(function(caseItem, index) {
                    var div = document.createElement('div');
                    div.setAttribute('data-expand', String(index));
                    if (caseItem.colour) div.style.backgroundColor = caseItem.colour;
                    div.textContent = caseItem.name || '';
                    div.addEventListener('click', function() {
                        if (testBar.dataset.expanded === String(index)) return;
                        testBar.dataset.expanded = String(index);
                        testDesc.classList.add('desc-fade-out');
                        setTimeout(function() {
                            if (window.matchMedia('(min-width: 1024px)').matches) {
                                testDesc.style.left = descLeftForIndex(index) + 'px';
                            }
                            testDesc.textContent = caseItem.description || '';
                            testDesc.classList.remove('desc-fade-out');
                            requestAnimationFrame(updateDeadZone);
                        }, 320);
                    });
                    testBar.appendChild(div);
                    caseItems.push(div);
                });

                // Contact button (desktop: open form → becomes send button)
                var testContact = document.createElement('div');
                testContact.className = 'test-expand-bar-contact';
                testContact.style.cursor = 'pointer';
                var dcBtnText = document.createElement('span');
                dcBtnText.className = 'btn-text';
                dcBtnText.textContent = 'Contact';
                var dcBtnWhiteWrapper = document.createElement('span');
                dcBtnWhiteWrapper.className = 'btn-text-white-wrapper';
                var dcBtnWhite = document.createElement('span');
                dcBtnWhite.className = 'btn-text-white';
                dcBtnWhite.textContent = 'Contact';
                dcBtnWhiteWrapper.appendChild(dcBtnWhite);
                testContact.appendChild(dcBtnText);
                testContact.appendChild(dcBtnWhiteWrapper);
                // --- Desktop send-button state machine (mirrors send-btn.js) ---
                var dcSending = false;
                var dcSent = false;
                var sentTriggerTime = 604.5;
                var sentDuration = 5000;
                var greenDuration = 800;

                function dcResetButton() {
                    testContact.classList.add('dc-fade-out');
                    setTimeout(function() {
                        var resetPanel = document.getElementById('desktop-contact-panel');
                        var isStillOpen = resetPanel && resetPanel.classList.contains('desktop-contact-panel--open');
                        var label = isStillOpen ? 'send' : 'Contact';
                        dcBtnText.textContent = label;
                        dcBtnWhite.textContent = label;
                        testContact.classList.remove('dc-fade-out');
                        testContact.classList.add('dc-resetting');
                        testContact.classList.remove('dc-sent', 'dc-sent-fade');
                        dcSent = false;
                        requestAnimationFrame(function() {
                            requestAnimationFrame(function() {
                                testContact.classList.remove('dc-resetting');
                            });
                        });
                    }, 500);
                }

                function dcStartAnimation() {
                    testContact.classList.add('dc-animating');
                    setTimeout(function() {
                        testContact.classList.add('dc-sent');
                        dcBtnText.textContent = 'sent';
                        dcBtnWhite.textContent = 'sent';
                        dcSent = true;
                    }, sentTriggerTime);
                    setTimeout(function() {
                        testContact.classList.remove('dc-sending', 'dc-animating');
                        dcSending = false;
                        setTimeout(function() { testContact.classList.add('dc-sent-fade'); }, greenDuration);
                        setTimeout(function() { dcResetButton(); }, sentDuration);
                    }, 1000);
                }

                function dcSubmit() {
                    var form = document.getElementById('desktop-contact-form');
                    if (!form || dcSending || dcSent) return;
                    // Validate without submitting
                    if (!form.checkValidity()) { form.reportValidity(); return; }
                    dcSending = true;
                    testContact.classList.add('dc-sending');
                    // TESTING: skip network request
                    dcStartAnimation(); form.reset(); return;
                    var formData = new FormData(form);
                    fetch(form.action, { method: 'POST', body: formData })
                        .then(function(r) { return r.json(); })
                        .then(function(data) {
                            if (data.success) {
                                dcStartAnimation();
                                form.reset();
                            } else {
                                testContact.classList.remove('dc-sending');
                                dcSending = false;
                                alert('Failed to send message. Please try again.');
                            }
                        })
                        .catch(function() {
                            testContact.classList.remove('dc-sending');
                            dcSending = false;
                            alert('An error occurred. Please try again.');
                        });
                }

                testContact.addEventListener('click', function(e) {
                    if (!window.matchMedia('(min-width: 1024px)').matches) return;
                    e.stopPropagation();
                    if (dcSending || dcSent) return;
                    var panel = document.getElementById('desktop-contact-panel');
                    if (!panel) return;
                    var isOpen = panel.classList.contains('desktop-contact-panel--open');
                    if (!isOpen) {
                        panel.classList.add('desktop-contact-panel--open');
                        dcBtnText.textContent = 'send';
                        dcBtnWhite.textContent = 'send';
                    } else {
                        dcSubmit();
                    }
                });
                testBar.appendChild(testContact);

                // Clicks inside the panel stay inside — don't bubble to document
                var panel = document.getElementById('desktop-contact-panel');
                if (panel) {
                    panel.addEventListener('click', function(e) { e.stopPropagation(); });
                }

                // Close the contact panel when clicking anywhere else
                document.addEventListener('click', function() {
                    if (!window.matchMedia('(min-width: 1024px)').matches) return;
                    if (dcSending || dcSent) return;
                    var p = document.getElementById('desktop-contact-panel');
                    if (!p || !p.classList.contains('desktop-contact-panel--open')) return;
                    p.classList.remove('desktop-contact-panel--open');
                    dcBtnText.textContent = 'Contact';
                    dcBtnWhite.textContent = 'Contact';
                });

                testBar.dataset.expanded = '0';

                // Cases are nth-child(2) through nth-child(N+1) because home is first
                var sel = [];
                for (var i = 0; i < validCases.length; i++) {
                    sel.push('.test-expand-bar[data-expanded="' + i + '"] > [data-expand="' + i + '"]');
                }
                var styleEl = document.createElement('style');
                styleEl.textContent = '@media (min-width:1024px){' + sel.join(',') + '{flex-grow:1;flex-shrink:1;flex-basis:0px;overflow:hidden;text-overflow:ellipsis;}}';
                document.head.appendChild(styleEl);
            }

            // Clicking the contact tab scrolls it toward the top (capped to avoid overscroll on iOS)
            var contactTab = document.querySelector('.contact-tab');
            if (contactTab) {
                contactTab.style.cursor = 'pointer';
                contactTab.addEventListener('click', function() {
                    var viewport = document.querySelector('.page-slider-viewport');
                    if (viewport) {
                        var tabTop = contactTab.getBoundingClientRect().top;
                        var viewportTop = viewport.getBoundingClientRect().top;
                        var delta = tabTop - viewportTop;
                        var maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
                        var targetScrollTop = viewport.scrollTop + delta;
                        var cappedScrollTop = Math.min(Math.max(0, targetScrollTop), maxScrollTop);
                        viewport.scrollTo({ top: cappedScrollTop, behavior: 'smooth' });
                    }
                });
            }

            // Run nav sync only after fonts have loaded so measured heights use the
            // actual font (Instrument Sans). Otherwise fallback font metrics are
            // cached and menu items overflow when the custom font loads.
            function runNavBarSync() {
                initNavBarSync();
            }
            function measureTestBarWidths() {
                var testBar = document.getElementById('test-expand-bar');
                if (!testBar || !window.matchMedia('(min-width: 1024px)').matches) return;
                var children = testBar.children;

                // Suppress transitions for the entire measure-and-restore cycle so the
                // browser never tries to animate flex-basis between auto and 0.
                for (var i = 0; i < children.length; i++) {
                    children[i].style.transition = 'none';
                }

                // Remove expanded state so every child is at its natural width.
                var saved = testBar.dataset.expanded;
                delete testBar.dataset.expanded;
                for (var i = 0; i < children.length; i++) {
                    children[i].style.setProperty('--collapsed-basis', 'auto');
                }
                testBar.offsetWidth; // force layout

                // Measure and lock each child's natural width as an explicit px value.
                for (var i = 0; i < children.length; i++) {
                    var w = children[i].getBoundingClientRect().width;
                    children[i].style.setProperty('--collapsed-basis', w + 'px');
                }

                // Restore expanded state instantly (transitions still off).
                testBar.dataset.expanded = saved;
                testBar.offsetWidth; // force layout so values are committed

                // Re-enable transitions next frame — all flex-basis values are now
                // explicit px, so every future transition is px → px and animatable.
                // Also set the initial description position without animation.
                requestAnimationFrame(function() {
                    for (var i = 0; i < children.length; i++) {
                        children[i].style.transition = '';
                    }
                    var initialIndex = parseInt(testBar.dataset.expanded) || 0;
                    if (testDesc && typeof descLeftForIndex === 'function') {
                        testDesc.style.left = descLeftForIndex(initialIndex) + 'px';
                    }
                    updateDeadZone();
                });
            }
            function afterContentAndFonts() {
                runNavBarSync();
                measureTestBarWidths();
                requestAnimationFrame(function() {
                    window.dispatchEvent(new Event('resize'));
                });
            }
            if (document.fonts && typeof document.fonts.ready !== 'undefined') {
                document.fonts.ready.then(afterContentAndFonts);
            } else {
                afterContentAndFonts();
            }
        })
        .catch(function(error) {
            console.error('Error loading content:', error);
        });
})();
