const express = require('express');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

const fetch = (...args) =>
    import('node-fetch').then(({ default: fetch }) => fetch(...args));

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const COMIC_MANIFEST_PATH = path.join(__dirname, 'archives.json');

const EXT_MAP = {
    '.jpg': 'j',
    '.jpeg': 'j',
    '.png': 'p',
    '.gif': 'g'
};

const EXT_MAP_REVERSE = {
    j: '.jpg',
    p: '.png',
    g: '.gif'
};

/*
|--------------------------------------------------------------------------
| LOAD COMICS (FLAT INDEX)
|--------------------------------------------------------------------------
*/

function loadComics() {
    if (!fs.existsSync(COMIC_MANIFEST_PATH)) {
        console.error('archives.json not found!');
        return [];
    }

    const files = JSON.parse(fs.readFileSync(COMIC_MANIFEST_PATH, 'utf-8'));

    const mainMap = new Map();    // chapter/page → Set(ext)
    const specialMap = new Map(); // page → Set(ext)

    for (const f of files) {
        const parsed = path.parse(f.name);
        const base = parsed.name;
        const ext = parsed.ext.toLowerCase();

        const match = base.match(/^(?:(\d+))?p(\d+)$/i);
        if (!match) continue;

        const chapter = match[1] ? Number(match[1]) : null;
        const page = Number(match[2]);

        const code = EXT_MAP[ext];
        if (!code) continue;

        if (chapter === null) {
            // SPECIAL: /1j /2p etc
            if (!specialMap.has(page)) specialMap.set(page, new Set());
            specialMap.get(page).add(code);
        } else {
            // MAIN: /0/1j etc
            const key = `${chapter}/${page}`;
            if (!mainMap.has(key)) mainMap.set(key, new Set());
            mainMap.get(key).add(code);
        }
    }

    const output = [];

    const extOrder = ['j', 'p', 'g'];

    /*
    |--------------------------------------------------------------------------
    | 1) MAIN SERIES
    |--------------------------------------------------------------------------
    */

    const mainPages = [...mainMap.entries()]
        .map(([key, variants]) => {
            const [chapter, page] = key.split('/').map(Number);
            return { chapter, page, variants: [...variants] };
        })
        .sort((a, b) => {
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
            return a.page - b.page;
        });

    for (const ext of extOrder) {
        for (const p of mainPages) {
            if (p.variants.includes(ext)) {
                output.push(`${p.chapter}/${p.page}${ext}`);
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | 2) SPECIAL SERIES
    |--------------------------------------------------------------------------
    */

    const specialPages = [...specialMap.entries()]
        .map(([page, variants]) => ({
            page,
            variants: [...variants]
        }))
        .sort((a, b) => a.page - b.page);

    for (const ext of extOrder) {
        for (const p of specialPages) {
            if (p.variants.includes(ext)) {
                output.push(`${p.page}${ext}`);
            }
        }
    }

    return output;
}

let comics = loadComics();

setInterval(() => {
    comics = loadComics();
}, 60 * 1000);

/*
|--------------------------------------------------------------------------
| HOME
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {
    if (!comics.length) {
        return res.send('<h1 style="color:white;background:#111;margin:0;padding:40px;">No comics found</h1>');
    }

    const main = new Map();     // chapter/page/ext
    const special = new Map();  // page/ext only

    for (const c of comics) {

        // MAIN: 0/1j
        const mainMatch = c.match(/^(\d+)\/(\d+)([jpgpnggif])$/);
        if (mainMatch) {
            const chapter = Number(mainMatch[1]);
            const page = Number(mainMatch[2]);
            const ext = mainMatch[3];

            const key = `${chapter}/${page}`;

            if (!main.has(key)) main.set(key, []);
            main.get(key).push({ id: c, page, ext, chapter });

            continue;
        }

        // SPECIAL: 1j
        const specialMatch = c.match(/^(\d+)([jpgpnggif])$/);
        if (specialMatch) {
            const page = Number(specialMatch[1]);
            const ext = specialMatch[2];

            const key = page;

            if (!special.has(key)) special.set(key, []);
            special.get(key).push({ id: c, page, ext });

            continue;
        }
    }

    const extOrder = { j: 0, p: 1, g: 2 };

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Dr McNinja Comics</title>

<style>
body {
    margin: 0;
    background: #0b0b0f;
    color: white;
    font-family: system-ui;
}

.hero {
    padding: 50px 20px 20px;
    text-align: center;
}

.title { font-size: 40px; font-weight: 700; }
.subtitle { opacity: 0.6; }

.start {
    display: inline-block;
    margin-top: 16px;
    padding: 12px 18px;
    background: #7c5cff;
    border-radius: 10px;
    color: white;
    text-decoration: none;
}

.container {
    max-width: 1000px;
    margin: auto;
    padding: 20px;
}

.section {
    margin-bottom: 40px;
}

.section-title {
    font-size: 18px;
    opacity: 0.8;
    margin-bottom: 10px;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 10px;
}

.card {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 10px;
    text-align: center;
    text-decoration: none;
    color: white;
    transition: 0.15s;
}

.card:hover {
    transform: translateY(-2px);
    background: rgba(255,255,255,0.12);
}

.small { font-size: 11px; opacity: 0.5; }
</style>

</head>

<body>

<div class="hero">
    <div class="title">Dr McNinja Comics</div>
    <div class="subtitle">Archived and easier to read</div>
    <a class="start" href="/comic/${comics[0]}">Dive In →</a>
</div>

<div class="container">

<!-- ================= MAIN ================= -->
<div class="section">
    <div class="section-title">Main Series</div>
    <div class="grid">
        ${
            [...main.entries()]
                .map(([_, arr]) => arr)
                .flat()
                .sort((a,b) => a.chapter - b.chapter || a.page - b.page || extOrder[a.ext] - extOrder[b.ext])
                .map(p => `
                    <a class="card" href="/comic/${p.id}">
                        <div>${p.chapter}/${p.page}</div>
                        <div class="small">${p.ext}</div>
                    </a>
                `).join('')
        }
    </div>
</div>

<!-- ================= SPECIAL ================= -->
<div class="section">
    <div class="section-title">Special Pages</div>
    <div class="grid">
        ${
            [...special.entries()]
                .map(([_, arr]) => arr)
                .flat()
                .sort((a,b) => a.page - b.page || extOrder[a.ext] - extOrder[b.ext])
                .map(p => `
                    <a class="card" href="/comic/${p.id}">
                        <div>${p.page}</div>
                        <div class="small">${p.ext}</div>
                    </a>
                `).join('')
        }
    </div>
</div>

</div>

</body>
</html>
    `);
});

/*
|--------------------------------------------------------------------------
| ROUTE
|--------------------------------------------------------------------------
*/

app.get('/comic/:a/:b?', (req, res) => {
    const id = req.params.b ? `${req.params.a}/${req.params.b}` : req.params.a;

    const index = comics.indexOf(id);
    if (index === -1) return res.status(404).send('Comic not found');

    const prev = index > 0 ? comics[index - 1] : null;
    const next = index < comics.length - 1 ? comics[index + 1] : null;

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>${id}</title>

<style>
body {
    margin: 0;
    background: #0b0b0f;
    color: white;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
}

/* ===================== TOP BAR ===================== */
.topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(20,20,25,0.85);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding: 12px 16px;

    display: flex;
    justify-content: space-between;
    align-items: center;
}

.nav {
    display: inline-flex;
    align-items: center;
    gap: 6px;

    padding: 8px 12px;
    border-radius: 10px;

    background: rgba(255,255,255,0.06);
    color: white;
    text-decoration: none;

    transition: 0.15s;
}

.nav:hover {
    background: rgba(255,255,255,0.12);
}

.disabled {
    opacity: 0.3;
    pointer-events: none;
}

/* ===================== READER ===================== */
.reader {
    display: flex;
    justify-content: center;
    padding: 24px 10px 60px;
}

.page {
    max-width: 900px;
    width: 100%;
    text-align: center;
}

img {
    width: 100%;
    height: auto;
    border-radius: 12px;

    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}

/* ===================== FOOT LABEL ===================== */
.meta {
    margin-top: 12px;
    font-size: 12px;
    color: rgba(255,255,255,0.5);
}

/* ===================== PAGE BADGE ===================== */
.badge {
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.08);
    font-size: 12px;
}

/* ===================== HOME BUTTON ===================== */
.homebtn {
    font-weight: 500;
}
</style>

</head>

<body>

<div class="topbar">
    <a class="nav homebtn" href="/">← Library</a>

    <div class="badge">${id}</div>

    <div>
        ${
            prev
                ? `<a class="nav" href="/comic/${prev}">← Prev</a>`
                : `<span class="nav disabled">← Prev</span>`
        }

        ${
            next
                ? `<a class="nav" href="/comic/${next}">Next →</a>`
                : `<span class="nav disabled">Next →</span>`
        }
    </div>
</div>

<div class="reader">
    <div class="page">
        <img src="/archives/comic/${id}" />

        <div class="meta">
            Use ← → arrow keys to navigate
        </div>
    </div>
</div>

<script>
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
        const prev = ${JSON.stringify(prev)};
        if (prev) window.location.href = '/comic/' + prev;
    }
    if (e.key === 'ArrowRight') {
        const next = ${JSON.stringify(next)};
        if (next) window.location.href = '/comic/' + next;
    }
});
</script>

