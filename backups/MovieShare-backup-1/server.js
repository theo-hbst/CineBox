const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

let allowlist;
try {
    const data = fs.readFileSync('allowlist.json');
    allowlist = JSON.parse(data).allowedIPs;
} catch (err) {
    console.error(err);
}

const server = http.createServer((req, res) => {
    const clientIp = req.connection.remoteAddress.replace(/^::ffff:/, '');

    // Check if the client's IP address is in the allowlist
    if (!allowlist.includes(clientIp)) {
        res.writeHead(403);
        res.end('Access denied');
        return;
    }
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    let extname = String(path.extname(filePath)).toLowerCase();
    let contentType = 'text/html';
    let mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
    };

    contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            fs.readFile(path.join(__dirname, '404.html'), (error, content) => {
                res.writeHead(404, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            });
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const port = 8080; // Change this to your preferred port
server.listen(port, () => {
    console.log(`Server is running on the following addresses:`);

    const networkInterfaces = os.networkInterfaces();
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            // Skip over non-IPv4 addresses
            if (net.family === 'IPv4') {
                console.log(`http://${net.address}:${port}`);
                // Add the server's IP to the allowlist
                if (!allowlist.includes(net.address)) {
                    allowlist.push(net.address);
                }
            }
        }
    }
});