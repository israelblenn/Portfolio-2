(function() {
    function getNestedValue(obj, path) {
        return path.split('.').reduce(function(current, key) {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    }

    function setContent(element, value) {
        if (value === null || value === undefined) return;
        element.textContent = value;
    }

    function stripHtml(html) {
        var div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    function applySiteContent(content) {
        var titleElement = document.querySelector('title[data-content]');
        if (titleElement) {
            var titlePath = titleElement.getAttribute('data-content');
            var titleValue = getNestedValue(content, titlePath);
            if (titleValue) {
                document.title = titleValue;
            }
        }

        var elements = document.querySelectorAll('[data-content]');
        elements.forEach(function(element) {
            if (element.hasAttribute('data-content-emphasis')) return;
            var path = element.getAttribute('data-content');
            var value = getNestedValue(content, path);
            if (value !== null && value !== undefined) {
                setContent(element, value);
            }
        });

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

        var headline = getNestedValue(content, 'home.headline');
        var description = getNestedValue(content, 'home.description');
        if (headline && description) {
            var metaDescription = headline + ' ' + stripHtml(description);
            var metaDescEl = document.querySelector('meta[name="description"]');
            if (metaDescEl) metaDescEl.setAttribute('content', metaDescription);
            var ogDescEl = document.querySelector('meta[property="og:description"]');
            if (ogDescEl) ogDescEl.setAttribute('content', metaDescription);
        }
    }

    window.applySiteContent = applySiteContent;
})();
