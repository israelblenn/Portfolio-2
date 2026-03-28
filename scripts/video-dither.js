(function() {
    function hexToRgb01(hex) {
        if (typeof hex !== 'string') return null;
        var value = hex.trim().replace('#', '');
        if (value.length === 3) {
            value = value.charAt(0) + value.charAt(0) +
                value.charAt(1) + value.charAt(1) +
                value.charAt(2) + value.charAt(2);
        }
        if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
        var intValue = parseInt(value, 16);
        return [
            ((intValue >> 16) & 255) / 255,
            ((intValue >> 8) & 255) / 255,
            (intValue & 255) / 255
        ];
    }

    function compileShader(gl, type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            var err = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('Shader compile error: ' + err);
        }
        return shader;
    }

    function createProgram(gl, vertexSource, fragmentSource) {
        var vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
        var fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
        var program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            var err = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error('Program link error: ' + err);
        }
        return program;
    }

    function createDitheredVideoElement(videoEl, options) {
        options = options || {};
        var wrapper = document.createElement('div');
        wrapper.className = 'dither-video';
        wrapper.style.aspectRatio = '16 / 9';
        wrapper.classList.add('dither-video--suppress-transition');

        var canvas = document.createElement('canvas');
        canvas.className = 'dither-video-canvas';
        wrapper.appendChild(canvas);
        wrapper.appendChild(videoEl);

        var gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false
        });

        if (!gl) {
            wrapper.removeChild(canvas);
            videoEl.classList.add('dither-video-fallback');
            return wrapper;
        }

        var vertexSource = [
            'attribute vec2 a_pos;',
            'attribute vec2 a_uv;',
            'varying vec2 v_uv;',
            'void main() {',
            '  v_uv = vec2(a_uv.x, 1.0 - a_uv.y);',
            '  gl_Position = vec4(a_pos, 0.0, 1.0);',
            '}'
        ].join('\n');

        var fragmentSource = [
            'precision mediump float;',
            'uniform sampler2D u_texture;',
            'uniform vec2 u_resolution;',
            'uniform float u_gridSize;',
            'uniform float u_pixelation;',
            'uniform vec3 u_tintColor;',
            'uniform float u_tintStrength;',
            'uniform vec2 u_velocity;',
            'varying vec2 v_uv;',
            '',
            'float bayer4x4(vec2 p) {',
            '  vec2 f = mod(p, 4.0);',
            '  float x = f.x;',
            '  float y = f.y;',
            '  float index = 0.0;',
            '  if (y < 0.5) {',
            '    if (x < 0.5) index = 0.0;',
            '    else if (x < 1.5) index = 8.0;',
            '    else if (x < 2.5) index = 2.0;',
            '    else index = 10.0;',
            '  } else if (y < 1.5) {',
            '    if (x < 0.5) index = 12.0;',
            '    else if (x < 1.5) index = 4.0;',
            '    else if (x < 2.5) index = 14.0;',
            '    else index = 6.0;',
            '  } else if (y < 2.5) {',
            '    if (x < 0.5) index = 3.0;',
            '    else if (x < 1.5) index = 11.0;',
            '    else if (x < 2.5) index = 1.0;',
            '    else index = 9.0;',
            '  } else {',
            '    if (x < 0.5) index = 15.0;',
            '    else if (x < 1.5) index = 7.0;',
            '    else if (x < 2.5) index = 13.0;',
            '    else index = 5.0;',
            '  }',
            '  return (index + 0.5) / 16.0;',
            '}',
            '',
            'void main() {',
            '  vec2 centered = v_uv - 0.5;',
            '  float dist = length(centered);',
            '  vec2 warp = u_velocity * dist * 0.45;',
            '  vec2 warped_uv = v_uv + warp;',
            '  vec2 frag = warped_uv * u_resolution;',
            '  float pixel = max(1.0, u_pixelation);',
            '  vec2 pixelUV = floor(frag / pixel) * pixel;',
            '  vec2 uv = pixelUV / u_resolution;',
            '  vec3 color = texture2D(u_texture, uv).rgb;',
            '  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));',
            '  float threshold = bayer4x4(floor(pixelUV / max(1.0, u_gridSize)));',
            '  float bw = 1.0 - step(threshold, lum);',
            '  vec3 tinted = vec3(bw) * u_tintColor;',
            '  vec3 dithered = mix(vec3(bw), tinted, clamp(u_tintStrength, 0.0, 1.0));',
            '  gl_FragColor = vec4(dithered, 1.0);',
            '}'
        ].join('\n');

        var program;
        try {
            program = createProgram(gl, vertexSource, fragmentSource);
        } catch (error) {
            console.error(error);
            wrapper.removeChild(canvas);
            videoEl.classList.add('dither-video-fallback');
            return wrapper;
        }

        gl.useProgram(program);

        var quad = new Float32Array([
            -1, -1, 0, 0,
             1, -1, 1, 0,
            -1,  1, 0, 1,
            -1,  1, 0, 1,
             1, -1, 1, 0,
             1,  1, 1, 1
        ]);
        var vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

        var aPos = gl.getAttribLocation(program, 'a_pos');
        var aUv = gl.getAttribLocation(program, 'a_uv');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        var uTexture = gl.getUniformLocation(program, 'u_texture');
        var uResolution = gl.getUniformLocation(program, 'u_resolution');
        var uGridSize = gl.getUniformLocation(program, 'u_gridSize');
        var uPixelation = gl.getUniformLocation(program, 'u_pixelation');
        var uTintColor = gl.getUniformLocation(program, 'u_tintColor');
        var uTintStrength = gl.getUniformLocation(program, 'u_tintStrength');
        var uVelocity = gl.getUniformLocation(program, 'u_velocity');

        var gridSize = typeof options.gridSize === 'number' ? options.gridSize : 2.0;
        var pixelation = typeof options.pixelation === 'number' ? options.pixelation : 2.0;
        var tintStrength = typeof options.tintStrength === 'number' ? options.tintStrength : 1.0;
        var tintColor = hexToRgb01(options.tintHex) || [1.0, 1.0, 1.0];
        var enabled = true;
        var hasRenderedFrame = false;
        var velocityX = 0.0;
        var velocityY = 0.0;

        function resize() {
            var rect = wrapper.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var w = Math.max(1, Math.round(rect.width * dpr));
            var h = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
        }

        function render() {
            resize();
            if (enabled && videoEl.readyState >= 2) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, videoEl);
                gl.useProgram(program);
                gl.uniform1i(uTexture, 0);
                gl.uniform2f(uResolution, canvas.width, canvas.height);
                gl.uniform1f(uGridSize, gridSize);
                gl.uniform1f(uPixelation, pixelation);
                gl.uniform3f(uTintColor, tintColor[0], tintColor[1], tintColor[2]);
                gl.uniform1f(uTintStrength, tintStrength);
                gl.uniform2f(uVelocity, velocityX, velocityY);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                if (!hasRenderedFrame) {
                    hasRenderedFrame = true;
                    wrapper.classList.add('dither-video--ready');
                    requestAnimationFrame(function() {
                        requestAnimationFrame(function() {
                            wrapper.classList.remove('dither-video--suppress-transition');
                        });
                    });
                }
            }
            requestAnimationFrame(render);
        }

        function setSettings(nextSettings) {
            if (!nextSettings || typeof nextSettings !== 'object') return;
            if (typeof nextSettings.gridSize === 'number' && isFinite(nextSettings.gridSize)) {
                gridSize = Math.max(1.0, nextSettings.gridSize);
            }
            if (typeof nextSettings.pixelation === 'number' && isFinite(nextSettings.pixelation)) {
                pixelation = Math.max(1.0, nextSettings.pixelation);
            }
            if (typeof nextSettings.tintStrength === 'number' && isFinite(nextSettings.tintStrength)) {
                tintStrength = Math.max(0.0, Math.min(1.0, nextSettings.tintStrength));
            }
            if (typeof nextSettings.tintHex === 'string') {
                var parsed = hexToRgb01(nextSettings.tintHex);
                if (parsed) tintColor = parsed;
            }
        }

        function setEnabled(nextEnabled) {
            enabled = !!nextEnabled;
            if (enabled) {
                wrapper.classList.remove('dither-video--disabled');
            } else {
                wrapper.classList.add('dither-video--disabled');
            }
        }

        function isEnabled() {
            return enabled;
        }

        function setVelocity(vx, vy) {
            velocityX = vx;
            velocityY = vy;
        }

        var resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(wrapper);
        window.addEventListener('resize', resize);

        render();
        wrapper.setDitherSettings = setSettings;
        wrapper.setDitherEnabled = setEnabled;
        wrapper.isDitherEnabled = isEnabled;
        wrapper.setVelocity = setVelocity;
        return wrapper;
    }

    function createViewportDitherCanvas() {
        var canvas = document.createElement('canvas');
        canvas.className = 'viewport-dither-canvas';

        var gl = canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false
        });
        if (!gl) return null;

        var vertexSource = [
            'attribute vec2 a_pos;',
            'attribute vec2 a_uv;',
            'varying vec2 v_uv;',
            'void main() {',
            '  v_uv = vec2(a_uv.x, 1.0 - a_uv.y);',
            '  gl_Position = vec4(a_pos, 0.0, 1.0);',
            '}'
        ].join('\n');

        var fragmentSource = [
            'precision mediump float;',
            'uniform sampler2D u_texture;',
            'uniform vec2 u_resolution;',
            'uniform vec2 u_videoCenter;',
            'uniform vec2 u_videoSize;',
            'uniform vec2 u_velocity;',
            'uniform float u_zoomWarp;',
            'uniform float u_gridSize;',
            'uniform float u_pixelation;',
            'uniform vec3 u_tintColor;',
            'uniform float u_tintStrength;',
            'uniform float u_ditherMix;',
            'varying vec2 v_uv;',
            '',
            'float bayer4x4(vec2 p) {',
            '  vec2 f = mod(p, 4.0);',
            '  float x = f.x;',
            '  float y = f.y;',
            '  float index = 0.0;',
            '  if (y < 0.5) {',
            '    if (x < 0.5) index = 0.0;',
            '    else if (x < 1.5) index = 8.0;',
            '    else if (x < 2.5) index = 2.0;',
            '    else index = 10.0;',
            '  } else if (y < 1.5) {',
            '    if (x < 0.5) index = 12.0;',
            '    else if (x < 1.5) index = 4.0;',
            '    else if (x < 2.5) index = 14.0;',
            '    else index = 6.0;',
            '  } else if (y < 2.5) {',
            '    if (x < 0.5) index = 3.0;',
            '    else if (x < 1.5) index = 11.0;',
            '    else if (x < 2.5) index = 1.0;',
            '    else index = 9.0;',
            '  } else {',
            '    if (x < 0.5) index = 15.0;',
            '    else if (x < 1.5) index = 7.0;',
            '    else if (x < 2.5) index = 13.0;',
            '    else index = 5.0;',
            '  }',
            '  return (index + 0.5) / 16.0;',
            '}',
            '',
            'void main() {',
            '  vec2 fragPx = v_uv * u_resolution;',
            '  vec2 rel = (fragPx - u_videoCenter) / u_videoSize;',
            '  float dist = length(rel);',
            '  float pinchFalloff = max(0.0, 1.0 - dist * 1.35);',
            '  vec2 pinchedRel = rel * (1.0 + u_zoomWarp * pinchFalloff);',
            '  float pinchedDist = length(pinchedRel);',
            '  vec2 warp = u_velocity * pinchedDist * 0.45;',
            '  vec2 warpedRel = pinchedRel + warp;',
            '  vec2 videoUV = warpedRel + 0.5;',
            '  vec2 shadowTestUV = videoUV - vec2(0.012, 0.018);',
            '  vec2 sd = max(abs(shadowTestUV - 0.5) - 0.5, 0.0) * u_videoSize;',
            '  float shadowDist = length(sd);',
            '  bool outside = videoUV.x < 0.0 || videoUV.x > 1.0 || videoUV.y < 0.0 || videoUV.y > 1.0;',
            '  if (outside) {',
            '    float minDim = min(u_videoSize.x, u_videoSize.y);',
            '    float shadowSpread = 0.09 * minDim;',
            '    float shadowAlpha = 0.14 * exp(-2.8 * shadowDist / shadowSpread);',
            '    if (shadowAlpha < 0.002) discard;',
            '    gl_FragColor = vec4(0.0, 0.0, 0.0, shadowAlpha);',
            '    return;',
            '  }',
            '  vec3 color = texture2D(u_texture, videoUV).rgb;',
            '  if (u_ditherMix < 0.01) {',
            '    gl_FragColor = vec4(color, 1.0);',
            '    return;',
            '  }',
            '  vec2 videoFrag = videoUV * u_videoSize;',
            '  float pixel = max(1.0, u_pixelation);',
            '  vec2 pixelUV = floor(videoFrag / pixel) * pixel;',
            '  vec2 ditherSampleUV = pixelUV / u_videoSize;',
            '  vec3 ditherColor = texture2D(u_texture, ditherSampleUV).rgb;',
            '  float lum = dot(ditherColor, vec3(0.2126, 0.7152, 0.0722));',
            '  float threshold = bayer4x4(floor(pixelUV / max(1.0, u_gridSize)));',
            '  float bw = 1.0 - step(threshold, lum);',
            '  vec3 tinted = vec3(bw) * u_tintColor;',
            '  vec3 dithered = mix(vec3(bw), tinted, clamp(u_tintStrength, 0.0, 1.0));',
            '  vec3 final = mix(color, dithered, u_ditherMix);',
            '  gl_FragColor = vec4(final, 1.0);',
            '}'
        ].join('\n');

        var program;
        try {
            program = createProgram(gl, vertexSource, fragmentSource);
        } catch (error) {
            console.error(error);
            return null;
        }

        gl.useProgram(program);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        var quad = new Float32Array([
            -1, -1, 0, 0,
             1, -1, 1, 0,
            -1,  1, 0, 1,
            -1,  1, 0, 1,
             1, -1, 1, 0,
             1,  1, 1, 1
        ]);
        var vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

        var aPos = gl.getAttribLocation(program, 'a_pos');
        var aUv = gl.getAttribLocation(program, 'a_uv');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        var uTexture = gl.getUniformLocation(program, 'u_texture');
        var uResolution = gl.getUniformLocation(program, 'u_resolution');
        var uVideoCenter = gl.getUniformLocation(program, 'u_videoCenter');
        var uVideoSize = gl.getUniformLocation(program, 'u_videoSize');
        var uVelocity = gl.getUniformLocation(program, 'u_velocity');
        var uZoomWarp = gl.getUniformLocation(program, 'u_zoomWarp');
        var uGridSize = gl.getUniformLocation(program, 'u_gridSize');
        var uPixelation = gl.getUniformLocation(program, 'u_pixelation');
        var uTintColor = gl.getUniformLocation(program, 'u_tintColor');
        var uTintStrength = gl.getUniformLocation(program, 'u_tintStrength');
        var uDitherMix = gl.getUniformLocation(program, 'u_ditherMix');

        var videoEl = null;
        var centerX = 0, centerY = 0;
        var sizeW = 400, sizeH = 225;
        var velocityX = 0, velocityY = 0;
        var zoomWarp = 0.0;
        var gridSize = 2.0, pixelation = 2.0;
        var tintColor = [1, 1, 1];
        var tintStrength = 1.0;
        var ditherMix = 1.0;
        var enabled = false;

        function resize() {
            if (!canvas.parentElement) return;
            var rect = canvas.parentElement.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var w = Math.max(1, Math.round(rect.width * dpr));
            var h = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
        }

        function render() {
            resize();
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            if (enabled && videoEl && videoEl.readyState >= 2) {
                var dpr = Math.min(window.devicePixelRatio || 1, 2);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, videoEl);
                gl.useProgram(program);
                gl.uniform1i(uTexture, 0);
                gl.uniform2f(uResolution, canvas.width, canvas.height);
                gl.uniform2f(uVideoCenter, centerX * dpr, centerY * dpr);
                gl.uniform2f(uVideoSize, sizeW * dpr, sizeH * dpr);
                gl.uniform2f(uVelocity, velocityX, velocityY);
                gl.uniform1f(uZoomWarp, zoomWarp);
                gl.uniform1f(uGridSize, gridSize);
                gl.uniform1f(uPixelation, pixelation);
                gl.uniform3f(uTintColor, tintColor[0], tintColor[1], tintColor[2]);
                gl.uniform1f(uTintStrength, tintStrength);
                gl.uniform1f(uDitherMix, ditherMix);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
            requestAnimationFrame(render);
        }

        render();

        return {
            canvas: canvas,
            setVideo: function(vid) { videoEl = vid; },
            setCenter: function(cx, cy) { centerX = cx; centerY = cy; },
            setSize: function(w, h) { sizeW = w; sizeH = h; },
            setVelocity: function(vx, vy) { velocityX = vx; velocityY = vy; },
            setZoomWarp: function(value) { zoomWarp = value; },
            setDitherMix: function(mix) { ditherMix = mix; },
            getDitherMix: function() { return ditherMix; },
            setDitherSettings: function(opts) {
                if (!opts) return;
                if (typeof opts.gridSize === 'number') gridSize = Math.max(1.0, opts.gridSize);
                if (typeof opts.pixelation === 'number') pixelation = Math.max(1.0, opts.pixelation);
                if (typeof opts.tintStrength === 'number') tintStrength = Math.max(0, Math.min(1, opts.tintStrength));
                if (typeof opts.tintHex === 'string') {
                    var parsed = hexToRgb01(opts.tintHex);
                    if (parsed) tintColor = parsed;
                }
            },
            setEnabled: function(e) { enabled = !!e; }
        };
    }

    window.createDitheredVideoElement = createDitheredVideoElement;
    window.createViewportDitherCanvas = createViewportDitherCanvas;
})();