</body>
</html>
`);
});

/*
|--------------------------------------------------------------------------
| IMAGE PROXY (NO FALLBACKS, EXACT MATCH ONLY)
|--------------------------------------------------------------------------
*/

app.get('/archives/comic/:a/:b?', async (req, res) => {
    try {
        const id = req.params.b ? `${req.params.a}/${req.params.b}` : req.params.a;

        /*
        |--------------------------------------------------------------------------
        | MAIN SERIES: /0/1j
        |--------------------------------------------------------------------------
        */
        const main = id.match(/^(\d+)\/(\d+)([jpgpnggif])$/);
        if (main) {
            const chapter = main[1];
            const page = main[2];
            const ext = EXT_MAP_REVERSE[main[3]];

            const filename = `${chapter}p${page}${ext}`;

            const url =
                `https://raw.githubusercontent.com/Dex9999/dr-mcninja-archival/master/archives/${filename}`;

            const response = await fetch(url);
            if (!response.ok) return res.status(404).send('Image not found');

            const buffer = Buffer.from(await response.arrayBuffer());
            res.setHeader('Content-Type', getContentType(ext));
            return res.send(buffer);
        }

        /*
        |--------------------------------------------------------------------------
        | SPECIAL SERIES: /1j
        |--------------------------------------------------------------------------
        */
        const special = id.match(/^(\d+)([jpgpnggif])$/);
        if (special) {
            const page = special[1];
            const ext = EXT_MAP_REVERSE[special[2]];

            const filename = `p${page}${ext}`;

            const url =
                `https://raw.githubusercontent.com/Dex9999/dr-mcninja-archival/master/archives/${filename}`;

            const response = await fetch(url);
            if (!response.ok) return res.status(404).send('Image not found');

            const buffer = Buffer.from(await response.arrayBuffer());
            res.setHeader('Content-Type', getContentType(ext));
            return res.send(buffer);
        }

        return res.status(400).send('Invalid id');

    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getContentType(ext) {
    switch (ext) {
        case '.png': return 'image/png';
        case '.gif': return 'image/gif';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        default: return 'application/octet-stream';
    }
}

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
