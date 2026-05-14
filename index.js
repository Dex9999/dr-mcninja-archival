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

const EXT_PRIORITY = { j: 0, p: 1, g: 2 };

/*
|--------------------------------------------------------------------------
| LOAD + ORDER COMICS
|--------------------------------------------------------------------------
| ORDER RULES:
| 1) LEGACY GROUP FIRST (p-only naming): 1j,2j,3j... then 1p,2p,3p...
| 2) THEN chapter/page variants: 0/1j etc
|--------------------------------------------------------------------------
*/

function loadComics() {
    if (!fs.existsSync(COMIC_MANIFEST_PATH)) {
        console.error('archives.json not found!');
        return [];
    }

    const files = JSON.parse(fs.readFileSync(COMIC_MANIFEST_PATH, 'utf-8'));

    const map = new Map();
    // key = "chapter/page"
    // value = { chapter, page, variants:Set }

    for (const f of files) {
        const parsed = path.parse(f.name);
        const base = parsed.name;
        const ext = parsed.ext.toLowerCase();

        const match = base.match(/^(?:(\d+))?p(\d+)$/i);
        if (!match) continue;

        const chapter = match?.[1] ? Number(match[1]) : 0;
        const page = Number(match[2]);

        const key = `${chapter}/${page}`;

        if (!map.has(key)) {
            map.set(key, {
                chapter,
                page,
                variants: new Set()
            });
        }

        const code = EXT_MAP[ext];
        if (code) map.get(key).variants.add(code);
    }

    const pages = [...map.entries()]
        .map(([key, v]) => ({
            key,
            chapter: v.chapter,
            page: v.page,
            variants: [...v.variants]
        }))
        .sort((a, b) => {
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
            return a.page - b.page;
        });

    const output = [];

    /*
    |--------------------------------------------------------------------------
    | 1) REGULAR (NO EXTENSION) FIRST
    |--------------------------------------------------------------------------
    */

    for (const p of pages) {
        output.push(p.key); // "0/1", "0/2", ...
    }

    /*
    |--------------------------------------------------------------------------
    | 2) SPECIALS (EXTENSIONS) AFTER
    | ORDER: j → p → g
    |--------------------------------------------------------------------------
    */

    const order = ['j', 'p', 'g'];

    for (const ext of order) {
        for (const p of pages) {
            if (p.variants.includes(ext)) {
                output.push(`${p.key}${ext}`); // "0/1j"
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

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Comic Archive</title>
<style>
body { margin:0; background:#111; color:white; font-family:Arial; text-align:center; }
.container { padding:60px 20px; }
a { color:white; text-decoration:none; }
.button { display:inline-block; padding:14px 22px; background:#333; border-radius:8px; margin-top:20px; }
.comic-link { display:inline-block; margin:6px; padding:10px 12px; background:#222; border-radius:6px; }
</style>
</head>
<body>
<div class="container">

<h1>Comic Archive</h1>

<a class="button" href="/comic/${comics[0]}">Start Reading</a>

<div style="margin-top:40px;">
${comics.map(c => `<a class="comic-link" href="/comic/${c}">${c}</a>`).join('')}
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

    const toUrl = (x) => `/comic/${x}`;

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>${id}</title>
<style>
body { margin:0; background:#111; color:white; font-family:Arial; text-align:center; }
.topbar { position:sticky; top:0; background:#1b1b1b; padding:14px; border-bottom:1px solid #333; }
.nav { display:inline-block; margin:0 6px; padding:8px 14px; background:#333; border-radius:6px; color:white; text-decoration:none; }
.disabled { opacity:0.4; pointer-events:none; }
img { max-width:95%; margin-top:20px; border-radius:8px; box-shadow:0 0 20px rgba(0,0,0,0.5); }
</style>
</head>
<body>

<div class="topbar">
<a class="nav" href="/">Home</a>

${prev ? `<a class="nav" href="${toUrl(prev)}">← Prev</a>` : `<span class="nav disabled">← Prev</span>`}
${next ? `<a class="nav" href="${toUrl(next)}">Next →</a>` : `<span class="nav disabled">Next →</span>`}
</div>

<img src="/archives/comic/${id}" />

<div style="margin:10px;color:#aaa;">${id}</div>

</body>
</html>
    `);
});

/*
|--------------------------------------------------------------------------
| IMAGE PROXY
|--------------------------------------------------------------------------
*/

app.get('/archives/comic/:id', async (req, res) => {
    try {
        const id = req.params.id;

        const match = id.match(/^(\d+\/)?(\d+)([jpgpnggif])$/i);
        if (!match) return res.status(400).send('Invalid id');

        const chapterPart = match[1];
        const page = match[2];
        const extCode = match[3];

        const ext = EXT_MAP_REVERSE[extCode];

        const base = chapterPart
            ? `${chapterPart.replace('/', '')}p${page}`
            : `p${page}`;

        const filename = `${base}${ext}`;

        const url =
            `https://raw.githubusercontent.com/Dex9999/dr-mcninja-archival/master/archives/${filename}`;

        const response = await fetch(url);
        if (!response.ok) return res.status(404).send('Image not found');

        const buffer = Buffer.from(await response.arrayBuffer());

        res.setHeader('Content-Type', getContentType(ext));
        return res.send(buffer);

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
