(function() {
    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function createDesktopPreviewModule(options) {
        options = options || {};
        var getSelectedCaseIndex = options.getSelectedCaseIndex || function() { return null; };
        var getCaseByIndex = options.getCaseByIndex || function() { return null; };

        var desktopPreviewHost = null;
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
        var desktopPreviewMomentumRafId = null;
        var desktopPreviewMagnetRafId = null;

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

        function startDesktopPreviewDitherFadeInForExit(renderer) {
            cancelDesktopPreviewDitherFade();
            var fromMix = typeof renderer.getDitherMix === 'function' ? renderer.getDitherMix() : 0;
            fromMix = clamp(fromMix, 0, 1);
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

        function clearDelayedRender() {
            if (delayedPreviewRenderTimeout !== null) {
                clearTimeout(delayedPreviewRenderTimeout);
                delayedPreviewRenderTimeout = null;
            }
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

        function bakeDesktopPreviewLiftIntoScale() {
            var liftMul = desktopPreviewLiftBoost;
            if (liftMul < 1e-4 && desktopPreviewLiftTarget > 1e-4) {
                liftMul = desktopPreviewLiftTarget;
            }
            if (liftMul < 1e-4) return;
            var vis = desktopPreviewScale * (1 + liftMul);
            vis = clamp(vis, 0.5, 2.5);
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
            if (desktopPreviewHitArea) {
                desktopPreviewHitArea.style.width = size.w + 'px';
                desktopPreviewHitArea.style.height = size.h + 'px';
                desktopPreviewHitArea.style.left = center.x + 'px';
                desktopPreviewHitArea.style.top = center.y + 'px';
            }
        }

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
            t = clamp(t, 0, 1);
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
            return { dx: f.pullX * f.strength * k, dy: f.pullY * f.strength * k };
        }

        function getMagneticMomentumImpulse() {
            var f = getDesktopPreviewMagneticField();
            var k = 0.032;
            return { ax: f.pullX * f.strength * k, ay: f.pullY * f.strength * k };
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

        function initDesktopPreviewInteraction() {
            var hitArea = ensureHitArea();
            var renderer = desktopViewportRenderer;
            var isDragging = false;
            var startPointerX = 0, startPointerY = 0;
            var startOffsetX = 0, startOffsetY = 0;
            var samples = [];
            var MAX_SAMPLES = 8;
            var velX = 0, velY = 0;
            var FRICTION = 0.92;
            var VELOCITY_THRESHOLD = 0.5;
            var WARP_SCALE = 1.0 / 102.0;
            var MAX_WARP_VEL = 270;
            var WARP_VEL_SMOOTH = 0.28;
            var WARP_VEL_SMOOTH_MOMENTUM = 0.38;
            var MIN_DT_MS = 10;
            var motionWarpX = 0, motionWarpY = 0;
            var warpVelSmoothX = 0, warpVelSmoothY = 0;
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
                renderer.setVelocity(motionWarpX * WARP_SCALE + wheelWarpX, motionWarpY * WARP_SCALE + wheelWarpY);
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

            function clampWarpVelocity(vx, vy) {
                var len = Math.sqrt(vx * vx + vy * vy);
                if (len <= MAX_WARP_VEL || len < 1e-6) return { vx: vx, vy: vy };
                var s = MAX_WARP_VEL / len;
                return { vx: vx * s, vy: vy * s };
            }

            function smoothWarpToward(tx, ty, alpha) {
                warpVelSmoothX += (tx - warpVelSmoothX) * alpha;
                warpVelSmoothY += (ty - warpVelSmoothY) * alpha;
            }

            function computeVelocity() {
                if (samples.length < 2) return { vx: 0, vy: 0 };
                var totalVx = 0;
                var totalVy = 0;
                var weight = 0;
                for (var i = 1; i < samples.length; i++) {
                    var a = samples[i - 1];
                    var b = samples[i];
                    var dt = b.t - a.t;
                    if (dt < 0.5) continue;
                    var effDt = Math.max(dt, MIN_DT_MS);
                    var scale = 16.67 / effDt;
                    var w = dt;
                    totalVx += (b.x - a.x) * scale * w;
                    totalVy += (b.y - a.y) * scale * w;
                    weight += w;
                }
                if (weight < 1e-6) return { vx: 0, vy: 0 };
                return { vx: totalVx / weight, vy: totalVy / weight };
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
                var wv = clampWarpVelocity(velX, velY);
                smoothWarpToward(wv.vx, wv.vy, WARP_VEL_SMOOTH_MOMENTUM);
                motionWarpX = warpVelSmoothX;
                motionWarpY = warpVelSmoothY;
                applyShaderVelocity();

                if (Math.abs(velX) < VELOCITY_THRESHOLD && Math.abs(velY) < VELOCITY_THRESHOLD) {
                    velX = 0;
                    velY = 0;
                    warpVelSmoothX = 0;
                    warpVelSmoothY = 0;
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
                var inst = computeVelocity();
                var vel = clampWarpVelocity(inst.vx, inst.vy);
                smoothWarpToward(vel.vx, vel.vy, WARP_VEL_SMOOTH);
                motionWarpX = warpVelSmoothX;
                motionWarpY = warpVelSmoothY;
                applyShaderVelocity();
            }

            function applyWheelScale(event) {
                if (desktopPreviewIsDragging && (desktopPreviewLiftBoost > 1e-4 || desktopPreviewLiftTarget > 1e-4)) {
                    bakeDesktopPreviewLiftIntoScale();
                }
                var prevTarget = desktopPreviewScaleTarget;
                var nextScale = desktopPreviewScaleTarget + (-event.deltaY * 0.0012);
                var clamped = clamp(nextScale, 0.5, 2.5);
                var scaleWouldChange = Math.abs(clamped - prevTarget) > 1e-6;
                desktopPreviewScaleTarget = clamped;
                if (scaleWouldChange) startScaleSmoothing();
                if (desktopPreviewIsDragging && scaleWouldChange) desktopPreviewWheelUsedThisDrag = true;
                if (scaleWouldChange) {
                    var size = computeVideoSize();
                    var center = computeVideoCenter();
                    var relX = (event.clientX - center.x) / Math.max(1, size.w);
                    var impulse = -event.deltaY * 0.00018;
                    wheelWarpX += relX * impulse * 0.9;
                    wheelWarpY += impulse * 1.4;
                    zoomWarp += event.deltaY * 0.00035;
                    zoomWarp = clamp(zoomWarp, -0.22, 0.22);
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
                if (desktopPreviewWheelUsedThisDrag) bakeDesktopPreviewLiftIntoScale();
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
                    warpVelSmoothX = 0;
                    warpVelSmoothY = 0;
                    motionWarpX = 0;
                    motionWarpY = 0;
                    applyShaderVelocity();
                }
            }

            hitArea.addEventListener('pointerdown', function(event) {
                if (event.button !== 0) return;
                if (!desktopPreviewActiveVideo) return;
                cancelMomentum();
                warpVelSmoothX = 0;
                warpVelSmoothY = 0;
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
                warpVelSmoothX = 0;
                warpVelSmoothY = 0;
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

        function runDesktopPreviewInterCaseTransition(nextCase) {
            var renderer = getViewportRenderer();
            if (!renderer || !desktopPreviewActiveVideo || !nextCase || !nextCase.video) return;

            var targetIndex = getSelectedCaseIndex();
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
                if (getSelectedCaseIndex() !== targetIndex || !desktopPreviewActiveVideo) {
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
                if (getSelectedCaseIndex() !== targetIndex) return;
                var oldVid = desktopPreviewActiveVideo;
                var vid = buildDesktopPreviewVideo(nextCase);
                if (!vid) return;
                document.body.appendChild(vid);
                var playPromise = vid.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(function() {});
                }

                function applySwapWhenNewVideoReady() {
                    if (getSelectedCaseIndex() !== targetIndex) {
                        if (vid.parentNode) vid.parentNode.removeChild(vid);
                        return;
                    }
                    if (oldVid && oldVid.parentNode) oldVid.parentNode.removeChild(oldVid);
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

        function reset() {
            clearDelayedRender();
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
            clearDelayedRender();
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
                if (fadingVideo && fadingVideo.parentNode) fadingVideo.parentNode.removeChild(fadingVideo);
            }, 500);
        }

        function renderSelectedCase() {
            var isDesktop = window.matchMedia('(min-width: 1024px)').matches;
            if (!isDesktop) {
                reset();
                return;
            }
            var renderer = getViewportRenderer();
            if (!renderer) return;

            var selectedCaseIndex = getSelectedCaseIndex();
            if (selectedCaseIndex === null) {
                fadeOutDesktopPreview();
                return;
            }
            var selectedCase = getCaseByIndex(selectedCaseIndex);
            if (!selectedCase || !selectedCase.video) {
                reset();
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

        function scheduleRender(delay) {
            clearDelayedRender();
            delayedPreviewRenderTimeout = setTimeout(function() {
                delayedPreviewRenderTimeout = null;
                renderSelectedCase();
            }, delay);
        }

        function onResize() {
            renderSelectedCase();
            startDesktopPreviewMagnet();
        }

        return {
            reset: reset,
            renderSelectedCase: renderSelectedCase,
            scheduleRender: scheduleRender,
            clearDelayedRender: clearDelayedRender,
            startMagnet: startDesktopPreviewMagnet,
            onResize: onResize
        };
    }

    window.createDesktopPreviewModule = createDesktopPreviewModule;
})();
