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
const colors = require('colors');
const readline = require('readline');
const { spawn } = require('child_process');

const version = '1.3.5';

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 20;

const argv = yargs(hideBin(process.argv))
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Port to run the server on',
    default: 8080
  })
  .option('allowlist', {
    type: 'boolean',
    alias: 'a',
    description: 'Enable allowlist',
  })
  .option('localhost', {
    alias: 'l',
    type: 'boolean',
    description: 'Run server on localhost only',
  })
  .option('debug-append', {
    type: 'boolean',
    description: 'Do not append server IPs to allowlist',
  })
  .option('persist-append', {
    type: 'boolean',
    description: 'Persist appended server IPs to allowlist file',
  })
  .version(version)
  .alias('version', 'v')
  .option('help', {
    alias: 'h',
    description: 'Display this usage guide.'
  })
  .argv;

const BASE_DIR = __dirname + '/Media';

let allowlist = [];
if (argv.allowlist) {
  try {
    const data = fs.readFileSync("allowlist.json");
    allowlist = JSON.parse(data).allowedIPs;
  } catch (err) {
    console.error(colors.magenta(err));
  }
}

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use((req, res, next) => {
  res.cookie('session', '1', {httpOnly: true });
  next();
});

let limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  handler: function(req, res, /*next*/) {
    console.log(colors.red(`Blocked IP due to rate limit: ${req.ip}`)); // Log the blocked IP
    res.status(429).sendFile(path.join(__dirname, '/public/pages/errors/429.html'));
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

app.post('/server/stop', (req, res) => {
  console.log(colors.red('Stopping server...'));
  server.close(() => {
    process.exit(0);
  });
});

app.post('/server/restart', (req, res) => {
  console.log(colors.yellow('Restarting server...'));
  server.close(() => {
    const nodeProcess = spawn('node', [process.argv[1], ...process.argv.slice(2)], {
      stdio: 'inherit'
    });
    nodeProcess.on('close', (code) => {
      console.log(colors.red(`Node process exited with code ${code}`));
      process.exit(code);
    });
  });
  res.send('Server restarting');
});

app.post('/server/append', (req, res) => {
  const ip = req.body.ip;
  if (ip) {
    if (!allowlist.includes(ip)) {
      allowlist.push(ip);
      fs.writeFileSync('allowlist.json', JSON.stringify({ allowedIPs: allowlist }, null, 2));
      console.log(colors.green(`Appended IP: ${ip}`));
      res.send(`Appended IP: ${ip}`);
    } else {
      console.log(colors.yellow(`IP already in allowlist: ${ip}`));
      res.send(`IP already in allowlist: ${ip}`);
    }
  } else {
    res.status(400).send('No IP provided to append.');
  }
});

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
    res.redirect('/public/pages/content/torrent.html');
    });

  io.on('connection', (socket) => {
    socket.on('pageLoaded', (page) => {
    socket.emit('showAlert', 'You have been redirected to the torrent page.');
    });
  });
});

app.use((req, res, next) => {
  const clientIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress.replace(/^::ffff:/, "") : null;

  if (argv.localhost) {
    if (clientIp !== '127.0.0.1') {
      console.log(colors.red(`Rejected IP: ${clientIp}`)); // Log the blocked IP
      res.sendFile(path.join(__dirname, "/public/pages/errors/403.html"));
      return;
    }
  } else if (argv.allowlist && clientIp && !allowlist.includes(clientIp)) {
    console.log(colors.red(`Rejected IP: ${clientIp}`)); // Log the blocked IP 
    res.sendFile(path.join(__dirname, "/public/pages/errors/403.html"));
    return;
  }
  next();
});

// Routes pour le gestionnaire de fichiers

app.get('/files', (req, res) => {
  const filePath = req.query.path || '';
  const fullPath = path.join(BASE_DIR, filePath);
  fs.readdir(fullPath, (err, items) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to scan directory' });
    }
    const files = items.map(item => {
      const itemPath = path.join(fullPath, item);
      return {
        name: item,
        path: path.join(filePath, item),
        isDirectory: fs.statSync(itemPath).isDirectory()
      };
    });
    res.json(files);
  });
});

app.delete('/delete', (req, res) => {
  const filePath = req.query.path;
  const fullPath = path.join(BASE_DIR, filePath);
  if (fs.statSync(fullPath).isDirectory()) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(colors.yellow(`Deleted directory: ${filePath}`));
  } else {
    fs.unlinkSync(fullPath);
    console.log(colors.yellow(`Deleted file: ${filePath}`));
  }
  res.sendStatus(204);
});

app.post('/rename', (req, res) => {
  const oldPath = req.query.oldPath;
  const newPath = req.query.newPath;
  const fullOldPath = path.join(BASE_DIR, oldPath);
  const fullNewPath = path.join(BASE_DIR, path.dirname(oldPath), newPath);
  fs.renameSync(fullOldPath, fullNewPath);
  console.log(colors.yellow(`Renamed: ${oldPath} to ${newPath}`));
  res.sendStatus(204);
});

app.get('/download', (req, res) => {
  const filePath = req.query.path;
  const fullPath = path.join(BASE_DIR, filePath);
  console.log(colors.yellow(`Downloaded file: ${filePath}`));
  res.download(fullPath);
});

