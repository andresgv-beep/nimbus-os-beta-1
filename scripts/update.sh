#!/usr/bin/env bash
DIR="/opt/nimbusos"
URL="https://github.com/andresgv-beep/nimbus-os-beta-1/archive/refs/heads/main.tar.gz"
PREV=$(node -e "console.log(require('$DIR/package.json').version)" 2>/dev/null)
echo "Current: $PREV"
echo "Downloading..."
curl -fsSL "$URL" | tar xz --strip-components=1 --overwrite -C "$DIR"
NEW=$(node -e "console.log(require('$DIR/package.json').version)" 2>/dev/null)
echo "Downloaded: $NEW"
cd "$DIR"
echo "Installing deps..."
npm install 2>&1 | tail -1
echo "Building..."
rm -rf dist
npx vite build 2>&1 | tail -1
echo "Restarting..."
systemctl restart nimbusos
sleep 3
systemctl is-active --quiet nimbusos && echo "OK: $PREV -> $NEW" || echo "FAILED"
