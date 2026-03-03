#!/usr/bin/env bash
DIR="/opt/nimbusos"
URL="https://github.com/andresgv-beep/nimbus-os-beta-1/archive/refs/heads/main.tar.gz"
RESULT_FILE="/var/log/nimbusos/update-result.json"

PREV=$(node -e "console.log(require('$DIR/package.json').version)" 2>/dev/null)
echo "Current: $PREV"

# Save checksums of key files to detect changes
SERVER_HASH=$(md5sum "$DIR/server/index.cjs" 2>/dev/null | cut -d' ' -f1)
INSTALL_HASH=$(md5sum "$DIR/install.sh" 2>/dev/null | cut -d' ' -f1)

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

# Determine restart type based on what changed
SERVER_HASH_NEW=$(md5sum "$DIR/server/index.cjs" 2>/dev/null | cut -d' ' -f1)
INSTALL_HASH_NEW=$(md5sum "$DIR/install.sh" 2>/dev/null | cut -d' ' -f1)

if [ "$SERVER_HASH" != "$SERVER_HASH_NEW" ] || [ "$INSTALL_HASH" != "$INSTALL_HASH_NEW" ]; then
  echo "{\"type\":\"full\",\"prev\":\"$PREV\",\"new\":\"$NEW\",\"time\":\"$(date -Iseconds)\"}" > "$RESULT_FILE"
  echo "Backend changes detected — restarting NimbusOS service..."
  systemctl restart nimbusos
  sleep 3
  systemctl is-active --quiet nimbusos && echo "OK: $PREV -> $NEW (service restarted)" || echo "FAILED"
else
  echo "{\"type\":\"frontend\",\"prev\":\"$PREV\",\"new\":\"$NEW\",\"time\":\"$(date -Iseconds)\"}" > "$RESULT_FILE"
  echo "Frontend-only changes — no restart needed."
  echo "OK: $PREV -> $NEW (reload browser to see changes)"
fi
