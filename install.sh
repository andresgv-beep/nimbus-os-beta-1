#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  NimbusOS Installer                                         ║
# ║  Transforms Ubuntu Server into a NimbusOS NAS               ║
# ║  Usage: curl -fsSL https://get.nimbusos.dev/install | bash  ║
# ╚══════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Config ──
NIMBUS_VERSION="1.0.0"
NIMBUS_REPO="https://github.com/nimbusos-project/nimbusos.git"
NIMBUS_BRANCH="main"
INSTALL_DIR="/opt/nimbusos"
DATA_DIR="/var/lib/nimbusos"
CONFIG_DIR="/etc/nimbusos"
LOG_DIR="/var/log/nimbusos"
NIMBUS_USER="nimbus"
NIMBUS_PORT="${NIMBUS_PORT:-5000}"
NODE_MAJOR=20

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[NimbusOS]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARNING]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()  { echo -e "\n${CYAN}${BOLD}━━━ $* ━━━${NC}"; }
ok()    { echo -e "  ${GREEN}✔${NC} $*"; }

# ── Pre-flight checks ──
preflight() {
  step "Pre-flight checks"

  # Must be root
  if [[ $EUID -ne 0 ]]; then
    err "This installer must be run as root (use sudo)"
    exit 1
  fi

  # Check OS
  if [[ ! -f /etc/os-release ]]; then
    err "Cannot detect OS. NimbusOS requires Ubuntu 22.04+ or Debian 12+"
    exit 1
  fi
  source /etc/os-release
  if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    warn "Detected $PRETTY_NAME — NimbusOS is tested on Ubuntu/Debian. Proceeding anyway..."
  fi
  ok "OS: $PRETTY_NAME"

  # Check architecture
  ARCH=$(uname -m)
  if [[ "$ARCH" != "x86_64" && "$ARCH" != "aarch64" ]]; then
    err "Unsupported architecture: $ARCH (need x86_64 or aarch64)"
    exit 1
  fi
  ok "Architecture: $ARCH"

  # Check memory (warn if < 1GB)
  MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  MEM_MB=$((MEM_KB / 1024))
  if [[ $MEM_MB -lt 1024 ]]; then
    warn "Only ${MEM_MB}MB RAM detected. NimbusOS recommends at least 1GB."
  fi
  ok "Memory: ${MEM_MB}MB"

  # Check disk space (need at least 2GB free)
  FREE_KB=$(df / | tail -1 | awk '{print $4}')
  FREE_MB=$((FREE_KB / 1024))
  if [[ $FREE_MB -lt 2048 ]]; then
    err "Need at least 2GB free disk space. Only ${FREE_MB}MB available on /"
    exit 1
  fi
  ok "Disk space: ${FREE_MB}MB free"

  # Check internet
  if ! ping -c1 -W3 1.1.1.1 &>/dev/null && ! ping -c1 -W3 8.8.8.8 &>/dev/null; then
    err "No internet connection detected"
    exit 1
  fi
  ok "Internet: connected"
}

# ── Install system dependencies ──
install_deps() {
  step "Installing system dependencies"

  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq

  # Critical packages (fail if these don't install)
  log "Installing core packages..."
  apt-get install -y -qq \
    curl wget git ca-certificates gnupg lsb-release \
    smartmontools hdparm lm-sensors \
    mdadm gdisk \
    samba \
    vsftpd \
    apache2 \
    nginx \
    certbot python3-certbot-nginx \
    ufw \
    avahi-daemon

  ok "Core packages installed"

  # Enable Apache WebDAV modules
  log "Configuring Apache WebDAV modules..."
  a2enmod dav dav_fs headers auth_basic authn_file 2>/dev/null || true
  ok "Apache WebDAV modules enabled"

  # Optional packages (nice to have, don't fail)
  log "Installing optional packages..."
  apt-get install -y -qq nfs-kernel-server 2>/dev/null || warn "nfs-kernel-server not available"
  apt-get install -y -qq ntfs-3g 2>/dev/null || warn "ntfs-3g not available"
  apt-get install -y -qq exfat-fuse 2>/dev/null || warn "exfat-fuse not available"
  apt-get install -y -qq exfat-utils 2>/dev/null || apt-get install -y -qq exfatprogs 2>/dev/null || warn "exfat utils not available"
  apt-get install -y -qq qrencode 2>/dev/null || warn "qrencode not available (2FA QR codes)"

  # Verify critical tools
  local missing=""
  command -v smbd &>/dev/null || missing="$missing samba"
  command -v mdadm &>/dev/null || missing="$missing mdadm"
  command -v smartctl &>/dev/null || missing="$missing smartmontools"
  command -v vsftpd &>/dev/null || missing="$missing vsftpd"
  command -v apache2 &>/dev/null || missing="$missing apache2"

  if [[ -n "$missing" ]]; then
    err "Failed to install critical packages:$missing"
    err "Try: apt-get install -y$missing"
    exit 1
  fi

  ok "All critical packages verified"
}

