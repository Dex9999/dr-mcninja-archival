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
    if (!comics.length) return res.send('<h1>No comics found</h1>');

    app.get('/', (req, res) => {
    if (!comics.length) return res.send('<h1 style="color:white;background:#111;margin:0;padding:40px;">No comics found</h1>');

    // Group into chapters for cleaner display
    const grouped = new Map();

    for (const c of comics) {
        const match = c.match(/^(\d+)\/(\d+)/);
        if (!match) continue;

        const chapter = match[1];

        if (!grouped.has(chapter)) grouped.set(chapter, []);
        grouped.get(chapter).push(c);
    }

    const chapters = [...grouped.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]));

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Comic Archive</title>

<style>
body {
    margin: 0;
    background: #0b0b0f;
    color: white;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
}

/* ================= HERO ================= */
.hero {
    padding: 60px 20px 30px;
    text-align: center;
}

.title {
    font-size: 42px;
    font-weight: 700;
    margin-bottom: 10px;
}

.subtitle {
    opacity: 0.6;
    margin-bottom: 20px;
}

.start {
    display: inline-block;
    padding: 14px 22px;
    background: #7c5cff;
    border-radius: 12px;
    color: white;
    text-decoration: none;
    font-weight: 600;
    transition: 0.15s;
}

.start:hover {
    transform: scale(1.05);
    background: #6a4df0;
}

/* ================= GRID ================= */
.container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 20px;
}

.chapter {
    margin-bottom: 30px;
}

.chapter-title {
    font-size: 18px;
    margin: 10px 0;
    opacity: 0.8;
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
    background: rgba(255,255,255,0.12);
    transform: translateY(-2px);
}

.small {
    font-size: 12px;
    opacity: 0.6;
}
</style>

</head>

<body>

<div class="hero">
    <div class="title">📚 Comic Archive</div>
    <div class="subtitle">Manga-style reader</div>

    <a class="start" href="/comic/${comics[0]}">Start Reading →</a>
</div>

<div class="container">

${chapters.map(([ch, pages]) => `
    <div class="chapter">
        <div class="chapter-title">Chapter ${ch}</div>

        <div class="grid">
            ${pages.map(p => `
                <a class="card" href="/comic/${p}">
                    <div>${p.split('/')[1] || p}</div>
                    <div class="small">${p.split('/')[2] || ''}</div>
                </a>
            `).join('')}
        </div>
    </div>
`).join('')}

</div>

</body>
</html>
    `);
});
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
