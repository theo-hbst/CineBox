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
const { randomUUID } = require('crypto');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const colors = require('colors');
const readline = require('readline');
const { spawn } = require('child_process');
const multer = require('multer');

const version = '1.5';

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
  .option('noid', {
    type: 'boolean',
    default: false,
    description: 'Bypass authentication (connection), IP redirect/rejection and logout',
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
const TORRENT_DOWNLOAD_DIR = path.join(BASE_DIR, 'downloads');
const TORRENT_JOB_DIR = path.join(TORRENT_DOWNLOAD_DIR, 'torrentJobs');
const TORRENT_INFO_DIR = path.join(TORRENT_DOWNLOAD_DIR, 'torrentInfo');
const ARIA2C_LOCAL_EXE = path.join(__dirname, 'public', 'python', 'aria2c.exe');
const USERS_FILE = path.join(__dirname, 'public', 'json', 'users.json');
const PROFILE_PICTURE_DIR = path.join(__dirname, 'public', 'imgs', 'profile-pictures');

const torrentJobs = new Map();

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getAria2Command() {
  return fs.existsSync(ARIA2C_LOCAL_EXE) ? ARIA2C_LOCAL_EXE : 'aria2c';
}

function createTorrentJob(type, sourceLabel) {
  const jobId = randomUUID();
  const downloadDir = path.join(TORRENT_JOB_DIR, jobId);
  const infoDir = path.join(TORRENT_INFO_DIR, jobId);

  ensureDirectory(downloadDir);
  ensureDirectory(infoDir);

  const job = {
    id: jobId,
    type,
    sourceLabel,
    downloadDir,
    infoDir,
    status: 'queued',
    progress: 0,
    speed: '',
    eta: '',
    message: 'Queued',
    canceled: false,
    bufferedOutput: '',
    process: null,
    source: '',
    startedAt: new Date().toISOString(),
  };

  torrentJobs.set(jobId, job);
  return job;
}

function serializeTorrentJob(job) {
  return {
    id: job.id,
    type: job.type,
    sourceLabel: job.sourceLabel,
    status: job.status,
    progress: job.progress,
    speed: job.speed,
    eta: job.eta,
    message: job.message,
    downloadDir: job.downloadDir,
    startedAt: job.startedAt,
  };
}

function emitTorrentJob(job) {
  io.emit('torrent:progress', serializeTorrentJob(job));
}

function cleanupTorrentJob(job) {
  try {
    if (job.infoDir && fs.existsSync(job.infoDir)) {
      fs.rmSync(job.infoDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(colors.red(`Failed to clean torrent info dir: ${error}`));
  }

  try {
    if (job.downloadDir && fs.existsSync(job.downloadDir)) {
      fs.rmSync(job.downloadDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(colors.red(`Failed to clean torrent download dir: ${error}`));
  }
}

function updateTorrentJobFromOutput(job, chunk) {
  job.bufferedOutput += chunk.toString();
  const lines = job.bufferedOutput.split(/[\r\n]+/);
  job.bufferedOutput = lines.pop() || '';

  lines.forEach((line) => {
    const cleanLine = line.trim();
    if (!cleanLine) {
      return;
    }

    const percentMatch = cleanLine.match(/(\d{1,3}(?:\.\d+)?)%/);
    if (percentMatch) {
      job.progress = Math.max(0, Math.min(100, Number(percentMatch[1])));
    }

    const speedMatch = cleanLine.match(/(?:DL|UL):\s*([^\s\]]+)/i);
    if (speedMatch) {
      job.speed = speedMatch[1];
    }

    const etaMatch = cleanLine.match(/ETA:?\s*([^\s\]]+)/i);
    if (etaMatch) {
      job.eta = etaMatch[1];
    }

    job.message = cleanLine;
    emitTorrentJob(job);
  });
}

function persistTorrentSource(job, sourceName, sourceContent) {
  fs.writeFileSync(path.join(job.infoDir, sourceName), sourceContent, 'utf-8');
}

function startTorrentJob(job, source, kind, useInputFile = false) {
  const aria2Command = getAria2Command();
  job.source = source;
  job.status = 'running';
  job.message = 'Starting aria2c';

  fs.writeFileSync(
    path.join(job.infoDir, 'metadata.json'),
    JSON.stringify(
      {
        id: job.id,
        type: kind,
        source,
        sourceLabel: job.sourceLabel,
        startedAt: job.startedAt,
        downloadDir: job.downloadDir,
      },
      null,
      2,
    ),
    'utf-8',
  );

  const args = [
    `--dir=${job.downloadDir}`,
    '--allow-overwrite=true',
    '--continue=true',
    '--summary-interval=1',
    '--show-console-readout=true',
    '--console-log-level=warn',
    ...(useInputFile ? [`--input-file=${source}`] : [source]),
  ];

  try {
    job.process = spawn(aria2Command, args, {
      cwd: __dirname,
      windowsHide: true,
    });
  } catch (error) {
    job.status = 'error';
    job.message = error.message;
    emitTorrentJob(job);
    cleanupTorrentJob(job);
    torrentJobs.delete(job.id);
    return;
  }

  emitTorrentJob(job);

  job.process.stdout.on('data', (data) => updateTorrentJobFromOutput(job, data));
  job.process.stderr.on('data', (data) => updateTorrentJobFromOutput(job, data));

  job.process.on('error', (error) => {
    job.status = 'error';
    job.message = error.message;
    emitTorrentJob(job);
    cleanupTorrentJob(job);
    torrentJobs.delete(job.id);
  });

  job.process.on('close', (code) => {
    job.process = null;

    if (job.canceled) {
      job.status = 'cancelled';
      job.progress = 0;
      job.message = 'Download cancelled';
      emitTorrentJob(job);
      cleanupTorrentJob(job);
      torrentJobs.delete(job.id);
      return;
    }

    if (code === 0) {
      job.status = 'completed';
      job.progress = 100;
      job.message = 'Download completed';
      emitTorrentJob(job);
    } else {
      job.status = 'error';
      job.message = `aria2c exited with code ${code}`;
      emitTorrentJob(job);
      cleanupTorrentJob(job);
    }

    torrentJobs.delete(job.id);
  });

  return job;
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(BASE_DIR, 'downloads', 'torrentInfo');
    // Create downloads directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Keep original filename
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

const profilePictureStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureDirectory(PROFILE_PICTURE_DIR);
    cb(null, PROFILE_PICTURE_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, buildProfilePictureFilename(req.body.username, file.originalname));
  }
});

const profilePictureUpload = multer({
  storage: profilePictureStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'));
    }

    cb(null, true);
  }
});