# ── Install Node.js ──
install_node() {
  step "Installing Node.js $NODE_MAJOR"

  # Check if already installed
  if command -v node &>/dev/null; then
    CURRENT_NODE=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $CURRENT_NODE -ge 18 ]]; then
      ok "Node.js $(node -v) already installed — skipping"
      return
    fi
    warn "Node.js v$CURRENT_NODE too old, upgrading..."
  fi

  # Install via NodeSource
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs

  ok "Node.js $(node -v) installed"
}

# ── Install Docker ──
install_docker() {
  step "Docker"
  ok "Docker available in App Store — install after creating a storage pool"
}

# ── Create NimbusOS user and directories ──
setup_user() {
  step "Setting up NimbusOS user and directories"

  # Create system user
  if ! id "$NIMBUS_USER" &>/dev/null; then
    useradd -r -s /bin/bash -m -d /home/$NIMBUS_USER $NIMBUS_USER
    ok "User '$NIMBUS_USER' created"
  else
    ok "User '$NIMBUS_USER' already exists"
  fi

  # Add to required groups
  usermod -aG docker $NIMBUS_USER 2>/dev/null || true
  usermod -aG sudo $NIMBUS_USER 2>/dev/null || true

  # Create directories
  mkdir -p "$INSTALL_DIR"
  mkdir -p "$DATA_DIR"/{apps,shares,backups,thumbnails}
  mkdir -p "$CONFIG_DIR"
  mkdir -p "$LOG_DIR"

  ok "Directories created"
}

# ── Install NimbusOS application ──
install_nimbusos() {
  step "Installing NimbusOS application"

  # Download via tarball (no git auth needed)
  TARBALL_URL="https://github.com/andresgv-beep/nimbus-os-beta-1/archive/refs/heads/${NIMBUS_BRANCH}.tar.gz"
  
  if [[ -d "$INSTALL_DIR/server" ]]; then
    log "Updating existing installation..."
    curl -fsSL "$TARBALL_URL" | tar xz --strip-components=1 --overwrite -C "$INSTALL_DIR"
  else
    log "Downloading NimbusOS..."
    mkdir -p "$INSTALL_DIR"
    curl -fsSL "$TARBALL_URL" | tar xz --strip-components=1 --overwrite -C "$INSTALL_DIR"
  fi

  cd "$INSTALL_DIR"

  # Install npm dependencies (including dev for building)
  log "Installing Node.js dependencies..."
  npm install --silent 2>/dev/null || npm install

  # Build frontend
  if grep -q '"build"' package.json 2>/dev/null; then
    log "Building frontend..."
    if npx vite build 2>/dev/null; then
      ok "Frontend built successfully"
      # Remove devDependencies after build to save space
      npm prune --production --silent 2>/dev/null || true
    else
      warn "Frontend build failed — will use dev mode (run 'npm run dev' manually)"
    fi
  fi

  # Set permissions
  chown -R $NIMBUS_USER:$NIMBUS_USER "$INSTALL_DIR"
  chown -R $NIMBUS_USER:$NIMBUS_USER "$DATA_DIR"
  chown -R $NIMBUS_USER:$NIMBUS_USER "$CONFIG_DIR"
  chown -R $NIMBUS_USER:$NIMBUS_USER "$LOG_DIR"

  ok "NimbusOS installed to $INSTALL_DIR"
}

