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

const EXTENSIONS = ['.png', '.jpg', '.gif'];
const COMIC_MANIFEST_PATH = path.join(__dirname, 'archives.json');

/*
|--------------------------------------------------------------------------
| COMIC LOADER (FROM JSON MANIFEST)
|--------------------------------------------------------------------------
*/

function loadComics() {
    if (!fs.existsSync(COMIC_MANIFEST_PATH)) {
        console.error('archives.json not found!');
        return [];
    }

    const raw = fs.readFileSync(COMIC_MANIFEST_PATH, 'utf-8');
    const files = JSON.parse(raw);

    return files
        .map(file => {
            const name = path.parse(file.name).name;

            // Matches:
            // 15p12 → chapter 15, page 12
            // 0p3   → chapter 0, page 3
            // p12   → page 12
            const match = name.match(/^(?:(\d+))?p(\d+)$/i);

            return {
                raw: name,
                file: file.name,
                size: file.size,
                chapter: match?.[1] ? Number(match[1]) : null,
                page: match ? Number(match[2]) : Number(name) || 0
            };
        })
        .sort((a, b) => {
            if (a.chapter !== b.chapter) {
                if (a.chapter === null) return 1;
                if (b.chapter === null) return -1;
                return a.chapter - b.chapter;
            }

            return a.page - b.page;
        })
        .map(c => c.raw);
}

// initial load
let comics = loadComics();

/*
|--------------------------------------------------------------------------
| OPTIONAL AUTO REFRESH
|--------------------------------------------------------------------------
*/

setInterval(() => {
    comics = loadComics();
}, 60 * 1000);

/*
|--------------------------------------------------------------------------
| HOME PAGE
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {
    if (comics.length === 0) {
        return res.send('<h1>No comics found</h1>');
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Comic Archive</title>
<style>
body {
    margin: 0;
    background: #111;
    color: white;
    font-family: Arial;
    text-align: center;
}

.container {
    padding: 60px 20px;
}

a {
    color: white;
    text-decoration: none;
}

.button {
    display: inline-block;
    padding: 14px 22px;
    background: #333;
    border-radius: 8px;
    margin-top: 20px;
}

.comic-link {
    display: inline-block;
    margin: 6px;
    padding: 10px 12px;
    background: #222;
    border-radius: 6px;
}
</style>
</head>

<body>
<div class="container">

    <h1>Comic Archive</h1>
    <p>Dynamic comic reader</p>

    <a class="button" href="/comic/${comics[0]}">Start Reading</a>

    <div style="margin-top:40px;">
        ${comics.map(c => `
            <a class="comic-link" href="/comic/${c}">${c}</a>
        `).join('')}
    </div>

</div>
</body>
</html>
    `);
});

/*
|--------------------------------------------------------------------------
| COMIC READER
|--------------------------------------------------------------------------
*/

app.get('/comic/:id', (req, res) => {
    const comicId = req.params.id;
    const index = comics.indexOf(comicId);

    if (index === -1) {
        return res.status(404).send('Comic not found');
    }

    const prev = index > 0 ? comics[index - 1] : null;
    const next = index < comics.length - 1 ? comics[index + 1] : null;

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>${comicId}</title>
<style>
body {
    margin: 0;
    background: #111;
    color: white;
    font-family: Arial;
    text-align: center;
}

.topbar {
    position: sticky;
    top: 0;
    background: #1b1b1b;
    padding: 14px;
    border-bottom: 1px solid #333;
}

.nav {
    display: inline-block;
    margin: 0 6px;
    padding: 8px 14px;
    background: #333;
    border-radius: 6px;
    color: white;
    text-decoration: none;
}

.disabled {
    opacity: 0.4;
    pointer-events: none;
}

img {
    max-width: 95%;
    margin-top: 20px;
    border-radius: 8px;
    box-shadow: 0 0 20px rgba(0,0,0,0.5);
}
</style>
</head>

<body>

<div class="topbar">
    <a class="nav" href="/">Home</a>

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

<img src="/archives/comic/${comicId}" />

<div style="margin:10px;color:#aaa;">${comicId}</div>

</body>
</html>
    `);
});

/*
|--------------------------------------------------------------------------
| IMAGE PROXY (GitHub RAW loader)
|--------------------------------------------------------------------------
*/

app.get('/archives/comic/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;

        const url = `https://raw.githubusercontent.com/Dex9999/dr-mcninja-archival/master/archives/${filename}`;
        console.log(url);

        const response = await fetch(url);

        if (!response.ok) {
            return res.status(404).send('Image not found');
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const ext = path.extname(filename).toLowerCase();
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
        case '.jpeg':
        default: return 'image/jpeg';
    }
}

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
