const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const Tokens = require('csrf');
const cookieParser = require('cookie-parser');
const http = require('http');
const socketIo = require('socket.io');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual } = require('crypto');
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

// Resolves a client-supplied relative path inside BASE_DIR, and
// returns null if the result escapes BASE_DIR (path traversal).
const RESOLVED_BASE_DIR = path.resolve(BASE_DIR);
function resolveSafePath(relativePath) {
  const resolved = path.resolve(RESOLVED_BASE_DIR, relativePath || '');
  if (resolved !== RESOLVED_BASE_DIR && !resolved.startsWith(RESOLVED_BASE_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getAria2Command() {
  // The bundled .exe is a Windows PE binary — it can't run on Linux/macOS/
  // Android (Termux), and would fail with EACCES if we tried. Only use it
  // on actual Windows; everywhere else, rely on the system-installed aria2c
  // (e.g. `apt install aria2` / `pkg install aria2`).
  if (process.platform === 'win32' && fs.existsSync(ARIA2C_LOCAL_EXE)) {
    return ARIA2C_LOCAL_EXE;
  }
  return 'aria2c';
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

// --- Password hashing (crypto.scrypt, native to Node) ---------------------
// scrypt is a "memory-hard" KDF recommended by OWASP alongside
// bcrypt/argon2. Used here instead of bcrypt/bcryptjs since neither is
// installed and npm install isn't possible offline; scrypt is part of
// Node's native crypto module, so zero extra dependency.
const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) {
    return false;
  }
  try {
    const hashBuffer = Buffer.from(hash, 'hex');
    const candidateBuffer = scryptSync(password, salt, SCRYPT_KEYLEN);
    if (candidateBuffer.length !== hashBuffer.length) {
      return false;
    }
    return timingSafeEqual(candidateBuffer, hashBuffer);
  } catch (error) {
    return false;
  }
}

// Automatic migration on startup: any account still stored with a
// plaintext password (`password`) is hashed and the plaintext field is
// removed. Idempotent: does not touch already-migrated accounts.
function migratePlaintextPasswords() {
  const usersData = readUsersData();
  let migrated = false;

  usersData.users.forEach((user) => {
    if (user.password && !user.passwordHash) {
      const { salt, hash } = hashPassword(user.password);
      user.passwordSalt = salt;
      user.passwordHash = hash;
      delete user.password;
      migrated = true;
    }
  });

  if (migrated) {
    writeUsersData(usersData);
    console.log(colors.green(`Migrated ${usersData.users.length} user(s) from plaintext to scrypt password hashes.`));
  }
}
// ---------------------------------------------------------------------------

try {
  migratePlaintextPasswords();
} catch (error) {
  console.error(colors.red(`Password migration skipped (users.json unreadable): ${error.message}`));
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

// Prevents the site from being embedded in a third-party iframe (clickjacking).
// No dependency (helmet) installed and no network access to add one,
// so the header is set by hand rather than a package for 3 lines.
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
});

app.use(cors());
app.use(cookieParser());
app.use((req, res, next) => {
  res.cookie('session', '1', {httpOnly: true });
  next();
});

// IMPORTANT: this check must stay at the very top, before ANY route
// AND before express.static, otherwise statically served pages/files
// (including server.html) remain accessible without IP restriction no
// matter --localhost/--allowlist.
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

let limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  handler: function(req, res, /*next*/) {
    console.log(colors.red(`Blocked IP due to rate limit: ${req.ip}`)); // Log the blocked IP
    res.status(429).sendFile(path.join(__dirname, 'public/pages/errors/429.html'));
  }
});
app.use(limiter);

// Anti brute-force on /auth (replaces express-brute, unmaintained since 2019).
// express-rate-limit is already a dependency of the project and actively maintained.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives de connexion par IP toutes les 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: function (req, res) {
    console.log(colors.red(`Blocked IP due to too many login attempts: ${req.ip}`));
    res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }
});

