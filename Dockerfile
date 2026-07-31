FROM node:20-alpine AS deps

WORKDIR /app

# Copy to enable npm ci
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mv node_modules node_modules.deps
COPY . .

# ---- Production image ----
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apk add --no-cache python3 py3-pip aria2 \
    && pip3 install --break-system-packages requests

RUN addgroup -S cinebox && \
    adduser -S -G cinebox -h /home/cinebox cinebox

COPY --from=deps /app/node_modules.deps ./node_modules
COPY package.json package-lock.json ./
COPY --chown=cinebox:cinebox . .

RUN mkdir -p Media/downloads/torrentJobs/torrentInfo && \
    mkdir -p public/json && \
    mkdir -p public/imgs/profile-pictures && \
    chown -R cinebox:cinebox /app/Media /app/public

EXPOSE 8080

USER cinebox

CMD ["node", "server.js"]