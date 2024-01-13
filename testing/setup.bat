@echo off
title Server setup

echo Server setup is starting...

timeout 1 /nobreak

echo Installing python libraries...

python -m pip install torrent-client

timeout 1 /nobreak

echo Installing and building server dependencies...

npm install
npm run build