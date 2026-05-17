(function() {
    var loaderPromise = null;
    var pretextModule = null;
    var prepareCache = new Map();
    var changeListeners = [];

    function load() {
        if (loaderPromise) return loaderPromise;
        loaderPromise = import('https://cdn.jsdelivr.net/npm/@chenglou/pretext/+esm')
            .then(function(mod) {
                pretextModule = mod;
                notifyChange('module');
                return mod;
            })
            .catch(function() {
                pretextModule = null;
                notifyChange('module');
                return null;
            });
        return loaderPromise;
    }

    function notifyChange(reason) {
        for (var i = 0; i < changeListeners.length; i++) {
            try { changeListeners[i](reason); } catch (e) {}
        }
    }

    function whenReady() {
        if (loaderPromise) return loaderPromise;
        return load();
    }

    function onChange(callback) {
        if (typeof callback !== 'function') return function() {};
        changeListeners.push(callback);
        return function() {
            var idx = changeListeners.indexOf(callback);
            if (idx !== -1) changeListeners.splice(idx, 1);
        };
    }

    function fontShorthand(style) {
        if (style && style.font && style.font.indexOf('px') !== -1) return style.font;
        var parts = [];
        if (style.fontStyle && style.fontStyle !== 'normal') parts.push(style.fontStyle);
        if (style.fontVariant && style.fontVariant !== 'normal') parts.push(style.fontVariant);
        if (style.fontWeight) parts.push(style.fontWeight);
        parts.push(style.fontSize || '16px');
        parts.push(style.fontFamily || 'sans-serif');
        return parts.join(' ');
    }

    function letterSpacingPx(style) {
        if (!style || !style.letterSpacing || style.letterSpacing === 'normal') return 0;
        var v = parseFloat(style.letterSpacing);
        return isNaN(v) ? 0 : v;
    }

    function parsePx(value) {
        var v = parseFloat(value);
        return isNaN(v) ? 0 : v;
    }

    function measureText(text, font, letterSpacing) {
        var value = String(text == null ? '' : text);
        if (!value) return 0;
        var ls = letterSpacing || 0;

        if (pretextModule && typeof pretextModule.prepareWithSegments === 'function' && typeof pretextModule.measureNaturalWidth === 'function') {
            try {
                var key = font + '|' + ls + '|' + value;
                var prepared = prepareCache.get(key);
                if (!prepared) {
                    var opts = ls ? { letterSpacing: ls } : undefined;
                    prepared = pretextModule.prepareWithSegments(value, font, opts);
                    prepareCache.set(key, prepared);
                }
                return pretextModule.measureNaturalWidth(prepared);
            } catch (e) {}
        }

        var canvas = measureText._canvas || (measureText._canvas = document.createElement('canvas'));
        var ctx = canvas.getContext('2d');
        if (!ctx) return 0;
        ctx.font = font;
        return ctx.measureText(value).width;
    }

    function measureElementText(element, text) {
        if (!element) return 0;
        var style = window.getComputedStyle(element);
        return measureText(
            text != null ? text : element.textContent,
            fontShorthand(style),
            letterSpacingPx(style)
        );
    }

    function measureInlineBoxWidth(element, text) {
        if (!element) return 0;
        var style = window.getComputedStyle(element);
        var textWidth = measureText(
            text != null ? text : element.textContent,
            fontShorthand(style),
            letterSpacingPx(style)
        );
        var padding = parsePx(style.paddingInlineStart) + parsePx(style.paddingInlineEnd);
        var border = parsePx(style.borderInlineStartWidth) + parsePx(style.borderInlineEndWidth);
        return textWidth + padding + border;
    }

    function clearCache() {
        prepareCache.clear();
        if (pretextModule && typeof pretextModule.clearCache === 'function') {
            try { pretextModule.clearCache(); } catch (e) {}
        }
        notifyChange('cache');
    }

    function isReady() {
        return !!pretextModule;
    }

    load();

    if (document.fonts) {
        if (document.fonts.ready && typeof document.fonts.ready.then === 'function') {
            document.fonts.ready.then(clearCache);
        }
        if (typeof document.fonts.addEventListener === 'function') {
            document.fonts.addEventListener('loadingdone', clearCache);
        }
    }

    window.pretextMeasure = {
        whenReady: whenReady,
        onChange: onChange,
        measureText: measureText,
        measureElementText: measureElementText,
        measureInlineBoxWidth: measureInlineBoxWidth,
        fontShorthand: fontShorthand,
        letterSpacingPx: letterSpacingPx,
        parsePx: parsePx,
        clearCache: clearCache,
        isReady: isReady
    };
})();
