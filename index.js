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
| LOAD COMICS
|--------------------------------------------------------------------------
*/

function loadComics() {
    if (!fs.existsSync(COMIC_MANIFEST_PATH)) {
        console.error('archives.json not found!');
        return [];
    }

    const files = JSON.parse(fs.readFileSync(COMIC_MANIFEST_PATH, 'utf-8'));

    return files
        .map(f => {
            const parsed = path.parse(f.name);
            const base = parsed.name;
            const ext = parsed.ext.toLowerCase();

            const match = base.match(/^(?:(\d+))?p(\d+)$/i);

            const chapter = match?.[1] ? Number(match[1]) : null;
            const page = match ? Number(match[2]) : Number(base.replace('p', ''));

            const extCode = EXT_MAP[ext];

            // KEY FIX:
            // - p1 → /comic/1g
            // - 0p1 → /comic/0/1g
            const id =
                chapter === null
                    ? `${page}${extCode}`        // page-only
                    : `${chapter}/${page}${extCode}`;

            return {
                chapter,
                page,
                ext,
                extCode,
                id
            };
        })
        .sort((a, b) => {
            const ac = a.chapter ?? -1;
            const bc = b.chapter ?? -1;

            if (ac !== bc) return ac - bc;
            return a.page - b.page;
        })
        .map(x => x.id);
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
| COMIC ROUTER (SUPPORTS BOTH FORMATS)
|--------------------------------------------------------------------------
*/

// /comic/1g   (page only)
// /comic/0/1g (chapter/page)
app.get('/comic/:a/:b?', (req, res) => {
    let id;

    if (req.params.b === undefined) {
        // page-only
        id = req.params.a;
    } else {
        id = `${req.params.a}/${req.params.b}`;
    }

    const index = comics.indexOf(id);

    if (index === -1) {
        return res.status(404).send('Comic not found');
    }

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

        const chapterPart = match[1]; // "0/" or undefined
        const page = match[2];
        const extCode = match[3];

        const ext = EXT_MAP_REVERSE[extCode];
        if (!ext) return res.status(400).send('Bad extension');

        const base = chapterPart
            ? `${chapterPart.replace('/', '')}p${page}`
            : `p${page}`;

        const filename = `${base}${ext}`;

        const url =
            `https://raw.githubusercontent.com/Dex9999/dr-mcninja-archival/master/archives/${filename}`;

        const response = await fetch(url);

        if (!response.ok) {
            return res.status(404).send('Image not found');
        }

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
