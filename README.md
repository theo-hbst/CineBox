# CineBox

CineBox is a self-hosted media server built for one purpose: let your family browse, watch, and manage the movies and shows on your own machine, without handing that job to a third-party streaming app. It scrapes trending titles from IMDb, comes with a file manager, a torrent client, and an admin panel for managing accounts — all wrapped in a dashboard you run yourself.

It started as a personal project to give my family an easy way to watch what was already on our home server, and grew from there into something worth sharing.

## Features

- 🎬 Trending movies feed, auto-scraped from IMDb on every server start
- 📁 File manager: rename, move, delete, and download files in your library
- 🌊 Torrent uploads with live progress over WebSockets
- 👤 Real server-side sessions, scrypt-hashed passwords, brute-force lockout on login
- 🔑 Admin-only Server page: stop/restart the server, manage the IP allowlist, manage user accounts
- 🌗 Per-user dark mode
- 🛡️ CSRF protection, path-traversal protection, clickjacking protection, rate limiting


## Installation

Requires **Node.js 18+**, **Python 3.8+**, and **aria2** (used for torrent downloads).

```bash
# Debian/Ubuntu
sudo apt install aria2

git clone https://github.com/<your-username>/CineBox.git
cd CineBox
npm install
pip install -r public/python/requirements.txt
node server.js
```

By default the server runs on port `8080` and listens on all network interfaces. Restrict access before exposing it to your network:

```bash
node server.js --localhost -p 8080        # only 127.0.0.1
node server.js --allowlist -p 8080        # only IPs in public/json/allowlist.json
```

## CLI Flags

| Flag | Alias | Description |
|---|---|---|
| `--port` | `-p` | Port to run on (default `8080`) |
| `--localhost` | `-l` | Only accept connections from `127.0.0.1` |
| `--allowlist` | `-a` | Only accept connections from IPs in `public/json/allowlist.json` |
| `--noid` | | Bypasses authentication, IP restrictions, and logout entirely (local testing only) |
| `--help` | `-h` | Show CLI usage |

## First Login

CineBox ships with a seed account: **`admin` / `admin`**. Log in, then immediately change the password and/or create your own admin account from the Server page.

Passwords are hashed with `crypto.scrypt` (Node's native, memory-hard KDF). If you ever hand-edit `users.json`, a plaintext `"password"` field is auto-hashed the next time the server starts.

## Usage

- **Home** - trending IMDb movies, with a manual "Refresh scraping" button
- **File Manager** - browse, rename, move, delete, and download files under `Media/`
- **Torrent** - upload a `.torrent` file and watch its progress live
- **Profile** - change your username, upload an avatar, toggle dark mode
- **Server** *(admin only)* - stop/restart the server, manage the IP allowlist, and manage users (create, rename, delete, promote/demote admin, reset passwords). A safeguard prevents removing or deleting the last remaining admin.

## Security

| Protection | Implementation |
|---|---|
| Passwords | `crypto.scrypt` + per-user salt + timing-safe comparison |
| Sessions | Server-side, `httpOnly` cookie |
| CSRF | Double-submit cookie pattern (`csrf` library) on every state-changing request |
| Brute-force | `express-rate-limit`, 10 attempts / 15 min on `/auth` |
| Path traversal | Every file route validates it stays inside `Media/` |
| Clickjacking | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| Admin authorization | Enforced server-side on both the API routes and the static admin page |

## API Reference

`LOCK` = requires a session · `ADMIN` = requires `admin: true` · `CSRF` = requires `X-CSRF-Token`

| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/auth` | Public (rate-limited) | Log in |
| `POST` | `/logout` | LOCK+CSRF | Log out |
| `GET` | `/api/csrf-token` | Public | Get a CSRF token |
| `GET` | `/api/users/:username` | LOCK | Get a profile (self or admin) |
| `POST` | `/api/users/username`, `/api/users/avatar`, `/api/users/darkmode` | LOCK+CSRF | Update your own profile |
| `GET/POST` | `/api/admin/users` | ADMIN(+CSRF) | List / create users |
| `PUT/DELETE` | `/api/admin/users/:username` | ADMIN+CSRF | Update / delete a user |
| `POST` | `/server/stop`, `/server/restart`, `/server/append` | ADMIN+CSRF | Server controls |
| `POST` | `/scraper` | CSRF | Trigger a manual scrape |
| `GET` | `/movies`, `/series`, `/files` | Public | Browse media/library |
| `POST/DELETE` | `/rename`, `/delete`, `/move` | CSRF | File operations |
| `GET` | `/download` | Public | Download a file |
| `POST` | `/upload_file`, `/api/torrent/upload` | CSRF | Start a torrent job |
| `GET/POST` | `/api/torrent/status/:jobId`, `/api/torrent/cancel/:jobId` | Public / CSRF | Torrent job control |

## Project Structure

```
CineBox/
├── server.js
├── Media/                # your media library
├── public/
│   ├── css/ js/ imgs/
│   ├── json/              # users.json, scrapedMovies.json, allowlist.json
│   ├── pages/content/     # home, movies, series, torrent, filemanager, profile, server
│   └── python/            # scraper.py
└── testing/tools/         # self-testing security scripts (point at your own instance only)
```

## Legal & Scope

CineBox is a personal media library manager, in the same spirit as Jellyfin, Plex, or Sonarr not a piracy tool. It has no indexer, no tracker, and ships with no media of its own. You're responsible for the legality of any content you add to your own library.

## About This Project

I built CineBox as a personal project after finishing high school, mostly to learn by doing. Along the way, I used AI assistance (Claude) to help implement some features and to review and fix parts of the code, especially around security, since that's an area I'm still learning. I've tried to understand and test everything that went in rather than just copy-pasting, but if you spot something that could be done better, I'd genuinely appreciate a PR or an issue explaining why.

## License

MIT