# ── Write NimbusOS config ──
write_config() {
  step "Writing configuration"

  cat > "$CONFIG_DIR/nimbusos.env" << EOF
# NimbusOS Configuration
# Generated by installer on $(date -Iseconds)

# Server
NIMBUS_PORT=$NIMBUS_PORT
NIMBUS_HOST=0.0.0.0
NIMBUS_DATA_DIR=$DATA_DIR
NIMBUS_LOG_DIR=$LOG_DIR

# Security (change these!)
# NIMBUS_HTTPS=true
# NIMBUS_CERT=/etc/nimbusos/cert.pem
# NIMBUS_KEY=/etc/nimbusos/key.pem

# Features
NIMBUS_DOCKER=true
NIMBUS_SAMBA=true
NIMBUS_UPNP=true
EOF

  chmod 600 "$CONFIG_DIR/nimbusos.env"
  chown $NIMBUS_USER:$NIMBUS_USER "$CONFIG_DIR/nimbusos.env"

  ok "Config written to $CONFIG_DIR/nimbusos.env"
}

# ── Create systemd service ──
install_service() {
  step "Creating systemd service"

  cat > /etc/systemd/system/nimbusos.service << EOF
[Unit]
Description=NimbusOS - NAS Operating System
Documentation=https://github.com/nimbusos-project/nimbusos
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$CONFIG_DIR/nimbusos.env
ExecStart=/usr/bin/node $INSTALL_DIR/server/index.cjs
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/nimbusos.log
StandardError=append:$LOG_DIR/nimbusos-error.log

# Security hardening
NoNewPrivileges=false
ProtectSystem=false
PrivateTmp=true

# Resource limits
LimitNOFILE=65535
LimitNPROC=4096

# No watchdog (Node.js doesn't implement sd_notify)

[Install]
WantedBy=multi-user.target
EOF

  # Log rotation
  cat > /etc/logrotate.d/nimbusos << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF

  systemctl daemon-reload
  systemctl enable nimbusos

  ok "Service created and enabled"
}

# ── Configure firewall ──
setup_firewall() {
  step "Configuring firewall (ufw)"

  # Don't lock ourselves out
  ufw default deny incoming 2>/dev/null || true
  ufw default allow outgoing 2>/dev/null || true

  # Essential ports
  ufw allow 22/tcp comment 'SSH' 2>/dev/null || true
  ufw allow "$NIMBUS_PORT"/tcp comment 'NimbusOS Web UI' 2>/dev/null || true
  ufw allow 445/tcp comment 'Samba (SMB)' 2>/dev/null || true
  ufw allow 5353/udp comment 'Avahi (mDNS)' 2>/dev/null || true
  ufw allow 21/tcp comment 'FTP' 2>/dev/null || true
  ufw allow 55000:55999/tcp comment 'FTP Passive' 2>/dev/null || true
  ufw allow 5005/tcp comment 'WebDAV' 2>/dev/null || true
  ufw allow 2049/tcp comment 'NFS' 2>/dev/null || true

  # Enable firewall (non-interactive)
  echo "y" | ufw enable 2>/dev/null || true

  ok "Firewall configured (SSH, NimbusOS:$NIMBUS_PORT, SMB, mDNS)"
}

# ── Configure Samba (basic) ──
setup_samba() {
  step "Configuring Samba"

  # Backup original config
  [[ -f /etc/samba/smb.conf ]] && cp /etc/samba/smb.conf /etc/samba/smb.conf.bak

  cat > /etc/samba/smb.conf << 'EOF'
[global]
   workgroup = WORKGROUP
   server string = NimbusOS NAS
   server role = standalone server
   log file = /var/log/samba/log.%m
   max log size = 1000
   logging = file
   panic action = /usr/share/samba/panic-action %d
   server role = standalone server
   obey pam restrictions = yes
   unix password sync = yes
   map to guest = bad user
   usershare allow guests = no
   min protocol = SMB2
   max protocol = SMB3

# Shares are managed by NimbusOS
# Add custom shares via the NimbusOS web interface
EOF

  systemctl enable smbd nmbd 2>/dev/null || true
  systemctl restart smbd nmbd 2>/dev/null || true

  ok "Samba configured"
}

