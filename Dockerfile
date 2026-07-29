# ---- Stage 1: Install Node.js deps + Python/aria2 ----
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json ./
RUN npm ci --omit=dev && mv node_modules node_modules.deps

# Copy everything else we need at build time (server, scraper, public content)
COPY . .

# Install Python and aria2 so the scraper and torrent downloads work out of the box
RUN apk add --no-cache python3 py3-pip aria2 \
    && pip3 install --break-system-packages requests

# ---- Stage 2: Production image ----
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN addgroup -g 999 cinebox && \
    adduser -u 999 -G cinebox -s /bin/sh -h /home/cinebox cinebox

# Copy the production Node modules from deps stage
COPY --from=deps /app/node_modules.deps ./node_modules
COPY --from=deps /app/package.json package-lock.json ./

# Copy everything else (server.js, public/, scraper.py) — already in /app from deps
COPY --chown=cinebox:cinebox . .

# Create directories the server expects at runtime and give them to cinebox
RUN mkdir -p Media/downloads/torrentJobs/torrentInfo && \
    mkdir -p public/json && \
    mkdir -p public/imgs/profile-pictures && \
    chown -R cinebox:cinebox /app/Media /app/public

# Expose the port we run on
EXPOSE 8080

USER cinebox

CMD ["node", "server.js"]
