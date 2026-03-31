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
            var desktopPreviewHost = null;
            var selectedCaseDitherTimeout = null;
            var desktopPreviewActiveIndex = null;
            var desktopPreviewTimers = [];
            var desktopPreviewDragOffsetX = 0;
            var desktopPreviewDragOffsetY = 0;
            var desktopPreviewScale = 1;
            var desktopPreviewScaleTarget = 1;
            var desktopPreviewScaleRafId = null;
            var desktopPreviewResetInteractionWarps = null;
            var desktopPreviewLiftBoost = 0;
            var desktopPreviewLiftTarget = 0;
            var desktopPreviewLiftRafId = null;
            var desktopPreviewWheelUsedThisDrag = false;
            var desktopViewportRenderer = null;
            var desktopPreviewActiveVideo = null;
            var desktopPreviewHitArea = null;
            var desktopPreviewIsDragging = false;
            var delayedPreviewRenderTimeout = null;
            var desktopPreviewDitherFadeRafId = null;
            function syncCaseActiveIndicator() {
                if (!caseActiveIndicator) return;
                if (selectedCaseIndex !== null) {
                    caseActiveIndicator.classList.add('tool-tip--active');
                } else {
                    caseActiveIndicator.classList.remove('tool-tip--active');
                }
            }

            syncCaseActiveIndicator();

            // ── Icon morph transition (Flubber + Motion) ──

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

            var iconFetchP = Promise.all(
                content.cases.map(function(c) {
                    if (!c.icon) return Promise.resolve(null);
                    return fetch(c.icon).then(function(r) { return r.text(); })
                        .then(parseIconSVG).catch(function() { return null; });
                })
            ).then(function(icons) {
                parsedIcons = icons;
                syncHomeButtonIndicator();
            });

            function easeInOutCubic(t) {
                return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            }

            function tween(dur, onUpdate, onComplete) {
                var start = performance.now();
                var ms = dur * 1000;
                function tick(now) {
                    var t = Math.min(1, (now - start) / ms);
                    onUpdate(easeInOutCubic(t));
                    if (t < 1) requestAnimationFrame(tick);
                    else if (onComplete) onComplete();
                }
                requestAnimationFrame(tick);
            }

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

                function ensure(n) {
                    while (pathEls.length < n) {
                        pathEls.push(svg.appendChild(
                            document.createElementNS('http://www.w3.org/2000/svg', 'path')
                        ));
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

                return {
                    morphTo: function(iconData) {
                        gen++;
                        var g = gen;
                        var dur = 0.35;
                        var mopts = { maxSegmentLength: 1 };

                        /* deselect → show ¿ */
                        if (!iconData) {
                            if (!cur) return;
                            if (!morphReady) { resetToText(); return; }
                            var exitIs = cur.paths.map(function(p) {
                                return morphLibs.toCircle(p.d, 8, 8, 0.3, mopts);
                            });
                            textSpan.style.display = '';
                            textSpan.style.opacity = '0';
                            tween(dur, function(t) {
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
                        ensure(toP.length);

                        /* first select: ¿ → icon */
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
                            tween(dur, function(t) {
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

                        /* switch case: icon → icon */
                        if (!morphReady) { setInstant(toP, toW, toH); return; }
                        var fromP = cur.paths;
                        var fW = cur.w, fH = cur.h;
                        var maxN = Math.max(fromP.length, toP.length);
                        ensure(maxN);
                        var mis = [];
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
                        tween(dur, function(t) {
                            if (gen !== g) return;
                            for (var j = 0; j < mis.length; j++) {
                                pathEls[j].setAttribute('d', mis[j].fn(t));
                                if (mis[j].ff !== mis[j].tf)
                                    pathEls[j].setAttribute('fill', lerpColor(mis[j].ff, mis[j].tf, t));
                            }
                            svg.style.width = (fW + (toW - fW) * t) + 'px';
                            svg.style.height = (fH + (toH - fH) * t) + 'px';
                        }, function() {
                            if (gen !== g) return;
                            for (var j = 0; j < toP.length; j++) {
                                pathEls[j].setAttribute('d', toP[j].d);
                                pathEls[j].setAttribute('fill', toP[j].fill);
                            }
                            for (var j = 0; j < mis.length; j++) {
                                if (mis[j].hide) pathEls[j].style.display = 'none';
                            }
                            for (var j = toP.length; j < pathEls.length; j++) pathEls[j].style.display = 'none';
                            svg.style.width = toW + 'px';
                            svg.style.height = toH + 'px';
                        });
                        cur = { paths: toP.slice(), w: toW, h: toH };
                    }
                };
            }

            function syncHomeButtonIndicator() {
                var target = selectedCaseIndex !== null && parsedIcons
                    ? parsedIcons[selectedCaseIndex] : null;
                if (navMorphCtrl) navMorphCtrl.morphTo(target);
            }

            function cancelDesktopPreviewDitherFade() {
                if (desktopPreviewDitherFadeRafId !== null) {
                    cancelAnimationFrame(desktopPreviewDitherFadeRafId);
                    desktopPreviewDitherFadeRafId = null;
                }
            }

            function startDesktopPreviewDitherFade(renderer) {
                cancelDesktopPreviewDitherFade();
                var start = performance.now();
                var DURATION_MS = 1000;
                function tick(now) {
                    var elapsed = now - start;
                    var t = Math.min(1, elapsed / DURATION_MS);
                    var eased = 1 - Math.pow(1 - t, 3);
                    renderer.setDitherMix(1 - eased);
                    if (t < 1) {
                        desktopPreviewDitherFadeRafId = requestAnimationFrame(tick);
                    } else {
                        renderer.setDitherMix(0);
                        desktopPreviewDitherFadeRafId = null;
                    }
                }
                desktopPreviewDitherFadeRafId = requestAnimationFrame(tick);
            }

            /** During canvas fade-out (500ms), ramps dither from current mix → 1 in lockstep. */
            function startDesktopPreviewDitherFadeInForExit(renderer) {
                cancelDesktopPreviewDitherFade();
                var fromMix = typeof renderer.getDitherMix === 'function'
                    ? renderer.getDitherMix()
                    : 0;
                fromMix = Math.max(0, Math.min(1, fromMix));
                if (fromMix >= 1) {
                    renderer.setDitherMix(1);
                    return;
                }
                var start = performance.now();
                var DURATION_MS = 500;
                function tick(now) {
                    var elapsed = now - start;
                    var t = Math.min(1, elapsed / DURATION_MS);
                    renderer.setDitherMix(fromMix + (1 - fromMix) * t);
                    if (t < 1) {
                        desktopPreviewDitherFadeRafId = requestAnimationFrame(tick);
                    } else {
                        renderer.setDitherMix(1);
                        desktopPreviewDitherFadeRafId = null;
                    }
                }
                desktopPreviewDitherFadeRafId = requestAnimationFrame(tick);
            }

            /**
             * Case A → case B: dither curtain (case B colour), cut at peak blur, no canvas opacity crossfade.
             * Timeline: 0.5s fade in → cut at 0.5s → 0.5s fade out (1s total).
             */
            function runDesktopPreviewInterCaseTransition(nextCase) {
                var renderer = getViewportRenderer();
                if (!renderer || !desktopPreviewActiveVideo || !nextCase || !nextCase.video) return;

                var targetIndex = selectedCaseIndex;

                renderer.canvas.style.transition = 'none';
                renderer.canvas.style.opacity = '1';

                renderer.setDitherSettings({
                    gridSize: 2.0,
                    pixelation: 2.0,
                    tintHex: nextCase.colour || '#ffffff',
                    tintStrength: 1.0
                });
                renderer.setDitherMix(0);

                cancelDesktopPreviewDitherFade();
                var start = performance.now();
                var FADE_IN_MS = 500;
                var TOTAL_MS = 1000;

                function easeOutCubic(t) {
                    return 1 - Math.pow(1 - t, 3);
                }

                function tick(now) {
                    if (selectedCaseIndex !== targetIndex || !desktopPreviewActiveVideo) {
                        desktopPreviewDitherFadeRafId = null;
                        return;
                    }
                    var elapsed = now - start;
                    var mix;
                    if (elapsed < FADE_IN_MS) {
                        mix = easeOutCubic(elapsed / FADE_IN_MS);
                    } else if (elapsed < TOTAL_MS) {
                        mix = 1 - easeOutCubic((elapsed - FADE_IN_MS) / (TOTAL_MS - FADE_IN_MS));
                    } else {
                        renderer.setDitherMix(0);
                        desktopPreviewDitherFadeRafId = null;
                        return;
                    }
                    renderer.setDitherMix(mix);
                    desktopPreviewDitherFadeRafId = requestAnimationFrame(tick);
                }
                desktopPreviewDitherFadeRafId = requestAnimationFrame(tick);

                scheduleDesktopPreviewStep(function() {
                    if (selectedCaseIndex !== targetIndex) return;
                    var oldVid = desktopPreviewActiveVideo;
                    var vid = buildDesktopPreviewVideo(nextCase);
                    if (!vid) return;
                    document.body.appendChild(vid);
                    var playPromise = vid.play();
                    if (playPromise && typeof playPromise.catch === 'function') {
                        playPromise.catch(function() {});
                    }

                    function applySwapWhenNewVideoReady() {
                        if (selectedCaseIndex !== targetIndex) {
                            if (vid.parentNode) vid.parentNode.removeChild(vid);
                            return;
                        }
                        if (oldVid && oldVid.parentNode) {
                            oldVid.parentNode.removeChild(oldVid);
                        }
                        desktopPreviewActiveVideo = vid;
                        desktopPreviewActiveIndex = targetIndex;
                        renderer.setVideo(vid);
                        renderer.setVelocity(0, 0);
                        updateRendererTransform();
                    }

                    if (vid.readyState >= 2) {
                        applySwapWhenNewVideoReady();
                    } else {
                        vid.addEventListener('loadeddata', function onLoadedData() {
                            vid.removeEventListener('loadeddata', onLoadedData);
                            applySwapWhenNewVideoReady();
                        });
                    }
                }, 500);
            }

            function clearSelectedCaseDitherTimeout() {
                if (selectedCaseDitherTimeout !== null) {
                    clearTimeout(selectedCaseDitherTimeout);
                    selectedCaseDitherTimeout = null;
                }
            }

            function clearDelayedPreviewRender() {
                if (delayedPreviewRenderTimeout !== null) {
                    clearTimeout(delayedPreviewRenderTimeout);
                    delayedPreviewRenderTimeout = null;
                }
            }

            function schedulePreviewRender(delay) {
                clearDelayedPreviewRender();
                delayedPreviewRenderTimeout = setTimeout(function() {
                    delayedPreviewRenderTimeout = null;
                    renderDesktopCasePreview();
                }, delay);
            }

            function clearDesktopPreviewTimers() {
                cancelDesktopPreviewDitherFade();
                for (var i = 0; i < desktopPreviewTimers.length; i++) {
                    clearTimeout(desktopPreviewTimers[i]);
                }
                desktopPreviewTimers = [];
            }

            function scheduleDesktopPreviewStep(callback, delay) {
                var id = setTimeout(callback, delay);
                desktopPreviewTimers.push(id);
                return id;
            }

            function getDesktopPreviewHost() {
                if (desktopPreviewHost) return desktopPreviewHost;
                desktopPreviewHost = document.createElement('div');
                desktopPreviewHost.id = 'desktop-case-preview';
                document.body.appendChild(desktopPreviewHost);
                return desktopPreviewHost;
            }

            function getViewportRenderer() {
                if (desktopViewportRenderer) return desktopViewportRenderer;
                if (typeof window.createViewportDitherCanvas !== 'function') return null;
                desktopViewportRenderer = window.createViewportDitherCanvas();
                if (!desktopViewportRenderer) return null;
                var host = getDesktopPreviewHost();
                host.appendChild(desktopViewportRenderer.canvas);
                initDesktopPreviewInteraction();
                return desktopViewportRenderer;
            }

            function computeVideoSize() {
                var w = Math.min(window.innerWidth * 0.33, window.innerHeight * 0.586667);
                var h = w / (16 / 9);
                var s = desktopPreviewScale * (1 + desktopPreviewLiftBoost);
                return { w: w * s, h: h * s };
            }

            function animateDesktopPreviewLift() {
                if (desktopPreviewLiftRafId !== null) return;
                function tick() {
                    var delta = desktopPreviewLiftTarget - desktopPreviewLiftBoost;
                    if (Math.abs(delta) < 0.0005) {
                        desktopPreviewLiftBoost = desktopPreviewLiftTarget;
                        updateRendererTransform();
                        desktopPreviewLiftRafId = null;
                        return;
                    }
                    desktopPreviewLiftBoost += delta * 0.28;
                    updateRendererTransform();
                    desktopPreviewLiftRafId = requestAnimationFrame(tick);
                }
                desktopPreviewLiftRafId = requestAnimationFrame(tick);
            }

            /** Fold pick-up lift into base scale so wheel + drop stay size-consistent. */
            function bakeDesktopPreviewLiftIntoScale() {
                var liftMul = desktopPreviewLiftBoost;
                if (liftMul < 1e-4 && desktopPreviewLiftTarget > 1e-4) {
                    liftMul = desktopPreviewLiftTarget;
                }
                if (liftMul < 1e-4) return;
                var vis = desktopPreviewScale * (1 + liftMul);
                vis = Math.max(0.5, Math.min(2.5, vis));
                desktopPreviewScale = vis;
                desktopPreviewScaleTarget = vis;
                cancelDesktopPreviewScaleSmoothing();
                desktopPreviewLiftBoost = 0;
                desktopPreviewLiftTarget = 0;
                if (desktopPreviewLiftRafId !== null) {
                    cancelAnimationFrame(desktopPreviewLiftRafId);
                    desktopPreviewLiftRafId = null;
                }
                updateRendererTransform();
            }

            function computeVideoCenter() {
                return {
                    x: window.innerWidth / 2 + desktopPreviewDragOffsetX,
                    y: window.innerHeight / 2 + desktopPreviewDragOffsetY
                };
            }

            function updateRendererTransform() {
                var renderer = getViewportRenderer();
                if (!renderer) return;
                var center = computeVideoCenter();
                var size = computeVideoSize();
                renderer.setCenter(center.x, center.y);
                renderer.setSize(size.w, size.h);
                if (typeof renderer.setShadowStrength === 'function') {
                    var effectiveScale = desktopPreviewScale * (1 + desktopPreviewLiftBoost);
                    var t = Math.max(0, Math.min(1, (effectiveScale - 0.5) / 0.5));
                    renderer.setShadowStrength(t);
                }
                if (desktopPreviewHitArea) {
                    desktopPreviewHitArea.style.width = size.w + 'px';
                    desktopPreviewHitArea.style.height = size.h + 'px';
                    desktopPreviewHitArea.style.left = center.x + 'px';
                    desktopPreviewHitArea.style.top = center.y + 'px';
                }
            }

            var desktopPreviewMagnetRafId = null;

            function cancelDesktopPreviewMagnet() {
                if (desktopPreviewMagnetRafId !== null) {
                    cancelAnimationFrame(desktopPreviewMagnetRafId);
                    desktopPreviewMagnetRafId = null;
                }
            }

            function cancelDesktopPreviewScaleSmoothing() {
                if (desktopPreviewScaleRafId !== null) {
                    cancelAnimationFrame(desktopPreviewScaleRafId);
                    desktopPreviewScaleRafId = null;
                }
            }

            function resetDesktopPreviewTransform() {
                desktopPreviewDragOffsetX = 0;
                desktopPreviewDragOffsetY = 0;
                desktopPreviewScale = 1;
                desktopPreviewScaleTarget = 1;
                desktopPreviewLiftBoost = 0;
                desktopPreviewLiftTarget = 0;
                desktopPreviewWheelUsedThisDrag = false;
                if (desktopPreviewLiftRafId !== null) {
                    cancelAnimationFrame(desktopPreviewLiftRafId);
                    desktopPreviewLiftRafId = null;
                }
                cancelDesktopPreviewScaleSmoothing();
                if (desktopPreviewMomentumRafId !== null) {
                    cancelAnimationFrame(desktopPreviewMomentumRafId);
                    desktopPreviewMomentumRafId = null;
                }
                cancelDesktopPreviewMagnet();
                if (typeof desktopPreviewResetInteractionWarps === 'function') {
                    desktopPreviewResetInteractionWarps();
                }
                var r = desktopViewportRenderer;
                if (r) {
                    r.setVelocity(0, 0);
                    if (typeof r.setZoomWarp === 'function') {
                        r.setZoomWarp(0);
                    }
                }
            }

            function smoothstep01(t) {
                t = Math.max(0, Math.min(1, t));
                return t * t * (3 - 2 * t);
            }

            function getDesktopPreviewMagneticField() {
                var margin = 16;
                var vw = window.innerWidth;
                var vh = window.innerHeight;
                var minDim = Math.min(vw, vh);
                var size = computeVideoSize();
                var c = computeVideoCenter();
                var hw = size.w * 0.5;
                var hh = size.h * 0.5;
                var L = c.x - hw;
                var R = c.x + hw;
                var T = c.y - hh;
                var B = c.y + hh;

                var outL = Math.max(0, -L);
                var outR = Math.max(0, R - vw);
                var outT = Math.max(0, -T);
                var outB = Math.max(0, B - vh);

                var hOverflow;
                if (size.w <= vw) {
                    hOverflow = Math.max(outL, outR);
                } else {
                    var panSlack = 1.5;
                    hOverflow = Math.max(0, Math.abs(c.x - vw * 0.5) - panSlack);
                }
                var vOverflow;
                if (size.h <= vh) {
                    vOverflow = Math.max(outT, outB);
                } else {
                    var panSlackY = 1.5;
                    vOverflow = Math.max(0, Math.abs(c.y - vh * 0.5) - panSlackY);
                }
                var overflow = Math.max(hOverflow, vOverflow);

                var minCx = margin + hw;
                var maxCx = vw - margin - hw;
                var minCy = margin + hh;
                var maxCy = vh - margin - hh;
                var idealCx = (minCx + maxCx) * 0.5;
                var idealCy = (minCy + maxCy) * 0.5;
                if (size.w > vw - 2 * margin) idealCx = vw * 0.5;
                if (size.h > vh - 2 * margin) idealCy = vh * 0.5;

                var pullX = idealCx - c.x;
                var pullY = idealCy - c.y;

                var feather = Math.max(1000, minDim * 0.12);
                var strength = overflow <= 0 ? 0 : smoothstep01(overflow / (feather + 1e-6));
                strength = Math.min(1, strength);

                return { pullX: pullX, pullY: pullY, strength: strength };
            }

            function getMagneticPullDelta() {
                var f = getDesktopPreviewMagneticField();
                var k = 0.003;
                return {
                    dx: f.pullX * f.strength * k,
                    dy: f.pullY * f.strength * k
                };
            }

            function getMagneticMomentumImpulse() {
                var f = getDesktopPreviewMagneticField();
                var k = 0.032;
                return {
                    ax: f.pullX * f.strength * k,
                    ay: f.pullY * f.strength * k
                };
            }

            function desktopPreviewMagnetTick() {
                if (!desktopPreviewActiveVideo) {
                    desktopPreviewMagnetRafId = null;
                    return;
                }
                if (!desktopPreviewIsDragging && desktopPreviewMomentumRafId === null) {
                    var p = getMagneticPullDelta();
                    desktopPreviewDragOffsetX += p.dx;
                    desktopPreviewDragOffsetY += p.dy;
                    updateRendererTransform();
                }
                desktopPreviewMagnetRafId = requestAnimationFrame(desktopPreviewMagnetTick);
            }

            function startDesktopPreviewMagnet() {
                if (desktopPreviewMagnetRafId !== null) return;
                desktopPreviewMagnetRafId = requestAnimationFrame(desktopPreviewMagnetTick);
            }

            function buildDesktopPreviewVideo(caseItem) {
                if (!caseItem || !caseItem.video) return null;
                var vid = document.createElement('video');
                vid.setAttribute('autoplay', '');
                vid.setAttribute('loop', '');
                vid.setAttribute('muted', '');
                vid.setAttribute('playsinline', '');
                vid.muted = true;
                var srcMp4 = document.createElement('source');
                srcMp4.src = caseItem.video;
                srcMp4.type = 'video/mp4';
                vid.appendChild(srcMp4);
                var webmPath = caseItem.video.replace(/\.mp4$/, '.webm');
                var srcWebm = document.createElement('source');
                srcWebm.src = webmPath;
                srcWebm.type = 'video/webm';
                vid.appendChild(srcWebm);
                vid.style.position = 'fixed';
                vid.style.top = '-9999px';
                vid.style.left = '-9999px';
                vid.style.width = '1px';
                vid.style.height = '1px';
                vid.style.opacity = '0';
                vid.style.pointerEvents = 'none';
                return vid;
            }

            function ensureHitArea() {
                if (desktopPreviewHitArea) return desktopPreviewHitArea;
                var host = getDesktopPreviewHost();
                desktopPreviewHitArea = document.createElement('div');
                desktopPreviewHitArea.className = 'desktop-case-preview-hitarea';
                desktopPreviewHitArea.style.pointerEvents = 'none';
                host.appendChild(desktopPreviewHitArea);
                return desktopPreviewHitArea;
            }

            function setDesktopPreviewHitAreaActive(active) {
                if (!desktopPreviewHitArea) return;
                desktopPreviewHitArea.style.pointerEvents = active ? 'auto' : 'none';
            }

            var desktopPreviewMomentumRafId = null;

            function initDesktopPreviewInteraction() {
                var hitArea = ensureHitArea();
                var renderer = desktopViewportRenderer;
                var isDragging = false;
                var startPointerX = 0, startPointerY = 0;
                var startOffsetX = 0, startOffsetY = 0;
                var samples = [];
                var MAX_SAMPLES = 3;
                var velX = 0, velY = 0;
                var FRICTION = 0.92;
                var VELOCITY_THRESHOLD = 0.5;
                var WARP_SCALE = 1.0 / 95.0;
                var motionWarpX = 0, motionWarpY = 0;
                var wheelWarpX = 0, wheelWarpY = 0;
                var zoomWarp = 0;
                var wheelWarpRafId = null;

                function startScaleSmoothing() {
                    if (desktopPreviewScaleRafId !== null) return;
                    function tick() {
                        var delta = desktopPreviewScaleTarget - desktopPreviewScale;
                        if (Math.abs(delta) < 0.0005) {
                            desktopPreviewScale = desktopPreviewScaleTarget;
                            updateRendererTransform();
                            desktopPreviewScaleRafId = null;
                            return;
                        }
                        desktopPreviewScale += delta * 0.22;
                        updateRendererTransform();
                        desktopPreviewScaleRafId = requestAnimationFrame(tick);
                    }
                    desktopPreviewScaleRafId = requestAnimationFrame(tick);
                }

                function applyShaderVelocity() {
                    renderer.setVelocity(
                        motionWarpX * WARP_SCALE + wheelWarpX,
                        motionWarpY * WARP_SCALE + wheelWarpY
                    );
                    if (typeof renderer.setZoomWarp === 'function') {
                        renderer.setZoomWarp(zoomWarp);
                    }
                }

                function startWheelWarpDecay() {
                    if (wheelWarpRafId !== null) return;
                    function tick() {
                        wheelWarpX *= 0.86;
                        wheelWarpY *= 0.86;
                        zoomWarp *= 0.86;
                        if (Math.abs(wheelWarpX) < 0.0005 && Math.abs(wheelWarpY) < 0.0005 && Math.abs(zoomWarp) < 0.0005) {
                            wheelWarpX = 0;
                            wheelWarpY = 0;
                            zoomWarp = 0;
                            wheelWarpRafId = null;
                            applyShaderVelocity();
                            return;
                        }
                        applyShaderVelocity();
                        wheelWarpRafId = requestAnimationFrame(tick);
                    }
                    wheelWarpRafId = requestAnimationFrame(tick);
                }

                function cancelMomentum() {
                    if (desktopPreviewMomentumRafId !== null) {
                        cancelAnimationFrame(desktopPreviewMomentumRafId);
                        desktopPreviewMomentumRafId = null;
                    }
                }

                function addSample(x, y) {
                    samples.push({ x: x, y: y, t: performance.now() });
                    if (samples.length > MAX_SAMPLES) samples.shift();
                }

                function computeVelocity() {
                    if (samples.length < 2) return { vx: 0, vy: 0 };
                    var first = samples[0];
                    var last = samples[samples.length - 1];
                    var dt = last.t - first.t;
                    if (dt < 1) return { vx: 0, vy: 0 };
                    var scale = 16.67 / dt;
                    return {
                        vx: (last.x - first.x) * scale,
                        vy: (last.y - first.y) * scale
                    };
                }

                function momentumLoop() {
                    var mag = getMagneticMomentumImpulse();
                    velX += mag.ax;
                    velY += mag.ay;
                    velX *= FRICTION;
                    velY *= FRICTION;
                    desktopPreviewDragOffsetX += velX;
                    desktopPreviewDragOffsetY += velY;
                    updateRendererTransform();
                    motionWarpX = velX;
                    motionWarpY = velY;
                    applyShaderVelocity();

                    if (Math.abs(velX) < VELOCITY_THRESHOLD && Math.abs(velY) < VELOCITY_THRESHOLD) {
                        velX = 0;
                        velY = 0;
                        motionWarpX = 0;
                        motionWarpY = 0;
                        applyShaderVelocity();
                        desktopPreviewMomentumRafId = null;
                        return;
                    }
                    desktopPreviewMomentumRafId = requestAnimationFrame(momentumLoop);
                }

                function onPointerMove(event) {
                    if (!isDragging) return;
                    desktopPreviewDragOffsetX = startOffsetX + (event.clientX - startPointerX);
                    desktopPreviewDragOffsetY = startOffsetY + (event.clientY - startPointerY);
                    updateRendererTransform();
                    addSample(event.clientX, event.clientY);
                    var vel = computeVelocity();
                    motionWarpX = vel.vx;
                    motionWarpY = vel.vy;
                    applyShaderVelocity();
                }

                function applyWheelScale(event) {
                    if (desktopPreviewIsDragging &&
                        (desktopPreviewLiftBoost > 1e-4 || desktopPreviewLiftTarget > 1e-4)) {
                        bakeDesktopPreviewLiftIntoScale();
                    }
                    var prevTarget = desktopPreviewScaleTarget;
                    var nextScale = desktopPreviewScaleTarget + (-event.deltaY * 0.0012);
                    var clamped = Math.max(0.5, Math.min(2.5, nextScale));
                    var scaleWouldChange = Math.abs(clamped - prevTarget) > 1e-6;
                    desktopPreviewScaleTarget = clamped;
                    if (scaleWouldChange) {
                        startScaleSmoothing();
                    }
                    if (desktopPreviewIsDragging && scaleWouldChange) {
                        desktopPreviewWheelUsedThisDrag = true;
                    }
                    if (scaleWouldChange) {
                        var size = computeVideoSize();
                        var center = computeVideoCenter();
                        var relX = (event.clientX - center.x) / Math.max(1, size.w);
                        var impulse = -event.deltaY * 0.00018;
                        wheelWarpX += relX * impulse * 0.9;
                        wheelWarpY += impulse * 1.4;
                        zoomWarp += event.deltaY * 0.00035;
                        zoomWarp = Math.max(-0.22, Math.min(0.22, zoomWarp));
                        applyShaderVelocity();
                        startWheelWarpDecay();
                    }
                    event.preventDefault();
                }

                function onWheelWhileDragging(event) {
                    if (!isDragging) return;
                    applyWheelScale(event);
                }

                function stopDragging() {
                    if (!isDragging) return;
                    isDragging = false;
                    desktopPreviewIsDragging = false;
                    desktopPreviewLiftTarget = 0;
                    if (desktopPreviewWheelUsedThisDrag) {
                        bakeDesktopPreviewLiftIntoScale();
                    }
                    desktopPreviewWheelUsedThisDrag = false;
                    animateDesktopPreviewLift();
                    hitArea.classList.remove('desktop-case-preview-hitarea--dragging');
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', stopDragging);
                    window.removeEventListener('pointercancel', stopDragging);
                    window.removeEventListener('wheel', onWheelWhileDragging);

                    var vel = computeVelocity();
                    velX = vel.vx;
                    velY = vel.vy;
                    samples = [];

                    if (Math.abs(velX) > VELOCITY_THRESHOLD || Math.abs(velY) > VELOCITY_THRESHOLD) {
                        desktopPreviewMomentumRafId = requestAnimationFrame(momentumLoop);
                    } else {
                        motionWarpX = 0;
                        motionWarpY = 0;
                        applyShaderVelocity();
                    }
                }

                hitArea.addEventListener('pointerdown', function(event) {
                    if (event.button !== 0) return;
                    if (!desktopPreviewActiveVideo) return;
                    cancelMomentum();
                    motionWarpX = 0;
                    motionWarpY = 0;
                    applyShaderVelocity();
                    isDragging = true;
                    desktopPreviewIsDragging = true;
                    desktopPreviewWheelUsedThisDrag = false;
                    desktopPreviewLiftTarget = 0.04;
                    animateDesktopPreviewLift();
                    startPointerX = event.clientX;
                    startPointerY = event.clientY;
                    startOffsetX = desktopPreviewDragOffsetX;
                    startOffsetY = desktopPreviewDragOffsetY;
                    samples = [];
                    addSample(event.clientX, event.clientY);
                    hitArea.classList.add('desktop-case-preview-hitarea--dragging');
                    if (typeof hitArea.setPointerCapture === 'function') {
                        hitArea.setPointerCapture(event.pointerId);
                    }
                    window.addEventListener('pointermove', onPointerMove);
                    window.addEventListener('pointerup', stopDragging);
                    window.addEventListener('pointercancel', stopDragging);
                    window.addEventListener('wheel', onWheelWhileDragging, { passive: false });
                });

                hitArea.addEventListener('wheel', function(event) {
                    if (!desktopPreviewActiveVideo) return;
                    applyWheelScale(event);
                }, { passive: false });

                desktopPreviewResetInteractionWarps = function() {
                    motionWarpX = 0;
                    motionWarpY = 0;
                    wheelWarpX = 0;
                    wheelWarpY = 0;
                    zoomWarp = 0;
                    velX = 0;
                    velY = 0;
                    samples = [];
                    if (wheelWarpRafId !== null) {
                        cancelAnimationFrame(wheelWarpRafId);
                        wheelWarpRafId = null;
                    }
                    applyShaderVelocity();
                };
            }

            function resetDesktopPreview() {
                clearDelayedPreviewRender();
                clearDesktopPreviewTimers();
                resetDesktopPreviewTransform();
                var renderer = getViewportRenderer();
                if (renderer) {
                    renderer.setEnabled(false);
                    renderer.setVideo(null);
                    renderer.setVelocity(0, 0);
                }
                if (desktopPreviewActiveVideo && desktopPreviewActiveVideo.parentNode) {
                    desktopPreviewActiveVideo.parentNode.removeChild(desktopPreviewActiveVideo);
                }
                desktopPreviewActiveVideo = null;
                desktopPreviewActiveIndex = null;
                setDesktopPreviewHitAreaActive(false);
            }

            function fadeOutDesktopPreview() {
                clearDelayedPreviewRender();
                clearDesktopPreviewTimers();
                resetDesktopPreviewTransform();
                var renderer = getViewportRenderer();
                if (!renderer || !desktopPreviewActiveVideo) {
                    desktopPreviewActiveVideo = null;
                    desktopPreviewActiveIndex = null;
                    setDesktopPreviewHitAreaActive(false);
                    return;
                }
                setDesktopPreviewHitAreaActive(false);
                renderer.canvas.style.transition = 'opacity 500ms ease';
                renderer.canvas.style.opacity = '0';
                startDesktopPreviewDitherFadeInForExit(renderer);
                var fadingVideo = desktopPreviewActiveVideo;
                desktopPreviewActiveVideo = null;
                desktopPreviewActiveIndex = null;
                scheduleDesktopPreviewStep(function() {
                    cancelDesktopPreviewDitherFade();
                    renderer.setEnabled(false);
                    renderer.setVideo(null);
                    renderer.setVelocity(0, 0);
                    renderer.canvas.style.transition = '';
                    renderer.canvas.style.opacity = '';
                    if (fadingVideo && fadingVideo.parentNode) {
                        fadingVideo.parentNode.removeChild(fadingVideo);
                    }
                }, 500);
            }

            function renderDesktopCasePreview() {
                var isDesktop = window.matchMedia('(min-width: 1024px)').matches;
                if (!isDesktop) {
                    resetDesktopPreview();
                    return;
                }
                var renderer = getViewportRenderer();
                if (!renderer) return;

                if (selectedCaseIndex === null) {
                    fadeOutDesktopPreview();
                    return;
                }
                var selectedCase = content.cases[selectedCaseIndex];
                if (!selectedCase || !selectedCase.video) {
                    resetDesktopPreview();
                    return;
                }

                clearDesktopPreviewTimers();

                if (desktopPreviewActiveIndex === selectedCaseIndex) return;

                if (desktopPreviewActiveIndex !== null &&
                    desktopPreviewActiveVideo &&
                    desktopPreviewActiveIndex !== selectedCaseIndex) {
                    runDesktopPreviewInterCaseTransition(selectedCase);
                    return;
                }

                if (desktopPreviewActiveVideo && desktopPreviewActiveVideo.parentNode) {
                    desktopPreviewActiveVideo.parentNode.removeChild(desktopPreviewActiveVideo);
                }

                // Hide before the renderer can paint the new video; otherwise one frame
                // flashes at full opacity (matches fade-out duration/easing).
                renderer.canvas.style.transition = 'none';
                renderer.canvas.style.opacity = '0';

                var vid = buildDesktopPreviewVideo(selectedCase);
                if (!vid) return;
                document.body.appendChild(vid);
                var playPromise = vid.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(function() {});
                }

                desktopPreviewActiveVideo = vid;
                desktopPreviewActiveIndex = selectedCaseIndex;

                renderer.setVideo(vid);
                renderer.setDitherSettings({
                    gridSize: 2.0,
                    pixelation: 2.0,
                    tintHex: selectedCase.colour || '#ffffff',
                    tintStrength: 1.0
                });
                renderer.setDitherMix(1.0);
                renderer.setVelocity(0, 0);
                updateRendererTransform();
                renderer.setEnabled(true);
                startDesktopPreviewMagnet();

                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        renderer.canvas.style.transition = 'opacity 500ms ease';
                        renderer.canvas.style.opacity = '1';
                    });
                });

                scheduleDesktopPreviewStep(function() {
                    renderer.canvas.style.transition = '';
                    startDesktopPreviewDitherFade(renderer);
                }, 500);

                setDesktopPreviewHitAreaActive(true);
            }

            function syncNavSelectedState() {
                var navItems = document.querySelectorAll('.nav-bar-case');
                navItems.forEach(function(el, index) {
                    if (index === selectedCaseIndex) {
                        el.classList.add('nav-bar-case--selected');
                    } else {
                        el.classList.remove('nav-bar-case--selected');
                    }
                });
            }

            function selectCaseByIndex(selectedIndex) {
                clearSelectedCaseDitherTimeout();
                var previousIndex = selectedCaseIndex;
                if (selectedCaseIndex === selectedIndex) {
                    selectedCaseIndex = null;
                } else {
                    selectedCaseIndex = selectedIndex;
                }
                syncCaseActiveIndicator();
                syncHomeButtonIndicator();
                shaderCases.forEach(function(item, index) {
                    if (!item || !item.wrapper ||
                        typeof item.wrapper.setDitherEnabled !== 'function') return;
                    item.wrapper.setDitherEnabled(index !== selectedCaseIndex);
                    if (item.card) {
                        if (index === selectedCaseIndex) {
                            item.card.classList.add('work-case--selected');
                        } else {
                            item.card.classList.remove('work-case--selected');
                        }
                    }
                });
                if (selectedCaseIndex !== null && shaderCases[selectedCaseIndex] &&
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
                if (selectedCaseIndex === null) {
                    clearDelayedPreviewRender();
                    renderDesktopCasePreview();
                } else {
                    var switchingDesktopCase = previousIndex !== null &&
                        selectedCaseIndex !== null &&
                        previousIndex !== selectedCaseIndex &&
                        window.matchMedia('(min-width: 1024px)').matches;
                    schedulePreviewRender(switchingDesktopCase ? 0 : 320);
                }
            }

            function clearCaseSelection() {
                clearSelectedCaseDitherTimeout();
                selectedCaseIndex = null;
                syncCaseActiveIndicator();
                syncHomeButtonIndicator();
                shaderCases.forEach(function(item) {
                    if (!item || !item.wrapper ||
                        typeof item.wrapper.setDitherEnabled !== 'function') return;
                    item.wrapper.setDitherEnabled(true);
                    if (item.card) item.card.classList.remove('work-case--selected');
                });
                var navBar = document.getElementById('nav-bar');
                if (navBar) {
                    navBar.dataset.expanded = 'none';
                }
                if (navBarDesc) {
                    navBarDesc.textContent = '';
                }
                if (navBar && typeof navBar._updateDescriptionDeadZone === 'function') {
                    navBar._updateDescriptionDeadZone();
                }
                syncNavSelectedState();
                renderDesktopCasePreview();
            }

            // Populate Work page with case blocks
            var workCasesContainer = document.getElementById('work-cases');
            if (workCasesContainer && Array.isArray(content.cases)) {
                workCasesContainer.innerHTML = '';

                content.cases.forEach(function(caseItem, caseIndex) {
                    if (!caseItem || typeof caseItem !== 'object') return;

                    var card = document.createElement('div');
                    card.className = 'work-case';
                    if (caseItem.colour) {
                        card.style.backgroundColor = caseItem.colour;
                    }

                    var desc = document.createElement('p');
                    desc.textContent = caseItem.description || '';
                    card.appendChild(desc);

                    if (caseItem.video) {
                        var vid = document.createElement('video');
                        vid.setAttribute('autoplay', '');
                        vid.setAttribute('loop', '');
                        vid.setAttribute('muted', '');
                        vid.setAttribute('playsinline', '');
                        vid.muted = true;
                        var srcMp4 = document.createElement('source');
                        srcMp4.src = caseItem.video;
                        srcMp4.type = 'video/mp4';
                        vid.appendChild(srcMp4);
                        var webmPath = caseItem.video.replace(/\.mp4$/, '.webm');
                        var srcWebm = document.createElement('source');
                        srcWebm.src = webmPath;
                        srcWebm.type = 'video/webm';
                        vid.appendChild(srcWebm);
                        if (typeof window.createDitheredVideoElement === 'function') {
                            var shaderVideo = window.createDitheredVideoElement(vid, {
                                gridSize: 2.0,
                                pixelation: 2.0,
                                tintHex: caseItem.colour || '#ffffff',
                                tintStrength: 1.0
                            });
                            card.addEventListener('click', function() {
                                selectCaseByIndex(caseIndex);
                            });
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

            // Populate a single shared nav bar for both mobile and desktop.
            var navBar = document.getElementById('nav-bar');
            if (navBar && Array.isArray(content.cases)) {
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

                // Contact button: mobile scrolls to form, desktop toggles send behavior.
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

                var dcSending = false;
                var dcSent = false;
                var sentTriggerTime = 604.5;
                var sentDuration = 5000;
                var greenDuration = 800;

                function dcResetButton() {
                    contactBtn.classList.add('dc-fade-out');
                    setTimeout(function() {
                        var resetPanel = document.querySelector('.contact');
                        var isStillOpen = resetPanel && resetPanel.classList.contains('contact--open');
                        var label = isStillOpen ? 'send' : 'Contact';
                        dcBtnText.textContent = label;
                        dcBtnWhite.textContent = label;
                        contactBtn.classList.remove('dc-fade-out');
                        contactBtn.classList.add('dc-resetting');
                        contactBtn.classList.remove('dc-sent', 'dc-sent-fade');
                        dcSent = false;
                        requestAnimationFrame(function() {
                            requestAnimationFrame(function() {
                                contactBtn.classList.remove('dc-resetting');
                            });
                        });
                    }, 500);
                }

                function dcStartAnimation() {
                    contactBtn.classList.add('dc-animating');
                    setTimeout(function() {
                        contactBtn.classList.add('dc-sent');
                        dcBtnText.textContent = 'sent';
                        dcBtnWhite.textContent = 'sent';
                        dcSent = true;
                    }, sentTriggerTime);
                    setTimeout(function() {
                        contactBtn.classList.remove('dc-sending', 'dc-animating');
                        dcSending = false;
                        setTimeout(function() { contactBtn.classList.add('dc-sent-fade'); }, greenDuration);
                        setTimeout(function() { dcResetButton(); }, sentDuration);
                    }, 1000);
                }

                function dcSubmit() {
                    var form = document.getElementById('contact-form');
                    if (!form || dcSending || dcSent) return;
                    if (!form.checkValidity()) { form.reportValidity(); return; }
                    dcSending = true;
                    contactBtn.classList.add('dc-sending');
                    var formData = new FormData(form);
                    fetch(form.action, { method: 'POST', body: formData })
                        .then(function(r) { return r.json(); })
                        .then(function(data) {
                            if (data.success) {
                                dcStartAnimation();
                                form.reset();
                            } else {
                                contactBtn.classList.remove('dc-sending');
                                dcSending = false;
                                alert('Failed to send message. Please try again.');
                            }
                        })
                        .catch(function() {
                            contactBtn.classList.remove('dc-sending');
                            dcSending = false;
                            alert('An error occurred. Please try again.');
                        });
                }

                contactBtn.addEventListener('click', function(e) {
                    var isDesktop = window.matchMedia('(min-width: 1024px)').matches;
                    if (!isDesktop) {
                        clearCaseSelection();
                        var contactTab = document.querySelector('.contact-tab');
                        var viewport = document.querySelector('.page-slider-viewport');
                        if (window.snapToPage) window.snapToPage(0);
                        if (contactTab && viewport) {
                            var tabTop = contactTab.getBoundingClientRect().top;
                            var viewportTop = viewport.getBoundingClientRect().top;
                            var delta = tabTop - viewportTop;
                            var maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
                            var targetScrollTop = viewport.scrollTop + delta;
                            var cappedScrollTop = Math.min(Math.max(0, targetScrollTop), maxScrollTop);
                            viewport.scrollTo({ top: cappedScrollTop, behavior: 'smooth' });
                        }
                        return;
                    }

                    e.stopPropagation();
                    if (dcSending || dcSent) return;
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
                    if (dcSending || dcSent) return;
                    var p = document.querySelector('.contact');
                    if (!p || !p.classList.contains('contact--open')) return;
                    p.classList.remove('contact--open');
                    dcBtnText.textContent = 'Contact';
                    dcBtnWhite.textContent = 'Contact';
                });

                var sel = [];
                for (var i = 0; i < validCases.length; i++) {
                    sel.push('.nav-bar[data-expanded="' + i + '"] > [data-expand="' + i + '"]');
                }
                var styleEl = document.createElement('style');
                var expandedRule = sel.join(',') + '{flex-grow:1;flex-shrink:1;flex-basis:0px;}';
                var idleRule = '.nav-bar[data-expanded="none"] > [data-expand]{flex-grow:1;flex-shrink:1;flex-basis:0px;}';
                styleEl.textContent = '@media (min-width:1024px){' + idleRule + expandedRule + '}';
                document.head.appendChild(styleEl);

                navBar._updateDescriptionDeadZone = updateDeadZone;
                navBar._descLeftForIndex = descLeftForIndex;
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
            function measureNavBarWidths() {
                var navBar = document.getElementById('nav-bar');
                if (!navBar || !window.matchMedia('(min-width: 1024px)').matches) return;
                var children = navBar.children;

                // Suppress transitions for the entire measure-and-restore cycle so the
                // browser never tries to animate flex-basis between auto and 0.
                for (var i = 0; i < children.length; i++) {
                    children[i].style.transition = 'none';
                }

                // Remove expanded state so every child is at its natural width.
                var saved = navBar.dataset.expanded;
                delete navBar.dataset.expanded;
                for (var i = 0; i < children.length; i++) {
                    children[i].style.setProperty('--collapsed-basis', 'auto');
                }
                navBar.offsetWidth; // force layout

                // Measure and lock each child's natural width as an explicit px value.
                for (var i = 0; i < children.length; i++) {
                    var w = children[i].getBoundingClientRect().width;
                    children[i].style.setProperty('--collapsed-basis', w + 'px');
                }

                // Restore expanded state instantly (transitions still off).
                if (typeof saved === 'string' && saved.length > 0) {
                    navBar.dataset.expanded = saved;
                } else {
                    delete navBar.dataset.expanded;
                }
                navBar.offsetWidth; // force layout so values are committed

                // Re-enable transitions next frame — all flex-basis values are now
                // explicit px, so every future transition is px → px and animatable.
                // Also set the initial description position without animation.
                requestAnimationFrame(function() {
                    for (var i = 0; i < children.length; i++) {
                        children[i].style.transition = '';
                    }
                    var initialIndex = parseInt(navBar.dataset.expanded) || 0;
                    if (navBarDesc && typeof navBar._descLeftForIndex === 'function') {
                        navBarDesc.style.left = navBar._descLeftForIndex(initialIndex) + 'px';
                    }
                    if (typeof navBar._updateDescriptionDeadZone === 'function') {
                        navBar._updateDescriptionDeadZone();
                    }
                });
            }
            function afterContentAndFonts() {
                runNavBarSync();
                measureNavBarWidths();
                renderDesktopCasePreview();
                requestAnimationFrame(function() {
                    window.dispatchEvent(new Event('resize'));
                });
            }
            window.addEventListener('resize', function() {
                renderDesktopCasePreview();
                startDesktopPreviewMagnet();
                var navBar = document.getElementById('nav-bar');
                if (navBar && typeof navBar._updateDescriptionDeadZone === 'function') {
                    navBar._updateDescriptionDeadZone();
                }
            });
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
