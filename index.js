const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
require('dotenv').config();
const fetch = require('node-fetch');

const port = process.env.PORT || 5000;
  
app.get('/archives/comic/:filename', async (req, res) => {
    try {
        const extensions = ['.png', '.jpg', '.gif']; // Add more extensions as needed
        let matchingFile = null;

        for (const ext of extensions) {
            const response = await fetch(`https://raw.githubusercontent.com/Dex9999/dr-mcninja-archival/master/archives/${req.params.filename}${ext}`);
            
            if (response.ok) {
                matchingFile = `${req.params.filename}${ext}`;
                break;
            }
        }

        if (!matchingFile) {
            throw new Error('File not found');
        }

        res.setHeader('Content-Type', getContentType(matchingFile));

        response.body.pipe(res);
    } catch (error) {
        console.error('Error fetching file:', error);
        res.status(500).send('Internal Server Error');
    }
});

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        case '.jpg':
        case '.jpeg':
        default:
            return 'image/jpeg';
    }
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
