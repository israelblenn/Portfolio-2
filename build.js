#!/usr/bin/env node
/*
 * Bakes content.json into index.html so the page ships fully-rendered HTML
 * to crawlers and link previewers. Runtime JS still hydrates the page for
 * interactivity (video shaders, nav animations, etc).
 *
 * Re-run with `node build.js` after editing content.json. The script is
 * idempotent: re-running produces the same output.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CONTENT_PATH = path.join(ROOT, 'content.json');
const HTML_PATH = path.join(ROOT, 'index.html');

function getNestedValue(obj, dotted) {
    return dotted.split('.').reduce(function(cur, key) {
        return cur && cur[key] !== undefined ? cur[key] : null;
    }, obj);
}

function escapeHtmlText(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function stripInlineHtml(value) {
    return String(value).replace(/<[^>]+>/g, '');
}

function normalizeSiteUrl(url) {
    const base = String(url || '').trim().replace(/\/+$/, '');
    if (!base) return '';
    return base + '/';
}

function resolveAbsoluteUrl(siteUrl, assetPath) {
    if (!assetPath || typeof assetPath !== 'string') return null;
    const trimmed = assetPath.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const base = String(siteUrl || '').trim().replace(/\/+$/, '');
    if (!base) return null;
    return base + '/' + trimmed.replace(/^\/+/, '');
}

function isPublicCaseUrl(link) {
    if (!link || typeof link !== 'string') return false;
    const trimmed = link.trim();
    return trimmed.length > 0 && trimmed !== '#';
}

function buildJsonLd(content) {
    const siteUrl = normalizeSiteUrl(getNestedValue(content, 'site.url'));
    const siteTitle = getNestedValue(content, 'site.title') || '';
    const headline = getNestedValue(content, 'home.headline') || '';
    const description = stripInlineHtml(getNestedValue(content, 'home.description') || '');
    const metaDescription = (headline + ' ' + description).trim();
    const email = getNestedValue(content, 'contact.email');
    const phone = getNestedValue(content, 'contact.phone');
    const personId = siteUrl ? siteUrl + '#person' : '#person';
    const websiteId = siteUrl ? siteUrl + '#website' : '#website';

    const graph = [];

    if (siteUrl) {
        graph.push({
            '@type': 'WebSite',
            '@id': websiteId,
            url: siteUrl,
            name: siteTitle,
            description: metaDescription,
            publisher: { '@id': personId }
        });
    }

    const person = {
        '@type': 'Person',
        '@id': personId,
        name: siteTitle,
        description: metaDescription
    };
    if (siteUrl) person.url = siteUrl;
    if (email) person.email = email;
    if (phone) person.telephone = phone;
    graph.push(person);

    const cases = Array.isArray(content.cases) ? content.cases : [];
    cases.forEach(function(caseItem, index) {
        if (!caseItem || typeof caseItem !== 'object') return;
        const work = {
            '@type': 'CreativeWork',
            '@id': siteUrl ? siteUrl + '#work-' + index : '#work-' + index,
            name: caseItem.name || '',
            description: stripInlineHtml(caseItem.description || ''),
            creator: { '@id': personId }
        };
        if (isPublicCaseUrl(caseItem.link)) {
            work.url = caseItem.link.trim();
        }
        const imageUrl = resolveAbsoluteUrl(siteUrl, caseItem.image);
        const videoUrl = resolveAbsoluteUrl(siteUrl, caseItem.video);
        if (imageUrl) work.image = imageUrl;
        if (videoUrl) work.contentUrl = videoUrl;
        graph.push(work);
    });

    return JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': graph
    }, null, 4);
}

function renderCanonical(siteUrl) {
    const url = normalizeSiteUrl(siteUrl);
    if (!url) {
        return '    <!-- site.url not set in content.json -->';
    }
    return [
        '    <link rel="canonical" href="' + escapeHtmlAttr(url) + '">',
        '    <meta property="og:url" content="' + escapeHtmlAttr(url) + '">'
    ].join('\n');
}

function renderJsonLd(content) {
  const json = buildJsonLd(content);
  return '    <script type="application/ld+json">\n' + json + '\n    </script>';
}

function replaceBetweenMarkers(html, name, replacement) {
    const re = new RegExp(
        '(<!--\\s*BUILD:' + name + ':start\\s*-->)[\\s\\S]*?(<!--\\s*BUILD:' + name + ':end\\s*-->)'
    );
    if (!re.test(html)) {
        throw new Error('Missing build markers for "' + name + '" in index.html');
    }
    return html.replace(re, function(_m, openTag, closeTag) {
        return openTag + '\n' + replacement + '\n' + closeTag;
    });
}

function replaceTitle(html, content) {
    return html.replace(
        /(<title\b[^>]*\bdata-content="([^"]+)"[^>]*>)[\s\S]*?(<\/title>)/,
        function(_m, openTag, dotted, closeTag) {
            const value = getNestedValue(content, dotted);
            return openTag + escapeHtmlText(value || '') + closeTag;
        }
    );
}

function replaceMetaContent(html, selectorAttr, selectorValue, newContent) {
    const re = new RegExp(
        '(<meta\\s+' + selectorAttr + '="' + selectorValue + '"\\s+content=")[^"]*(")'
    );
    return html.replace(re, function(_m, a, b) {
        return a + escapeHtmlAttr(newContent) + b;
    });
}

function replaceSimpleDataContent(html, content) {
    // Replace text-only data-content elements (skip those with emphasis).
    return html.replace(
        /(<(span|p|div|h[1-6])\b[^>]*\bdata-content="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
        function(match, openTag, _tag, dotted, _body, closeTag) {
            if (/data-content-emphasis="/.test(openTag)) return match;
            const value = getNestedValue(content, dotted);
            if (value === null || value === undefined) return match;
            return openTag + escapeHtmlText(value) + closeTag;
        }
    );
}

function replaceEmphasisDataContent(html, content) {
    // Replace headline + emphasis pairs. The description value may contain
    // trusted inline HTML (e.g. <i>most</i>) and is intentionally not escaped.
    return html.replace(
        /(<(p|div|span)\b[^>]*\bdata-content="([^"]+)"[^>]*\bdata-content-emphasis="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
        function(match, openTag, _tag, mainPath, emPath, _body, closeTag) {
            const mainValue = getNestedValue(content, mainPath);
            const emValue = getNestedValue(content, emPath);
            if (mainValue == null || emValue == null) return match;
            return openTag + escapeHtmlText(mainValue) + ' <em>' + emValue + '</em>' + closeTag;
        }
    );
}

function renderWorkCases(cases, indent) {
    const pad = indent || '                ';
    const innerPad = pad + '    ';
    const lines = [];
    cases.forEach(function(caseItem) {
        if (!caseItem || typeof caseItem !== 'object') return;
        const style = caseItem.colour ? ' style="background-color: ' + escapeHtmlAttr(caseItem.colour) + '"' : '';
        lines.push(pad + '<div class="work-case"' + style + '>');
        lines.push(innerPad + '<p>' + escapeHtmlText(caseItem.description || '') + '</p>');
        if (caseItem.video) {
            lines.push(innerPad + '<div class="dither-video dither-video--suppress-transition" style="aspect-ratio: 16 / 9;">');
            lines.push(innerPad + '    <canvas class="dither-video-canvas"></canvas>');
            lines.push(innerPad + '    <video autoplay loop muted playsinline>');
            lines.push(innerPad + '        <source src="' + escapeHtmlAttr(caseItem.video) + '" type="video/mp4">');
            lines.push(innerPad + '    </video>');
            lines.push(innerPad + '</div>');
        } else if (caseItem.image) {
            lines.push(innerPad + '<img src="' + escapeHtmlAttr(caseItem.image) + '" alt="" loading="lazy">');
        }
        lines.push(pad + '</div>');
    });
    return lines.join('\n');
}

function renderNavBar(cases, indent) {
    const pad = indent || '            ';
    const lines = [];
    lines.push(pad + '<div class="nav-bar-home">\u00BF</div>');
    cases.forEach(function(caseItem, index) {
        if (!caseItem || typeof caseItem !== 'object') return;
        const style = caseItem.colour ? ' style="background-color: ' + escapeHtmlAttr(caseItem.colour) + '"' : '';
        lines.push(
            pad + '<div class="nav-bar-case" data-expand="' + index + '"' + style + '>' +
            escapeHtmlText(caseItem.name || '') + '</div>'
        );
    });
    return lines.join('\n');
}

function main() {
    const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
    let html = fs.readFileSync(HTML_PATH, 'utf8');

    html = replaceTitle(html, content);

    const headline = getNestedValue(content, 'home.headline') || '';
    const description = stripInlineHtml(getNestedValue(content, 'home.description') || '');
    const metaDescription = (headline + ' ' + description).trim();
    const siteTitle = getNestedValue(content, 'site.title') || '';

    html = replaceMetaContent(html, 'name', 'description', metaDescription);
    html = replaceMetaContent(html, 'property', 'og:description', metaDescription);
    html = replaceMetaContent(html, 'property', 'og:title', siteTitle);

    const siteUrl = getNestedValue(content, 'site.url');
    html = replaceBetweenMarkers(html, 'canonical', renderCanonical(siteUrl));
    html = replaceBetweenMarkers(html, 'json-ld', renderJsonLd(content));

    html = replaceSimpleDataContent(html, content);
    html = replaceEmphasisDataContent(html, content);

    const cases = Array.isArray(content.cases) ? content.cases : [];
    html = replaceBetweenMarkers(html, 'work-cases', renderWorkCases(cases));
    html = replaceBetweenMarkers(html, 'nav-bar', renderNavBar(cases));

    fs.writeFileSync(HTML_PATH, html, 'utf8');
    console.log('Built index.html with baked content from content.json');
}

main();
