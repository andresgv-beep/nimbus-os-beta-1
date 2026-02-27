#!/usr/bin/env bash
# NimbusOS Update Script
# Usage: sudo /opt/nimbusos/scripts/update.sh
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[NimbusOS]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

INSTALL_DIR="/opt/nimbusos"
BACKUP_DIR="/tmp/nimbusos-backup-$(date +%Y%m%d-%H%M%S)"
TARBALL_URL="https://github.com/andresgv-beep/nimbusos/archive/refs/heads/master.tar.gz"

[[ $EUID -ne 0 ]] && { err "Run with sudo"; exit 1; }
[[ ! -d "$INSTALL_DIR/server" ]] && { err "NimbusOS not found at $INSTALL_DIR"; exit 1; }

echo -e "${CYAN}${BOLD}☁️  NimbusOS Updater${NC}\n"

log "Backing up..."
mkdir -p "$BACKUP_DIR"
cp -r /etc/nimbusos "$BACKUP_DIR/" 2>/dev/null || true
log "Backup saved to $BACKUP_DIR"

log "Downloading latest version..."
curl -fsSL "$TARBALL_URL" | tar xz --strip-components=1 -C "$INSTALL_DIR"

cd "$INSTALL_DIR"
log "Updating dependencies..."
npm install --silent 2>/dev/null || npm install

if grep -q '"build"' package.json 2>/dev/null; then
  log "Rebuilding frontend..."
  npx vite build 2>/dev/null || warn "Build failed"
fi

log "Restarting NimbusOS..."
systemctl restart nimbusos
sleep 3

if systemctl is-active --quiet nimbusos; then
  echo -e "\n${GREEN}${BOLD}✔ Updated successfully${NC}\n"
else
  err "Service failed. Check: journalctl -u nimbusos -n 50"
  exit 1
fi
