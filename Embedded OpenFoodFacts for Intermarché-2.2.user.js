// ==UserScript==
// @name         Embedded OpenFoodFacts for Intermarché
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Injects Nutri-Score, NOVA, and Additive Risk into Intermarché with links to OpenFoodFacts
// @match        https://www.intermarche.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIG & CONSTANTS ---
    const PRODUCT_CARD_SELECTOR = '.stime-product-card-course';
    const PROCESSED_ATTR = 'data-off-scanned';
    const API_FIELDS = "code,nutriscore_grade,nutriscore_data,nova_group,additives_tags";

    // Extracted from https://static.openfoodfacts.org/data/taxonomies/additives.json
    const HIGH_RISK_ADDITIVES = new Set(["en:e100", "en:e104", "en:e110", "en:e124", "en:e129", "en:e141", "en:e141i", "en:e141ii", "en:e150a", "en:e150b", "en:e150c", "en:e150d", "en:e155", "en:e160ai", "en:e160aii", "en:e160b", "en:e160e", "en:e160f", "en:e161b", "en:e170", "en:e171", "en:e172", "en:e174", "en:e180", "en:e200", "en:e202", "en:e210", "en:e211", "en:e212", "en:e213", "en:e220", "en:e221", "en:e222", "en:e223", "en:e224", "en:e225", "en:e226", "en:e227", "en:e228", "en:e243", "en:e249", "en:e250", "en:e251", "en:e252", "en:e321", "en:e334", "en:e335", "en:e335i", "en:e335ii", "en:e336", "en:e336i", "en:e336ii", "en:e337", "en:e338", "en:e339", "en:e339i", "en:e339ii", "en:e339iii", "en:e340", "en:e340i", "en:e340ii", "en:e340iii", "en:e341", "en:e341i", "en:e341ii", "en:e341iii", "en:e343", "en:e343i", "en:e343ii", "en:e354", "en:e407", "en:e407a", "en:e432", "en:e433", "en:e434", "en:e435", "en:e436", "en:e450", "en:e450i", "en:e450ii", "en:e450iii", "en:e450v", "en:e450vi", "en:e450vii", "en:e451", "en:e451i", "en:e451ii", "en:e452", "en:e452i", "en:e452ii", "en:e452iii", "en:e452iv", "en:e459", "en:e460i", "en:e472e", "en:e473", "en:e474", "en:e475", "en:e481", "en:e482", "en:e483", "en:e491", "en:e492", "en:e493", "en:e494", "en:e495", "en:e520", "en:e521", "en:e522", "en:e523", "en:e535", "en:e536", "en:e538", "en:e541", "en:e551", "en:e554", "en:e555", "en:e556", "en:e558", "en:e559", "en:e620", "en:e621", "en:e622", "en:e623", "en:e624", "en:e625", "en:e950", "en:e955", "en:e960"]);
    const MEDIUM_RISK_ADDITIVES = new Set(["en:e131", "en:e133", "en:e142", "en:e507", "en:e508", "en:e509", "en:e511"]);

    // --- CORE LOGIC ---

    function getEan(card) {
        const link = card.querySelector('a.productCard__link');
        const match = link?.href?.match(/\/(\d+)(\?|$)/);
        if (!match) return null;

        let code = match[1].replace(/^0+/, '');
        if (code.length <= 7) return code.padStart(8, '0');
        if (code.length <= 12) return code.padStart(13, '0');
        return code;
    }

    function calculateRisk(tags) {
        if (!tags?.length) return 'low';
        if (tags.some(t => HIGH_RISK_ADDITIVES.has(t))) return 'high';
        if (tags.some(t => MEDIUM_RISK_ADDITIVES.has(t))) return 'medium';
        return 'low';
    }

    function fetchOffData(ean, callback) {
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=${API_FIELDS}`,
            onload: res => {
                if (res.status === 200) callback(JSON.parse(res.responseText));
            }
        });
    }

    // --- UI COMPONENTS ---

    function getColors(type, value) {
        if (type === 'nutri') {
            const map = { a: '#166534', b: '#15803d', c: '#ca8a04', d: '#c2410c', e: '#991b1b' };
            const bgMap = { a: '#dcfce7', b: '#f0fdf4', c: '#fef9c3', d: '#ffedd5', e: '#fee2e2' };
            return { text: map[value] || '#666', bg: bgMap[value] || '#eee' };
        }
        if (type === 'nova') {
            const map = { 1: '#166534', 2: '#ca8a04', 3: '#c2410c', 4: '#991b1b' };
            return { text: map[value] || '#666', bg: '#f3f4f6' };
        }
        if (type === 'risk') {
            const map = { low: '#166534', medium: '#c2410c', high: '#991b1b' };
            const bgMap = { low: '#dcfce7', medium: '#ffedd5', high: '#fee2e2' };
            return { text: map[value], bg: bgMap[value] };
        }
    }

    function createBadge(label, value, type) {
        const colors = getColors(type, value?.toString().toLowerCase());
        const el = document.createElement('div');
        el.style.cssText = `
            flex: 1;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            text-align: center;
            font-family: 'Open Sans', sans-serif;
            color: ${colors.text};
            background-color: ${colors.bg};
            border: 1px solid ${colors.text}20;
            white-space: nowrap;
        `;
        el.innerText = label;
        return el;
    }

    function renderContainer(card, product, ean) {
        const container = document.createElement('a');

        container.href = `https://world.openfoodfacts.org/product/${ean}`;
        container.target = "_blank"; // Open in new tab
        container.title = "View details on Open Food Facts";

        container.style.cssText = `
            display: flex;
            gap: 6px;
            margin-bottom: 8px;
            width: 100%;
            box-sizing: border-box;
            text-decoration: none;
            cursor: pointer;
            transition: opacity 0.2s;
        `;

        container.onmouseover = () => container.style.opacity = "0.8";
        container.onmouseout = () => container.style.opacity = "1";

        const nsGrade = product.nutriscore_grade || '?';
        const nsScore = product.nutriscore_data?.score !== undefined ? ` (${product.nutriscore_data.score})` : '';
        container.appendChild(createBadge(`Nutri: ${nsGrade.toUpperCase()}${nsScore}`, nsGrade, 'nutri'));

        const nova = product.nova_group || '?';
        container.appendChild(createBadge(`Nova: ${nova}`, nova, 'nova'));

        const risk = calculateRisk(product.additives_tags);
        container.appendChild(createBadge(`Risk: ${risk.toUpperCase()}`, risk, 'risk'));

        const footer = card.querySelector('.stime-product--footer');
        footer ? footer.parentNode.insertBefore(container, footer) : card.appendChild(container);
    }

    function processCard(card) {
        if (card.hasAttribute(PROCESSED_ATTR)) return;
        card.setAttribute(PROCESSED_ATTR, 'true');

        const ean = getEan(card);
        if (!ean) return;

        const loader = document.createElement('div');
        loader.innerText = '...';
        loader.style.cssText = "font-size:10px; color:#ccc; text-align:center; margin-bottom:4px;";
        const footer = card.querySelector('.stime-product--footer');
        footer.parentNode.insertBefore(loader, footer);

        fetchOffData(ean, data => {
            loader.remove();
            if (data.status === 1) renderContainer(card, data.product, ean);
        });
    }

    // --- INIT & OBSERVER ---

    const observer = new MutationObserver(muts => {
        for (const m of muts) {
            for (const n of m.addedNodes) {
                if (n.nodeType === 1) {
                    if (n.matches(PRODUCT_CARD_SELECTOR)) processCard(n);
                    n.querySelectorAll?.(PRODUCT_CARD_SELECTOR).forEach(processCard);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll(PRODUCT_CARD_SELECTOR).forEach(processCard);

})();