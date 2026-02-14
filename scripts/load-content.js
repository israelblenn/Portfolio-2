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
    function initNavBarSync() {
        var navBar = document.getElementById('nav-bar');
        var homeBtn = navBar.querySelector('.nav-bar-home');
        var contactBtn = navBar.querySelector('.nav-bar-contact');
        var navCases = navBar.querySelectorAll('.nav-bar-case');
        var workCases = document.querySelectorAll('.work-case');
        var viewport = document.querySelector('.page-slider-viewport');
        if (!navBar || navCases.length !== workCases.length) return;

        // Fixed heights of home and contact buttons
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

        // Click a nav item to navigate to work page and scroll its case to the top
        for (var i = 0; i < navCases.length; i++) {
            (function(index) {
                navCases[index].addEventListener('click', function() {
                    // Snap to work page if not already there
                    if (window.snapToPage) {
                        window.snapToPage(1);
                    }
                    var caseTop = workCases[index].getBoundingClientRect().top;
                    var viewportTop = viewport.getBoundingClientRect().top;
                    viewport.scrollBy({ top: caseTop - viewportTop, behavior: 'smooth' });
                });
                navCases[index].style.cursor = 'pointer';
            })(i);
        }

        viewport.addEventListener('scroll', requestSync);
        window.addEventListener('resize', requestSync);
        new ResizeObserver(requestSync).observe(workCases[0].parentElement);
        requestSync();
    }

    fetch('content.json')
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

                content.cases.forEach(function(caseItem) {
                    if (!caseItem || typeof caseItem !== 'object') return;
                    var caseNav = document.createElement('div');
                    caseNav.className = 'nav-bar-case';
                    if (caseItem.colour) {
                        caseNav.style.backgroundColor = caseItem.colour;
                    }
                    caseNav.textContent = caseItem.name || '';
                    navBar.appendChild(caseNav);
                });

                // Contact button at the bottom
                var contactBtn = document.createElement('div');
                contactBtn.className = 'nav-bar-contact';
                contactBtn.textContent = 'Contact';
                contactBtn.addEventListener('click', function() {
                    var contactTab = document.querySelector('.contact-tab');
                    var viewport = document.querySelector('.page-slider-viewport');
                    if (window.snapToPage) {
                        window.snapToPage(0);
                    }
                    if (contactTab && viewport) {
                        var tabTop = contactTab.getBoundingClientRect().top;
                        var viewportTop = viewport.getBoundingClientRect().top;
                        viewport.scrollBy({ top: tabTop - viewportTop, behavior: 'smooth' });
                    }
                });
                navBar.appendChild(contactBtn);
            }

            // Clicking the contact tab scrolls it to the top of the viewport
            var contactTab = document.querySelector('.contact-tab');
            if (contactTab) {
                contactTab.style.cursor = 'pointer';
                contactTab.addEventListener('click', function() {
                    var viewport = document.querySelector('.page-slider-viewport');
                    if (viewport) {
                        var tabTop = contactTab.getBoundingClientRect().top;
                        var viewportTop = viewport.getBoundingClientRect().top;
                        viewport.scrollBy({ top: tabTop - viewportTop, behavior: 'smooth' });
                    }
                });
            }

            initNavBarSync();
        })
        .catch(function(error) {
            console.error('Error loading content:', error);
        });
})();