// --- CSRF protection -------------------------------------------------------
// csurf (the previously installed package) has been deprecated since 2022.
// We directly reuse `csrf`, the low-level library csurf used internally,
// to implement a homemade "double submit cookie" pattern:
// - a CSRF secret is stored in a server-side httpOnly cookie
// - the frontend fetches a token derived from that secret via /api/csrf-token
// - that token must be sent back in the X-CSRF-Token header on every request
//   that changes state (POST/PUT/PATCH/DELETE), except /auth (pre-session)
const csrfTokens = new Tokens();

app.use((req, res, next) => {
  if (!req.cookies || !req.cookies.csrfSecret) {
    const secret = csrfTokens.secretSync();
    res.cookie('csrfSecret', secret, { httpOnly: true, sameSite: 'strict' });
    req.csrfSecret = secret;
  } else {
    req.csrfSecret = req.cookies.csrfSecret;
  }
  next();
});

app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: csrfTokens.create(req.csrfSecret) });
});

function verifyCsrf(req, res, next) {
  const token = req.get('X-CSRF-Token') || (req.body && req.body._csrf);
  if (!req.csrfSecret || !token || !csrfTokens.verify(req.csrfSecret, token)) {
    console.log(colors.red(`Rejected request with invalid/missing CSRF token: ${req.method} ${req.originalUrl}`));
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}
// ---------------------------------------------------------------------------

// --- Server sessions + admin role ------------------------------------------
// Until now "authentication" only existed client-side (localStorage), so
// anyone could call the routes directly (curl, etc.) without ever having
// logged in. We add a real server session, created at login, to be able
// to check the admin role on sensitive routes.
const sessions = new Map(); // sessionId -> { username, admin }

function createSession(user) {
  const sessionId = randomUUID();
  sessions.set(sessionId, { username: user.username, admin: !!user.admin });
  return sessionId;
}

app.use((req, res, next) => {
  const sid = req.cookies && req.cookies.sid;
  req.session = sid ? sessions.get(sid) || null : null;
  next();
});

function requireAdmin(req, res, next) {
  if (argv.noid) {
    return next();
  }
  if (req.session && req.session.admin) {
    return next();
  }
  return res.status(403).json({ error: 'Access restricted to administrators.' });
}
// ---------------------------------------------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Must be declared BEFORE express.static: otherwise express.static would
// serve server.html directly, never going through requireAdmin.
app.get('/public/pages/content/server.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/pages/content/server.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/auth', authLimiter, (req, res) => {
  if (argv.noid) {
    const usersData = readUsersData();
    const fallbackUser = Array.isArray(usersData.users) ? usersData.users[0] : null;
    const username = (req.body && req.body.username) || (fallbackUser && fallbackUser.username) || 'guest';
    const avatarUrl = fallbackUser ? getAvatarUrl(fallbackUser.avatarUrl) : null;
    const admin = fallbackUser ? !!fallbackUser.admin : false;
    const darkMode = fallbackUser ? !!fallbackUser.darkMode : false;

    return res.json({ username, avatarUrl, admin, darkMode, noid: true });
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
      ? usersData.users.find((user) => user.username === req.body.username)
      : null;

    if (!userFound || !verifyPassword(req.body.password, userFound.passwordSalt, userFound.passwordHash)) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    const sessionId = createSession(userFound);
    res.cookie('sid', sessionId, { httpOnly: true, sameSite: 'strict' });

    return res.json({
      username: userFound.username,
      avatarUrl: getAvatarUrl(userFound.avatarUrl),
      admin: !!userFound.admin,
      darkMode: !!userFound.darkMode,
    });
  } catch (error) {
    console.error(colors.red(`Auth error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to validate credentials.' });
  }
});

app.get('/api/config', (req, res) => {
  return res.json({ noid: !!argv.noid });
});

app.post('/logout', verifyCsrf, (req, res) => {
  if (argv.noid) {
    // In --noid mode there is no session to invalidate: just respond OK
    // so the frontend can handle this case without forcing a real logout.
    return res.json({ noid: true, loggedOut: false });
  }

  if (req.cookies && req.cookies.sid) {
    sessions.delete(req.cookies.sid);
  }
  res.clearCookie('sid');
  res.clearCookie('session');
  return res.json({ loggedOut: true });
});

app.get('/api/users/:username', (req, res) => {
  // This route is only ever called by the frontend (profile.js) for the
  // currently logged-in user's own profile. So we block: (1) any request
  // without a valid session, (2) any attempt to look up ANOTHER user's
  // profile (unless admin) - this closes the account enumeration found
  // by the idor.py script.

  // No caching: some mobile browsers cache GET JSON responses aggressively
  // by default. Without this, a stale cached darkMode value could keep
  // getting served and silently reset the toggle/theme every time the
  // Profile page is visited, even after the preference was saved.
  res.setHeader('Cache-Control', 'no-store');

  if (!argv.noid) {
    if (!req.session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.session.username !== req.params.username && !req.session.admin) {
      return res.status(403).json({ error: 'Access restricted to the profile owner.' });
    }
  }

  try {
    const usersData = readUsersData();
    const user = usersData.users.find((entry) => entry.username === req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      username: user.username,
      avatarUrl: getAvatarUrl(user.avatarUrl),
      darkMode: !!user.darkMode,
    });
  } catch (error) {
    console.error(colors.red(`Profile lookup error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to load profile.' });
  }
});

app.post('/api/users/avatar', verifyCsrf, handleProfilePictureUpload, (req, res) => {
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
      return res.status(404).json({ error: 'User not found.' });
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

app.post('/api/users/username', verifyCsrf, (req, res) => {
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
      return res.status(404).json({ error: 'User not found.' });
    }

    const usernameAlreadyExists = usersData.users.some((entry) => entry.username === newUsername);
    if (usernameAlreadyExists) {
      return res.status(409).json({ error: 'This username is already taken.' });
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

app.post('/api/users/darkmode', verifyCsrf, (req, res) => {
  // Self-service only: always applies to the currently logged-in session,
  // never to a username supplied by the client, so a user can't flip
  // another account's preference.
  const schema = Joi.object({
    darkMode: Joi.boolean().required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  if (argv.noid) {
    return res.json({ darkMode: value.darkMode });
  }

  if (!req.session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const usersData = readUsersData();
    const userIndex = usersData.users.findIndex((entry) => entry.username === req.session.username);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }

    usersData.users[userIndex].darkMode = value.darkMode;
    writeUsersData(usersData);

    return res.json({ darkMode: value.darkMode });
  } catch (error) {
    console.error(colors.red(`Dark mode update error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to update dark mode preference.' });
  }
});

// --- User management (admin only) ------------------------------------------
// Note: we use /api/admin/users (not /api/users/:username) to never
// conflict with the /api/users/username route above, which is a literal
// path that would also match a :username parameter.

function sanitizeUserForResponse(user) {
  return {
    username: user.username,
    admin: !!user.admin,
    avatarUrl: getAvatarUrl(user.avatarUrl),
  };
}

app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const usersData = readUsersData();
    return res.json({ users: usersData.users.map(sanitizeUserForResponse) });
  } catch (error) {
    console.error(colors.red(`List users error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to load users.' });
  }
});

app.post('/api/admin/users', requireAdmin, verifyCsrf, (req, res) => {
  const schema = Joi.object({
    username: Joi.string().min(1).max(30).required(),
    password: Joi.string().min(1).max(100).required(),
    admin: Joi.boolean().default(false),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const usersData = readUsersData();
    const username = value.username.trim();

    if (usersData.users.some((entry) => entry.username === username)) {
      return res.status(409).json({ error: 'This username is already taken.' });
    }

    const { salt, hash } = hashPassword(value.password);
    const newUser = {
      username,
      admin: !!value.admin,
      avatarUrl: null,
      passwordSalt: salt,
      passwordHash: hash,
    };
    usersData.users.push(newUser);
    writeUsersData(usersData);

    console.log(colors.green(`Admin ${req.session && req.session.username} created user ${username} (admin: ${!!value.admin})`));
    return res.status(201).json({ user: sanitizeUserForResponse(newUser) });
  } catch (error) {
    console.error(colors.red(`Create user error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to create user.' });
  }
});

app.put('/api/admin/users/:username', requireAdmin, verifyCsrf, (req, res) => {
  const schema = Joi.object({
    newUsername: Joi.string().min(1).max(30),
    password: Joi.string().min(1).max(100).allow(''),
    admin: Joi.boolean(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const usersData = readUsersData();
    const targetUsername = req.params.username;
    const userIndex = usersData.users.findIndex((entry) => entry.username === targetUsername);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const isLastAdmin = usersData.users.filter((entry) => entry.admin).length === 1
      && usersData.users[userIndex].admin;

    if (isLastAdmin && value.admin === false) {
      return res.status(400).json({ error: 'Cannot remove admin rights from the last administrator.' });
    }

    if (value.newUsername && value.newUsername.trim() !== targetUsername) {
      const newUsername = value.newUsername.trim();
      const usernameTaken = usersData.users.some((entry) => entry.username === newUsername);
      if (usernameTaken) {
        return res.status(409).json({ error: 'This username is already taken.' });
      }
      usersData.users[userIndex].username = newUsername;

      // Invalidate this user's active sessions to stay consistent with
      // their new name (avoids a "ghost" session under the old name).
      for (const [sid, session] of sessions.entries()) {
        if (session.username === targetUsername) {
          sessions.delete(sid);
        }
      }
    }

    if (typeof value.admin === 'boolean') {
      usersData.users[userIndex].admin = value.admin;
    }

    if (value.password) {
      const { salt, hash } = hashPassword(value.password);
      usersData.users[userIndex].passwordSalt = salt;
      usersData.users[userIndex].passwordHash = hash;

      // A password change also invalidates active sessions.
      for (const [sid, session] of sessions.entries()) {
        if (session.username === usersData.users[userIndex].username) {
          sessions.delete(sid);
        }
      }
    }

    writeUsersData(usersData);
    return res.json({ user: sanitizeUserForResponse(usersData.users[userIndex]) });
  } catch (error) {
    console.error(colors.red(`Update user error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to update user.' });
  }
});

app.delete('/api/admin/users/:username', requireAdmin, verifyCsrf, (req, res) => {
  try {
    const usersData = readUsersData();
    const targetUsername = req.params.username;
    const userIndex = usersData.users.findIndex((entry) => entry.username === targetUsername);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const isLastAdmin = usersData.users.filter((entry) => entry.admin).length === 1
      && usersData.users[userIndex].admin;

    if (isLastAdmin) {
      return res.status(400).json({ error: 'Cannot delete the last administrator.' });
    }

    usersData.users.splice(userIndex, 1);
    writeUsersData(usersData);

    for (const [sid, session] of sessions.entries()) {
      if (session.username === targetUsername) {
        sessions.delete(sid);
      }
    }

    console.log(colors.yellow(`Admin ${req.session && req.session.username} deleted user ${targetUsername}`));
    return res.sendStatus(204);
  } catch (error) {
    console.error(colors.red(`Delete user error: ${error.message}`));
    return res.status(500).json({ error: 'Unable to delete user.' });
  }
});
// ---------------------------------------------------------------------------

app.post('/server/stop', requireAdmin, verifyCsrf, (req, res) => {
  console.log(colors.red('Stopping server...'));
      server.close(() => {
        process.exit(0);
      });
  res.send('Server stopping');
});
    

app.post('/server/restart', requireAdmin, verifyCsrf, (req, res) => {
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

app.post('/server/append', requireAdmin, verifyCsrf, (req, res) => {
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

// Runs the Python scraper and swaps in the temp file once complete.
// Reused both by POST /scraper (user-triggered) and on server startup.
function runScraper(onComplete) {
  function getPythonExecutable() {
    if (process.env.PYTHON_EXECUTABLE) return process.env.PYTHON_EXECUTABLE;
    if (process.env.PYTHON) return process.env.PYTHON;

    return process.platform === 'win32' ? 'python' : 'python3';
  }

  const pythonExecutable = getPythonExecutable();

  const scriptPath = path.join(__dirname, 'public', 'python', 'scraper.py');

  console.log(colors.yellow('Starting Python scraper...'));
  console.log(colors.yellow(`Python: ${pythonExecutable}`));
  console.log(colors.yellow(`Script: ${scriptPath}`));

  const pythonProcessScraper = spawn(
    pythonExecutable,
    [scriptPath],
    {
      cwd: __dirname,
      shell: false
    }
  );

  pythonProcessScraper.on('error', (err) => {
    console.error(colors.red(`Unable to start Python: ${err.message}`));
    if (onComplete) onComplete(1);
  });

  console.log(colors.green('Python process launched'));

  pythonProcessScraper.stdout.setEncoding('utf8');
  pythonProcessScraper.stdout.on('data', (data) => {
    console.log(colors.yellow(data.trim()));

    if (data.includes('SCRAPING_COMPLETE')) {
      const oldFile = path.join(__dirname, 'public', 'json', 'scrapedMovies.json');
      const tempFile = path.join(__dirname, 'public', 'json', 'scrapedMoviesTemp.json');

      try {
        if (fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
        }

        if (fs.existsSync(tempFile)) {
          fs.renameSync(tempFile, oldFile);
        }

        console.log(colors.green('Scraping file updated successfully.'));
      } catch (err) {
        console.error(colors.red(`Error swapping files: ${err.message}`));
      }
    }
  });

  pythonProcessScraper.stderr.setEncoding('utf8');
  pythonProcessScraper.stderr.on('data', (data) => {
    console.error(colors.red(data.trim()));
  });

  pythonProcessScraper.on('close', (code) => {
    console.log(colors.yellow(`Python exited with code ${code}`));
    if (onComplete) onComplete(code);
  });
}

app.post('/scraper', verifyCsrf, (req, res) => {
  runScraper(() => {
    res.send('Scraper process completed');
  });
});

app.get('/scraper/status', (req, res) => {
  const oldFile = path.join(__dirname, 'public', 'json', 'scrapedMovies.json');
  const tempFile = path.join(__dirname, 'public', 'json', 'scrapedMoviesTemp.json');

  res.json({
    scrapingInProgress: fs.existsSync(tempFile),
    hasData: fs.existsSync(oldFile),
    timestamp: Date.now()
  });
});

// Routes pour le gestionnaire de fichiers

app.get('/files', (req, res) => {
  const filePath = req.query.path || '';
  const fullPath = resolveSafePath(filePath);
  if (!fullPath) {
    return res.status(403).json({ error: 'Invalid path' });
  }
  fs.readdir(fullPath, (err, items) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to scan directory' });
    }
    const files = items
      .map(item => {
        const itemPath = path.join(fullPath, item);
        try {
          return {
            name: item,
            path: path.join(filePath, item),
            isDirectory: fs.statSync(itemPath).isDirectory()
          };
        } catch (statError) {
          // A file may have disappeared/become unreadable between the readdir
          // and the stat call: skip it instead of crashing the whole process.
          console.error(colors.red(`Skipped unreadable entry ${itemPath}: ${statError.message}`));
          return null;
        }
      })
      .filter(Boolean);
    res.json(files);
  });
});

app.delete('/delete', verifyCsrf, (req, res) => {
  const filePath = req.query.path;
  const fullPath = resolveSafePath(filePath);
  if (!fullPath) {
    return res.status(403).json({ error: 'Invalid path' });
  }
  try {
    if (fs.statSync(fullPath).isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(colors.yellow(`Deleted directory: ${filePath}`));
    } else {
      fs.unlinkSync(fullPath);
      console.log(colors.yellow(`Deleted file: ${filePath}`));
    }
    res.sendStatus(204);
  } catch (error) {
    console.error(colors.red(`Delete error: ${error.message}`));
    res.status(500).json({ error: 'Unable to delete path' });
  }
});

app.post('/rename', verifyCsrf, (req, res) => {
  const oldPath = req.query.oldPath;
  const newPath = req.query.newPath;
  const fullOldPath = resolveSafePath(oldPath);
  const fullNewPath = resolveSafePath(path.join(path.dirname(oldPath), newPath));
  if (!fullOldPath || !fullNewPath) {
    return res.status(403).json({ error: 'Invalid path' });
  }
  try {
    fs.renameSync(fullOldPath, fullNewPath);
    console.log(colors.yellow(`Renamed: ${oldPath} to ${newPath}`));
    res.sendStatus(204);
  } catch (error) {
    console.error(colors.red(`Rename error: ${error.message}`));
    res.status(500).json({ error: 'Unable to rename path' });
  }
});

app.post('/move', verifyCsrf, (req, res) => {
  const sourcePath = req.body.sourcePath;
  const destinationPath = req.body.destinationPath;
  const fileName = path.basename(sourcePath);

  const fullSourcePath = resolveSafePath(sourcePath);
  const destDir = resolveSafePath(destinationPath);
  if (!fullSourcePath || !destDir) {
    return res.status(403).json({ error: 'Invalid path' });
  }
  const fullDestinationPath = path.join(destDir, fileName);

  try {
    // Check that the destination folder exists
    if (!fs.existsSync(destDir)) {
      return res.status(400).json({ error: 'Destination directory does not exist' });
    }
    
    // Check that the source file exists
    if (!fs.existsSync(fullSourcePath)) {
      return res.status(400).json({ error: 'Source file does not exist' });
    }
    
    // Check that we're not moving a folder into itself
    if (fs.statSync(fullSourcePath).isDirectory() && fullDestinationPath.startsWith(fullSourcePath)) {
      return res.status(400).json({ error: 'Cannot move directory into itself' });
    }
    
    // Move the file/folder
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
  const fullPath = resolveSafePath(filePath);
  if (!fullPath) {
    return res.status(403).json({ error: 'Invalid path' });
  }
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

app.post('/upload_file', verifyCsrf, upload.single('file_upload'), handleTorrentUploadRequest);

app.post('/api/torrent/upload', verifyCsrf, upload.single('file_upload'), handleTorrentUploadRequest);

app.get('/api/torrent/status/:jobId', (req, res) => {
  const job = torrentJobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Torrent job not found' });
  }

  return res.json({
    job: serializeTorrentJob(job),
  });
});

app.post('/api/torrent/cancel/:jobId', verifyCsrf, (req, res) => {
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
    console.log(colors.magenta('--noid enabled: bypassing authentication, IP redirect, and logout.'));
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
          if (!allowlist.includes(net.address)) {
            allowlist.push(net.address);
          }
        }
      }
    }
  }

  console.log(colors.yellow('Starting automatic movie scraping...'));
  runScraper((code) => {
    if (code === 0) {
      console.log(colors.green('Automatic scraping complete, movies are up to date.'));
    } else {
      console.log(colors.red(`Automatic scraping finished with code ${code} (the site will show previous data if available).`));
    }
  });

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
          fs.writeFileSync('public/json/allowlist.json', JSON.stringify({ allowedIPs: allowlist }, null, 2));
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