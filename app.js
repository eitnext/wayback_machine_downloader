
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const fetch = require('node-fetch');
const path = require('path');
const URL = require('url').URL;

const app = express();
const PORT = 3000;

// Utility functions
const sanitizeFilename = (filename) => filename.replace(/[:*?&=<>\\|]/g, '_');

// Fetch snapshots from Wayback Machine API
const getSnapshots = async (baseUrl) => {
    const apiUrl = `http://web.archive.org/cdx/search/cdx?url=${baseUrl}/*&output=json&fl=timestamp,original&filter=statuscode:200`;
    const response = await axios.get(apiUrl);
    return response.data.slice(1); // Remove header row
};

// Download file from Wayback Machine
const downloadFile = async (timestamp, fileUrl, backupPath) => {
    const fileUrlWithTimestamp = `https://web.archive.org/web/${timestamp}id_/${fileUrl}`;
    const sanitizedFileUrl = sanitizeFilename(fileUrl);
    let filePath = path.join(backupPath, sanitizedFileUrl);

    // Determine if the path is a directory and adjust accordingly
    if (fileUrl.endsWith('/') || !path.extname(fileUrl)) {
        filePath = path.join(filePath, 'index.html');
    }

    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const response = await fetch(fileUrlWithTimestamp);
    const fileStream = fs.createWriteStream(filePath);

    await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
    });

    console.log(`${fileUrlWithTimestamp} -> ${filePath}`);

    // Parse HTML to find and download assets
    if (filePath.endsWith('index.html')) {
        const html = await fs.readFile(filePath, 'utf8');
        await downloadAssets(html, timestamp, backupPath, new URL(fileUrl).origin);
    }
};

// Download assets like CSS, JS, images
const downloadAssets = async (html, timestamp, backupPath, baseUrl) => {
    const $ = cheerio.load(html);
    const assetLinks = [];

    $('link[rel="stylesheet"], script[src], img[src]').each((_, element) => {
        const src = $(element).attr('href') || $(element).attr('src');
        if (src) {
            assetLinks.push(src);
        }
    });

    for (const assetLink of assetLinks) {
        try {
            const assetUrl = new URL(assetLink, baseUrl).href;
            await downloadFile(timestamp, assetUrl, backupPath);
        } catch (error) {
            console.error(`Failed to download asset ${assetLink}:`, error);
        }
    }
};

// Main download function
const downloadSnapshots = async (baseUrl, backupPath) => {
    const snapshots = await getSnapshots(baseUrl);
    for (const [timestamp, fileUrl] of snapshots) {
        await downloadFile(timestamp, fileUrl, backupPath);
    }
};

app.get('/download', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('URL parameter is required');
    }

    const backupPath = path.join(__dirname, 'backups', sanitizeFilename(new URL(url).hostname));

    try {
        await downloadSnapshots(url, backupPath);
        res.send(`Downloaded snapshots of ${url} to ${backupPath}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while downloading snapshots');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
