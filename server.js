const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const ExpressBrute = require('express-brute');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const http = require('http');
const socketIo = require('socket.io');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const argv = yargs(hideBin(process.argv))
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Port to run the server on',
    default: 2048
  })
  .option('debug', {
    type: 'boolean',
    description: 'Enable debug mode',
    default: false
  })
  .argv;

let allowlist;
try {
  const data = fs.readFileSync("allowlist.json");
  allowlist = JSON.parse(data).allowedIPs;
} catch (err) {
  console.error(err);
}

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
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
    res.status(429).sendFile(path.join(__dirname, 'pages/errors/429.html'));
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
    next();
  }
);

app.use((req, res, next) => {
  const clientIp = req.socket.remoteAddress.replace(/^::ffff:/, "");

  // Check if the client's IP address is in the allowlist
  if (!allowlist.includes(clientIp)) {
    console.log(`Rejected IP: ${clientIp}`); // Log the blocked IP 
    fs.readFile(path.join(__dirname, "pages/errors/403.html"), (error, content) => {
      res.writeHead(403, { "Content-Type": "text/html; charset=UTF-8" });
      res.end(content, "utf-8");
    });
    return; // Ensure the middleware chain is stopped
  }
  next();
});

app.use((req, res) => {
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
      if (error.code === 'ENOENT') {
        fs.readFile(path.join(__dirname, "pages/errors/404.html"), (error, content) => {
          res.writeHead(404, { "Content-Type": "text/html" });
          res.end(content, "utf-8");
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

const port = argv.port; // Change this to your preferred port
server.listen(port, () => {
  console.log(`Server is running on the following addresses:`);

  const networkInterfaces = os.networkInterfaces();
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      // Skip over non-IPv4 addresses
      if (net.family === "IPv4") {
        console.log(`http://${net.address}:${port}`);
        if (!argv.debug && !allowlist.includes(net.address)) {
          allowlist.push(net.address);
        }
      }
    }
  }
  if (argv.debug) {
    console.log('Debug mode is enabled (ALLOWLIST TEST). Allowlist:', allowlist);
  }
});