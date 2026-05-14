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

            const chapter = match?.[1] ? Number(match[1]) : 0;
            const page = match ? Number(match[2]) : 0;

            const extCode = EXT_MAP[ext];

            return {
                chapter,
                page,
                extCode,
                id: `${chapter}/${page}${extCode}`
            };
        })
        .sort((a, b) => {
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
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
| COMIC VIEWER
|--------------------------------------------------------------------------
*/

app.get('/comic/:chapter/:page', (req, res) => {
    const { chapter, page } = req.params;

    const baseId = `${chapter}/${page}`;
    const index = comics.indexOf(baseId + 'j')
        || comics.indexOf(baseId + 'p')
        || comics.indexOf(baseId + 'g');

    if (index === -1) {
        return res.status(404).send('Comic not found');
    }

    const current = comics[index];
    const prev = index > 0 ? comics[index - 1] : null;
    const next = index < comics.length - 1 ? comics[index + 1] : null;

    const imgUrl = `/archives/comic/${current}`;

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>${current}</title>
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

${prev ? `<a class="nav" href="/comic/${prev.replace('/', '/')}">← Prev</a>` : `<span class="nav disabled">← Prev</span>`}

${next ? `<a class="nav" href="/comic/${next.replace('/', '/')}">Next →</a>` : `<span class="nav disabled">Next →</span>`}
</div>

<img src="${imgUrl}" />

<div style="margin:10px;color:#aaa;">${chapter}/${page}</div>

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
        const id = req.params.id; // e.g. 0/1j

        const match = id.match(/^(\d+)\/(\d+)([jpgp|pngp|gifg])$/i);
        const safe = id; // fallback

        // better parse
        const [, chapter, page, extCode] = id.match(/^(\d+)\/(\d+)([jpgpnggif]{1})$/i) || [];

        const ext = EXT_MAP_REVERSE[extCode];
        if (!ext) return res.status(400).send('Invalid image format');

        const baseName = `${chapter}p${page}`;
        const filename = `${baseName}${ext}`;

        const url = `https://raw.githubusercontent.com/Dex9999/dr-mcninja-archival/master/archives/${filename}`;

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