# ── Configure vsftpd (FTP) ──
setup_ftp() {
  step "Configuring FTP (vsftpd)"

  [[ -f /etc/vsftpd.conf ]] && cp /etc/vsftpd.conf /etc/vsftpd.conf.bak

  cat > /etc/vsftpd.conf << 'EOF'
# NimbusOS FTP Configuration
listen=YES
listen_ipv6=NO
anonymous_enable=NO
local_enable=YES
write_enable=YES
local_umask=022
dirmessage_enable=YES
use_localtime=YES
xferlog_enable=YES
connect_from_port_20=YES
chroot_local_user=YES
allow_writeable_chroot=YES
secure_chroot_dir=/var/run/vsftpd/empty
pam_service_name=vsftpd
# Passive mode
pasv_enable=YES
pasv_min_port=55000
pasv_max_port=55999
# Security
ssl_enable=NO
EOF

  systemctl enable vsftpd 2>/dev/null || true
  systemctl restart vsftpd 2>/dev/null || true

  ok "FTP configured (port 21, passive 55000-55999)"
}

# ── Configure Apache WebDAV ──
setup_webdav() {
  step "Configuring WebDAV (Apache)"

  # Disable default site — NimbusOS uses port 5000, Apache only for WebDAV
  a2dissite 000-default 2>/dev/null || true

  # Create WebDAV directory
  mkdir -p /var/lib/dav
  chown www-data:www-data /var/lib/dav

  # Create WebDAV vhost
  cat > /etc/apache2/sites-available/nimbusos-webdav.conf << 'EOF'
Listen 5005
<VirtualHost *:5005>
    ServerName localhost
    DocumentRoot /var/www/webdav

    <Directory /var/www/webdav>
        Options Indexes
        DAV On
        AuthType Basic
        AuthName "NimbusOS WebDAV"
        AuthUserFile /etc/apache2/.htpasswd-webdav
        Require valid-user
    </Directory>

    DavLockDB /var/lib/dav/lockdb
    ErrorLog ${APACHE_LOG_DIR}/webdav-error.log
    CustomLog ${APACHE_LOG_DIR}/webdav-access.log combined
</VirtualHost>
EOF

  # Create webdav root and htpasswd
  mkdir -p /var/www/webdav
  chown www-data:www-data /var/www/webdav
  touch /etc/apache2/.htpasswd-webdav

  a2ensite nimbusos-webdav 2>/dev/null || true
  
  # Make sure Apache doesn't listen on 80/443 (Nginx handles those)
  sed -i 's/^Listen 80/#Listen 80/' /etc/apache2/ports.conf 2>/dev/null || true
  sed -i 's/^Listen 443/#Listen 443/' /etc/apache2/ports.conf 2>/dev/null || true
  
  # Don't start Apache yet — user enables it from NimbusOS UI
  systemctl enable apache2 2>/dev/null || true
  systemctl stop apache2 2>/dev/null || true

  ok "WebDAV configured (port 5005, stopped until enabled from UI)"
}

# ── Configure Nginx (Reverse Proxy) ──
setup_nginx() {
  step "Configuring Nginx (Reverse Proxy)"

  # Remove default site
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null

  # Create NimbusOS proxy base config
  cat > /etc/nginx/sites-available/nimbusos-proxy.conf << 'EOF'
# NimbusOS Reverse Proxy — managed by NimbusOS
# Individual proxy rules are in /etc/nginx/sites-available/nimbusos-proxy-*.conf

# Default server — shows NimbusOS if no proxy rule matches
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Redirect to NimbusOS
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

  ln -sf /etc/nginx/sites-available/nimbusos-proxy.conf /etc/nginx/sites-enabled/ 2>/dev/null

  # Increase max upload size
  echo 'client_max_body_size 10G;' > /etc/nginx/conf.d/nimbusos.conf

  # Test and start
  nginx -t 2>/dev/null && systemctl enable nginx && systemctl restart nginx
  
  ok "Nginx configured (port 80 → NimbusOS, ready for proxy rules)"
}

