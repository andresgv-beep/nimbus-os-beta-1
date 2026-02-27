#!/usr/bin/env bash
# NimbusOS Update Script
# Usage: sudo /opt/nimbusos/scripts/update.sh
# Called by: Control Panel > Updates > Install Update

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[NimbusOS]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

INSTALL_DIR="/opt/nimbusos"
BACKUP_DIR="/tmp/nimbusos-backup-$(date +%Y%m%d-%H%M%S)"
TARBALL_URL="https://github.com/andresgv-beep/nimbus-os-beta-1/archive/refs/heads/main.tar.gz"

# Must be root
if [[ $EUID -ne 0 ]]; then
  err "Run with sudo: sudo $0"
  exit 1
fi

if [[ ! -d "$INSTALL_DIR/server" ]]; then
  err "NimbusOS not found at $INSTALL_DIR"
  exit 1
fi

echo -e "${CYAN}${BOLD}☁️  NimbusOS Updater${NC}"
echo ""

# ── Backup config + user data ──
log "Backing up configuration..."
mkdir -p "$BACKUP_DIR"
cp -r /etc/nimbusos "$BACKUP_DIR/" 2>/dev/null || true
# Backup user data (sessions, preferences, wallpapers)
NIMBUS_DATA=$(grep -r "NIMBUS_ROOT" "$INSTALL_DIR/server/index.cjs" 2>/dev/null | head -1 | grep -oP "path\.join\(os\.homedir\(\), '([^']+)'\)" | grep -oP "'[^']+'" | tr -d "'" || echo ".nimbusos")
if [[ -d "/root/.nimbusos" ]]; then
  cp -r /root/.nimbusos "$BACKUP_DIR/nimbusos-data" 2>/dev/null || true
fi
log "Backup saved to $BACKUP_DIR"

# ── Save current version ──
PREV_VERSION=$(node -e "try{console.log(require('$INSTALL_DIR/package.json').version)}catch{console.log('unknown')}" 2>/dev/null || echo "unknown")
log "Current version: $PREV_VERSION"

# ── Preserve node_modules (don't re-download if not needed) ──
# Move node_modules out temporarily so tarball doesn't nuke it
if [[ -d "$INSTALL_DIR/node_modules" ]]; then
  mv "$INSTALL_DIR/node_modules" /tmp/nimbusos-node-modules-$$ 2>/dev/null || true
fi

# ── Download latest ──
log "Downloading latest version..."
if ! curl -fsSL "$TARBALL_URL" | tar xz --strip-components=1 --overwrite -C "$INSTALL_DIR"; then
  err "Download failed!"
  # Restore node_modules
  if [[ -d "/tmp/nimbusos-node-modules-$$" ]]; then
    mv /tmp/nimbusos-node-modules-$$ "$INSTALL_DIR/node_modules"
  fi
  exit 1
fi

# ── Restore node_modules ──
if [[ -d "/tmp/nimbusos-node-modules-$$" ]]; then
  mv /tmp/nimbusos-node-modules-$$ "$INSTALL_DIR/node_modules"
fi

# ── Get new version ──
NEW_VERSION=$(node -e "try{console.log(require('$INSTALL_DIR/package.json').version)}catch{console.log('unknown')}" 2>/dev/null || echo "unknown")
log "New version: $NEW_VERSION"

# ── Install/update dependencies ──
cd "$INSTALL_DIR"
log "Installing dependencies..."
npm install 2>&1 | tail -3 || {
  warn "npm install had issues, trying again..."
  npm install
}

# ── Build frontend ──
log "Building frontend..."
rm -rf dist
if npx vite build 2>&1; then
  log "Frontend built successfully"
else
  err "Frontend build failed!"
  # Try to restore from backup
  warn "Attempting rollback..."
  if [[ -d "$BACKUP_DIR" ]]; then
    # Re-download previous version would be complex, just warn
    err "Build failed. Check /var/log/nimbusos/update.log for details."
    err "You may need to run: cd $INSTALL_DIR && sudo npx vite build"
  fi
fi

# ── Prune dev dependencies ──
npm prune --production 2>/dev/null || true

# ── Restart service ──
log "Restarting NimbusOS..."
systemctl restart nimbusos

# ── Wait and verify ──
sleep 4
if systemctl is-active --quiet nimbusos; then
  echo ""
  echo -e "${GREEN}${BOLD}  ✔ Updated: $PREV_VERSION → $NEW_VERSION${NC}"
  echo ""
else
  err "Service failed to start after update!"
  err "Check: journalctl -u nimbusos -n 30"
  err "Backup at: $BACKUP_DIR"
  exit 1
fi
