(function() {
    function createWorkCasesModule(options) {
        options = options || {};
        var content = options.content || {};
        var previewModule = options.previewModule || null;

        var shaderCases = [];
        var selectedCaseIndex = null;
        var caseActiveIndicator = document.getElementById('tool-tip');
        var homeSymbol = '\u00BF';
        var navMorphCtrl = null;
        var navBarDesc = null;
        var navBarCaseItems = [];
        var parsedIcons = null;
        var morphLibs = null;
        var morphReady = false;
        var selectedCaseDitherTimeout = null;
        var updateDeadZoneRef = null;
        var descLeftForIndexRef = null;

        function createCaseVideoElement(videoPath, offscreen) {
            if (!videoPath) return null;
            var vid = document.createElement('video');
            vid.setAttribute('autoplay', '');
            vid.setAttribute('loop', '');
            vid.setAttribute('muted', '');
            vid.setAttribute('playsinline', '');
            vid.muted = true;
            var srcMp4 = document.createElement('source');
            srcMp4.src = videoPath;
            srcMp4.type = 'video/mp4';
            vid.appendChild(srcMp4);
            if (offscreen) {
                vid.style.position = 'fixed';
                vid.style.top = '-9999px';
                vid.style.left = '-9999px';
                vid.style.width = '1px';
                vid.style.height = '1px';
                vid.style.opacity = '0';
                vid.style.pointerEvents = 'none';
            }
            return vid;
        }

        function syncCaseActiveIndicator() {
            if (!caseActiveIndicator) return;
            if (selectedCaseIndex !== null) caseActiveIndicator.classList.add('tool-tip--active');
            else caseActiveIndicator.classList.remove('tool-tip--active');
        }

        function scalePathD(d, scale) {
            return d.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, function(n) {
                return String(parseFloat(n) * scale);
            });
        }

        function parseIconSVG(svgText) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(svgText, 'image/svg+xml');
            var svgEl = doc.querySelector('svg');
            if (!svgEl) return null;
            var vb = (svgEl.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
            var nW = vb[2] || parseFloat(svgEl.getAttribute('width')) || 16;
            var nH = vb[3] || parseFloat(svgEl.getAttribute('height')) || 16;
            var scale = 16 / Math.max(nW, nH);
            var paths = [];
            svgEl.querySelectorAll('path').forEach(function(p) {
                var d = p.getAttribute('d');
                if (scale !== 1) d = scalePathD(d, scale);
                paths.push({ d: d, fill: p.getAttribute('fill') || '#000' });
            });
            return { paths: paths, nativeW: nW, nativeH: nH };
        }

        function lerpColor(a, b, t) {
            var aR = parseInt(a.slice(1, 3), 16), aG = parseInt(a.slice(3, 5), 16), aB = parseInt(a.slice(5, 7), 16);
            var bR = parseInt(b.slice(1, 3), 16), bG = parseInt(b.slice(3, 5), 16), bB = parseInt(b.slice(5, 7), 16);
            var r = Math.round(aR + (bR - aR) * t);
            var g = Math.round(aG + (bG - aG) * t);
            var bl = Math.round(aB + (bB - aB) * t);
            return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
        }

        function easeInOutCubic(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function createMorphController(hostEl) {
            var textSpan = document.createElement('span');
            textSpan.className = 'home-symbol';
            textSpan.textContent = hostEl.textContent;
            hostEl.textContent = '';
            hostEl.appendChild(textSpan);

            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 16 16');
            svg.setAttribute('aria-hidden', 'true');
            svg.classList.add('home-icon-svg');
            svg.style.display = 'none';
            hostEl.appendChild(svg);

            var pathEls = [];
            var cur = null;
            var gen = 0;
            var morphRafId = null;
            var morphTweenToken = 0;

            function ensure(n) {
                while (pathEls.length < n) {
                    pathEls.push(svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path')));
                }
            }

            function setInstant(toP, toW, toH) {
                textSpan.style.display = 'none';
                textSpan.style.opacity = '';
                svg.style.display = '';
                svg.style.opacity = '';
                svg.style.width = toW + 'px';
                svg.style.height = toH + 'px';
                ensure(toP.length);
                toP.forEach(function(p, i) {
                    pathEls[i].setAttribute('d', p.d);
                    pathEls[i].setAttribute('fill', p.fill);
                    pathEls[i].style.display = '';
                });
                for (var i = toP.length; i < pathEls.length; i++) pathEls[i].style.display = 'none';
                cur = { paths: toP.slice(), w: toW, h: toH };
            }

            function resetToText() {
                svg.style.display = 'none';
                svg.style.opacity = '';
                textSpan.style.display = '';
                textSpan.style.opacity = '';
                cur = null;
            }

            function sameIconState(state, paths, w, h) {
                if (!state) return false;
                if (state.w !== w || state.h !== h) return false;
                if (!state.paths || state.paths.length !== paths.length) return false;
                for (var i = 0; i < paths.length; i++) {
                    if (state.paths[i].d !== paths[i].d) return false;
                    if (state.paths[i].fill !== paths[i].fill) return false;
                }
                return true;
            }

            function runMorphTween(dur, onUpdate, onComplete) {
                morphTweenToken++;
                var token = morphTweenToken;
                if (dur <= 0) {
                    onUpdate(1);
                    if (onComplete) onComplete();
                    return;
                }
                if (morphRafId !== null) {
                    cancelAnimationFrame(morphRafId);
                    morphRafId = null;
                }
                var start = null;
                var ms = dur * 1000;
                // Paint an explicit initial frame so morphs never "jump in" mid-curve.
                onUpdate(0);
                function tick(now) {
                    if (token !== morphTweenToken) return;
                    if (start === null) start = now;
                    var t = Math.min(1, (now - start) / ms);
                    onUpdate(easeInOutCubic(t));
                    if (t < 1) morphRafId = requestAnimationFrame(tick);
                    else {
                        morphRafId = null;
                        if (onComplete) onComplete();
                    }
                }
                morphRafId = requestAnimationFrame(tick);
            }

            return {
                morphTo: function(iconData) {
                    gen++;
                    var g = gen;
                    var dur = 0.5;
                    var mopts = { maxSegmentLength: 0.45 };

                    if (!iconData) {
                        if (!cur) return;
                        if (!morphReady) { resetToText(); return; }
                        var exitIs = cur.paths.map(function(p) {
                            return morphLibs.toCircle(p.d, 8, 8, 0.3, mopts);
                        });
                        textSpan.style.display = '';
                        textSpan.style.opacity = '0';
                        runMorphTween(dur, function(t) {
                            if (gen !== g) return;
                            exitIs.forEach(function(fn, i) { pathEls[i].setAttribute('d', fn(t)); });
                            textSpan.style.opacity = String(t);
                            svg.style.opacity = String(1 - t);
                        }, function() { if (gen === g) resetToText(); });
                        cur = null;
                        return;
                    }

                    var toP = iconData.paths;
                    var toW = iconData.nativeW || 16;
                    var toH = iconData.nativeH || 16;
                    if (sameIconState(cur, toP, toW, toH)) return;
                    ensure(toP.length);

                    if (!cur) {
                        if (!morphReady) { setInstant(toP, toW, toH); return; }
                        svg.style.display = '';
                        svg.style.width = toW + 'px';
                        svg.style.height = toH + 'px';
                        svg.style.opacity = '0';
                        var enterIs = toP.map(function(p) {
                            return morphLibs.fromCircle(8, 8, 0.3, p.d, mopts);
                        });
                        toP.forEach(function(p, i) {
                            pathEls[i].setAttribute('d', enterIs[i](0));
                            pathEls[i].setAttribute('fill', p.fill);
                            pathEls[i].style.display = '';
                        });
                        for (var k = toP.length; k < pathEls.length; k++) pathEls[k].style.display = 'none';
                        runMorphTween(dur, function(t) {
                            if (gen !== g) return;
                            enterIs.forEach(function(fn, i) { pathEls[i].setAttribute('d', fn(t)); });
                            textSpan.style.opacity = String(1 - t);
                            svg.style.opacity = String(t);
                        }, function() {
                            if (gen !== g) return;
                            textSpan.style.display = 'none';
                            textSpan.style.opacity = '';
                            svg.style.opacity = '';
                            toP.forEach(function(p, i) { pathEls[i].setAttribute('d', p.d); });
                        });
                        cur = { paths: toP.slice(), w: toW, h: toH };
                        return;
                    }

                    if (!morphReady) { setInstant(toP, toW, toH); return; }
                    var fromP = cur.paths;
                    var fW = cur.w, fH = cur.h;
                    var maxN = Math.max(fromP.length, toP.length);
                    ensure(maxN);
                    var mis = [];
                    if (fromP.length === 1 && toP.length > 1) {
                        // Symmetric split without center staging: duplicate source path and
                        // morph both copies outward so both sides move in unison.
                        for (var i = 0; i < toP.length; i++) {
                            var splitFn = morphLibs.interpolate(fromP[0].d, toP[i].d, mopts);
                            pathEls[i].setAttribute('d', splitFn(0));
                            pathEls[i].setAttribute('fill', fromP[0].fill);
                            pathEls[i].style.display = '';
                            mis.push({
                                fn: splitFn,
                                ff: fromP[0].fill,
                                tf: toP[i].fill,
                                hide: false
                            });
                        }
                    } else if (fromP.length > 1 && toP.length === 1) {
                        // Symmetric merge without center staging: each source morphs directly
                        // into the destination so both sides travel simultaneously.
                        for (var i = 0; i < fromP.length; i++) {
                            var mergeFn = morphLibs.interpolate(fromP[i].d, toP[0].d, mopts);
                            pathEls[i].style.display = '';
                            mis.push({
                                fn: mergeFn,
                                ff: fromP[i].fill,
                                tf: toP[0].fill,
                                hide: i > 0
                            });
                        }
                    } else {
                        for (var i = 0; i < maxN; i++) {
                            var fd = fromP[i] ? fromP[i].d : null;
                            var td = toP[i] ? toP[i].d : null;
                            var ff = fromP[i] ? fromP[i].fill : (toP[i] ? toP[i].fill : '#000');
                            var tf = toP[i] ? toP[i].fill : ff;
                            var fn, hide = false;
                            if (fd && td) fn = morphLibs.interpolate(fd, td, mopts);
                            else if (td) { fn = morphLibs.fromCircle(8, 8, 0.3, td, mopts); pathEls[i].setAttribute('d', fn(0)); }
                            else if (fd) { fn = morphLibs.toCircle(fd, 8, 8, 0.3, mopts); hide = true; }
                            pathEls[i].style.display = '';
                            mis.push({ fn: fn, ff: ff, tf: tf, hide: hide });
                        }
                    }
                    runMorphTween(dur, function(t) {
                        if (gen !== g) return;
                        for (var j = 0; j < mis.length; j++) {
                            pathEls[j].setAttribute('d', mis[j].fn(t));
                            if (mis[j].ff !== mis[j].tf) {
                                pathEls[j].setAttribute('fill', lerpColor(mis[j].ff, mis[j].tf, t));
                            }
                        }
                        svg.style.width = (fW + (toW - fW) * t) + 'px';
                        svg.style.height = (fH + (toH - fH) * t) + 'px';
                    }, function() {
                        if (gen !== g) return;
                        for (var j = 0; j < toP.length; j++) {
                            pathEls[j].setAttribute('d', toP[j].d);
                            pathEls[j].setAttribute('fill', toP[j].fill);
                        }
                        for (var j = 0; j < mis.length; j++) if (mis[j].hide) pathEls[j].style.display = 'none';
                        for (var j = toP.length; j < pathEls.length; j++) pathEls[j].style.display = 'none';
                        svg.style.width = toW + 'px';
                        svg.style.height = toH + 'px';
                    });
                    cur = { paths: toP.slice(), w: toW, h: toH };
                }
            };
        }

        function syncHomeButtonIndicator() {
            var target = selectedCaseIndex !== null && parsedIcons ? parsedIcons[selectedCaseIndex] : null;
            if (navMorphCtrl) navMorphCtrl.morphTo(target);
        }

        function clearSelectedCaseDitherTimeout() {
            if (selectedCaseDitherTimeout !== null) {
                clearTimeout(selectedCaseDitherTimeout);
                selectedCaseDitherTimeout = null;
            }
        }

        function syncNavSelectedState() {
            var navItems = document.querySelectorAll('.nav-bar-case');
            navItems.forEach(function(el, index) {
                if (index === selectedCaseIndex) el.classList.add('nav-bar-case--selected');
                else el.classList.remove('nav-bar-case--selected');
            });
        }

        function selectCaseByIndex(selectedIndex) {
            clearSelectedCaseDitherTimeout();
            var previousIndex = selectedCaseIndex;
            if (selectedCaseIndex === selectedIndex) selectedCaseIndex = null;
            else selectedCaseIndex = selectedIndex;

            syncCaseActiveIndicator();
            syncHomeButtonIndicator();
            shaderCases.forEach(function(item, index) {
                if (!item || !item.wrapper || typeof item.wrapper.setDitherEnabled !== 'function') return;
                item.wrapper.setDitherEnabled(index !== selectedCaseIndex);
                if (item.card) {
                    if (index === selectedCaseIndex) item.card.classList.add('work-case--selected');
                    else item.card.classList.remove('work-case--selected');
                }
            });

            if (selectedCaseIndex !== null &&
                shaderCases[selectedCaseIndex] &&
                shaderCases[selectedCaseIndex].wrapper &&
                typeof shaderCases[selectedCaseIndex].wrapper.setDitherEnabled === 'function') {
                selectedCaseDitherTimeout = setTimeout(function() {
                    if (selectedCaseIndex === selectedIndex) {
                        shaderCases[selectedCaseIndex].wrapper.setDitherEnabled(false);
                    }
                    selectedCaseDitherTimeout = null;
                }, 500);
            }

            syncNavSelectedState();

            if (!previewModule) return;
            if (selectedCaseIndex === null) {
                previewModule.clearDelayedRender();
                previewModule.renderSelectedCase();
            } else {
                var switchingDesktopCase = previousIndex !== null &&
                    selectedCaseIndex !== null &&
                    previousIndex !== selectedCaseIndex &&
                    window.matchMedia('(min-width: 1024px)').matches;
                previewModule.scheduleRender(switchingDesktopCase ? 0 : 320);
            }
        }

        function clearCaseSelection() {
            clearSelectedCaseDitherTimeout();
            selectedCaseIndex = null;
            syncCaseActiveIndicator();
            syncHomeButtonIndicator();
            shaderCases.forEach(function(item) {
                if (!item || !item.wrapper || typeof item.wrapper.setDitherEnabled !== 'function') return;
                item.wrapper.setDitherEnabled(true);
                if (item.card) item.card.classList.remove('work-case--selected');
            });
            var navBar = document.getElementById('nav-bar');
            if (navBar) navBar.dataset.expanded = 'none';
            if (navBarDesc) navBarDesc.textContent = '';
            if (typeof updateDeadZoneRef === 'function') updateDeadZoneRef();
            syncNavSelectedState();
            if (previewModule) previewModule.renderSelectedCase();
        }

        function buildWorkCases() {
            var workCasesContainer = document.getElementById('work-cases');
            if (!workCasesContainer || !Array.isArray(content.cases)) return;
            workCasesContainer.innerHTML = '';

            content.cases.forEach(function(caseItem, caseIndex) {
                if (!caseItem || typeof caseItem !== 'object') return;
                var card = document.createElement('div');
                card.className = 'work-case';
                if (caseItem.colour) card.style.backgroundColor = caseItem.colour;

                var desc = document.createElement('p');
                desc.textContent = caseItem.description || '';
                card.appendChild(desc);

                if (caseItem.video) {
                    var vid = createCaseVideoElement(caseItem.video, false);
                    if (!vid) return;
                    if (typeof window.createDitheredVideoElement === 'function') {
                        var shaderVideo = window.createDitheredVideoElement(vid, {
                            gridSize: 2.0,
                            pixelation: 2.0,
                            tintHex: caseItem.colour || '#ffffff',
                            tintStrength: 1.0
                        });
                        card.addEventListener('click', function() { selectCaseByIndex(caseIndex); });
                        shaderCases.push({ card: card, wrapper: shaderVideo });
                        card.appendChild(shaderVideo);
                    } else {
                        card.appendChild(vid);
                    }
                } else if (caseItem.image) {
                    var img = document.createElement('img');
                    img.src = caseItem.image;
                    img.alt = '';
                    img.loading = 'lazy';
                    card.appendChild(img);
                }

                workCasesContainer.appendChild(card);
            });
        }

        function buildNavBar() {
            var navBar = document.getElementById('nav-bar');
            if (!navBar || !Array.isArray(content.cases)) return;
            navBar.innerHTML = '';
            navBarCaseItems = [];

            if (!navBarDesc) {
                navBarDesc = document.createElement('p');
                navBarDesc.id = 'case-description';
                document.body.appendChild(navBarDesc);
            }

            function updateDeadZone() {
                if (!navBarDesc || !window.matchMedia('(min-width: 1024px)').matches) {
                    window.lifeExtraDeadZones = [];
                    if (window.lifeRefreshDeadZones) window.lifeRefreshDeadZones();
                    return;
                }
                var rect = navBarDesc.getBoundingClientRect();
                window.lifeExtraDeadZones = [{ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }];
                if (window.lifeRefreshDeadZones) window.lifeRefreshDeadZones();
            }

            function descLeftForIndex(index) {
                var homeEl = navBar.querySelector('.nav-bar-home');
                var left = homeEl ? homeEl.getBoundingClientRect().width : 0;
                for (var j = 0; j < index; j++) {
                    var w = parseFloat(navBarCaseItems[j].style.getPropertyValue('--collapsed-basis'));
                    left += isNaN(w) ? navBarCaseItems[j].getBoundingClientRect().width : w;
                }
                return left;
            }

            updateDeadZoneRef = updateDeadZone;
            descLeftForIndexRef = descLeftForIndex;

            var validCases = content.cases.filter(function(c) { return c && typeof c === 'object'; });
            navBarDesc.textContent = '';
            navBar.dataset.expanded = 'none';

            var homeBtn = document.createElement('div');
            homeBtn.className = 'nav-bar-home';
            homeBtn.textContent = homeSymbol;
            navMorphCtrl = createMorphController(homeBtn);
            syncHomeButtonIndicator();
            homeBtn.style.cursor = 'pointer';
            homeBtn.addEventListener('click', function() {
                clearCaseSelection();
                var viewport = document.querySelector('.page-slider-viewport');
                if (window.snapToPage) window.snapToPage(0);
                if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
            });
            navBar.appendChild(homeBtn);

            validCases.forEach(function(caseItem, index) {
                var caseNav = document.createElement('div');
                caseNav.className = 'nav-bar-case';
                caseNav.setAttribute('data-expand', String(index));
                if (caseItem.colour) caseNav.style.backgroundColor = caseItem.colour;
                caseNav.textContent = caseItem.name || '';
                caseNav.style.cursor = 'pointer';
                caseNav.addEventListener('click', function() {
                    var isDesktop = window.matchMedia('(min-width: 1024px)').matches;
                    var wasExpanded = navBar.dataset.expanded === String(index);
                    selectCaseByIndex(index);

                    if (isDesktop) {
                        if (selectedCaseIndex === null) {
                            navBar.dataset.expanded = 'none';
                            navBarDesc.classList.add('desc-fade-out');
                            setTimeout(function() {
                                navBarDesc.textContent = '';
                                navBarDesc.classList.remove('desc-fade-out');
                                requestAnimationFrame(updateDeadZone);
                            }, 320);
                            return;
                        }
                        if (wasExpanded) return;
                        navBar.dataset.expanded = String(index);
                        navBarDesc.classList.add('desc-fade-out');
                        setTimeout(function() {
                            navBarDesc.style.left = descLeftForIndex(index) + 'px';
                            navBarDesc.textContent = caseItem.description || '';
                            navBarDesc.classList.remove('desc-fade-out');
                            requestAnimationFrame(updateDeadZone);
                        }, 320);
                        return;
                    }

                    var viewport = document.querySelector('.page-slider-viewport');
                    var workCases = document.querySelectorAll('.work-case');
                    if (window.snapToPage) window.snapToPage(1);
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
                navBarCaseItems.push(caseNav);
            });

            if (typeof window.initDesktopContact === 'function') {
                window.initDesktopContact({
                    navBar: navBar,
                    clearCaseSelection: clearCaseSelection
                });
            }

            var sel = [];
            for (var i = 0; i < validCases.length; i++) {
                sel.push('.nav-bar[data-expanded="' + i + '"] > [data-expand="' + i + '"]');
            }
            var styleEl = document.createElement('style');
            var expandedRule = sel.join(',') + '{flex-grow:1;flex-shrink:1;flex-basis:0px;}';
            var idleRule = '.nav-bar[data-expanded="none"] > [data-expand]{flex-grow:1;flex-shrink:1;flex-basis:0px;}';
            styleEl.textContent = '@media (min-width:1024px){' + idleRule + expandedRule + '}';
            document.head.appendChild(styleEl);
        }

        function measureNavBarWidths() {
            var navBar = document.getElementById('nav-bar');
            if (!navBar || !window.matchMedia('(min-width: 1024px)').matches) return;
            var children = navBar.children;
            for (var i = 0; i < children.length; i++) children[i].style.transition = 'none';

            var saved = navBar.dataset.expanded;
            delete navBar.dataset.expanded;
            for (var j = 0; j < children.length; j++) children[j].style.setProperty('--collapsed-basis', 'auto');
            navBar.offsetWidth;

            for (var k = 0; k < children.length; k++) {
                var w = children[k].getBoundingClientRect().width;
                children[k].style.setProperty('--collapsed-basis', w + 'px');
            }

            if (typeof saved === 'string' && saved.length > 0) navBar.dataset.expanded = saved;
            else delete navBar.dataset.expanded;
            navBar.offsetWidth;

            requestAnimationFrame(function() {
                for (var i = 0; i < children.length; i++) children[i].style.transition = '';
                var initialIndex = parseInt(navBar.dataset.expanded, 10) || 0;
                if (navBarDesc && typeof descLeftForIndexRef === 'function') {
                    navBarDesc.style.left = descLeftForIndexRef(initialIndex) + 'px';
                }
                if (typeof updateDeadZoneRef === 'function') updateDeadZoneRef();
            });
        }

        function onResize() {
            if (typeof updateDeadZoneRef === 'function') updateDeadZoneRef();
        }

        var iconFetchP = Promise.all(
            (content.cases || []).map(function(c) {
                if (!c.icon) return Promise.resolve(null);
                return fetch(c.icon).then(function(r) { return r.text(); })
                    .then(parseIconSVG).catch(function() { return null; });
            })
        ).then(function(icons) {
            parsedIcons = icons;
            syncHomeButtonIndicator();
        });

        import('https://cdn.jsdelivr.net/npm/flubber@0.4.2/+esm').then(function(flubber) {
            morphLibs = {
                interpolate: flubber.interpolate,
                toCircle: flubber.toCircle,
                fromCircle: flubber.fromCircle
            };
            if (parsedIcons) { morphReady = true; syncHomeButtonIndicator(); }
            iconFetchP.then(function() {
                if (!morphReady) { morphReady = true; syncHomeButtonIndicator(); }
            });
        }).catch(function() {});

        buildWorkCases();
        buildNavBar();
        syncCaseActiveIndicator();

        var slider = document.querySelector('.page-slider');
        if (slider) {
            slider.addEventListener('transitionend', function(e) {
                if (e.propertyName !== 'transform') return;
                if (slider.classList.contains('page-slider--work-active')) return;
                if (window.matchMedia('(min-width: 1024px)').matches) return;
                if (selectedCaseIndex === null) return;
                clearCaseSelection();
            });
        }

        return {
            getSelectedCaseIndex: function() { return selectedCaseIndex; },
            getCaseByIndex: function(index) {
                if (!Array.isArray(content.cases)) return null;
                return content.cases[index] || null;
            },
            selectCaseByIndex: selectCaseByIndex,
            clearCaseSelection: clearCaseSelection,
            measureNavBarWidths: measureNavBarWidths,
            onResize: onResize
        };
    }

    window.createWorkCasesModule = createWorkCasesModule;
})();