# ── Configure Avahi (mDNS/Bonjour) ──
setup_avahi() {
  step "Configuring Avahi (network discovery)"

  HOSTNAME=$(hostname)
  cat > /etc/avahi/services/nimbusos.service << EOF
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">NimbusOS on %h</name>
  <service>
    <type>_http._tcp</type>
    <port>$NIMBUS_PORT</port>
    <txt-record>path=/</txt-record>
    <txt-record>product=NimbusOS</txt-record>
  </service>
  <service>
    <type>_smb._tcp</type>
    <port>445</port>
  </service>
</service-group>
EOF

  systemctl enable avahi-daemon 2>/dev/null || true
  systemctl restart avahi-daemon 2>/dev/null || true

  ok "Avahi configured — accessible as ${HOSTNAME}.local"
}

# ── Start NimbusOS ──
start_nimbusos() {
  step "Starting NimbusOS"

  systemctl start nimbusos

  # Wait for it to come up
  for i in $(seq 1 15); do
    if curl -sf "http://localhost:$NIMBUS_PORT/api/system/info" &>/dev/null; then
      ok "NimbusOS is running!"
      return
    fi
    sleep 1
  done

  warn "NimbusOS may still be starting. Check: systemctl status nimbusos"
}

# ── Print summary ──
print_summary() {
  # Get IP addresses
  LOCAL_IPS=$(hostname -I | tr ' ' '\n' | grep -E '^(192|10|172)' | head -3)
  HOSTNAME=$(hostname)

  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                                                              ║"
  echo "║   ☁️  NimbusOS v${NIMBUS_VERSION} installed successfully!       ║"
  echo "║                                                              ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Access NimbusOS:${NC}"
  for ip in $LOCAL_IPS; do
    echo -e "    ${CYAN}→ http://${ip}:${NIMBUS_PORT}${NC}"
  done
  echo -e "    ${CYAN}→ http://${HOSTNAME}.local:${NIMBUS_PORT}${NC}  (mDNS)"
  echo ""
  echo -e "  ${BOLD}Manage:${NC}"
  echo -e "    Status:   ${CYAN}systemctl status nimbusos${NC}"
  echo -e "    Logs:     ${CYAN}journalctl -u nimbusos -f${NC}"
  echo -e "    Restart:  ${CYAN}systemctl restart nimbusos${NC}"
  echo -e "    Update:   ${CYAN}/opt/nimbusos/scripts/update.sh${NC}"
  echo -e "    Uninstall:${CYAN} /opt/nimbusos/scripts/uninstall.sh${NC}"
  echo ""
  echo -e "  ${BOLD}Installed services:${NC}"
  echo -e "    Docker:  $(docker --version 2>/dev/null | cut -d' ' -f3 | tr -d ',' || echo 'not found')"
  echo -e "    Node.js: $(node -v 2>/dev/null || echo 'not found')"
  echo -e "    Samba:   $(smbd --version 2>/dev/null || echo 'not found')"
  echo -e "    FTP:     $(vsftpd -v 2>&1 | head -1 2>/dev/null || echo 'not found')"
  echo -e "    WebDAV:  $(apache2 -v 2>/dev/null | head -1 || echo 'not found')"
  echo -e "    NFS:     $(cat /proc/fs/nfsd/versions 2>/dev/null && echo 'installed' || echo 'not found')"
  echo -e "    Certbot: $(certbot --version 2>/dev/null || echo 'not found')"
  echo -e "    UFW:     $(ufw status 2>/dev/null | head -1 || echo 'not found')"
  echo ""
  echo -e "  ${BOLD}Paths:${NC}"
  echo -e "    Application: ${INSTALL_DIR}"
  echo -e "    Data:        ${DATA_DIR}"
  echo -e "    Config:      ${CONFIG_DIR}/nimbusos.env"
  echo -e "    Logs:        ${LOG_DIR}"
  echo ""
  echo -e "  ${YELLOW}⚠️  First time? Open the web UI to create your admin account.${NC}"
  echo ""
}

# ══════════════════════════════════════
#  Main
# ══════════════════════════════════════

main() {
  echo -e "${CYAN}${BOLD}"
  echo "   ☁️  NimbusOS Installer v${NIMBUS_VERSION}"
  echo "   Transforming Ubuntu Server into your personal NAS"
  echo -e "${NC}"

  preflight
  install_deps
  install_node
  install_docker
  setup_user
  install_nimbusos
  write_config
  install_service
  setup_firewall
  setup_samba
  setup_ftp
  setup_webdav
  setup_nginx
  setup_avahi
  start_nimbusos
  print_summary
}

main "$@"
