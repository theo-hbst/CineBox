const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const ExpressBrute = require('express-brute');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');


let allowlist;
try {
  const data = fs.readFileSync("allowlist.json");
  allowlist = JSON.parse(data).allowedIPs;
} catch (err) {
  console.error(err);
}

const app = express();

app.use(cors());

app.use(cookieParser());
app.use((req, res, next) => {
  res.cookie('session', '1', { secure: true, httpOnly: true });
  next();
});

app.use(csurf({ cookie: true }));

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  handler: function(req, res, /*next*/) {
    console.log(`Blocked IP due to rate limit: ${req.ip}`); // Log the blocked IP
    console.log(`A DDoS attack may be in progress from above IP address.`);
    res.status(429).sendFile(path.join(__dirname, '429.html'));
  }
});
app.use(limiter);

const store = new ExpressBrute.MemoryStore(); // stores state locally, don't use this in production
const bruteforce = new ExpressBrute(store);

app.post('/auth',
  bruteforce.prevent, // prevent brute force attacks
  (req, res, next) => {
    // validate the input using Joi
    const schema = Joi.object({
      username: Joi.string().alphanum().min(3).max(30).required(),
      password: Joi.string().pattern(new RegExp('^[a-zA-Z0-9]{3,30}$')).required(),
    });
    const { error } = schema.validate(req.body);
    if (error) {
      res.status(400).send(error.details[0].message);
      return;
    }
  }
);

app.use((req, res, next) => {
  const clientIp = req.connection.remoteAddress.replace(/^::ffff:/, "");

  // Check if the client's IP address is in the allowlist
  if (!allowlist.includes(clientIp)) {
    console.log(`Rejected IP: ${clientIp}`); // Log the blocked IP 
    res.status(403).send("Access denied");
    return;
  }

  let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
  let extname = String(path.extname(filePath)).toLowerCase();
  let contentType = "text/html";
  let mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  };

  contentType = mimeTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(__dirname, "404.html"), (error, content) => {
        res.writeHead(404, { "Content-Type": contentType });
        res.end(content, "utf-8");
      });
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

const port = 8080; // Change this to your preferred port
app.listen(port, () => {
  console.log(`Server is running on the following addresses:`);

  const networkInterfaces = os.networkInterfaces();
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      // Skip over non-IPv4 addresses
      if (net.family === "IPv4") {
        console.log(`http://${net.address}:${port}`);
        // Add the server's IP to the allowlist
        if (!allowlist.includes(net.address)) {
          allowlist.push(net.address);
        }
      }
    }
  }
});