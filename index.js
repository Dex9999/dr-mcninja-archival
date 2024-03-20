const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
require('dotenv').config();

const archiveDirectory = 'archives'; 
const port = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, 'archives')));
  
app.get('/archives/comic/:filename', (req, res) => {

    fs.readdir(archiveDirectory, (err, files) => {
        if (err) {
            console.error('Error reading archive directory:', err);
            return res.status(500).send('Internal Server Error');
        }

        const matchingFile = files.find(file => file.includes(req.params.filename));

        if (!matchingFile) {
            return res.status(404).send('File not found');
        }

        const filePath = path.join(archiveDirectory, matchingFile);
        const fileStream = fs.createReadStream(filePath);

        res.setHeader('Content-Type', getContentType(filePath));


        fileStream.on('error', (error) => {
            res.status(500).send('Internal Server Error');
        });

        fileStream.pipe(res);
    });
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