function handleProfilePictureUpload(req, res, next) {
  profilePictureUpload.single('avatar')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return next();
  });
}

function readUsersData() {
  const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

  if (!Array.isArray(usersData.users)) {
    usersData.users = [];
  }

  return usersData;
}

function writeUsersData(usersData) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
}

function getAvatarUrl(avatarPath) {
  return avatarPath && typeof avatarPath === 'string' ? avatarPath : null;
}

function sanitizeProfileUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildProfilePictureFilename(username, originalFilename) {
  const safeUsername = sanitizeProfileUsername(username) || 'user';
  const fileExtension = path.extname(originalFilename || '').toLowerCase() || '.png';
  return `${safeUsername}-${Date.now()}-${randomUUID()}${fileExtension}`;
}

function removeFileIfExists(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

let allowlist = [];
if (argv.allowlist) {
  try {
    const data = fs.readFileSync("public/json/allowlist.json");
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
    res.status(429).sendFile(path.join(__dirname, 'public/pages/errors/429.html'));
  }
});
app.use(limiter);

const store = new ExpressBrute.MemoryStore(); // stores state locally, don't use this in production
const bruteforce = new ExpressBrute(store);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/auth', bruteforce.prevent, (req, res) => {
  if (argv.noid) {
    const usersData = readUsersData();
    const fallbackUser = Array.isArray(usersData.users) ? usersData.users[0] : null;
    const username = (req.body && req.body.username) || (fallbackUser && fallbackUser.username) || 'guest';
    const avatarUrl = fallbackUser ? getAvatarUrl(fallbackUser.avatarUrl) : null;

    return res.json({ username, avatarUrl, noid: true });
  }

  const schema = Joi.object({
    username: Joi.string().min(1).max(30).required(),
    password: Joi.string().min(1).max(100).required(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const usersData = readUsersData();
    const userFound = Array.isArray(usersData.users)
      ? usersData.users.find((user) => user.username === req.body.username && user.password === req.body.password)
      : null;

    if (!userFound) {
      return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect.' });
    }

    return res.json({
      username: userFound.username,
      avatarUrl: getAvatarUrl(userFound.avatarUrl),
    });
  } catch (error) {
    console.error(colors.red(`Auth error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to validate credentials.' });
  }
});

app.get('/api/config', (req, res) => {
  return res.json({ noid: !!argv.noid });
});

app.post('/logout', (req, res) => {
  if (argv.noid) {
    // En mode --noid, il n'y a pas de session à invalider : on répond simplement OK
    // pour que le frontend puisse gérer ce cas sans forcer de déconnexion réelle.
    return res.json({ noid: true, loggedOut: false });
  }

  res.clearCookie('session');
  return res.json({ loggedOut: true });
});

app.get('/api/users/:username', (req, res) => {
  try {
    const usersData = readUsersData();
    const user = usersData.users.find((entry) => entry.username === req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    return res.json({
      username: user.username,
      avatarUrl: getAvatarUrl(user.avatarUrl),
    });
  } catch (error) {
    console.error(colors.red(`Profile lookup error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to load profile.' });
  }
});

app.post('/api/users/avatar', handleProfilePictureUpload, (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';

  if (!username) {
    if (req.file) {
      removeFileIfExists(req.file.path);
    }

    return res.status(400).json({ error: 'Username is required.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded.' });
  }

  try {
    const usersData = readUsersData();
    const userIndex = usersData.users.findIndex((entry) => entry.username === username);

    if (userIndex === -1) {
      removeFileIfExists(req.file.path);
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const previousAvatarUrl = getAvatarUrl(usersData.users[userIndex].avatarUrl);
    const avatarUrl = `/public/imgs/profile-pictures/${req.file.filename}`;
    usersData.users[userIndex].avatarUrl = avatarUrl;
    writeUsersData(usersData);

    if (previousAvatarUrl) {
      const previousAvatarPath = path.join(__dirname, previousAvatarUrl.replace('/public/', 'public/'));
      if (previousAvatarPath !== req.file.path) {
        removeFileIfExists(previousAvatarPath);
      }
    }

    return res.json({
      username,
      avatarUrl,
    });
  } catch (error) {
    removeFileIfExists(req.file.path);
    console.error(colors.red(`Avatar upload error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to save profile picture.' });
  }
});

app.post('/api/users/username', (req, res) => {
  const schema = Joi.object({
    currentUsername: Joi.string().min(1).max(30).required(),
    newUsername: Joi.string().min(1).max(30).required(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const currentUsername = req.body.currentUsername.trim();
  const newUsername = req.body.newUsername.trim();

  if (currentUsername === newUsername) {
    try {
      const usersData = readUsersData();
      const currentUser = usersData.users.find((entry) => entry.username === currentUsername);

      return res.json({
        username: currentUsername,
        avatarUrl: getAvatarUrl(currentUser && currentUser.avatarUrl),
      });
    } catch (error) {
      console.error(colors.red(`Username lookup error: ${error.message}`));
      return res.status(500).json({ error: 'Unable to load username.' });
    }
  }

  try {
    const usersData = readUsersData();
    const currentUserIndex = usersData.users.findIndex((entry) => entry.username === currentUsername);

    if (currentUserIndex === -1) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const usernameAlreadyExists = usersData.users.some((entry) => entry.username === newUsername);
    if (usernameAlreadyExists) {
      return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà utilisé.' });
    }

    usersData.users[currentUserIndex].username = newUsername;
    writeUsersData(usersData);

    return res.json({
      username: newUsername,
      avatarUrl: getAvatarUrl(usersData.users[currentUserIndex].avatarUrl),
    });
  } catch (error) {
    console.error(colors.red(`Username update error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to update username.' });
  }
});

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
      fs.writeFileSync('public/json/allowlist.json', JSON.stringify({ allowedIPs: allowlist }, null, 2));
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


app.post('/scraper', (req, res) => {
  const pythonExecutable = process.env.PYTHON_EXECUTABLE || process.env.PYTHON || 'python';
  const pythonProcessScraper = spawn(pythonExecutable, ['public/python/scraper.py']);

  console.log(colors.yellow('Python engine started'));

  pythonProcessScraper.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(colors.yellow(`stdout: ${output}`));

    // Vérifier si le scraping est terminé
    if (output.includes('SCRAPING_COMPLETE')) {
      // Échanger les fichiers
      const oldFile = 'public/json/scrapedMovies.json';
      const tempFile = 'public/json/scrapedMoviesTemp.json';

      try {
        // Supprimer l'ancien fichier s'il existe
        if (fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
          console.log(colors.green('Old scraping file removed'));
        }

        // Renommer le fichier temporaire
        if (fs.existsSync(tempFile)) {
          fs.renameSync(tempFile, oldFile);
          console.log(colors.green('Scraping file updated successfully'));
        }
      } catch (error) {
        console.error(colors.red(`Error swapping files: ${error}`));
      }
    }
  });

  pythonProcessScraper.stderr.on('data', (data) => {
    console.error(colors.red(`stderr: ${data}`));
  });

  pythonProcessScraper.on('close', (code) => {
    console.log(colors.yellow(`child process exited with code ${code}`));
    res.send('Scraper process completed');
  });
});

// Nouvel endpoint pour vérifier si le scraping est terminé
app.get('/scraper/status', (req, res) => {
  const oldFile = 'public/json/scrapedMovies.json';
  const tempFile = 'public/json/scrapedMoviesTemp.json';

  const isScrapingInProgress = fs.existsSync(tempFile);
  const hasData = fs.existsSync(oldFile);

  res.json({
    scrapingInProgress: isScrapingInProgress,
    hasData: hasData,
    timestamp: Date.now()
  });
});

app.use((req, res, next) => {
  if (argv.noid) {
    return next();
  }

  const clientIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress.replace(/^::ffff:/, "") : null;

  if (argv.localhost) {
    if (clientIp !== '127.0.0.1') {
      console.log(colors.red(`Rejected IP: ${clientIp}`)); // Log the blocked IP
      res.sendFile(path.join(__dirname, "public/pages/errors/403.html"));
      return;
    }
  } else if (argv.allowlist && clientIp && !allowlist.includes(clientIp)) {
    console.log(colors.red(`Rejected IP: ${clientIp}`)); // Log the blocked IP 
    res.sendFile(path.join(__dirname, "public/pages/errors/403.html"));
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

app.post('/move', (req, res) => {
  const sourcePath = req.body.sourcePath;
  const destinationPath = req.body.destinationPath;
  const fileName = path.basename(sourcePath);
  
  const fullSourcePath = path.join(BASE_DIR, sourcePath);
  const fullDestinationPath = path.join(BASE_DIR, destinationPath, fileName);
  
  try {
    // Vérifier que le dossier de destination existe
    const destDir = path.join(BASE_DIR, destinationPath);
    if (!fs.existsSync(destDir)) {
      return res.status(400).json({ error: 'Destination directory does not exist' });
    }
    
    // Vérifier que le fichier source existe
    if (!fs.existsSync(fullSourcePath)) {
      return res.status(400).json({ error: 'Source file does not exist' });
    }
    
    // Vérifier qu'on ne déplace pas un dossier dans lui-même
    if (fs.statSync(fullSourcePath).isDirectory() && fullDestinationPath.startsWith(fullSourcePath)) {
      return res.status(400).json({ error: 'Cannot move directory into itself' });
    }
    
    // Déplacer le fichier/dossier
    fs.renameSync(fullSourcePath, fullDestinationPath);
    console.log(colors.yellow(`Moved: ${sourcePath} to ${destinationPath}/${fileName}`));
    res.json({ success: true, message: 'File moved successfully' });
  } catch (error) {
    console.error(colors.red(`Error moving file: ${error}`));
    res.status(500).json({ error: 'Failed to move file' });
  }
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
      if (
        filename.endsWith('.mp4') ||
        filename.endsWith('.mkv') ||
        filename.endsWith('.mov') ||
        filename.endsWith('.mp3')
      ) {
        const baseName = filename.replace(/\.[^/.]+$/, '');
        const thumbnailPath = path.join(moviesFolder, 'src', `${baseName}.jpg`);
        const movie = {
          name: filename,
          thumbnail: fs.existsSync(thumbnailPath) ? `/movies/src/${baseName}.jpg` : null,
          videoUrl: `/movies/${filename}`,
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
    } else if (path.endsWith('.mov')) {
      res.setHeader('Content-Type', 'video/quicktime');
    } else if (path.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
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
    } else if (path.endsWith('.mov')) {
      res.setHeader('Content-Type', 'video/quicktime');
    } else if (path.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
    }
  }
}));

function handleTorrentUploadRequest(req, res) {
  if (!req.file) {
    console.log(colors.red('No file uploaded'));
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const uploadedFile = req.file;
  const job = createTorrentJob('upload', uploadedFile.originalname || uploadedFile.filename);
  const storedTorrentPath = path.join(job.infoDir, path.basename(uploadedFile.originalname || uploadedFile.filename));

  try {
    fs.copyFileSync(uploadedFile.path, storedTorrentPath);
    fs.unlinkSync(uploadedFile.path);
  } catch (error) {
    cleanupTorrentJob(job);
    torrentJobs.delete(job.id);
    return res.status(500).json({ error: `Failed to stage torrent file: ${error.message}` });
  }

  console.log(colors.green(`File upload received for job ${job.id}`));
  startTorrentJob(job, storedTorrentPath, 'upload');

  return res.json({
    job: serializeTorrentJob(job),
  });
}

app.post('/upload_file', upload.single('file_upload'), handleTorrentUploadRequest);

app.post('/api/torrent/upload', upload.single('file_upload'), handleTorrentUploadRequest);

app.get('/api/torrent/status/:jobId', (req, res) => {
  const job = torrentJobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Torrent job not found' });
  }

  return res.json({
    job: serializeTorrentJob(job),
  });
});

app.post('/api/torrent/cancel/:jobId', (req, res) => {
  const job = torrentJobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Torrent job not found' });
  }

  if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'error') {
    cleanupTorrentJob(job);
    torrentJobs.delete(job.id);
    return res.json({ job: serializeTorrentJob(job), cancelled: true });
  }

  job.canceled = true;
  job.status = 'cancelling';
  job.message = 'Cancelling download';
  emitTorrentJob(job);

  if (job.process && !job.process.killed) {
    job.process.kill();
  }

  return res.json({ job: serializeTorrentJob(job), cancelled: true });
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
        fs.readFile(path.join(__dirname, "public/pages/errors/404.html"), (error, content) => {
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
  if (argv.noid) {
    console.log(colors.magenta('--noid activé: bypass de l\'authentification, redirection IP/ et déconnection.'));
  }

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
    fs.writeFileSync('public/json/allowlist.json', JSON.stringify({ allowedIPs: allowlist }, null, 2));
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
            fs.writeFileSync('public/json/allowlist.json', JSON.stringify({ allowedIPs: allowlist }, null, 2));
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