app.get('/movies', (req, res) => {
  const moviesFolder = path.join(BASE_DIR, 'movies');
  const movies = [];

  fs.readdir(moviesFolder, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to scan directory' });
    }

    files.forEach(filename => {
      if (filename.endsWith('.mp4') || filename.endsWith('.mkv')) {
        const thumbnailPath = path.join(moviesFolder, 'src', filename.replace(/\.[^/.]+$/, '') + '.jpg');
        const movie = {
          name: filename,
          thumbnail: fs.existsSync(thumbnailPath) ? thumbnailPath : 'black-thumbnail.jpg'
        };
        movies.push(movie);
      }
    });

    res.json(movies);
  });
});

app.use('/movies', express.static(path.join(BASE_DIR, 'movies'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (path.endsWith('.mkv')) {
      res.setHeader('Content-Type', 'video/x-matroska');
    }
  }
}));

app.get('/series', (req, res) => {
  const seriesFolder = path.join(BASE_DIR, 'series');
  const series = [];

  fs.readdir(seriesFolder, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to scan directory' });
    }

    files.forEach(filename => {
      const seriesPath = path.join(seriesFolder, filename);
      if (fs.statSync(seriesPath).isDirectory()) {
        const thumbnailPath = path.join(seriesPath, 'src', 'thumbnail.jpg');
        const serie = {
          name: filename,
          thumbnail: fs.existsSync(thumbnailPath) ? thumbnailPath : 'black-thumbnail.jpg'
        };
        series.push(serie);
      }
    });

    res.json(series);
  });
});

app.use('/series', express.static(path.join(BASE_DIR, 'series'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (path.endsWith('.mkv')) {
      res.setHeader('Content-Type', 'video/x-matroska');
    }
  }
}));

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
        fs.readFile(path.join(__dirname, "/public/pages/errors/404.html"), (error, content) => {
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

  if (argv.localhost) {
    console.log(colors.green(`http://127.0.0.1:${port}`));
    if (!allowlist.includes('127.0.0.1')) {
      allowlist.push('127.0.0.1');
    }
  } else {
    const networkInterfaces = os.networkInterfaces();
    for (const name of Object.keys(networkInterfaces)) {
      for (const net of networkInterfaces[name]) {
        // Skip over non-IPv4 addresses
        if (net.family === "IPv4") {
          console.log(colors.green(`http://${net.address}:${port}`));
          if (!argv['debug-append'] && !allowlist.includes(net.address)) {
            allowlist.push(net.address);
          }
        }
      }
    }
  }

  if (!argv['debug-append'] && argv['persist-append']) {
    fs.writeFileSync('allowlist.json', JSON.stringify({ allowedIPs: allowlist }, null, 2));
  }
  rl.prompt();
});

// Command line interface for server control
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '>>> '
});

rl.on('line', (input) => {
  const [command, ip] = input.trim().split(' ');

  switch (command) {
    case 'stop':
      console.log(colors.red('Stopping server...'));
      server.close(() => {
        process.exit(0);
      });
      break;
    case 'restart':
      console.log(colors.yellow('Restarting server...'));
      server.close(() => {
        const nodeProcess = spawn('node', [process.argv[1], ...process.argv.slice(2)], {
          stdio: 'inherit'
        });
        nodeProcess.on('close', (code) => {
          console.log(colors.red(`Node process exited with code ${code}`));
          process.exit(code);
        });
      });
      break;
    case 'append':
      if (ip) {
        if (!allowlist.includes(ip)) {
          allowlist.push(ip);
          if (argv['persist-append']) {
            fs.writeFileSync('allowlist.json', JSON.stringify({ allowedIPs: allowlist }, null, 2));
          }
          console.log(colors.green(`Appended IP: ${ip}`));
          console.log(colors.cyan(`Current allowlist: ${JSON.stringify(allowlist, null, 2)}`));
        } else {
          console.log(colors.yellow(`IP already in allowlist: ${ip}`));
        }
      } else {
        console.log(colors.red('No IP provided to append.'));
      }
      break;
    case 'list':
      console.log(colors.yellow('Open IP addresses:'));
      const networkInterfaces = os.networkInterfaces();
      for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
          if (net.family === "IPv4") {
            console.log(colors.green(`http://${net.address}:${port}`));
          }
        }
      }
      break;
    case 'allowlist':
      console.log(colors.cyan('Current allowlist:'));
      console.log(colors.cyan(JSON.stringify(allowlist, null, 2)));
      break;
    case 'clear':
      console.clear();
      console.log(colors.yellow('Console cleared.'));
      break;
    case 'help':
      console.log(`
Usage: cli interface

Commands:
  stop                    Stop the server
  restart                 Restart the server
  append <ip>             Append an IP to the allowlist  [EXAMPLE: 'append 192.168.x.x']
  list                    List open IP addresses
  allowlist               Display the current allowlist
  clear                   Clear the console
  help                    Display this help message
      `);
      break;
    default:
      console.log(colors.red(`Unknown command: ${input}`));
      break;
  }
  rl.prompt();
});