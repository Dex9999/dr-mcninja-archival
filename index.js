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

const EXT_PRIORITY = { j: 0, g: 1, p: 2 };

const EXT_MAP_REVERSE = {
    j: '.jpg',
    p: '.png',
    g: '.gif'
};

/*
|--------------------------------------------------------------------------
| LOAD DATA
|--------------------------------------------------------------------------
*/

function loadComics() {
    if (!fs.existsSync(COMIC_MANIFEST_PATH)) {
        console.error('archives.json not found!');
        return [];
    }

    const files = JSON.parse(fs.readFileSync(COMIC_MANIFEST_PATH, 'utf-8'));

    const main = new Map();   // chapter/page
    const special = new Map(); // page only (no chapter)

    for (const f of files) {
        const parsed = path.parse(f.name);
        const base = parsed.name;
        const ext = parsed.ext.toLowerCase();

        const match = base.match(/^(?:(\d+))?p(\d+)$/i);
        if (!match) continue;

        const chapter = match?.[1] ? Number(match[1]) : null;
        const page = Number(match[2]);

        const code = EXT_MAP[ext];
        if (!code) continue;

        /*
        |--------------------------------------------------------------------------
        | MAIN SERIES (chapter exists)
        |--------------------------------------------------------------------------
        */
        if (chapter !== null) {
            const key = `${chapter}/${page}`;
            if (!main.has(key)) main.set(key, { chapter, page, variants: new Set() });
            main.get(key).variants.add(code);
        }

        /*
        |--------------------------------------------------------------------------
        | SPECIAL SERIES (NO CHAPTER)
        |--------------------------------------------------------------------------
        */
        else {
            const key = page;
            if (!special.has(key)) special.set(key, new Set());
            special.get(key).add(code);
        }
    }

    const output = [];

    /*
    |--------------------------------------------------------------------------
    | 1) MAIN SERIES: /0/1, /0/2 ...
    |--------------------------------------------------------------------------
    */

    const mainPages = [...main.entries()]
        .map(([key, v]) => ({
            key,
            chapter: v.chapter,
            page: v.page
        }))
        .sort((a, b) => {
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
            return a.page - b.page;
        });

    for (const p of mainPages) {
        output.push(`${p.key}`); // /0/1 (no extension)
    }

    /*
    |--------------------------------------------------------------------------
    | 2) SPECIAL SERIES GROUPED BY EXTENSION ORDER
    |--------------------------------------------------------------------------
    */

    const specialPages = [...special.entries()]
        .map(([page, variants]) => ({
            page,
            variants: [...variants]
        }))
        .sort((a, b) => a.page - b.page);

    const extOrder = ['j', 'g', 'p'];

    for (const ext of extOrder) {
        for (const p of specialPages) {
            if (p.variants.includes(ext)) {
                output.push(`${p.page}${ext}`); // /1j /2j etc
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
| IMAGE PROXY (ALWAYS INCLUDE EXTENSION)
|--------------------------------------------------------------------------
*/

app.get('/archives/comic/:id', async (req, res) => {
    try {
        const id = req.params.id;

        /*
        |--------------------------------------------------------------------------
        | MAIN SERIES: /0/1
        |--------------------------------------------------------------------------
        */
        const main = id.match(/^(\d+)\/(\d+)$/);
        if (main) {
            const chapter = main[1];
            const page = main[2];

            // try best available format
            const tryExts = ['.png', '.jpg', '.gif'];

            for (const ext of tryExts) {
                const filename = `${chapter}p${page}${ext}`;

                const url =
                    `https://raw.githubusercontent.com/Dex9999/dr-mcninja-archival/master/archives/${filename}`;

                const response = await fetch(url);
                if (response.ok) {
                    const buffer = Buffer.from(await response.arrayBuffer());
                    res.setHeader('Content-Type', getContentType(ext));
                    return res.send(buffer);
                }
            }

            return res.status(404).send('Image not found');
        }

        /*
        |--------------------------------------------------------------------------
        | SPECIAL SERIES: /1j /2g etc
        |--------------------------------------------------------------------------
        */
        const special = id.match(/^(\d+)([jpgpnggif])$/);
        if (special) {
            const page = special[1];
            const extCode = special[2];

            const ext = EXT_MAP_REVERSE[extCode];
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
