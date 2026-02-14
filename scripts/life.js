(() => {
    const CELL = 8; // 8px per cell (matches 1rem)
    const canvas = document.getElementById('life');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const genEl = document.getElementById('gen');

    let cols, rows;
    let grid, nextGrid; // 0 = dead, 1+ = age (generations alive)
    let generation = 0;
    let offsetX = 0, offsetY = 0; // centering offset in pixels
    let logicalWidth = 0, logicalHeight = 0; // for sharp canvas (DPR) drawing

    // Dead zones: array of {r1, r2, c1, c2} rectangles where cells cannot live
    let deadZones = [];
    let running = false;
    let rafId = null;
    let lastTick = 0;
    const TICK_MS = 80; // ms between generations when playing
    const STAGNATION_LIMIT = 10; // kill cells unchanged for this many generations
    let snapshot = null;
    let stagnationCounter = 0;

    // Case colours for cell aging (fetched from content.json)
    let caseColours = ['#000', '#000', '#000', '#000'];
    fetch('content.json').then(r => r.json()).then(data => {
        if (data.cases) {
            caseColours = data.cases.map(c => c.colour || '#000');
        }
    }).catch(() => {});

    // --- Resize & init ---
    const section = canvas.closest('section') || canvas.parentElement;
    const contactTab = section ? section.querySelector('.contact-tab') : null;

    function getLineRects(el) {
        const rects = [];
        const range = document.createRange();
        const textNodes = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        let lastTop = null;
        let lineRect = null;

        for (const node of textNodes) {
            for (let i = 0; i < node.textContent.length; i++) {
                range.setStart(node, i);
                range.setEnd(node, i + 1);
                const charRect = range.getBoundingClientRect();
                if (charRect.width === 0 && charRect.height === 0) continue;

                if (lastTop === null || Math.abs(charRect.top - lastTop) > 2) {
                    if (lineRect) rects.push(lineRect);
                    lineRect = { top: charRect.top, bottom: charRect.bottom,
                                 left: charRect.left, right: charRect.right };
                    lastTop = charRect.top;
                } else {
                    lineRect.left = Math.min(lineRect.left, charRect.left);
                    lineRect.right = Math.max(lineRect.right, charRect.right);
                    lineRect.bottom = Math.max(lineRect.bottom, charRect.bottom);
                }
            }
        }
        if (lineRect) rects.push(lineRect);
        return rects;
    }

    function resize() {
        const w = section ? section.clientWidth : window.innerWidth;
        let h;
        if (contactTab) {
            const tabTop = contactTab.offsetTop;
            const tabBottom = tabTop + contactTab.offsetHeight;
            const tabRight = contactTab.offsetLeft + contactTab.offsetWidth;
            h = tabBottom;

            // L-shaped clip: full width above tab, right of tab below
            canvas.style.clipPath = `polygon(
                0 0,
                ${w}px 0,
                ${w}px ${tabBottom}px,
                ${tabRight}px ${tabBottom}px,
                ${tabRight}px ${tabTop}px,
                0 ${tabTop}px
            )`;

        } else if (section) {
            h = section.scrollHeight;
            canvas.style.clipPath = '';
        } else {
            h = window.innerHeight;
            canvas.style.clipPath = '';
        }

        logicalWidth = w;
        logicalHeight = h;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const newCols = Math.floor(w / CELL);
        const newRows = Math.floor(h / CELL);
        offsetX = Math.floor((w - newCols * CELL) / 2);
        offsetY = Math.floor((h - newRows * CELL) / 2);

        const oldGrid = grid;
        const oldCols = cols;
        const oldRows = rows;

        cols = newCols;
        rows = newRows;
        grid = new Uint8Array(cols * rows);
        nextGrid = new Uint8Array(cols * rows);

        // Preserve existing cells on resize
        if (oldGrid) {
            const minC = Math.min(oldCols, cols);
            const minR = Math.min(oldRows, rows);
            for (let r = 0; r < minR; r++) {
                for (let c = 0; c < minC; c++) {
                    grid[r * cols + c] = oldGrid[r * oldCols + c];
                }
            }
        }

        // Compute dead zones from per-line text bounding rects
        deadZones = [];
        if (section) {
            const homeEl = section.querySelector('.home');
            if (homeEl) {
                const sectionRect = section.getBoundingClientRect();
                const lineRects = getLineRects(homeEl);
                for (const lr of lineRects) {
                    const top = lr.top - sectionRect.top;
                    const bottom = lr.bottom - sectionRect.top;
                    const left = lr.left - sectionRect.left;
                    const right = lr.right - sectionRect.left;
                    deadZones.push({
                        r1: Math.floor((top - offsetY) / CELL),
                        r2: Math.ceil((bottom - offsetY) / CELL),
                        c1: Math.floor((left - offsetX) / CELL),
                        c2: Math.ceil((right - offsetX) / CELL),
                    });
                }
            }
        }
        if (contactTab) {
            const tabTop = contactTab.offsetTop;
            const tabBottom = tabTop + contactTab.offsetHeight;
            const tabRight = contactTab.offsetLeft + contactTab.offsetWidth;
            deadZones.push({
                r1: Math.floor(tabTop / CELL),
                r2: Math.ceil(tabBottom / CELL),
                c1: 0,
                c2: Math.ceil(tabRight / CELL),
            });
        }

        draw();
    }

    // --- Drawing ---
    const GAP = 1; // 1px inset per side for white outline

    function draw() {
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);

        // Find the N youngest cells (one per case colour)
        const numColours = caseColours.length;
        // Each slot: { age, idx }
        const youngest = [];
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] > 0) {
                if (youngest.length < numColours) {
                    youngest.push({ age: grid[i], idx: i });
                    youngest.sort((a, b) => a.age - b.age);
                } else if (grid[i] < youngest[numColours - 1].age) {
                    youngest[numColours - 1] = { age: grid[i], idx: i };
                    youngest.sort((a, b) => a.age - b.age);
                }
            }
        }
        const colourMap = new Map();
        for (let i = 0; i < youngest.length; i++) {
            colourMap.set(youngest[i].idx, caseColours[i]);
        }

        // Draw all cells
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                if (grid[idx] > 0) {
                    ctx.fillStyle = colourMap.get(idx) || '#000';
                    ctx.fillRect(
                        offsetX + c * CELL + GAP,
                        offsetY + r * CELL + GAP,
                        CELL - GAP * 2,
                        CELL - GAP * 2
                    );
                }
            }
        }
    }

    // --- Game logic ---
    function isDead(r, c) {
        for (const z of deadZones) {
            if (r >= z.r1 && r < z.r2 && c >= z.c1 && c < z.c2) return true;
        }
        return false;
    }

    function isEdge(r, c) {
        return r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
    }

    function countNeighbors(r, c) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !isDead(nr, nc)) {
                    if (grid[nr * cols + nc] > 0) count++;
                }
            }
        }
        return count;
    }

    function step() {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                if (isDead(r, c)) {
                    nextGrid[idx] = 0;
                    continue;
                }
                const n = countNeighbors(r, c);
                if (grid[idx] > 0) {
                    nextGrid[idx] = (n === 2 || n === 3) ? grid[idx] + 1 : 0;
                } else {
                    nextGrid[idx] = (n === 3) ? 1 : 0;
                }
            }
        }
        // Edge kill: any alive cell on the border dies and kills all neighbours
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (isEdge(r, c) && nextGrid[r * cols + c]) {
                    nextGrid[r * cols + c] = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                                nextGrid[nr * cols + nc] = 0;
                            }
                        }
                    }
                }
            }
        }

        [grid, nextGrid] = [nextGrid, grid];
        generation++;

        // Stagnation detection: every N generations, kill cells alive in both
        // the snapshot and the current grid (they haven't changed)
        stagnationCounter++;
        if (stagnationCounter >= STAGNATION_LIMIT) {
            if (snapshot) {
                for (let i = 0; i < grid.length; i++) {
                    if (grid[i] && snapshot[i]) {
                        grid[i] = 0;
                    }
                }
            }
            snapshot = new Uint8Array(grid);
            stagnationCounter = 0;
        }

        if (genEl) genEl.textContent = generation;
        draw();
    }

    // --- Animation loop ---
    function loop(timestamp) {
        if (!running) return;
        if (timestamp - lastTick >= TICK_MS) {
            lastTick = timestamp;
            step();
        }
        rafId = requestAnimationFrame(loop);
    }

    function play() {
        running = true;
        if (btnPlay) {
            btnPlay.classList.add('active');
            btnPlay.textContent = 'Pause';
        }
        lastTick = performance.now();
        rafId = requestAnimationFrame(loop);
    }

    function pause() {
        running = false;
        if (btnPlay) {
            btnPlay.classList.remove('active');
            btnPlay.textContent = 'Play';
        }
        if (rafId) cancelAnimationFrame(rafId);
    }

    // --- Mouse / touch drawing ---
    function cellFromEvent(e) {
        const clientX = e.clientX ?? e.touches[0].clientX;
        const clientY = e.clientY ?? e.touches[0].clientY;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left - offsetX;
        const y = clientY - rect.top - offsetY;
        return {
            c: Math.floor(x / CELL),
            r: Math.floor(y / CELL),
        };
    }

    function setCell(r, c, val) {
        if (r >= 0 && r < rows && c >= 0 && c < cols && !isDead(r, c)) {
            grid[r * cols + c] = val ? 1 : 0;
            ctx.clearRect(offsetX + c * CELL, offsetY + r * CELL, CELL, CELL);
            if (val) {
                ctx.fillStyle = '#000';
                ctx.fillRect(
                    offsetX + c * CELL + GAP,
                    offsetY + r * CELL + GAP,
                    CELL - GAP * 2,
                    CELL - GAP * 2
                );
            }
        }
    }

    // Glider patterns for all 4 orientations
    const GLIDERS = [
        // SE
        [[-1,  0], [ 0,  1], [ 1, -1], [ 1, 0], [ 1, 1]],
        // SW
        [[-1,  0], [ 0, -1], [ 1, -1], [ 1, 0], [ 1, 1]],
        // NE
        [[ 1,  0], [ 0,  1], [-1, -1], [-1, 0], [-1, 1]],
        // NW
        [[ 1,  0], [ 0, -1], [-1, -1], [-1, 0], [-1, 1]],
    ];

    function placeGlider(r, c) {
        const offsets = GLIDERS[Math.floor(Math.random() * GLIDERS.length)];
        for (const [dr, dc] of offsets) {
            setCell(r + dr, c + dc, 1);
        }
    }

    let drawing = false;
    let dragged = false;
    let startR, startC;

    function pointerDown(e) {
        const { r, c } = cellFromEvent(e);
        drawing = true;
        dragged = false;
        startR = r;
        startC = c;
        setCell(r, c, 1);
    }

    function pointerMove(e) {
        if (!drawing) return;
        const { r, c } = cellFromEvent(e);
        if (r !== startR || c !== startC) dragged = true;
        setCell(r, c, 1);
    }

    function pointerUp() {
        if (drawing && !dragged) {
            // Single tap — replace the drawn cell with a glider
            setCell(startR, startC, 0);
            placeGlider(startR, startC);
        }
        drawing = false;
    }

    // Check if a click target is interactive content (not empty space)
    function isInteractive(el) {
        while (el && el !== document.body) {
            if (el === canvas) return false;
            if (el.matches('a, button, input, textarea, label, .home, .contact, .contact-tab, .nav-bar, .controls, .gen-counter, .page-work')) return true;
            el = el.parentElement;
        }
        return false;
    }

    document.addEventListener('mousedown', (e) => {
        if (isInteractive(e.target)) return;
        pointerDown(e);
    });
    document.addEventListener('mousemove', (e) => pointerMove(e));
    window.addEventListener('mouseup', () => pointerUp());

    document.addEventListener('touchstart', (e) => {
        const target = e.target;
        const interactive = isInteractive(target);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b6e8a1a9-ad94-4558-a64f-e8756014b6ea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'life.js:touchstart',message:'touchstart',data:{tag:target.tagName,className:target.className||'',id:target.id||'',isInteractive:interactive,action:interactive?'skip':'pointerDown'},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        if (interactive) return;
        e.preventDefault();
        pointerDown(e);
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (!drawing) return;
        e.preventDefault();
        pointerMove(e);
    }, { passive: false });
    window.addEventListener('touchend', () => pointerUp());

    // --- Controls (optional, only if buttons exist) ---
    const btnPlay = document.getElementById('btn-play');
    const btnStep = document.getElementById('btn-step');
    const btnClear = document.getElementById('btn-clear');
    const btnRandom = document.getElementById('btn-random');

    if (btnPlay) {
        btnPlay.addEventListener('click', () => {
            running ? pause() : play();
        });
    }

    if (btnStep) {
        btnStep.addEventListener('click', () => {
            if (running) pause();
            step();
        });
    }

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (running) pause();
            grid.fill(0);
            generation = 0;
            snapshot = null;
            stagnationCounter = 0;
            if (genEl) genEl.textContent = generation;
            draw();
        });
    }

    if (btnRandom) {
        btnRandom.addEventListener('click', () => {
            for (let i = 0; i < grid.length; i++) {
                grid[i] = Math.random() < 0.25 ? 1 : 0;
            }
            generation = 0;
            snapshot = null;
            stagnationCounter = 0;
            if (genEl) genEl.textContent = generation;
            draw();
        });
    }

    // --- Init ---
    window.addEventListener('resize', resize);
    if (section) new ResizeObserver(() => resize()).observe(section);
    resize();
    play();
})();
