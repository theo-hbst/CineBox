const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const ExpressBrute = require('express-brute');
const cookieParser = require('cookie-parser');
const http = require('http');
const socketIo = require('socket.io');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { all } = require('axios');
const helmet = require('helmet');
const { spawn } = require('child_process');
const colors = require('colors'); // Ajout de colors

const version = '1.2.0';

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(helmet());

const argv = yargs(hideBin(process.argv))
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Port to run the server on',
    default: 8080
  })
  .option('localhost', {
    type: 'boolean',
    alias: 'l',
    description: 'Run the server on localhost only',
  })
  .option('allowlist', {
    type: 'boolean',
    alias: 'a',
    description: 'Enable allowlist',
  })
  .version(version)
  .alias('version', 'v')
  .option('help', {
    alias: 'h',
    description: 'Display this usage guide.'
  })
  .argv;

let allowlist;
try {
  const data = fs.readFileSync("allowlist.json");
  allowlist = JSON.parse(data).allowedIPs;
} catch (err) {
  console.error(colors.magenta(err));
}

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use((req, res, next) => {
  res.cookie('session', '1', { secure: true, httpOnly: true });
  next();
});

// app.use(csurf({ cookie: true }));

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  handler: function(req, res, /*next*/) {
    console.log(colors.red(`Blocked IP due to rate limit: ${req.ip}`)); // Log the blocked IP
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/submit_form', (req, res) => {
  const option = req.body.option;
  const textInput = req.body.text_input;

  console.log(colors.green(`Option: ${option}`));
  console.log(colors.green(`Text Input: ${textInput}`));

  const pythonProcess = spawn('python', ['handle_form.py', option, textInput]);

  console.log(colors.yellow('Python engine started'));
  
  pythonProcess.stdout.on('data', (data) => {
    console.log(colors.yellow(`stdout: ${data}`));
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(colors.red(`stderr: ${data}`));
  });

  pythonProcess.on('close', (code) => {
    console.log(colors.yellow(`child process exited with code ${code}`));
    console.log(colors.green('Form data processed successfully'));
    res.status(200).send('Form data processed successfully');
  });
});

app.get('/form', (req, res) => {
  res.sendFile(path.join(__dirname, 'pages/content/form.html'));
});

app.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.use((req, res, next) => {
  const clientIp = req.socket.remoteAddress.replace(/^::ffff:/, "");

  // Check if the client's IP address is in the allowlist
  if (argv.allowlist && !allowlist.includes(clientIp)) {
    console.log(colors.red(`Rejected IP: ${clientIp}`)); // Log the blocked IP 
    fs.readFile(path.join(__dirname, "pages/errors/403.html"), (error, content) => {
      res.writeHead(403, { "Content-Type": "text/html; charset=UTF-8" });
      res.end(content, "utf-8");
    });
    return;
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
        console.error(colors.magenta(`Server Error: ${error.code}`));
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
  console.log(colors.yellow(`Server is running on the following addresses:`));

  const networkInterfaces = os.networkInterfaces();
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      // Skip over non-IPv4 addresses
      if (net.family === "IPv4") {
        console.log(colors.green(`http://${net.address}:${port}`));
        if (!argv.localhost && !allowlist.includes(net.address)) {
          allowlist.push(net.address);
        }
      }
    }
  }
  console.log(colors.green('Allowlist enabled:'), colors.green(allowlist));
});