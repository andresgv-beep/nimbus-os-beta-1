/**
 * NimbusOS Backend API Server
 * Auto-detects system hardware and provides real-time metrics
 * Zero config — reads from /proc, /sys, nvidia-smi, lm-sensors, etc.
 */

const http = require('http');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');

const PORT = parseInt(process.env.NIMBUS_PORT || '5000');
const NIMBUS_ROOT = path.join(os.homedir(), '.nimbusos');
const CONFIG_DIR = path.join(NIMBUS_ROOT, 'config');
const USER_DATA_DIR = path.join(NIMBUS_ROOT, 'userdata'); // Datos por usuario
const USERS_FILE = path.join(CONFIG_DIR, 'users.json');
const SHARES_FILE = path.join(CONFIG_DIR, 'shares.json');
const DOCKER_FILE = path.join(CONFIG_DIR, 'docker.json');
const NATIVE_APPS_FILE = path.join(CONFIG_DIR, 'native-apps.json');
const SESSIONS_FILE = path.join(CONFIG_DIR, 'sessions.json');

// Load sessions from disk (survive restarts)
let SESSIONS = {};
try {
  if (fs.existsSync(SESSIONS_FILE)) {
    SESSIONS = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    // Clean expired on load
    const now = Date.now();
    Object.keys(SESSIONS).forEach(token => {
      if (now - SESSIONS[token].created > 24 * 60 * 60 * 1000) delete SESSIONS[token];
    });
  }
} catch { SESSIONS = {}; }

function saveSessions() {
  try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(SESSIONS, null, 2)); } catch {}
}

// Session expiry (24 hours)
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Clean expired sessions periodically
setInterval(() => {
  const now = Date.now();
  Object.keys(SESSIONS).forEach(token => {
    if (now - SESSIONS[token].created > SESSION_EXPIRY_MS) {
      delete SESSIONS[token];
    }
  });
}, 60 * 60 * 1000); // Every hour

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

// ═══════════════════════════════════
// Default user preferences
// ═══════════════════════════════════
const DEFAULT_PREFERENCES = {
  theme: 'dark',
  accentColor: 'orange',
  glowIntensity: 50,
  taskbarSize: 'medium',
  taskbarPosition: 'bottom',
  autoHideTaskbar: false,
  clock24: true,
  showDesktopIcons: true,
  textScale: 100,
  wallpaper: '',
  showWidgets: true,
  widgetScale: 100,
  visibleWidgets: {
    system: true,
    network: true,
    disk: true,
    notifications: true
  },
  pinnedApps: ['files', 'appstore', 'settings'],
  playlist: [],
  playlistName: 'Mi Lista'
};

// ═══════════════════════════════════
// Config directory setup
// ═══════════════════════════════════
function ensureConfig() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]');
  }
  if (!fs.existsSync(SHARES_FILE)) {
    fs.writeFileSync(SHARES_FILE, '[]');
  }
  if (!fs.existsSync(DOCKER_FILE)) {
    fs.writeFileSync(DOCKER_FILE, JSON.stringify({
      installed: false,
      path: null,
      permissions: [],        // Permisos globales Docker (admin de contenedores)
      appPermissions: {},     // Permisos por app: { "plex": ["user1"], "immich": ["user1", "user2"] }
      installedAt: null,
      containers: []
    }, null, 2));
  }
  
  // Installed apps registry
  const APPS_FILE = path.join(CONFIG_DIR, 'installed-apps.json');
  if (!fs.existsSync(APPS_FILE)) {
    fs.writeFileSync(APPS_FILE, '[]');
  }
}
ensureConfig();

// ═══════════════════════════════════
// User Preferences Management
// ═══════════════════════════════════
function getUserDataPath(username) {
  const safeName = username.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(USER_DATA_DIR, safeName);
}

function ensureUserDataDir(username) {
  const userPath = getUserDataPath(username);
  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(userPath, { recursive: true });
  }
  return userPath;
}

function getUserPreferences(username) {
  try {
    const userPath = getUserDataPath(username);
    const prefsFile = path.join(userPath, 'preferences.json');
    if (fs.existsSync(prefsFile)) {
      const saved = JSON.parse(fs.readFileSync(prefsFile, 'utf-8'));
      // Merge with defaults to ensure all keys exist
      return { ...DEFAULT_PREFERENCES, ...saved };
    }
  } catch (err) {
    console.error(`[Prefs] Error loading preferences for ${username}:`, err.message);
  }
  return { ...DEFAULT_PREFERENCES };
}

function saveUserPreferences(username, prefs) {
  try {
    const userPath = ensureUserDataDir(username);
    const prefsFile = path.join(userPath, 'preferences.json');
    // Only save non-default values to keep file small
    fs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
    console.log(`[Prefs] Saved preferences for ${username}`);
    return true;
  } catch (err) {
    console.error(`[Prefs] Error saving preferences for ${username}:`, err.message);
    return false;
  }
}

function getUserPlaylist(username) {
  try {
    const userPath = getUserDataPath(username);
    const playlistFile = path.join(userPath, 'playlist.json');
    if (fs.existsSync(playlistFile)) {
      return JSON.parse(fs.readFileSync(playlistFile, 'utf-8'));
    }
  } catch (err) {
    console.error(`[Playlist] Error loading playlist for ${username}:`, err.message);
  }
  return [];
}

function saveUserPlaylist(username, playlist) {
  try {
    const userPath = ensureUserDataDir(username);
    const playlistFile = path.join(userPath, 'playlist.json');
    fs.writeFileSync(playlistFile, JSON.stringify(playlist, null, 2));
    console.log(`[Playlist] Saved ${playlist.length} items for ${username}`);
    return true;
  } catch (err) {
    console.error(`[Playlist] Error saving playlist for ${username}:`, err.message);
    return false;
  }
}

// ═══════════════════════════════════
// Installed Apps Registry
// ═══════════════════════════════════
const APPS_FILE = path.join(CONFIG_DIR, 'installed-apps.json');

function getInstalledApps() {
  try { 
    return JSON.parse(fs.readFileSync(APPS_FILE, 'utf-8'));
  }
  catch (err) { 
    return []; 
  }
}

function saveInstalledApps(apps) {
  fs.writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2));
}

function registerApp(appData) {
  console.log(`[Apps] Registering app: ${appData.id}`);
  const apps = getInstalledApps();
  // Remove if already exists
  const filtered = apps.filter(a => a.id !== appData.id);
  
  let iconPath = appData.icon || '📦';
  
  // If icon is a URL, download it locally
  if (appData.icon && appData.icon.startsWith('http')) {
    try {
      const iconsDir = path.join(__dirname, '..', 'public', 'app-icons');
      if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
      }
      
      // Detect extension from URL or default to png
      const urlPath = appData.icon.split('?')[0];
      const urlExt = path.extname(urlPath).toLowerCase();
      const ext = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico'].includes(urlExt) ? urlExt : '.png';
      const iconFileName = `${appData.id}${ext}`;
      const localIconPath = path.join(iconsDir, iconFileName);
      
      // Download synchronously using curl
      execSync(`curl -sL -o "${localIconPath}" "${appData.icon}"`, { timeout: 10000 });
      
      // Use local path for the icon
      iconPath = `/app-icons/${iconFileName}`;
      console.log(`[App] Downloaded icon for ${appData.id}: ${iconPath}`);
    } catch (err) {
      console.error(`[App] Failed to download icon for ${appData.id}:`, err.message);
      iconPath = appData.icon; // Keep original URL as fallback
    }
  }
  
  filtered.push({
    id: appData.id,
    name: appData.name,
    icon: iconPath,
    port: appData.port,
    image: appData.image,
    type: appData.type || 'container', // container or stack
    color: appData.color || '#607D8B',
    external: appData.external || false,
    installedAt: new Date().toISOString(),
    installedBy: appData.installedBy || 'admin'
  });
  saveInstalledApps(filtered);
  return filtered;
}

function unregisterApp(appId) {
  const apps = getInstalledApps();
  const filtered = apps.filter(a => a.id !== appId);
  saveInstalledApps(filtered);
  return filtered;
}

// ═══════════════════════════════════
// Native Apps Detection & Management
// ═══════════════════════════════════

// Known native apps that NimbusOS can detect and integrate
const KNOWN_NATIVE_APPS = {
  'virtualization': {
    name: 'Virtual Machines (KVM)',
    description: 'Full virtualization with QEMU/KVM. Create and manage virtual machines.',
    category: 'system',
    checkCommand: 'which virsh 2>/dev/null && which qemu-system-x86_64 2>/dev/null',
    installCommand: 'sudo apt install -y qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils virt-install virtinst && sudo systemctl enable libvirtd && sudo systemctl start libvirtd && sudo mkdir -p /var/lib/nimbusos/vms /var/lib/nimbusos/isos',
    uninstallCommand: 'sudo apt remove -y qemu-kvm libvirt-daemon-system libvirt-clients virt-install virtinst',
    port: null,
    icon: '/app-icons/virtualization.svg',
    color: '#7C4DFF',
    isNativeApp: true,
    nimbusApp: 'vms',
  },
  'transmission': {
    name: 'Transmission',
    checkCommand: 'systemctl is-active transmission-daemon',
    installCommand: 'sudo apt install -y transmission-daemon',
    port: 9091,
    icon: '/app-icons/transmission.svg',
    color: '#B50D0D',
    configPath: '/etc/transmission-daemon/settings.json'
  },
  'onlyoffice': {
    name: 'OnlyOffice',
    checkCommand: 'which onlyoffice-desktopeditors || snap list onlyoffice-desktopeditors 2>/dev/null || ls /snap/bin/onlyoffice* 2>/dev/null || flatpak list 2>/dev/null | grep -i onlyoffice',
    port: null, // Desktop app, no web port
    icon: '/app-icons/onlyoffice.svg',
    color: '#FF6F3D',
    isDesktop: true,
    launchCommand: 'onlyoffice-desktopeditors || snap run onlyoffice-desktopeditors || flatpak run org.onlyoffice.desktopeditors'
  },
  'samba': {
    name: 'Samba (SMB)',
    checkCommand: 'systemctl is-active smbd',
    installCommand: 'sudo apt install -y samba',
    port: 445,
    icon: '📁',
    color: '#4A90A4',
    configPath: '/etc/samba/smb.conf'
  },
  'libreoffice': {
    name: 'LibreOffice',
    checkCommand: 'which libreoffice || snap list libreoffice 2>/dev/null',
    port: null,
    icon: '/app-icons/libreoffice.svg', 
    color: '#18A303',
    isDesktop: true,
    launchCommand: 'libreoffice'
  }
};

function getNativeApps() {
  try {
    if (!fs.existsSync(NATIVE_APPS_FILE)) return [];
    return JSON.parse(fs.readFileSync(NATIVE_APPS_FILE, 'utf-8'));
  } catch { return []; }
}

function saveNativeApps(apps) {
  fs.writeFileSync(NATIVE_APPS_FILE, JSON.stringify(apps, null, 2));
}

function detectNativeApp(appId) {
  const appDef = KNOWN_NATIVE_APPS[appId];
  if (!appDef) return { installed: false, running: false };
  
  try {
    const result = execSync(appDef.checkCommand, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }).trim();
    const isActive = result === 'active' || result.length > 0;
    return { installed: true, running: isActive };
  } catch {
    return { installed: false, running: false };
  }
}

function detectAllNativeApps() {
  const results = [];
  for (const [id, def] of Object.entries(KNOWN_NATIVE_APPS)) {
    const status = detectNativeApp(id);
    if (status.installed) {
      results.push({
        id,
        name: def.name,
        icon: def.icon,
        color: def.color,
        port: def.port,
        type: 'native',
        isDesktop: def.isDesktop || false,
        running: status.running
      });
    }
  }
  return results;
}

function registerNativeApp(appData) {
  const apps = getNativeApps();
  const filtered = apps.filter(a => a.id !== appData.id);
  filtered.push({
    ...appData,
    type: 'native',
    installedAt: new Date().toISOString()
  });
  saveNativeApps(filtered);
  return filtered;
}

// ═══════════════════════════════════
// Auth helpers
// ═══════════════════════════════════
// ═══════════════════════════════════
// Rate limiting for auth endpoints
// ═══════════════════════════════════
const LOGIN_ATTEMPTS = {}; // { ip: { count, lastAttempt, lockedUntil } }
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
  const record = LOGIN_ATTEMPTS[ip];
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return { allowed: false, message: `Too many attempts. Try again in ${remaining} minutes.` };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    delete LOGIN_ATTEMPTS[ip];
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedAttempt(ip) {
  if (!LOGIN_ATTEMPTS[ip]) LOGIN_ATTEMPTS[ip] = { count: 0, lastAttempt: 0 };
  const record = LOGIN_ATTEMPTS[ip];
  // Reset if last attempt was more than lockout duration ago
  if (Date.now() - record.lastAttempt > LOCKOUT_DURATION) record.count = 0;
  record.count++;
  record.lastAttempt = Date.now();
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION;
  }
}

function clearFailedAttempts(ip) {
  delete LOGIN_ATTEMPTS[ip];
}

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(LOGIN_ATTEMPTS)) {
    const r = LOGIN_ATTEMPTS[ip];
    if (now - r.lastAttempt > LOCKOUT_DURATION * 2) delete LOGIN_ATTEMPTS[ip];
  }
}, 3600000);

// ═══════════════════════════════════
// TOTP secret encryption (encrypt at rest with server key)
// ═══════════════════════════════════
const SERVER_KEY_FILE = path.join(CONFIG_DIR, '.server_key');
function getServerKey() {
  if (fs.existsSync(SERVER_KEY_FILE)) return fs.readFileSync(SERVER_KEY_FILE, 'utf-8').trim();
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SERVER_KEY_FILE, key, { mode: 0o600 });
  return key;
}

function encryptSecret(plaintext) {
  const key = Buffer.from(getServerKey(), 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptSecret(ciphertext) {
  if (!ciphertext || !ciphertext.includes(':')) return ciphertext; // backwards compat: unencrypted
  const key = Buffer.from(getServerKey(), 'hex');
  const [ivHex, encrypted] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Backup codes for 2FA recovery
function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// ═══════════════════════════════════
// TOTP (2FA) — compatible with Google Authenticator
// ═══════════════════════════════════
function generateTotpSecret() {
  // Generate 20 random bytes, encode as base32
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, result = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const output = [];
  for (const c of str.toUpperCase().replace(/=+$/, '')) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xFF);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function generateTotp(secret, time) {
  const t = Math.floor((time || Date.now() / 1000) / 30);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(0, 0);
  timeBuffer.writeUInt32BE(t, 4);
  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;
  return code.toString().padStart(6, '0');
}

function verifyTotp(secret, token) {
  // Check current and ±1 time step (30 second window each side)
  const now = Date.now() / 1000;
  for (let i = -1; i <= 1; i++) {
    if (generateTotp(secret, now + i * 30) === token) return true;
  }
  return false;
}

function getTotpQrUrl(username, secret) {
  const issuer = 'NimbusOS';
  const uri = `otpauth://totp/${issuer}:${username}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  return { uri };
}

function generateQrSvg(text) {
  // Try qrencode CLI first (apt install qrencode)
  try {
    const svg = execSync(`echo -n "${text.replace(/"/g, '\\"')}" | qrencode -t SVG -o - -m 1`, { timeout: 5000 }).toString();
    return svg;
  } catch {}
  
  // Try python3 qrcode module
  try {
    const svg = execSync(`python3 -c "
import qrcode, qrcode.image.svg, sys
img = qrcode.make(sys.argv[1], image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=1)
import io; buf = io.BytesIO(); img.save(buf); sys.stdout.buffer.write(buf.getvalue())
" "${text.replace(/"/g, '\\"')}"`, { timeout: 5000 }).toString();
    return svg;
  } catch {}
  
  // Install qrencode and retry
  try {
    execSync('apt-get install -y qrencode 2>/dev/null', { timeout: 30000, stdio: 'pipe' });
    const svg = execSync(`echo -n "${text.replace(/"/g, '\\"')}" | qrencode -t SVG -o - -m 1`, { timeout: 5000 }).toString();
    return svg;
  } catch {}
  
  throw new Error('QR generation not available. Install qrencode: sudo apt install qrencode');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === test;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function isSetupDone() {
  const users = getUsers();
  return users.length > 0;
}

function getSessionUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  const session = SESSIONS[token];
  
  // Check if session exists and hasn't expired
  if (session && (Date.now() - session.created < SESSION_EXPIRY_MS)) {
    return session;
  }
  
  // Clean expired session
  if (session) delete SESSIONS[token];
  return null;
}

// Security: Sanitize container/image names to prevent command injection
function sanitizeDockerName(name) {
  if (!name || typeof name !== 'string') return null;
  // Only allow alphanumeric, dash, underscore, dot, colon, slash (for images)
  const sanitized = name.replace(/[^a-zA-Z0-9_.\-\/:]/g, '');
  if (sanitized.length === 0 || sanitized.length > 256) return null;
  // Prevent path traversal
  if (sanitized.includes('..')) return null;
  return sanitized;
}

// Security: Validate port number
function isValidPort(port) {
  const num = parseInt(port);
  return !isNaN(num) && num >= 1 && num <= 65535;
}

// ═══════════════════════════════════
// Auth API handlers
// ═══════════════════════════════════
// ═══════════════════════════════════
// Linux / Samba user sync
// ═══════════════════════════════════
function ensureLinuxUser(username) {
  // Check if user already exists in Linux
  const exists = run(`id "${username}" 2>/dev/null`);
  if (!exists) {
    // Create system user: no home, no login shell, in 'nimbus' group for shared access
    run(`sudo useradd -M -s /usr/sbin/nologin -G nimbus "${username}" 2>/dev/null`);
    // If nimbus group doesn't exist, create without group
    if (!run(`id "${username}" 2>/dev/null`)) {
      run(`sudo useradd -M -s /usr/sbin/nologin "${username}" 2>/dev/null`);
    }
  }
}

function ensureSmbUser(username, password) {
  ensureLinuxUser(username);
  // Set samba password (pipe it to smbpasswd)
  try {
    execSync(`(echo "${password}"; echo "${password}") | sudo smbpasswd -s -a "${username}" 2>/dev/null`, 
      { encoding: 'utf-8', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

function removeLinuxSmbUser(username) {
  // Remove from samba
  run(`sudo smbpasswd -x "${username}" 2>/dev/null`);
  // Remove linux user (only if it was created by NimbusOS — check nologin shell)
  const shell = run(`getent passwd "${username}" 2>/dev/null | cut -d: -f7`);
  if (shell && shell.includes('nologin')) {
    run(`sudo userdel "${username}" 2>/dev/null`);
  }
}

function handleAuth(url, method, body, req) {

  // GET /api/auth/status — is setup done?
  if (url === '/api/auth/status' && method === 'GET') {
    return { setup: isSetupDone(), hostname: os.hostname() };
  }

  // POST /api/auth/setup — create initial admin account (only if no users exist)
  if (url === '/api/auth/setup' && method === 'POST') {
    if (isSetupDone()) return { error: 'Setup already completed' };
    const { username, password, deviceName } = body;
    if (!username || !password) return { error: 'Username and password required' };
    if (password.length < 4) return { error: 'Password must be at least 4 characters' };

    const users = [{
      username: username.toLowerCase().trim(),
      password: hashPassword(password),
      role: 'admin',
      created: new Date().toISOString(),
      description: 'System administrator',
    }];
    saveUsers(users);

    // Sync: create Linux user + Samba password
    ensureSmbUser(users[0].username, password);

    // Create default volume directory
    const volDir = path.join(NIMBUS_ROOT, 'volumes', 'volume1');
    if (!fs.existsSync(volDir)) fs.mkdirSync(volDir, { recursive: true });

    // Auto-login after setup
    const token = generateToken();
    SESSIONS[token] = { username: users[0].username, role: 'admin', created: Date.now() };
    saveSessions();

    return { ok: true, token, user: { username: users[0].username, role: 'admin' } };
  }

  // POST /api/auth/login
  if (url === '/api/auth/login' && method === 'POST') {
    const { username, password, totpCode } = body;
    if (!username || !password) return { error: 'Username and password required' };

    // Rate limiting
    const clientIp = req.socket?.remoteAddress || 'unknown';
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) return { error: rateCheck.message };

    const users = getUsers();
    const user = users.find(u => u.username === username.toLowerCase().trim());
    if (!user || !verifyPassword(password, user.password)) {
      recordFailedAttempt(clientIp);
      return { error: 'Invalid credentials' };
    }

    // Check 2FA if enabled
    if (user.totpSecret && user.totpEnabled) {
      if (!totpCode) {
        return { requires2FA: true, message: 'Two-factor authentication code required' };
      }
      const secret = decryptSecret(user.totpSecret);
      if (!verifyTotp(secret, totpCode)) {
        // Check backup codes
        let backupValid = false;
        if (user.backupCodes && Array.isArray(user.backupCodes)) {
          const idx = user.backupCodes.indexOf(totpCode.toUpperCase());
          if (idx !== -1) {
            user.backupCodes.splice(idx, 1); // One-time use
            saveUsers(users);
            backupValid = true;
          }
        }
        if (!backupValid) {
          recordFailedAttempt(clientIp);
          return { error: 'Invalid 2FA code' };
        }
      }
    }

    clearFailedAttempts(clientIp);
    const token = generateToken();
    SESSIONS[token] = { username: user.username, role: user.role, created: Date.now() };
    saveSessions();

    return { ok: true, token, user: { username: user.username, role: user.role } };
  }

  // POST /api/auth/change-password
  if (url === '/api/auth/change-password' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const { currentPassword, newPassword, targetUser } = body;
    if (!newPassword || newPassword.length < 4) return { error: 'Password must be at least 4 characters' };
    
    const users = getUsers();
    const editUser = targetUser && session.role === 'admin'
      ? users.find(u => u.username === targetUser)
      : users.find(u => u.username === session.username);
    
    if (!editUser) return { error: 'User not found' };
    
    // Non-admin users must provide current password
    if (!targetUser || targetUser === session.username) {
      if (!currentPassword || !verifyPassword(currentPassword, editUser.password)) {
        return { error: 'Current password is incorrect' };
      }
    }
    
    editUser.password = hashPassword(newPassword);
    saveUsers(users);
    
    // Also update Linux/Samba password
    ensureSmbUser(editUser.username, newPassword);
    
    return { ok: true };
  }

  // POST /api/auth/2fa/setup — generate TOTP secret and QR
  if (url === '/api/auth/2fa/setup' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const users = getUsers();
    const user = users.find(u => u.username === session.username);
    if (!user) return { error: 'User not found' };
    
    // Generate new secret (store encrypted, not yet enabled)
    const secret = generateTotpSecret();
    user.totpSecret = encryptSecret(secret);
    user.totpEnabled = false;
    saveUsers(users);
    
    const { uri } = getTotpQrUrl(user.username, secret);
    return { ok: true, secret, uri };
  }

  // POST /api/auth/2fa/verify — verify TOTP code and enable 2FA
  if (url === '/api/auth/2fa/verify' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const { code } = body;
    if (!code) return { error: 'Code required' };
    
    const users = getUsers();
    const user = users.find(u => u.username === session.username);
    if (!user || !user.totpSecret) return { error: 'No 2FA setup in progress' };
    
    const secret = decryptSecret(user.totpSecret);
    if (!verifyTotp(secret, code)) {
      return { error: 'Invalid code. Make sure your authenticator app is synced.' };
    }
    
    // Generate backup codes
    const backupCodes = generateBackupCodes();
    user.totpEnabled = true;
    user.backupCodes = backupCodes;
    saveUsers(users);
    
    return { ok: true, message: '2FA enabled successfully', backupCodes };
  }

  // POST /api/auth/2fa/disable — disable 2FA
  if (url === '/api/auth/2fa/disable' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const { password } = body;
    if (!password) return { error: 'Password required to disable 2FA' };
    
    const users = getUsers();
    const user = users.find(u => u.username === session.username);
    if (!user) return { error: 'User not found' };
    
    if (!verifyPassword(password, user.password)) {
      return { error: 'Invalid password' };
    }
    
    user.totpSecret = null;
    user.totpEnabled = false;
    saveUsers(users);
    
    return { ok: true };
  }

  // GET /api/auth/2fa/status — check if 2FA is enabled
  if (url === '/api/auth/2fa/status' && method === 'GET') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const users = getUsers();
    const user = users.find(u => u.username === session.username);
    return { enabled: !!(user?.totpEnabled) };
  }

  // POST /api/auth/2fa/qr — generate QR code as SVG
  if (url === '/api/auth/2fa/qr' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const { text } = body;
    if (!text) return { error: 'Text required' };
    
    try {
      const svg = generateQrSvg(text);
      return { svg };
    } catch (err) {
      return { error: 'QR generation failed', detail: err.message };
    }
  }

  // POST /api/auth/logout
  if (url === '/api/auth/logout' && method === 'POST') {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '');
    delete SESSIONS[token];
    saveSessions();
    return { ok: true };
  }

  // GET /api/auth/me — verify session
  if (url === '/api/auth/me' && method === 'GET') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    return { user: { username: session.username, role: session.role } };
  }

  // ═══════════════════════════════════
  // User Preferences API
  // ═══════════════════════════════════
  
  // GET /api/user/preferences — get current user's preferences
  if (url === '/api/user/preferences' && method === 'GET') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    const prefs = getUserPreferences(session.username);
    return { preferences: prefs };
  }
  
  // PUT /api/user/preferences — save current user's preferences
  if (url === '/api/user/preferences' && method === 'PUT') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    // Merge with existing preferences
    const current = getUserPreferences(session.username);
    const updated = { ...current, ...body };
    
    // Remove playlist from preferences (it has its own endpoint)
    delete updated.playlist;
    
    if (saveUserPreferences(session.username, updated)) {
      return { ok: true, preferences: updated };
    }
    return { error: 'Failed to save preferences' };
  }
  
  // PATCH /api/user/preferences — partial update (for single setting changes)
  if (url === '/api/user/preferences' && method === 'PATCH') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const current = getUserPreferences(session.username);
    const updated = { ...current, ...body };
    delete updated.playlist;
    
    if (saveUserPreferences(session.username, updated)) {
      return { ok: true };
    }
    return { error: 'Failed to save preferences' };
  }
  
  // POST /api/user/wallpaper — upload wallpaper image (base64 in body)
  if (url === '/api/user/wallpaper' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const { data, filename } = body;
    if (!data) return { error: 'No image data provided' };
    
    try {
      // Extract base64 data
      const matches = data.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
      if (!matches) return { error: 'Invalid image format' };
      
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const imgBuffer = Buffer.from(matches[2], 'base64');
      
      // Limit to 10MB
      if (imgBuffer.length > 10 * 1024 * 1024) return { error: 'Image too large (max 10MB)' };
      
      // Save to user data dir
      const userPath = ensureUserDataDir(session.username);
      const wallpaperFile = `wallpaper.${ext}`;
      const fullPath = path.join(userPath, wallpaperFile);
      fs.writeFileSync(fullPath, imgBuffer);
      
      // Return URL that the frontend can use
      const wallpaperUrl = `/api/user/wallpaper/${session.username}/${wallpaperFile}`;
      
      // Also save URL in preferences
      const current = getUserPreferences(session.username);
      current.wallpaper = wallpaperUrl;
      saveUserPreferences(session.username, current);
      
      return { ok: true, url: wallpaperUrl };
    } catch (err) {
      return { error: 'Failed to save wallpaper: ' + err.message };
    }
  }
  
  // GET /api/user/wallpaper/:username/:file — serve wallpaper image
  const wpMatch = url.match(/^\/api\/user\/wallpaper\/([a-zA-Z0-9_.-]+)\/wallpaper\.(png|jpg|jpeg|webp|gif)$/);
  if (wpMatch && method === 'GET') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const wpUser = wpMatch[1];
    const ext = wpMatch[2];
    const userPath = getUserDataPath(wpUser);
    const wallpaperPath = path.join(userPath, `wallpaper.${ext}`);
    
    if (fs.existsSync(wallpaperPath)) {
      const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
      // Return special marker so the caller handles binary
      return { __binary: true, path: wallpaperPath, mime: mimeTypes[ext] || 'image/png' };
    }
    return { error: 'Wallpaper not found' };
  }

  // GET /api/user/playlist — get current user's playlist
  if (url === '/api/user/playlist' && method === 'GET') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    const playlist = getUserPlaylist(session.username);
    return { playlist };
  }
  
  // PUT /api/user/playlist — save current user's playlist
  if (url === '/api/user/playlist' && method === 'PUT') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const { playlist } = body;
    if (!Array.isArray(playlist)) {
      return { error: 'Playlist must be an array' };
    }
    
    // Validate and sanitize playlist items
    const sanitized = playlist.map(item => ({
      name: String(item.name || 'Unknown'),
      url: String(item.url || ''),
      type: item.type === 'video' ? 'video' : 'audio',
      duration: item.duration || null,
      addedAt: item.addedAt || new Date().toISOString()
    })).filter(item => item.url); // Remove items without URL
    
    if (saveUserPlaylist(session.username, sanitized)) {
      return { ok: true, count: sanitized.length };
    }
    return { error: 'Failed to save playlist' };
  }
  
  // POST /api/user/playlist/add — add item to playlist
  if (url === '/api/user/playlist/add' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const { name, url: itemUrl, type, duration } = body;
    if (!itemUrl) return { error: 'URL required' };
    
    const playlist = getUserPlaylist(session.username);
    
    // Check if already in playlist
    if (playlist.some(item => item.url === itemUrl)) {
      return { error: 'Already in playlist', exists: true };
    }
    
    playlist.push({
      name: name || 'Unknown',
      url: itemUrl,
      type: type === 'video' ? 'video' : 'audio',
      duration: duration || null,
      addedAt: new Date().toISOString()
    });
    
    if (saveUserPlaylist(session.username, playlist)) {
      return { ok: true, count: playlist.length };
    }
    return { error: 'Failed to add to playlist' };
  }
  
  // DELETE /api/user/playlist/:index — remove item from playlist
  const playlistDelMatch = url.match(/^\/api\/user\/playlist\/(\d+)$/);
  if (playlistDelMatch && method === 'DELETE') {
    const session = getSessionUser(req);
    if (!session) return { error: 'Not authenticated' };
    
    const index = parseInt(playlistDelMatch[1]);
    const playlist = getUserPlaylist(session.username);
    
    if (index < 0 || index >= playlist.length) {
      return { error: 'Invalid index' };
    }
    
    playlist.splice(index, 1);
    
    if (saveUserPlaylist(session.username, playlist)) {
      return { ok: true, count: playlist.length };
    }
    return { error: 'Failed to remove from playlist' };
  }

  // GET /api/users — list users (admin only)
  if (url === '/api/users' && method === 'GET') {
    const session = getSessionUser(req);
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    const users = getUsers().map(u => ({
      username: u.username,
      role: u.role,
      description: u.description || '',
      created: u.created,
    }));
    return users;
  }

  // POST /api/users — create user (admin only)
  if (url === '/api/users' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    const { username, password, role, description } = body;
    if (!username || !password) return { error: 'Username and password required' };
    if (password.length < 4) return { error: 'Password must be at least 4 characters' };

    const users = getUsers();
    if (users.find(u => u.username === username.toLowerCase().trim())) {
      return { error: 'User already exists' };
    }

    users.push({
      username: username.toLowerCase().trim(),
      password: hashPassword(password),
      role: role || 'user',
      description: description || '',
      created: new Date().toISOString(),
    });
    saveUsers(users);

    // Sync: create Linux user + Samba password
    ensureSmbUser(username.toLowerCase().trim(), password);

    return { ok: true, username: username.toLowerCase().trim() };
  }

  // DELETE /api/users/:username — delete user (admin only)
  const delMatch = url.match(/^\/api\/users\/([a-zA-Z0-9_.-]+)$/);
  if (delMatch && method === 'DELETE') {
    const session = getSessionUser(req);
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    const target = delMatch[1].toLowerCase();
    if (target === session.username) return { error: 'Cannot delete yourself' };

    let users = getUsers();
    const before = users.length;
    users = users.filter(u => u.username !== target);
    if (users.length === before) return { error: 'User not found' };

    saveUsers(users);

    // Sync: remove Linux/Samba user
    removeLinuxSmbUser(target);

    return { ok: true };
  }

  // PUT /api/users/:username — update user (admin only)
  if (delMatch && method === 'PUT') {
    const session = getSessionUser(req);
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    const target = delMatch[1].toLowerCase();

    const users = getUsers();
    const user = users.find(u => u.username === target);
    if (!user) return { error: 'User not found' };

    if (body.password && body.password.length >= 4) {
      user.password = hashPassword(body.password);
      // Sync: update Samba password
      ensureSmbUser(target, body.password);
    }
    if (body.role) user.role = body.role;
    if (body.description !== undefined) user.description = body.description;

    saveUsers(users);
    return { ok: true };
  }

  return null; // not handled
}

// ═══════════════════════════════════
// Shared Folders API
// ═══════════════════════════════════
const VOLUMES_DIR = path.join(NIMBUS_ROOT, 'volumes');

function getShares() {
  try { return JSON.parse(fs.readFileSync(SHARES_FILE, 'utf-8')); }
  catch { return []; }
}

function saveShares(shares) {
  fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
}

function handleShares(url, method, body, req) {
  const session = getSessionUser(req);

  // GET /api/shares — list all shared folders (any authenticated user)
  if (url === '/api/shares' && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    const shares = getShares();
    // If not admin, filter to only shares they have access to
    if (session.role !== 'admin') {
      return shares.filter(s => {
        const perm = (s.permissions || {})[session.username];
        return perm === 'rw' || perm === 'ro';
      }).map(s => ({
        ...s,
        myPermission: (s.permissions || {})[session.username] || 'none',
      }));
    }
    return shares;
  }

  // POST /api/shares — create shared folder (admin only)
  if (url === '/api/shares' && method === 'POST') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    const { name, description, pool } = body;
    if (!name || !name.trim()) return { error: 'Folder name required' };
    if (/[^a-zA-Z0-9_\- ]/.test(name.trim())) return { error: 'Name can only contain letters, numbers, spaces, -, _' };

    const shares = getShares();
    const safeName = name.trim().toLowerCase().replace(/\s+/g, '-');

    if (shares.find(s => s.name === safeName)) return { error: 'Shared folder already exists' };

    // Determine target path — MUST use a pool
    const storageConf = getStorageConfig();
    const targetPool = pool 
      ? (storageConf.pools || []).find(p => p.name === pool)
      : (storageConf.pools || []).find(p => p.name === storageConf.primaryPool);
    
    if (!targetPool) {
      return { error: 'No storage pool available. Create a pool in Storage Manager first.' };
    }
    
    const folderPath = path.join(targetPool.mountPoint, 'shares', safeName);
    const volumeName = targetPool.name;
    
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    // Set ownership so SMB users can access — owner=creator, group=nimbus, mode=2775 (setgid)
    run(`sudo chown ${session.username}:nimbus "${folderPath}" 2>/dev/null`);
    run(`sudo chmod 2775 "${folderPath}" 2>/dev/null`);

    // Default: admin has rw
    const permissions = {};
    permissions[session.username] = 'rw';

    shares.push({
      name: safeName,
      displayName: name.trim(),
      description: description || '',
      path: folderPath,
      volume: volumeName,
      pool: targetPool ? targetPool.name : null,
      created: new Date().toISOString(),
      createdBy: session.username,
      recycleBin: true,
      permissions,        // User permissions: { "user1": "rw", "user2": "ro" }
      appPermissions: [], // App permissions: ["plex", "jellyfin", "immich"]
    });
    saveShares(shares);

    return { ok: true, name: safeName, path: folderPath, pool: volumeName };
  }

  // PUT /api/shares/:name — update shared folder (admin only)
  const shareMatch = url.match(/^\/api\/shares\/([a-zA-Z0-9_-]+)$/);
  if (shareMatch && method === 'PUT') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    const target = shareMatch[1];
    const shares = getShares();
    const share = shares.find(s => s.name === target);
    if (!share) return { error: 'Shared folder not found' };

    if (body.description !== undefined) share.description = body.description;
    if (body.recycleBin !== undefined) share.recycleBin = body.recycleBin;
    if (body.permissions) share.permissions = body.permissions;
    if (body.appPermissions) share.appPermissions = body.appPermissions; // NEW

    saveShares(shares);
    return { ok: true };
  }

  // DELETE /api/shares/:name — delete shared folder (admin only)
  if (shareMatch && method === 'DELETE') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    const target = shareMatch[1];
    let shares = getShares();
    const share = shares.find(s => s.name === target);
    if (!share) return { error: 'Shared folder not found' };

    shares = shares.filter(s => s.name !== target);
    saveShares(shares);
    // Note: we do NOT delete the actual directory for safety
    return { ok: true };
  }

  // GET /api/shares/:name/files?path= — list files in shared folder
  if (shareMatch && method === 'GET' && url.includes('/files')) {
    // handled separately
    return null;
  }

  return null;
}

// ═══════════════════════════════════
// Docker API (REAL EXECUTION)
// ═══════════════════════════════════
function getDockerConfig() {
  try { 
    const config = JSON.parse(fs.readFileSync(DOCKER_FILE, 'utf-8'));
    // Ensure appPermissions exists
    if (!config.appPermissions) config.appPermissions = {};
    return config;
  }
  catch { return { installed: false, path: null, permissions: [], appPermissions: {}, installedAt: null, containers: [] }; }
}

function saveDockerConfig(config) {
  fs.writeFileSync(DOCKER_FILE, JSON.stringify(config, null, 2));
}

// App metadata for known Docker images
const KNOWN_APPS = {
  'jellyfin': { displayName: 'Jellyfin', icon: '🎞️', color: '#00A4DC' },
  'plex': { displayName: 'Plex', icon: '🎬', color: '#E5A00D' },
  'nextcloud': { displayName: 'Nextcloud', icon: '☁️', color: '#0082C9' },
  'immich': { displayName: 'Immich', icon: '📸', color: '#4250AF' },
  'syncthing': { displayName: 'Syncthing', icon: '🔄', color: '#0891B2' },
  'transmission': { displayName: 'Transmission', icon: '⬇️', color: '#B50D0D' },
  'qbittorrent': { displayName: 'qBittorrent', icon: '📥', color: '#2F67BA' },
  'homeassistant': { displayName: 'Home Assistant', icon: '🏠', color: '#18BCF2' },
  'home-assistant': { displayName: 'Home Assistant', icon: '🏠', color: '#18BCF2' },
  'vaultwarden': { displayName: 'Vaultwarden', icon: '🔐', color: '#175DDC' },
  'portainer': { displayName: 'Portainer', icon: '📊', color: '#13BEF9' },
  'gitea': { displayName: 'Gitea', icon: '🦊', color: '#609926' },
  'pihole': { displayName: 'Pi-hole', icon: '🛡️', color: '#96060C' },
  'adguard': { displayName: 'AdGuard Home', icon: '🛡️', color: '#68BC71' },
  'nginx': { displayName: 'Nginx', icon: '🌐', color: '#009639' },
  'mariadb': { displayName: 'MariaDB', icon: '🗄️', color: '#003545' },
  'postgres': { displayName: 'PostgreSQL', icon: '🐘', color: '#336791' },
  'redis': { displayName: 'Redis', icon: '🔴', color: '#DC382D' },
  'grafana': { displayName: 'Grafana', icon: '📈', color: '#F46800' },
  'prometheus': { displayName: 'Prometheus', icon: '🔥', color: '#E6522C' },
  'code-server': { displayName: 'VS Code Server', icon: '💻', color: '#007ACC' },
  'filebrowser': { displayName: 'File Browser', icon: '📁', color: '#40C4FF' },
  'calibre': { displayName: 'Calibre', icon: '📚', color: '#964B00' },
  'sonarr': { displayName: 'Sonarr', icon: '📺', color: '#35C5F4' },
  'radarr': { displayName: 'Radarr', icon: '🎥', color: '#FFC230' },
  'prowlarr': { displayName: 'Prowlarr', icon: '🔍', color: '#FFC230' },
  'overseerr': { displayName: 'Overseerr', icon: '🎫', color: '#5B4BB6' },
  'tautulli': { displayName: 'Tautulli', icon: '📊', color: '#E5A00D' },
  'bazarr': { displayName: 'Bazarr', icon: '💬', color: '#9B59B6' },
  'lidarr': { displayName: 'Lidarr', icon: '🎵', color: '#1DB954' },
  'readarr': { displayName: 'Readarr', icon: '📖', color: '#8E44AD' },
};

function getAppMetaFromImage(image, containerName) {
  // Try to match by container name first
  const nameLower = containerName.toLowerCase();
  for (const [key, meta] of Object.entries(KNOWN_APPS)) {
    if (nameLower.includes(key)) {
      return meta;
    }
  }
  
  // Try to match by image name
  const imageLower = image.toLowerCase();
  for (const [key, meta] of Object.entries(KNOWN_APPS)) {
    if (imageLower.includes(key)) {
      return meta;
    }
  }
  
  // Default
  return { displayName: containerName, icon: '📦', color: '#78706A' };
}

// Check if Docker is actually installed on the system
function isDockerInstalled() {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Get real container status from Docker
function getRealContainers() {
  try {
    const output = execSync('docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.State}}"', { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [id, name, image, status, ports, state] = line.split('|');
      return { id, name, image, status, ports, state };
    });
  } catch {
    return [];
  }
}

function handleDocker(url, method, body, req) {
  const session = getSessionUser(req);
  
  // GET /api/installed-apps — get all installed apps (for launcher)
  if (url === '/api/installed-apps' && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const apps = getInstalledApps();
    const config = getDockerConfig();
    
    // Filter based on user permissions if not admin
    if (session.role !== 'admin') {
      return apps.filter(app => {
        const appPerms = config.appPermissions?.[app.id] || [];
        return appPerms.includes(session.username);
      });
    }
    
    return apps;
  }
  
  // DELETE /api/installed-apps/:id — unregister an app
  const unregMatch = url.match(/^\/api\/installed-apps\/([a-zA-Z0-9_-]+)$/);
  if (unregMatch && method === 'DELETE') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const appId = unregMatch[1];
    unregisterApp(appId);
    return { ok: true, appId };
  }
  
  // GET /api/docker/status — check if Docker is installed and user has permission
  if (url === '/api/docker/status' && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    const dockerRunning = isDockerInstalled();
    
    // If Docker is installed on system but not in our config, sync it
    if (dockerRunning && !config.installed) {
      config.installed = true;
      config.installedAt = new Date().toISOString();
      saveDockerConfig(config);
    }
    
    // Get real containers if Docker is running
    const realContainers = dockerRunning ? getRealContainers() : [];
    
    return {
      installed: config.installed || dockerRunning,
      path: config.path || '/var/lib/docker',
      hasPermission,
      installedAt: config.installedAt,
      containers: hasPermission ? realContainers : [],
      dockerRunning
    };
  }
  
  // GET /api/docker/permissions — get who has Docker access (admin only)
  if (url === '/api/docker/permissions' && method === 'GET') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const config = getDockerConfig();
    const users = getUsers().map(u => ({
      username: u.username,
      role: u.role,
      hasAccess: u.role === 'admin' || config.permissions.includes(u.username)
    }));
    
    return { users, permissions: config.permissions };
  }
  
  // PUT /api/docker/permissions — update Docker permissions (admin only)
  if (url === '/api/docker/permissions' && method === 'PUT') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const { permissions } = body;
    if (!Array.isArray(permissions)) return { error: 'Invalid permissions format' };
    
    const config = getDockerConfig();
    config.permissions = permissions;
    saveDockerConfig(config);
    
    return { ok: true, permissions };
  }
  
  // GET /api/docker/app-permissions — get all app permissions (admin only)
  if (url === '/api/docker/app-permissions' && method === 'GET') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const config = getDockerConfig();
    const users = getUsers();
    const shares = getShares();
    
    // Get installed apps (containers + stacks)
    const installedApps = [];
    
    // Add containers
    const containers = getRealContainers();
    containers.forEach(c => {
      installedApps.push({
        id: c.name,
        name: c.name,
        type: 'container',
        image: c.image
      });
    });
    
    // Check for stacks
    const stacksPath = path.join(config.path || '/var/lib/docker', 'stacks');
    if (fs.existsSync(stacksPath)) {
      try {
        const stacks = fs.readdirSync(stacksPath);
        stacks.forEach(s => {
          if (fs.existsSync(path.join(stacksPath, s, 'docker-compose.yml'))) {
            installedApps.push({
              id: s,
              name: s,
              type: 'stack'
            });
          }
        });
      } catch {}
    }
    
    return {
      users: users.map(u => ({ username: u.username, role: u.role })),
      apps: installedApps,
      shares: shares.map(s => ({ name: s.name, displayName: s.displayName, permissions: s.permissions })),
      appPermissions: config.appPermissions || {},
      dockerPermissions: config.permissions || []
    };
  }
  
  // PUT /api/docker/app-permissions/:appId — update permissions for specific app
  const appPermMatch = url.match(/^\/api\/docker\/app-permissions\/([a-zA-Z0-9_-]+)$/);
  if (appPermMatch && method === 'PUT') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const appId = appPermMatch[1];
    const { users: allowedUsers } = body;
    
    if (!Array.isArray(allowedUsers)) return { error: 'Invalid format' };
    
    const config = getDockerConfig();
    if (!config.appPermissions) config.appPermissions = {};
    config.appPermissions[appId] = allowedUsers;
    saveDockerConfig(config);
    
    return { ok: true, appId, users: allowedUsers };
  }
  
  // GET /api/docker/app-access/:appId — check if current user has access to app
  const appAccessMatch = url.match(/^\/api\/docker\/app-access\/([a-zA-Z0-9_-]+)$/);
  if (appAccessMatch && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const appId = appAccessMatch[1];
    const config = getDockerConfig();
    
    // Admin always has access
    if (session.role === 'admin') return { hasAccess: true, appId };
    
    // Check app-specific permissions
    const appPerms = config.appPermissions?.[appId] || [];
    const hasAccess = appPerms.includes(session.username);
    
    return { hasAccess, appId };
  }
  
  // GET /api/docker/app-folders/:appId — get folders accessible by an app
  const appFoldersMatch = url.match(/^\/api\/docker\/app-folders\/([a-zA-Z0-9_-]+)$/);
  if (appFoldersMatch && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const appId = appFoldersMatch[1];
    const shares = getShares();
    
    // Filter shares that have this app in their appPermissions
    const accessibleFolders = shares.filter(s => {
      const appPerms = s.appPermissions || [];
      return appPerms.includes(appId);
    }).map(s => ({
      name: s.name,
      displayName: s.displayName,
      path: s.path
    }));
    
    return { appId, folders: accessibleFolders };
  }
  
  // GET /api/permissions/matrix — get full permissions matrix (admin only)
  if (url === '/api/permissions/matrix' && method === 'GET') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const users = getUsers();
    const shares = getShares();
    const dockerConfig = getDockerConfig();
    
    // Get installed apps
    const installedApps = [];
    const containers = getRealContainers();
    containers.forEach(c => {
      installedApps.push({ id: c.name, name: c.name, type: 'container' });
    });
    
    // Check for stacks
    const stacksPath = path.join(dockerConfig.path || '/var/lib/docker', 'stacks');
    if (fs.existsSync(stacksPath)) {
      try {
        fs.readdirSync(stacksPath).forEach(s => {
          if (fs.existsSync(path.join(stacksPath, s, 'docker-compose.yml'))) {
            installedApps.push({ id: s, name: s, type: 'stack' });
          }
        });
      } catch {}
    }
    
    return {
      users: users.map(u => ({ 
        username: u.username, 
        role: u.role,
        dockerAccess: u.role === 'admin' || dockerConfig.permissions.includes(u.username)
      })),
      shares: shares.map(s => ({
        name: s.name,
        displayName: s.displayName,
        userPermissions: s.permissions || {},
        appPermissions: s.appPermissions || []
      })),
      apps: installedApps,
      dockerAdmins: dockerConfig.permissions || []
    };
  }
  
  // POST /api/hardware/install-driver — install/remove GPU driver (admin only)
  // POST /api/firewall/add-rule — add firewall rule (admin only)
  if (url === '/api/firewall/add-rule' && method === 'POST') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const { port, protocol, source, action } = body;
    if (!port || !protocol || !action) return { error: 'port, protocol, and action required' };
    
    // Validate
    const portNum = String(port);
    if (!/^\d+(-\d+)?$/.test(portNum)) return { error: 'Invalid port format' };
    if (!['tcp', 'udp', 'both'].includes(protocol)) return { error: 'protocol must be tcp, udp, or both' };
    if (!['allow', 'deny', 'limit'].includes(action)) return { error: 'action must be allow, deny, or limit' };
    
    const hasUfw = !!run('which ufw 2>/dev/null');
    
    if (hasUfw) {
      // Enable ufw if not active
      const status = run('ufw status 2>/dev/null');
      if (status && !status.includes('Status: active')) {
        run('echo "y" | ufw enable 2>/dev/null');
      }
      
      const proto = protocol === 'both' ? '' : `/${protocol}`;
      const src = source && source !== 'any' && source !== 'Any' ? ` from ${source}` : '';
      const cmd = `ufw ${action} ${portNum}${proto}${src}`;
      const result = run(`${cmd} 2>&1`);
      return { ok: true, command: cmd, result: result || 'Rule added' };
    } else {
      // Fallback to iptables
      const act = action === 'allow' ? 'ACCEPT' : action === 'deny' ? 'DROP' : 'REJECT';
      const protos = protocol === 'both' ? ['tcp', 'udp'] : [protocol];
      const results = [];
      for (const p of protos) {
        const src = source && source !== 'any' && source !== 'Any' ? `-s ${source}` : '';
        const cmd = `iptables -A INPUT -p ${p} --dport ${portNum} ${src} -j ${act}`;
        results.push(run(`${cmd} 2>&1`) || 'Rule added');
      }
      return { ok: true, results };
    }
  }

  // POST /api/firewall/remove-rule — remove firewall rule (admin only)
  if (url === '/api/firewall/remove-rule' && method === 'POST') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const { ruleNum } = body;
    if (!ruleNum) return { error: 'ruleNum required' };
    
    const hasUfw = !!run('which ufw 2>/dev/null');
    const ufwActive = hasUfw && (run('ufw status 2>/dev/null') || '').includes('Status: active');
    
    if (ufwActive) {
      const result = run(`echo "y" | ufw delete ${ruleNum} 2>&1`);
      return { ok: true, result: result || 'Rule removed' };
    } else {
      const result = run(`iptables -D INPUT ${ruleNum} 2>&1`);
      return { ok: true, result: result || 'Rule removed' };
    }
  }

  // POST /api/firewall/toggle — enable/disable firewall (admin only)
  if (url === '/api/firewall/toggle' && method === 'POST') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const { enable } = body;
    const hasUfw = !!run('which ufw 2>/dev/null');
    
    if (hasUfw) {
      const cmd = enable ? 'echo "y" | ufw enable' : 'ufw disable';
      const result = run(`${cmd} 2>&1`);
      return { ok: true, result: result || (enable ? 'Firewall enabled' : 'Firewall disabled') };
    }
    return { error: 'ufw not installed. Install with: apt install ufw' };
  }

  // POST /api/hardware/install-driver — install/remove GPU driver (admin only)
  // Body: { package: "nvidia-driver-550", action: "install" | "remove" }
  if (url === '/api/hardware/install-driver' && method === 'POST') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const { package: pkg, action } = body;
    if (!pkg || !action) return { error: 'package and action required' };
    
    // Validate package name (only allow driver packages)
    if (!/^(nvidia-driver-\d+|nvidia-driver-\d+-server|nvidia-driver-\d+-open|xserver-xorg-video-\w+|mesa-\w+|linux-modules-nvidia-\S+)$/.test(pkg)) {
      return { error: 'Invalid driver package name' };
    }
    
    if (action !== 'install' && action !== 'remove') {
      return { error: 'action must be install or remove' };
    }
    
    const cmd = action === 'install'
      ? `apt-get install -y ${pkg}`
      : `apt-get remove -y ${pkg}`;
    
    // Run in background — return immediately
    const { exec } = require('child_process');
    const logFile = `/tmp/nimbus-driver-${Date.now()}.log`;
    exec(`${cmd} > ${logFile} 2>&1`, { timeout: 300000 }, (err) => {
      if (err) {
        fs.appendFileSync(logFile, `\nERROR: ${err.message}\n`);
      } else {
        fs.appendFileSync(logFile, `\nSUCCESS: ${action} ${pkg} completed\n`);
      }
    });
    
    return { ok: true, message: `${action} ${pkg} started`, logFile };
  }

  // GET /api/hardware/driver-log/:file — read driver install log
  if (url.startsWith('/api/hardware/driver-log/') && method === 'GET') {
    const logFile = '/tmp/' + url.split('/').pop();
    if (!logFile.startsWith('/tmp/nimbus-driver-')) return { error: 'Invalid log file' };
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const done = content.includes('SUCCESS:') || content.includes('ERROR:');
      const success = content.includes('SUCCESS:');
      return { content, done, success };
    } catch { return { content: 'Waiting...', done: false, success: false }; }
  }

  // POST /api/docker/install — install Docker and configure data path on a pool (admin only)
  if (url === '/api/docker/install' && method === 'POST') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const { path: dockerPath, permissions, pool: poolName } = body;
    
    // Require a pool
    const storageConf = getStorageConfig();
    if (!storageConf.pools || storageConf.pools.length === 0) {
      return { error: 'No storage pools available. Create a pool in Storage Manager first.' };
    }
    
    // Determine which pool to use
    const targetPool = poolName
      ? storageConf.pools.find(p => p.name === poolName)
      : storageConf.pools.find(p => p.name === storageConf.primaryPool) || storageConf.pools[0];
    
    if (!targetPool) {
      return { error: 'Selected pool not found.' };
    }
    
    // Determine full path
    let fullPath;
    if (dockerPath && dockerPath.startsWith('/')) {
      fullPath = dockerPath;
    } else {
      fullPath = path.join(targetPool.mountPoint, 'docker');
    }
    
    const containersPath = path.join(fullPath, 'containers');
    const volumesPath = path.join(fullPath, 'volumes');
    const stacksPath = path.join(fullPath, 'stacks');
    
    // Check if parent directory exists
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      return { 
        error: 'Parent directory does not exist', 
        detail: `Cannot create ${fullPath} because ${parentDir} does not exist.`
      };
    }
    
    // Create directories
    try {
      fs.mkdirSync(containersPath, { recursive: true });
      fs.mkdirSync(volumesPath, { recursive: true });
      fs.mkdirSync(stacksPath, { recursive: true });
    } catch (err) {
      return { error: 'Error creando directorios', detail: err.message };
    }
    
    // Check if Docker is available — install if not
    let dockerAvailable = isDockerInstalled();
    
    if (!dockerAvailable) {
      try {
        console.log('[Docker] Installing Docker engine...');
        execSync('curl -fsSL https://get.docker.com | sh', { timeout: 300000, stdio: 'pipe' });
        execSync(`usermod -aG docker ${session.username} 2>/dev/null || true`, { timeout: 5000 });
        // Add nimbus user too
        execSync('usermod -aG docker nimbus 2>/dev/null || true', { timeout: 5000 });
        dockerAvailable = true;
        console.log('[Docker] Engine installed successfully');
      } catch (err) {
        return { error: 'Docker installation failed', detail: err.stderr || err.message };
      }
    }
    
    // Configure Docker daemon to use pool as data-root
    if (dockerAvailable) {
      const daemonJsonPath = '/etc/docker/daemon.json';
      let daemonConfig = {};
      try {
        if (fs.existsSync(daemonJsonPath)) {
          daemonConfig = JSON.parse(fs.readFileSync(daemonJsonPath, 'utf-8'));
        }
      } catch {}
      
      const dockerDataPath = path.join(fullPath, 'data');
      daemonConfig['data-root'] = dockerDataPath;
      
      try {
        fs.mkdirSync('/etc/docker', { recursive: true });
        fs.mkdirSync(dockerDataPath, { recursive: true });
        fs.writeFileSync(daemonJsonPath, JSON.stringify(daemonConfig, null, 2));
        execSync('systemctl enable docker', { timeout: 10000 });
        execSync('systemctl restart docker', { timeout: 30000 });
        console.log('[Docker] daemon.json configured with data-root:', dockerDataPath);
      } catch (err) {
        console.error('[Docker] Failed to configure daemon.json:', err.message);
      }
    }
    
    // Update config
    const config = getDockerConfig();
    config.installed = true; // Config is done
    config.dockerAvailable = dockerAvailable; // Docker engine status
    config.path = fullPath;
    config.permissions = permissions || [];
    config.installedAt = new Date().toISOString();
    saveDockerConfig(config);
    
    // Create shared folder for docker
    const shares = getShares();
    if (!shares.find(s => s.name === 'docker')) {
      shares.push({
        name: 'docker',
        displayName: 'Docker',
        description: 'Docker containers and data',
        path: fullPath,
        volume: targetPool ? targetPool.name : 'system',
        pool: targetPool ? targetPool.name : null,
        created: new Date().toISOString(),
        createdBy: session.username,
        recycleBin: false,
        permissions: { [session.username]: 'rw' },
        appPermissions: []
      });
      saveShares(shares);
    }
    
    console.log('[Docker] Configured. Path:', fullPath, 'Docker available:', dockerAvailable);
    
    return { 
      ok: true, 
      path: fullPath, 
      dockerAvailable,
      message: dockerAvailable ? 'Docker configurado correctamente' : 'Configurado. Docker no detectado en el sistema.'
    };
  }
  
  // POST /api/docker/uninstall — fully uninstall Docker (admin only)
  if (url === '/api/docker/uninstall' && method === 'POST') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    try {
      // 1. Stop all containers
      run('docker stop $(docker ps -aq) 2>/dev/null || true');
      run('docker rm $(docker ps -aq) 2>/dev/null || true');
      
      // 2. Stop Docker
      run('systemctl stop docker 2>/dev/null || true');
      run('systemctl stop docker.socket 2>/dev/null || true');
      run('systemctl disable docker 2>/dev/null || true');
      
      // 3. Remove Docker packages
      execSync('apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || true', { timeout: 60000, stdio: 'pipe' });
      execSync('apt-get autoremove -y 2>/dev/null || true', { timeout: 30000, stdio: 'pipe' });
      
      // 4. Remove daemon.json
      run('rm -f /etc/docker/daemon.json 2>/dev/null || true');
      
      // 5. Reset NimbusOS docker config
      const config = getDockerConfig();
      config.installed = false;
      config.dockerAvailable = false;
      config.path = null;
      config.permissions = [];
      config.installedAt = null;
      saveDockerConfig(config);
      
      // 6. Remove docker share
      const shares = getShares().filter(s => s.name !== 'docker');
      saveShares(shares);
      
      console.log('[Docker] Fully uninstalled');
      return { ok: true };
    } catch (err) {
      return { error: 'Uninstall failed', detail: err.message };
    }
  }
  
  // DELETE /api/docker/uninstall — alias for backwards compat
  if (url === '/api/docker/uninstall' && method === 'DELETE') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    const config = getDockerConfig();
    config.installed = false;
    config.path = null;
    config.permissions = [];
    config.installedAt = null;
    saveDockerConfig(config);
    return { ok: true };
  }
  
  // POST /api/docker/container — create/run a real container
  if (url === '/api/docker/container' && method === 'POST') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    if (!isDockerInstalled()) return { error: 'Docker not installed' };
    
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    if (!hasPermission) return { error: 'No permission to manage Docker', code: 'NO_PERMISSION' };
    
    const { id, name, image, ports, volumes, env, mediaPath } = body;
    if (!id || !name || !image) return { error: 'Missing container info' };
    
    // SECURITY: Sanitize all inputs
    const safeId = sanitizeDockerName(id);
    const safeName = sanitizeDockerName(name);
    const safeImage = sanitizeDockerName(image);
    
    if (!safeId || !safeName || !safeImage) {
      return { error: 'Invalid container name or image (special characters not allowed)' };
    }
    
    // Build docker run command with sanitized values
    let cmd = `docker run -d --name ${safeId} --restart unless-stopped`;
    
    // Add port mappings (validate ports)
    if (ports) {
      for (const [host, container] of Object.entries(ports)) {
        if (!isValidPort(host) || !isValidPort(container)) {
          return { error: `Invalid port mapping: ${host}:${container}` };
        }
        cmd += ` -p ${parseInt(host)}:${parseInt(container)}`;
      }
    }
    
    // Add config volume for container data
    const containerDataPath = path.join(config.path || '/var/lib/docker', 'containers', safeId);
    
    // Prevent path traversal
    if (containerDataPath.includes('..')) {
      return { error: 'Invalid container path' };
    }
    
    fs.mkdirSync(containerDataPath, { recursive: true });
    cmd += ` -v ${containerDataPath}:/config`;
    
    // ═══════════════════════════════════════════════════════════
    // CRITICAL: Mount ONLY shared folders that have this app in appPermissions
    // ═══════════════════════════════════════════════════════════
    const shares = getShares();
    const allowedShares = shares.filter(s => {
      const appPerms = s.appPermissions || [];
      return appPerms.includes(safeId);
    });
    
    // Mount allowed shares to /media/{shareName}
    for (const share of allowedShares) {
      const sharePath = share.path;
      const mountPoint = `/media/${share.name}`;
      
      // Validate path
      if (!sharePath || sharePath.includes('..')) continue;
      if (!fs.existsSync(sharePath)) continue;
      
      // Mount as read-only for safety (apps shouldn't modify media by default)
      // Apps that need write access can be configured differently
      cmd += ` -v "${sharePath}":"${mountPoint}":ro`;
      
      console.log(`[Docker] Mounting share "${share.name}" -> ${mountPoint} (ro)`);
    }
    
    // Also mount custom media path if specified (legacy support)
    if (mediaPath && typeof mediaPath === 'string') {
      const safePath = mediaPath.replace(/\.\./g, '');
      if (fs.existsSync(safePath)) {
        cmd += ` -v "${safePath}":/media:ro`;
      }
    }
    
    // Legacy volumes (from app catalog)
    if (volumes) {
      for (const [host, container] of Object.entries(volumes)) {
        // Sanitize volume paths
        const hostPath = host.replace('{DOCKER_PATH}', config.path || '/var/lib/docker');
        if (hostPath.includes('..') || container.includes('..')) {
          return { error: 'Invalid volume path' };
        }
        // Only allow alphanumeric and path chars
        if (!/^[a-zA-Z0-9_.\-\/]+$/.test(hostPath) || !/^[a-zA-Z0-9_.\-\/]+$/.test(container)) {
          return { error: 'Invalid characters in volume path' };
        }
        cmd += ` -v ${hostPath}:${container}`;
      }
    }
    
    // Add environment variables (SANITIZED)
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        if (value && !value.includes('{')) {
          // Only allow safe characters in env key and value
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
            return { error: `Invalid environment variable name: ${key}` };
          }
          // Escape value for shell (remove dangerous chars)
          const safeValue = String(value).replace(/[`$\\;"'|&<>]/g, '');
          if (safeValue.length > 1000) {
            return { error: `Environment value too long: ${key}` };
          }
          cmd += ` -e ${key}="${safeValue}"`;
        }
      }
    }
    
    // Add image (use sanitized)
    cmd += ` ${safeImage}`;
    
    console.log('[Docker] Running:', cmd);
    console.log(`[Docker] App "${safeId}" has access to ${allowedShares.length} shared folders`);
    
    try {
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
      const containerId = output.trim();
      
      // Register app in installed-apps registry
      const appPort = ports ? Object.keys(ports)[0] : null;
      registerApp({
        id: safeId,
        name: safeName,
        icon: body.icon || '📦',
        port: appPort ? parseInt(appPort) : null,
        image: safeImage,
        type: 'container',
        color: body.color || '#607D8B',
        installedBy: session.username
      });
      
      console.log(`[Docker] App "${safeId}" registered in launcher`);
      
      return { 
        ok: true, 
        containerId,
        container: { id: safeId, name: safeName, image: safeImage, status: 'running' },
        mountedShares: allowedShares.map(s => s.name)
      };
    } catch (err) {
      console.error('[Docker] Container creation failed:', err.message);
      return { error: 'Failed to create container', detail: err.stderr || err.message };
    }
  }
  
  // POST /api/docker/stack — deploy a docker-compose stack
  if (url === '/api/docker/stack' && method === 'POST') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    if (!isDockerInstalled()) return { error: 'Docker not installed' };
    
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    if (!hasPermission) return { error: 'No permission to manage Docker', code: 'NO_PERMISSION' };
    
    const { id, name, compose, env } = body;
    if (!id || !name || !compose) return { error: 'Missing stack info' };
    
    console.log('[Docker] Received compose for', id, '- length:', compose?.length || 0);
    
    // SECURITY: Sanitize ID
    const safeId = sanitizeDockerName(id);
    if (!safeId) return { error: 'Invalid stack ID' };
    
    // Create stack directory
    const stackPath = path.join(config.path || '/var/lib/docker', 'stacks', safeId);
    
    if (stackPath.includes('..')) {
      return { error: 'Invalid stack path' };
    }
    
    // ═══════════════════════════════════════════════════════════
    // Get allowed shared folders for this app
    // ═══════════════════════════════════════════════════════════
    const shares = getShares();
    const allowedShares = shares.filter(s => {
      const appPerms = s.appPermissions || [];
      return appPerms.includes(safeId);
    });
    
    try {
      fs.mkdirSync(stackPath, { recursive: true });
      
      // Create media directories symlinks or mount info
      const mediaPath = path.join(stackPath, 'media');
      fs.mkdirSync(mediaPath, { recursive: true });
      
      // Write a media-mounts.txt for reference
      const mountsInfo = allowedShares.map(s => `${s.name}: ${s.path}`).join('\n');
      fs.writeFileSync(path.join(stackPath, 'media-mounts.txt'), mountsInfo || 'No shares assigned');
      
      // Modify compose to add volume mounts for allowed shares
      let modifiedCompose = compose;
      
      // For stacks like Immich, inject media volumes into the main service
      if (allowedShares.length > 0) {
        // Build additional volumes section
        const additionalVolumes = allowedShares.map(s => 
          `      - "${s.path}:/media/${s.name}:ro"`
        ).join('\n');
        
        // Try to inject after the existing volumes in the main service
        // This is a simple approach - works for most compose files
        const volumeMarker = '      - /etc/localtime:/etc/localtime:ro';
        if (modifiedCompose.includes(volumeMarker)) {
          modifiedCompose = modifiedCompose.replace(
            volumeMarker,
            `${volumeMarker}\n${additionalVolumes}`
          );
        }
      }
      
      // Write docker-compose.yml
      const composePath = path.join(stackPath, 'docker-compose.yml');
      fs.writeFileSync(composePath, modifiedCompose);
      
      // Write .env file if provided
      const envPath = path.join(stackPath, '.env');
      if (env && typeof env === 'object') {
        // Check if .env already exists (reinstall case)
        let existingEnv = {};
        if (fs.existsSync(envPath)) {
          try {
            const existingContent = fs.readFileSync(envPath, 'utf-8');
            existingContent.split('\n').forEach(line => {
              const [key, ...valueParts] = line.split('=');
              if (key && valueParts.length > 0) {
                existingEnv[key.trim()] = valueParts.join('=').trim();
              }
            });
            console.log('[Docker] Found existing .env, preserving DB passwords');
          } catch (e) {
            console.log('[Docker] Could not read existing .env:', e.message);
          }
        }
        
        // Add media paths to env
        const mediaEnv = {};
        allowedShares.forEach((s, i) => {
          mediaEnv[`MEDIA_PATH_${i + 1}`] = s.path;
          mediaEnv[`MEDIA_NAME_${i + 1}`] = s.name;
        });
        
        // Merge: existing values take priority for DB_* and POSTGRES_* keys
        const allEnv = { ...env, ...mediaEnv };
        for (const [key, value] of Object.entries(existingEnv)) {
          // Preserve existing DB passwords to avoid breaking reinstalls
          if (key.startsWith('DB_') || key.startsWith('POSTGRES_')) {
            allEnv[key] = value;
          }
        }
        
        const envContent = Object.entries(allEnv)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n');
        fs.writeFileSync(envPath, envContent);
      }
      
      // ═══════════════════════════════════════════════════════════
      // Create initial config files for specific apps
      // ═══════════════════════════════════════════════════════════
      if (safeId === 'homeassistant') {
        // Home Assistant needs configuration to allow iframes
        const haConfigDir = path.join(stackPath, 'config');
        fs.mkdirSync(haConfigDir, { recursive: true });
        const haConfig = `# Home Assistant Configuration
# Auto-generated by NimbusOS

homeassistant:
  name: Home
  unit_system: metric

http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - 172.16.0.0/12
    - 192.168.0.0/16
    - 10.0.0.0/8
    - ::1

# Enable frontend
frontend:

# Enable config UI
config:

# Discover some devices automatically
discovery:

# Track the sun
sun:

# Text to speech
tts:
  - platform: google_translate
`;
        fs.writeFileSync(path.join(haConfigDir, 'configuration.yaml'), haConfig);
        console.log('[Docker] Created Home Assistant initial configuration');
      }
      
      // Run docker-compose up
      console.log('[Docker] Deploying stack:', safeId);
      console.log(`[Docker] Stack "${safeId}" has access to ${allowedShares.length} shared folders`);
      
      execSync(`docker compose -f "${composePath}" up -d`, { 
        cwd: stackPath,
        encoding: 'utf-8', 
        timeout: 300000 // 5 min for pulling images
      });
      
      // Register stack in installed-apps registry
      registerApp({
        id: safeId,
        name: body.name || safeId,
        icon: body.icon || '📦',
        port: body.port || null,
        image: 'stack',
        type: 'stack',
        color: body.color || '#607D8B',
        external: body.external || false,
        installedBy: session.username
      });
      
      console.log(`[Docker] Stack "${safeId}" registered in launcher`);
      
      return { 
        ok: true, 
        stack: safeId, 
        path: stackPath,
        mountedShares: allowedShares.map(s => s.name)
      };
      
    } catch (err) {
      console.error('[Docker] Stack deployment failed:', err.message);
      return { error: 'Failed to deploy stack', detail: err.stderr || err.message };
    }
  }
  
  // DELETE /api/docker/stack/:id — remove a stack
  const stackMatch = url.match(/^\/api\/docker\/stack\/([a-zA-Z0-9_-]+)$/);
  if (stackMatch && method === 'DELETE') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    if (!hasPermission) return { error: 'No permission', code: 'NO_PERMISSION' };
    
    const safeId = sanitizeDockerName(stackMatch[1]);
    if (!safeId) return { error: 'Invalid stack ID' };
    
    const basePath = config.path || '/var/lib/docker';
    const stackPath = path.join(basePath, 'stacks', safeId);
    const containerPath = path.join(basePath, 'containers', safeId);
    const composePath = path.join(stackPath, 'docker-compose.yml');
    
    // Unregister from installed apps FIRST (instant, so UI updates immediately)
    unregisterApp(safeId);
    
    // Run docker compose down in background (non-blocking)
    const cleanup = () => {
      if (fs.existsSync(composePath)) {
        exec(`docker compose -f "${composePath}" down -v --remove-orphans`, { 
          cwd: stackPath,
          timeout: 120000 
        }, (err) => {
          if (err) console.error(`[Docker] compose down error for "${safeId}":`, err.message);
          else console.log(`[Docker] Stack "${safeId}" containers stopped`);
          
          // Clean up directories after compose down finishes
          try {
            if (fs.existsSync(stackPath)) fs.rmSync(stackPath, { recursive: true, force: true });
          } catch (e) { console.error(`[Docker] Could not remove stack dir "${safeId}":`, e.message); }
          
          try {
            if (fs.existsSync(containerPath)) fs.rmSync(containerPath, { recursive: true, force: true });
          } catch (e) { console.error(`[Docker] Could not remove container dir "${safeId}":`, e.message); }
          
          console.log(`[Docker] Stack "${safeId}" cleanup complete`);
        });
      } else {
        // No compose file, just clean dirs
        try {
          if (fs.existsSync(stackPath)) fs.rmSync(stackPath, { recursive: true, force: true });
        } catch (e) { console.error(`[Docker] Could not remove stack dir "${safeId}":`, e.message); }
        try {
          if (fs.existsSync(containerPath)) fs.rmSync(containerPath, { recursive: true, force: true });
        } catch (e) { console.error(`[Docker] Could not remove container dir "${safeId}":`, e.message); }
        console.log(`[Docker] Stack "${safeId}" cleanup complete (no compose)`);
      }
    };
    
    // Launch cleanup async
    cleanup();
    
    console.log(`[Docker] Stack "${safeId}" unregistered, cleanup running in background`);
    return { ok: true };
  }
  
  // GET /api/docker/containers — list real containers
  if (url === '/api/docker/containers' && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    if (!isDockerInstalled()) return { installed: false, containers: [] };
    
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    if (!hasPermission) return { error: 'No permission to manage Docker', code: 'NO_PERMISSION' };
    
    return { installed: true, containers: getRealContainers() };
  }
  
  // GET /api/docker/installed-apps — list installed apps with their ports (for launcher)
  if (url === '/api/docker/installed-apps' && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    if (!isDockerInstalled()) return { apps: [] };
    
    try {
      // Get registered apps from our registry
      const registeredApps = getInstalledApps();
      
      // Get running containers
      const output = execSync(
        `docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}|{{.Status}}'`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      
      const runningContainers = {};
      output.trim().split('\n').filter(Boolean).forEach(line => {
        const [name, image, ports, status] = line.split('|');
        let port = null;
        if (ports) {
          const portMatch = ports.match(/0\.0\.0\.0:(\d+)/);
          if (portMatch) port = parseInt(portMatch[1]);
        }
        runningContainers[name] = { image, port, status: status.includes('Up') ? 'running' : 'stopped' };
      });
      
      const apps = [];
      const addedIds = new Set();
      
      // First: Add ALL registered apps (these are our source of truth)
      registeredApps.forEach(reg => {
        const isStack = reg.type === 'stack';
        
        // Try to find running container for status
        let containerStatus = 'unknown';
        if (isStack) {
          // For stacks, check various possible container names
          const possibleNames = [
            `${reg.id}_server`,
            `${reg.id}-server`,
            `${reg.id}_app`,
            `${reg.id}-app`,
            reg.id
          ];
          for (const name of possibleNames) {
            if (runningContainers[name]) {
              containerStatus = runningContainers[name].status;
              break;
            }
          }
          // If no container found, check if any container starts with the stack id
          if (containerStatus === 'unknown') {
            for (const [name, container] of Object.entries(runningContainers)) {
              if (name.startsWith(reg.id + '_') || name.startsWith(reg.id + '-')) {
                containerStatus = container.status;
                break;
              }
            }
          }
        } else {
          const container = runningContainers[reg.id];
          if (container) containerStatus = container.status;
        }
        
        apps.push({
          id: reg.id,
          name: reg.name,
          icon: reg.icon || '📦',
          color: reg.color || '#78706A',
          port: reg.port,
          image: reg.image,
          status: containerStatus,
          category: 'installed',
          isStack,
          external: reg.external || false
        });
        addedIds.add(reg.id);
      });
      
      // Second: Add unregistered containers with ports (fallback)
      Object.entries(runningContainers).forEach(([name, container]) => {
        if (addedIds.has(name) || !container.port) return;
        // Skip stack sub-containers (redis, postgres, etc)
        if (name.includes('_redis') || name.includes('_postgres') || name.includes('_ml')) return;
        // Skip containers that belong to a registered stack (e.g. immich_server belongs to immich)
        let belongsToStack = false;
        for (const id of addedIds) {
          if (name.startsWith(id + '_') || name.startsWith(id + '-')) {
            belongsToStack = true;
            break;
          }
        }
        if (belongsToStack) return;
        
        const appMeta = getAppMetaFromImage(container.image, name);
        apps.push({
          id: name,
          name: appMeta.displayName || name,
          icon: appMeta.icon || '📦',
          color: appMeta.color || '#78706A',
          port: container.port,
          image: container.image,
          status: container.status,
          category: 'installed'
        });
      });
      
      return { apps };
      
    } catch (err) {
      return { apps: [], error: err.message };
    }
  }
  
  // GET /api/docker/container/:id/mounts — get mounted volumes of a container
  const mountsMatch = url.match(/^\/api\/docker\/container\/([a-zA-Z0-9_-]+)\/mounts$/);
  if (mountsMatch && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    if (!hasPermission) return { error: 'No permission', code: 'NO_PERMISSION' };
    
    const containerId = sanitizeDockerName(mountsMatch[1]);
    if (!containerId) return { error: 'Invalid container ID' };
    
    try {
      // Get container mounts using docker inspect
      const output = execSync(
        `docker inspect ${containerId} --format '{{range .Mounts}}{{.Source}}|{{.Destination}}|{{.Mode}}{{println}}{{end}}'`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      
      const mounts = output.trim().split('\n').filter(Boolean).map(line => {
        const [source, destination, mode] = line.split('|');
        return { source, destination, mode: mode || 'rw' };
      });
      
      // Get allowed shares for this container
      const shares = getShares();
      const allowedShares = shares.filter(s => (s.appPermissions || []).includes(containerId));
      
      return { 
        containerId, 
        mounts,
        allowedShares: allowedShares.map(s => ({ name: s.name, path: s.path }))
      };
    } catch (err) {
      return { error: 'Failed to get mounts', detail: err.message };
    }
  }
  
  // POST /api/docker/container/:id/rebuild — recreate container with updated mounts
  const rebuildMatch = url.match(/^\/api\/docker\/container\/([a-zA-Z0-9_-]+)\/rebuild$/);
  if (rebuildMatch && method === 'POST') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    if (!hasPermission) return { error: 'No permission', code: 'NO_PERMISSION' };
    
    const containerId = sanitizeDockerName(rebuildMatch[1]);
    if (!containerId) return { error: 'Invalid container ID' };
    
    try {
      // Get current container info
      const inspectOutput = execSync(
        `docker inspect ${containerId} --format '{{.Config.Image}}|{{range $p, $conf := .NetworkSettings.Ports}}{{$p}}={{(index $conf 0).HostPort}},{{end}}'`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      
      const [image, portsStr] = inspectOutput.trim().split('|');
      
      // Parse ports
      const ports = {};
      if (portsStr) {
        portsStr.split(',').filter(Boolean).forEach(p => {
          const [containerPort, hostPort] = p.split('=');
          if (containerPort && hostPort) {
            const cp = containerPort.replace('/tcp', '').replace('/udp', '');
            ports[hostPort] = cp;
          }
        });
      }
      
      // Stop and remove old container
      try { execSync(`docker stop ${containerId}`, { timeout: 30000 }); } catch {}
      try { execSync(`docker rm ${containerId}`, { timeout: 10000 }); } catch {}
      
      // Get allowed shares
      const shares = getShares();
      const allowedShares = shares.filter(s => (s.appPermissions || []).includes(containerId));
      
      // Build new docker run command
      let cmd = `docker run -d --name ${containerId} --restart unless-stopped`;
      
      // Add ports
      for (const [host, container] of Object.entries(ports)) {
        cmd += ` -p ${host}:${container}`;
      }
      
      // Add config volume
      const containerDataPath = path.join(config.path || '/var/lib/docker', 'containers', containerId);
      cmd += ` -v ${containerDataPath}:/config`;
      
      // Add allowed shares
      for (const share of allowedShares) {
        cmd += ` -v "${share.path}":"/media/${share.name}":ro`;
      }
      
      // Add image
      cmd += ` ${image}`;
      
      console.log('[Docker] Rebuilding container:', cmd);
      
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
      
      return { 
        ok: true, 
        containerId,
        mountedShares: allowedShares.map(s => s.name)
      };
      
    } catch (err) {
      return { error: 'Failed to rebuild container', detail: err.message };
    }
  }
  
  // POST /api/docker/container/:id/:action — start/stop/restart container
  const actionMatch = url.match(/^\/api\/docker\/container\/([a-zA-Z0-9_-]+)\/(start|stop|restart)$/);
  if (actionMatch && method === 'POST') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    if (!hasPermission) return { error: 'No permission to manage Docker', code: 'NO_PERMISSION' };
    
    const [, rawContainerId, action] = actionMatch;
    
    // SECURITY: Sanitize container ID
    const containerId = sanitizeDockerName(rawContainerId);
    if (!containerId) {
      return { error: 'Invalid container ID' };
    }
    
    try {
      execSync(`docker ${action} ${containerId}`, { encoding: 'utf-8', timeout: 60000 });
      return { ok: true, action, containerId };
    } catch (err) {
      return { error: `Failed to ${action} container`, detail: err.message };
    }
  }
  
  // DELETE /api/docker/container/:id — remove container
  const containerMatch = url.match(/^\/api\/docker\/container\/([a-zA-Z0-9_-]+)$/);
  if (containerMatch && method === 'DELETE') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    if (!hasPermission) return { error: 'No permission to manage Docker', code: 'NO_PERMISSION' };
    
    const rawContainerId = containerMatch[1];
    
    // SECURITY: Sanitize container ID
    const containerId = sanitizeDockerName(rawContainerId);
    if (!containerId) {
      return { error: 'Invalid container ID' };
    }
    
    // Unregister immediately so UI updates fast
    unregisterApp(containerId);
    
    // Run stop + remove in background
    exec(`docker stop ${containerId} && docker rm ${containerId} || docker rm -f ${containerId}`, { 
      timeout: 60000 
    }, (err) => {
      if (err) console.error(`[Docker] Failed to remove container "${containerId}":`, err.message);
      else console.log(`[Docker] Container "${containerId}" removed`);
    });
    
    return { ok: true, containerId };
  }
  
  // GET /api/docker/pull/:image — pull an image
  const pullMatch = url.match(/^\/api\/docker\/pull\/(.+)$/);
  if (pullMatch && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const config = getDockerConfig();
    const hasPermission = session.role === 'admin' || config.permissions.includes(session.username);
    if (!hasPermission) return { error: 'No permission', code: 'NO_PERMISSION' };
    
    const rawImage = decodeURIComponent(pullMatch[1]);
    
    // SECURITY: Sanitize image name
    const image = sanitizeDockerName(rawImage);
    if (!image) {
      return { error: 'Invalid image name' };
    }
    
    try {
      console.log('[Docker] Pulling image:', image);
      execSync(`docker pull ${image}`, { stdio: 'inherit', timeout: 300000 });
      return { ok: true, image };
    } catch (err) {
      return { error: 'Failed to pull image', detail: err.message };
    }
  }
  
  return null;
}

// ═══════════════════════════════════
// Native Apps API
// ═══════════════════════════════════
// ═══════════════════════════════════
// SMB / Samba Service API
// ═══════════════════════════════════
const SMB_CONFIG_FILE = path.join(CONFIG_DIR, 'smb.json');

function getSmbConfig() {
  try {
    if (fs.existsSync(SMB_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(SMB_CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  // Defaults
  return {
    workgroup: 'WORKGROUP',
    serverString: 'NimbusOS NAS',
    minProtocol: 'SMB2',
    maxProtocol: 'SMB3',
    guestAccess: false,
    recycleBin: true,
    auditLog: false,
    maxConnections: 0,       // 0 = unlimited
    enableNetbios: true,
  };
}

function saveSmbConfig(config) {
  fs.writeFileSync(SMB_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getSmbStatus() {
  // smbd lives in /usr/sbin which may not be in Node's PATH
  // Use multiple detection methods
  const installed = !!(
    run('which smbd 2>/dev/null') ||
    run('test -x /usr/sbin/smbd && echo yes') ||
    run('dpkg -l samba 2>/dev/null | grep -q "^ii" && echo yes') ||
    run('systemctl list-unit-files smbd.service 2>/dev/null | grep -q smbd && echo yes')
  );
  const running = run('systemctl is-active smbd 2>/dev/null') === 'active';
  
  // Try to get connected clients
  let clients = [];
  const smbstatus = run('smbstatus --shares --json 2>/dev/null');
  if (smbstatus) {
    try {
      const parsed = JSON.parse(smbstatus);
      clients = (parsed.sessions || []).map(s => ({
        user: s.username || '?',
        machine: s.remote_machine || s.hostname || '?',
        ip: s.remote_address || '?',
        share: s.service || '?',
        connected: s.signing || '?',
      }));
    } catch {}
  }
  // Fallback: text smbstatus
  if (clients.length === 0) {
    const raw = run('smbstatus -b 2>/dev/null');
    if (raw) {
      const lines = raw.split('\n').filter(l => l.match(/^\d+/));
      clients = lines.map(l => {
        const parts = l.trim().split(/\s+/);
        return {
          pid: parts[0] || '',
          user: parts[1] || '?',
          group: parts[2] || '',
          machine: parts[3] || '?',
          ip: parts[4] ? parts[4].replace(/[()]/g, '') : '?',
        };
      });
    }
  }

  // Get lock info
  let lockedFiles = 0;
  const locks = run('smbstatus -L 2>/dev/null');
  if (locks) {
    lockedFiles = (locks.match(/^\d+/gm) || []).length;
  }

  return {
    installed,
    running,
    clients,
    clientCount: clients.length,
    lockedFiles,
    port: 445,
    version: run('smbd --version 2>/dev/null') || null,
  };
}

function fixSharePermissions(shares) {
  for (const share of shares) {
    if (!share.path || !fs.existsSync(share.path)) continue;
    // Get first rw user as owner, fallback to 'nobody'
    const perms = share.permissions || {};
    const rwUsers = Object.entries(perms).filter(([, v]) => v === 'rw').map(([k]) => k);
    const owner = rwUsers[0] || 'nobody';
    // Ensure owner exists in Linux
    if (owner !== 'nobody') ensureLinuxUser(owner);
    // Set ownership recursively: owner:nimbus with setgid
    run(`sudo chown -R ${owner}:nimbus "${share.path}" 2>/dev/null`);
    run(`sudo chmod -R 2775 "${share.path}" 2>/dev/null`);
  }
}

function generateSmbConf(config, shares) {
  const lines = [
    '# Generated by NimbusOS — do not edit manually',
    `# Last updated: ${new Date().toISOString()}`,
    '',
    '[global]',
    `   workgroup = ${config.workgroup}`,
    `   server string = ${config.serverString}`,
    `   server min protocol = ${config.minProtocol}`,
    `   server max protocol = ${config.maxProtocol}`,
    '   security = user',
    `   map to guest = ${config.guestAccess ? 'Bad User' : 'Never'}`,
    '   dns proxy = no',
    '   log file = /var/log/samba/log.%m',
    '   max log size = 1000',
    '   logging = file',
    `   disable netbios = ${config.enableNetbios ? 'no' : 'yes'}`,
    `   max connections = ${config.maxConnections}`,
    '',
  ];

  if (config.recycleBin) {
    lines.push('   # Recycle bin (global defaults)');
    lines.push('   vfs objects = recycle');
    lines.push('   recycle:repository = .recycle/%U');
    lines.push('   recycle:keeptree = yes');
    lines.push('   recycle:versions = yes');
    lines.push('');
  }

  // Generate share sections from NimbusOS shares
  for (const share of shares) {
    const smbEnabled = share.smb !== false; // opt-out model
    if (!smbEnabled) continue;

    // Build valid users list
    const perms = share.permissions || {};
    const rwUsers = Object.entries(perms).filter(([, v]) => v === 'rw').map(([k]) => k);
    const roUsers = Object.entries(perms).filter(([, v]) => v === 'ro').map(([k]) => k);
    const allUsers = [...rwUsers, ...roUsers];

    lines.push(`[${share.displayName || share.name}]`);
    lines.push(`   comment = ${share.description || share.displayName || share.name}`);
    lines.push(`   path = ${share.path}`);
    lines.push(`   browseable = yes`);
    lines.push(`   read only = ${rwUsers.length === 0 ? 'yes' : 'no'}`);
    if (allUsers.length > 0) {
      lines.push(`   valid users = ${allUsers.join(' ')}`);
    }
    if (rwUsers.length > 0) {
      lines.push(`   write list = ${rwUsers.join(' ')}`);
    }
    if (config.guestAccess) {
      lines.push('   guest ok = yes');
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════
// SSH API
// ═══════════════════════════════════
// ═══════════════════════════════════
// DDNS API
// ═══════════════════════════════════
const DDNS_CONFIG_FILE = path.join(CONFIG_DIR, 'ddns.json');
const DDNS_LOG_FILE = path.join(CONFIG_DIR, 'ddns.log');

function getDdnsConfig() {
  try { if (fs.existsSync(DDNS_CONFIG_FILE)) return JSON.parse(fs.readFileSync(DDNS_CONFIG_FILE, 'utf-8')); } catch {}
  return { enabled: false, provider: '', domain: '', token: '', username: '', interval: 5 };
}
function saveDdnsConfig(cfg) { fs.writeFileSync(DDNS_CONFIG_FILE, JSON.stringify(cfg, null, 2)); }

function ddnsUpdate(cfg) {
  let url = '';
  const headers = {};
  const token = (cfg.token || '').trim();
  const domain = (cfg.domain || '').trim();
  if (cfg.provider === 'duckdns') {
    const subdomain = domain.replace('.duckdns.org', '');
    url = `https://www.duckdns.org/update?domains=${subdomain}&token=${token}&ip=`;
  } else if (cfg.provider === 'noip') {
    url = `https://dynupdate.no-ip.com/nic/update?hostname=${domain}`;
    headers['Authorization'] = 'Basic ' + Buffer.from(`${(cfg.username||'').trim()}:${token}`).toString('base64');
  } else if (cfg.provider === 'dynu') {
    url = `https://api.dynu.com/nic/update?hostname=${domain}&password=${token}`;
  } else if (cfg.provider === 'cloudflare') {
    // Cloudflare needs zone + record IDs, simplified: just log
    return { ok: false, error: 'Cloudflare requires zone/record setup — use API token in CLI' };
  } else if (cfg.provider === 'freedns') {
    url = `https://freedns.afraid.org/dynamic/update.php?${token}`;
  } else {
    return { ok: false, error: 'Unknown provider' };
  }

  try {
    const curlCmd = headers.Authorization
      ? `curl -fsSL -H "Authorization: ${headers.Authorization}" "${url}" 2>&1`
      : `curl -fsSL "${url}" 2>&1`;
    const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 15000 });
    const logEntry = `[${new Date().toISOString()}] ${cfg.provider}: ${result.trim()}\n`;
    fs.appendFileSync(DDNS_LOG_FILE, logEntry);
    return { ok: true, response: result.trim() };
  } catch (err) {
    const logEntry = `[${new Date().toISOString()}] ${cfg.provider}: ERROR ${err.message}\n`;
    fs.appendFileSync(DDNS_LOG_FILE, logEntry);
    return { ok: false, error: err.message };
  }
}

function setupDdnsCron(cfg) {
  // Remove existing nimbusos ddns cron
  run('crontab -l 2>/dev/null | grep -v "nimbusos-ddns" | crontab - 2>/dev/null');
  if (!cfg.enabled) return;
  // Write update script
  const script = `#!/bin/bash\n# nimbusos-ddns\nnode -e "require('${path.join(INSTALL_DIR, 'server', 'index.cjs')}').ddnsUpdate && process.exit()" 2>/dev/null || curl -fsSL "${cfg.provider === 'duckdns' ? `https://www.duckdns.org/update?domains=${(cfg.domain||'').trim().replace('.duckdns.org','')}&token=${(cfg.token||'').trim()}&ip=` : ''}" > /dev/null 2>&1\n`;
  const scriptPath = path.join(CONFIG_DIR, 'ddns-update.sh');
  fs.writeFileSync(scriptPath, script);
  run(`chmod +x "${scriptPath}"`);
  // Add cron
  const cronLine = `*/${cfg.interval} * * * * ${scriptPath} # nimbusos-ddns`;
  run(`(crontab -l 2>/dev/null; echo "${cronLine}") | crontab - 2>/dev/null`);
}

function handleDdns(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  if (url === '/api/ddns/status' && method === 'GET') {
    const config = getDdnsConfig();
    const externalIp = run('curl -fsSL https://api.ipify.org 2>/dev/null') || run('curl -fsSL https://ifconfig.me 2>/dev/null') || '—';
    let lastLog = '';
    try {
      if (fs.existsSync(DDNS_LOG_FILE)) {
        const lines = fs.readFileSync(DDNS_LOG_FILE, 'utf-8').trim().split('\n');
        lastLog = lines[lines.length - 1] || '';
      }
    } catch {}
    return { config, externalIp: externalIp.trim(), lastLog };
  }

  if (url === '/api/ddns/config' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    saveDdnsConfig(body);
    setupDdnsCron(body);
    return { ok: true };
  }

  if (url === '/api/ddns/test' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const cfg = body.provider ? body : getDdnsConfig();
    return ddnsUpdate(cfg);
  }

  if (url === '/api/ddns/logs' && method === 'GET') {
    try {
      if (fs.existsSync(DDNS_LOG_FILE)) {
        const log = fs.readFileSync(DDNS_LOG_FILE, 'utf-8');
        return { log };
      }
    } catch {}
    return { log: '' };
  }

  return null;
}

// ═══════════════════════════════════
// Web Portal (port config) API
// ═══════════════════════════════════
function handlePortal(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  if (url === '/api/portal/status' && method === 'GET') {
    const currentPort = PORT;
    const httpsEnabled = !!process.env.NIMBUS_HTTPS;
    const httpsPort = process.env.NIMBUS_HTTPS_PORT || '5001';
    return { httpPort: currentPort, httpsEnabled, httpsPort };
  }

  if (url === '/api/portal/config' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { httpPort, httpsPort } = body;
    
    // Validate ports
    const hp = parseInt(httpPort);
    const hsp = parseInt(httpsPort);
    if (hp && (hp < 1 || hp > 65535)) return { error: 'Invalid HTTP port' };
    if (hsp && (hsp < 1 || hsp > 65535)) return { error: 'Invalid HTTPS port' };
    
    // Update env file
    const envFile = '/etc/nimbusos/nimbusos.env';
    if (fs.existsSync(envFile)) {
      let env = fs.readFileSync(envFile, 'utf-8');
      if (hp) env = env.replace(/NIMBUS_PORT=\d+/, `NIMBUS_PORT=${hp}`);
      if (hsp) {
        if (env.includes('NIMBUS_HTTPS_PORT=')) {
          env = env.replace(/NIMBUS_HTTPS_PORT=\d+/, `NIMBUS_HTTPS_PORT=${hsp}`);
        } else {
          env += `\nNIMBUS_HTTPS_PORT=${hsp}\n`;
        }
      }
      fs.writeFileSync(envFile, env);
    }
    
    // Update systemd and firewall
    if (hp && hp !== PORT) {
      run(`sudo ufw allow ${hp}/tcp comment 'NimbusOS Web UI' 2>/dev/null`);
    }
    
    return { ok: true, needsRestart: true, message: `Port will change to ${hp || PORT} after restart. Run: sudo systemctl restart nimbusos` };
  }

  return null;
}

// ═══════════════════════════════════
// Reverse Proxy (Nginx) API
// ═══════════════════════════════════
const PROXY_CONFIG_FILE = path.join(CONFIG_DIR, 'proxy-rules.json');
const NGINX_SITES = '/etc/nginx/sites-available';
const NGINX_ENABLED = '/etc/nginx/sites-enabled';

function getProxyRules() {
  try { if (fs.existsSync(PROXY_CONFIG_FILE)) return JSON.parse(fs.readFileSync(PROXY_CONFIG_FILE, 'utf-8')); } catch {}
  return [];
}
function saveProxyRules(rules) { fs.writeFileSync(PROXY_CONFIG_FILE, JSON.stringify(rules, null, 2)); }

function generateNginxProxyConf(rule) {
  const upstreamName = rule.domain.replace(/[^a-z0-9]/g, '_');
  let conf = '';
  
  if (rule.ssl && rule.certPath) {
    // HTTPS server block
    conf += `server {\n`;
    conf += `    listen 443 ssl http2;\n`;
    conf += `    listen [::]:443 ssl http2;\n`;
    conf += `    server_name ${rule.domain};\n\n`;
    conf += `    ssl_certificate ${rule.certPath};\n`;
    conf += `    ssl_certificate_key ${rule.keyPath};\n`;
    conf += `    ssl_protocols TLSv1.2 TLSv1.3;\n`;
    conf += `    ssl_ciphers HIGH:!aNULL:!MD5;\n\n`;
    conf += `    location / {\n`;
    conf += `        proxy_pass http://${rule.target};\n`;
    conf += `        proxy_set_header Host $host;\n`;
    conf += `        proxy_set_header X-Real-IP $remote_addr;\n`;
    conf += `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n`;
    conf += `        proxy_set_header X-Forwarded-Proto $scheme;\n`;
    conf += `        proxy_http_version 1.1;\n`;
    conf += `        proxy_set_header Upgrade $http_upgrade;\n`;
    conf += `        proxy_set_header Connection "upgrade";\n`;
    conf += `        proxy_buffering off;\n`;
    conf += `        proxy_request_buffering off;\n`;
    conf += `    }\n`;
    conf += `}\n\n`;
    // HTTP → HTTPS redirect
    conf += `server {\n`;
    conf += `    listen 80;\n    listen [::]:80;\n`;
    conf += `    server_name ${rule.domain};\n`;
    conf += `    return 301 https://$server_name$request_uri;\n`;
    conf += `}\n`;
  } else {
    // HTTP only
    conf += `server {\n`;
    conf += `    listen 80;\n    listen [::]:80;\n`;
    conf += `    server_name ${rule.domain};\n\n`;
    conf += `    location / {\n`;
    conf += `        proxy_pass http://${rule.target};\n`;
    conf += `        proxy_set_header Host $host;\n`;
    conf += `        proxy_set_header X-Real-IP $remote_addr;\n`;
    conf += `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n`;
    conf += `        proxy_set_header X-Forwarded-Proto $scheme;\n`;
    conf += `        proxy_http_version 1.1;\n`;
    conf += `        proxy_set_header Upgrade $http_upgrade;\n`;
    conf += `        proxy_set_header Connection "upgrade";\n`;
    conf += `    }\n`;
    conf += `}\n`;
  }
  return conf;
}

function applyProxyRules(rules) {
  // Remove old nimbusos proxy rule files
  const existing = run(`ls ${NGINX_SITES}/nimbusos-proxy-*.conf 2>/dev/null`) || '';
  for (const f of existing.split('\n').filter(Boolean)) {
    const base = path.basename(f);
    fs.unlinkSync(f);
    try { fs.unlinkSync(path.join(NGINX_ENABLED, base)); } catch {}
  }
  
  // Generate new configs
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const filename = `nimbusos-proxy-${rule.domain.replace(/[^a-z0-9.-]/g, '_')}.conf`;
    const conf = generateNginxProxyConf(rule);
    fs.writeFileSync(path.join(NGINX_SITES, filename), conf);
    run(`ln -sf ${path.join(NGINX_SITES, filename)} ${NGINX_ENABLED}/${filename}`);
  }
  
  // Test and reload
  const test = run('sudo nginx -t 2>&1');
  if (test && test.includes('failed')) {
    return { ok: false, error: 'Nginx config test failed', detail: test };
  }
  run('sudo systemctl reload nginx 2>/dev/null');
  return { ok: true };
}

function handleProxy(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  if (url === '/api/proxy/status' && method === 'GET') {
    const installed = !!(run('which nginx 2>/dev/null') || run('test -x /usr/sbin/nginx && echo yes'));
    const running = run('systemctl is-active nginx 2>/dev/null') === 'active';
    const version = run('nginx -v 2>&1') || null;
    const rules = getProxyRules();
    return { installed, running, version, rules };
  }

  // POST /api/proxy/rules — save all rules
  if (url === '/api/proxy/rules' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { rules } = body;
    if (!Array.isArray(rules)) return { error: 'rules array required' };
    saveProxyRules(rules);
    const result = applyProxyRules(rules);
    return result;
  }

  // POST /api/proxy/add — add a single rule
  if (url === '/api/proxy/add' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { domain, target, ssl } = body;
    if (!domain || !target) return { error: 'Domain and target required' };
    
    const rules = getProxyRules();
    if (rules.find(r => r.domain === domain)) return { error: 'Domain already exists' };
    
    const rule = { 
      domain, target, ssl: !!ssl, enabled: true, 
      created: new Date().toISOString(),
      certPath: '', keyPath: '',
    };
    
    // Try to get cert if SSL enabled
    if (ssl) {
      const certDir = `/etc/letsencrypt/live/${domain}`;
      if (fs.existsSync(certDir)) {
        rule.certPath = `${certDir}/fullchain.pem`;
        rule.keyPath = `${certDir}/privkey.pem`;
      }
    }
    
    rules.push(rule);
    saveProxyRules(rules);
    const result = applyProxyRules(rules);
    return { ...result, rule };
  }

  // POST /api/proxy/delete — remove a rule
  if (url === '/api/proxy/delete' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { domain } = body;
    let rules = getProxyRules();
    rules = rules.filter(r => r.domain !== domain);
    saveProxyRules(rules);
    const result = applyProxyRules(rules);
    return result;
  }

  // POST /api/proxy/toggle — enable/disable rule
  if (url === '/api/proxy/toggle' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { domain } = body;
    const rules = getProxyRules();
    const rule = rules.find(r => r.domain === domain);
    if (!rule) return { error: 'Rule not found' };
    rule.enabled = !rule.enabled;
    saveProxyRules(rules);
    const result = applyProxyRules(rules);
    return result;
  }

  // POST /api/proxy/ssl — request cert for a proxy rule
  if (url === '/api/proxy/ssl' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { domain, email } = body;
    if (!domain || !email) return { error: 'Domain and email required' };
    
    try {
      const log = execSync(
        `sudo certbot --nginx -d "${domain}" --non-interactive --agree-tos -m "${email}" --redirect 2>&1`,
        { encoding: 'utf-8', timeout: 120000 }
      );
      
      // Update rule with cert paths
      const rules = getProxyRules();
      const rule = rules.find(r => r.domain === domain);
      if (rule) {
        rule.ssl = true;
        rule.certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
        rule.keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;
        saveProxyRules(rules);
        applyProxyRules(rules);
      }
      
      return { ok: true, log };
    } catch (err) {
      return { error: 'SSL request failed', log: err.stderr || err.message };
    }
  }

  return null;
}

function handleSsh(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  if (url === '/api/ssh/status' && method === 'GET') {
    const running = run('systemctl is-active sshd 2>/dev/null || systemctl is-active ssh 2>/dev/null') === 'active';
    const version = run('ssh -V 2>&1 | head -1') || null;

    // Parse sshd_config
    const config = {};
    const conf = readFile('/etc/ssh/sshd_config');
    if (conf) {
      const get = (key) => {
        const m = conf.match(new RegExp(`^\\s*${key}\\s+(.+)`, 'mi'));
        return m ? m[1].trim() : null;
      };
      config.port = get('Port') || '22';
      config.rootLogin = get('PermitRootLogin') || 'prohibit-password';
      config.passwordAuth = get('PasswordAuthentication') || 'yes';
      config.pubkeyAuth = get('PubkeyAuthentication') || 'yes';
      config.maxAuthTries = get('MaxAuthTries') || '6';
      config.x11Forwarding = get('X11Forwarding') || 'no';
    }

    // Active sessions
    let connectedUsers = [];
    const who = run('who 2>/dev/null');
    if (who) {
      connectedUsers = who.split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/);
        return { user: parts[0], tty: parts[1], login: parts[2] + ' ' + (parts[3] || ''), from: (parts[4] || '').replace(/[()]/g, '') };
      });
    }

    return { running, version, config, connectedUsers, activeSessions: connectedUsers.length };
  }

  if (url === '/api/ssh/start' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl start sshd 2>/dev/null || sudo systemctl start ssh 2>/dev/null', { encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) { return { error: 'Failed', detail: err.message }; }
  }

  if (url === '/api/ssh/stop' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl stop sshd 2>/dev/null || sudo systemctl stop ssh 2>/dev/null', { encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) { return { error: 'Failed', detail: err.message }; }
  }

  return null;
}

// ═══════════════════════════════════
// FTP API
// ═══════════════════════════════════
function handleFtp(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  if (url === '/api/ftp/status' && method === 'GET') {
    const installed = !!(run('which vsftpd 2>/dev/null') || run('test -x /usr/sbin/vsftpd && echo yes') || run('which proftpd 2>/dev/null'));
    const running = run('systemctl is-active vsftpd 2>/dev/null') === 'active' || run('systemctl is-active proftpd 2>/dev/null') === 'active';
    const sftpAvailable = run('systemctl is-active sshd 2>/dev/null || systemctl is-active ssh 2>/dev/null') === 'active';
    const version = run('vsftpd -v 2>&1 | head -1') || run('proftpd -v 2>&1 | head -1') || null;

    // Parse vsftpd.conf
    const config = {};
    const conf = readFile('/etc/vsftpd.conf') || readFile('/etc/vsftpd/vsftpd.conf');
    if (conf) {
      const get = (key) => {
        const m = conf.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)`, 'mi'));
        return m ? m[1].trim() : null;
      };
      config.port = get('listen_port') || '21';
      config.anonymousEnable = get('anonymous_enable') || 'NO';
      config.localEnable = get('local_enable') || 'YES';
      config.writeEnable = get('write_enable') || 'NO';
      config.chrootLocalUser = get('chroot_local_user') || 'NO';
      config.sslEnable = get('ssl_enable') || 'NO';
      config.pasvMinPort = get('pasv_min_port') || '';
      config.pasvMaxPort = get('pasv_max_port') || '';
    }

    return { installed, running, sftpAvailable, version, config };
  }

  if (url === '/api/ftp/start' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl start vsftpd 2>/dev/null || sudo systemctl start proftpd 2>/dev/null', { encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) { return { error: 'Failed', detail: err.message }; }
  }

  if (url === '/api/ftp/stop' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl stop vsftpd 2>/dev/null || sudo systemctl stop proftpd 2>/dev/null', { encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) { return { error: 'Failed', detail: err.message }; }
  }

  return null;
}

// ═══════════════════════════════════
// NFS API
// ═══════════════════════════════════
function handleNfs(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  if (url === '/api/nfs/status' && method === 'GET') {
    const installed = !!(
      run('which nfsd 2>/dev/null') ||
      run('test -x /usr/sbin/rpc.nfsd && echo yes') ||
      run('dpkg -l nfs-kernel-server 2>/dev/null | grep -q "^ii" && echo yes') ||
      run('systemctl list-unit-files nfs-server.service 2>/dev/null | grep -q nfs && echo yes')
    );
    const running = run('systemctl is-active nfs-server 2>/dev/null') === 'active' || run('systemctl is-active nfs-kernel-server 2>/dev/null') === 'active';
    const version = run('cat /proc/fs/nfsd/versions 2>/dev/null') || null;

    // Parse /etc/exports
    let exports = [];
    const exportsFile = readFile('/etc/exports');
    if (exportsFile) {
      exports = exportsFile.split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#'))
        .map(line => {
          const parts = line.trim().split(/\s+/);
          const path = parts[0];
          const rest = parts.slice(1).join(' ');
          // Extract clients and options: "192.168.1.0/24(rw,sync)"
          const clientMatch = rest.match(/^([^\(]+)/);
          const optMatch = rest.match(/\(([^)]+)\)/);
          return {
            path,
            clients: clientMatch ? clientMatch[1].trim() : '*',
            options: optMatch ? optMatch[1] : 'defaults',
          };
        });
    }

    // Active clients
    let activeClients = [];
    const showmount = run('showmount --no-headers 2>/dev/null');
    if (showmount) {
      activeClients = showmount.split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/);
        return { client: parts[0] || '?', export: parts[1] || '?' };
      });
    }

    return { installed, running, version, exports, activeClients };
  }

  if (url === '/api/nfs/start' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl start nfs-server 2>/dev/null || sudo systemctl start nfs-kernel-server 2>/dev/null', { encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) { return { error: 'Failed', detail: err.message }; }
  }

  if (url === '/api/nfs/stop' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl stop nfs-server 2>/dev/null || sudo systemctl stop nfs-kernel-server 2>/dev/null', { encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) { return { error: 'Failed', detail: err.message }; }
  }

  return null;
}

// ═══════════════════════════════════
// DNS API
// ═══════════════════════════════════
function getDnsStatus() {
  const result = { servers: [], search: [], method: 'unknown' };
  
  // Try systemd-resolved first
  const resolved = run('resolvectl status 2>/dev/null');
  if (resolved) {
    result.method = 'systemd-resolved';
    const dnsLines = resolved.match(/DNS Servers?:\s*(.+)/g) || [];
    for (const line of dnsLines) {
      const ips = line.replace(/DNS Servers?:\s*/, '').trim().split(/\s+/);
      result.servers.push(...ips.filter(ip => ip.match(/^\d/)));
    }
    const searchMatch = resolved.match(/DNS Domain:\s*(.+)/);
    if (searchMatch) result.search = searchMatch[1].trim().split(/\s+/);
  }
  
  // Fallback: /etc/resolv.conf
  if (result.servers.length === 0) {
    const resolv = readFile('/etc/resolv.conf');
    if (resolv) {
      result.method = 'resolv.conf';
      const nameservers = resolv.match(/^nameserver\s+(\S+)/gm) || [];
      result.servers = nameservers.map(l => l.replace('nameserver ', '').trim());
      const searchLine = resolv.match(/^search\s+(.+)/m);
      if (searchLine) result.search = searchLine[1].trim().split(/\s+/);
    }
  }
  
  // Deduplicate
  result.servers = [...new Set(result.servers)];
  return result;
}

function handleDns(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  if (url === '/api/dns/status' && method === 'GET') {
    return getDnsStatus();
  }

  if (url === '/api/dns/config' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { servers, search } = body;
    if (!servers || !Array.isArray(servers)) return { error: 'servers array required' };

    // Try systemd-resolved first
    const useResolved = !!run('which resolvectl 2>/dev/null');
    if (useResolved) {
      // Get default interface
      const iface = run("ip route | grep default | awk '{print $5}' | head -1") || 'eth0';
      const dnsCmd = `sudo resolvectl dns ${iface} ${servers.join(' ')} 2>/dev/null`;
      run(dnsCmd);
      if (search && search.length > 0) {
        run(`sudo resolvectl domain ${iface} ${search.join(' ')} 2>/dev/null`);
      }
    }
    
    // Also write resolv.conf as fallback
    const lines = ['# Generated by NimbusOS'];
    if (search && search.length > 0) lines.push(`search ${search.join(' ')}`);
    for (const s of servers) lines.push(`nameserver ${s}`);
    
    try {
      fs.writeFileSync('/tmp/nimbus-resolv.conf', lines.join('\n') + '\n');
      run('sudo cp /tmp/nimbus-resolv.conf /etc/resolv.conf 2>/dev/null');
    } catch {}
    
    return { ok: true };
  }

  return null;
}

// ═══════════════════════════════════
// Certificates / Let's Encrypt API
// ═══════════════════════════════════
function handleCerts(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  if (url === '/api/certs/status' && method === 'GET') {
    const certbotInstalled = !!(
      run('which certbot 2>/dev/null') ||
      run('test -x /usr/bin/certbot && echo yes') ||
      run('snap list certbot 2>/dev/null | grep certbot && echo yes')
    );
    
    const certificates = [];
    if (certbotInstalled) {
      const raw = run('sudo certbot certificates 2>/dev/null');
      if (raw) {
        // Parse certbot output
        const blocks = raw.split(/Certificate Name:/);
        for (const block of blocks.slice(1)) {
          const nameMatch = block.match(/^\s*(\S+)/);
          const domainMatch = block.match(/Domains?:\s*(.+)/);
          const expiryMatch = block.match(/Expiry Date:\s*(\S+ \S+ \S+)/);
          const pathMatch = block.match(/Certificate Path:\s*(\S+)/);
          
          if (nameMatch) {
            const expiry = expiryMatch ? expiryMatch[1] : 'unknown';
            let daysLeft = -1;
            if (expiryMatch) {
              try {
                const expDate = new Date(expiryMatch[1]);
                daysLeft = Math.floor((expDate - Date.now()) / 86400000);
              } catch {}
            }
            
            certificates.push({
              name: nameMatch[1].trim(),
              domain: domainMatch ? domainMatch[1].trim() : nameMatch[1].trim(),
              expiry,
              daysLeft,
              valid: daysLeft > 0,
              path: pathMatch ? pathMatch[1].trim() : '',
              issuer: "Let's Encrypt",
            });
          }
        }
      }
    }
    
    // Also check for self-signed certs
    const selfSigned = run('ls /etc/ssl/certs/nimbus* 2>/dev/null');
    if (selfSigned) {
      for (const certPath of selfSigned.split('\n').filter(Boolean)) {
        const info = run(`openssl x509 -in "${certPath}" -noout -subject -enddate 2>/dev/null`);
        if (info) {
          const subMatch = info.match(/CN\s*=\s*(\S+)/);
          const endMatch = info.match(/notAfter=(.+)/);
          let daysLeft = -1;
          if (endMatch) {
            try { daysLeft = Math.floor((new Date(endMatch[1]) - Date.now()) / 86400000); } catch {}
          }
          certificates.push({
            name: subMatch ? subMatch[1] : 'Self-signed',
            domain: subMatch ? subMatch[1] : path.basename(certPath),
            expiry: endMatch ? endMatch[1].trim() : 'unknown',
            daysLeft,
            valid: daysLeft > 0,
            path: certPath,
            issuer: 'Self-signed',
          });
        }
      }
    }

    return { certbotInstalled, certificates };
  }

  // POST /api/certs/request — request new Let's Encrypt cert
  if (url === '/api/certs/request' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { domain, email, method: certMethod } = body;
    if (!domain || !email) return { error: 'Domain and email required' };
    
    let cmd = `sudo certbot certonly --non-interactive --agree-tos -m "${email}"`;
    if (certMethod === 'standalone') {
      cmd += ` --standalone -d "${domain}"`;
    } else if (certMethod === 'webroot') {
      cmd += ` --webroot -w /var/www/html -d "${domain}"`;
    } else if (certMethod === 'dns') {
      cmd += ` --manual --preferred-challenges dns -d "${domain}"`;
    }
    
    try {
      const log = execSync(cmd + ' 2>&1', { encoding: 'utf-8', timeout: 120000 });
      return { ok: true, log };
    } catch (err) {
      return { error: 'Certificate request failed', log: err.stderr || err.stdout || err.message };
    }
  }

  // POST /api/certs/renew — renew specific cert
  if (url === '/api/certs/renew' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { domain } = body;
    try {
      const log = execSync(`sudo certbot renew --cert-name "${domain}" --force-renewal 2>&1`,
        { encoding: 'utf-8', timeout: 120000 });
      return { ok: true, log };
    } catch (err) {
      return { error: 'Renewal failed', log: err.stderr || err.message };
    }
  }

  // POST /api/certs/delete — delete cert
  if (url === '/api/certs/delete' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { domain } = body;
    try {
      run(`sudo certbot delete --cert-name "${domain}" --non-interactive 2>/dev/null`);
      return { ok: true };
    } catch {
      return { error: 'Delete failed' };
    }
  }

  return null;
}

// ═══════════════════════════════════
// WebDAV API
// ═══════════════════════════════════
const WEBDAV_CONFIG_FILE = path.join(CONFIG_DIR, 'webdav.json');

function getWebdavConfig() {
  try {
    if (fs.existsSync(WEBDAV_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(WEBDAV_CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {
    httpPort: '80',
    httpsPort: '443',
    maxUploadMB: 10240,
    requireAuth: true,
  };
}

function saveWebdavConfig(config) {
  fs.writeFileSync(WEBDAV_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function handleWebdav(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  if (url === '/api/webdav/status' && method === 'GET') {
    // Detect web server (apache or nginx)
    const apacheInstalled = !!(run('which apache2 2>/dev/null') || run('test -x /usr/sbin/apache2 && echo yes'));
    const nginxInstalled = !!(run('which nginx 2>/dev/null') || run('test -x /usr/sbin/nginx && echo yes'));
    const installed = apacheInstalled || nginxInstalled;
    
    let running = false;
    let version = null;
    let server = null;
    
    if (apacheInstalled) {
      running = run('systemctl is-active apache2 2>/dev/null') === 'active';
      version = run('apache2 -v 2>/dev/null | head -1') || null;
      server = 'Apache';
    } else if (nginxInstalled) {
      running = run('systemctl is-active nginx 2>/dev/null') === 'active';
      version = run('nginx -v 2>&1 | head -1') || null;
      server = 'Nginx';
    }

    const config = getWebdavConfig();
    const shares = getShares();
    const webdavShares = shares.map(s => ({
      name: s.name,
      displayName: s.displayName,
      path: s.path,
      pool: s.pool,
      webdavEnabled: s.webdav === true,
    }));

    return { installed, running, version, server, config, shares: webdavShares };
  }

  if (url === '/api/webdav/config' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const current = getWebdavConfig();
    const updated = { ...current, ...body };
    saveWebdavConfig(updated);
    return { ok: true, config: updated };
  }

  if (url === '/api/webdav/start' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl start apache2 2>/dev/null || sudo systemctl start nginx 2>/dev/null',
        { encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) {
      return { error: 'Failed to start', detail: err.message };
    }
  }

  if (url === '/api/webdav/stop' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl stop apache2 2>/dev/null || sudo systemctl stop nginx 2>/dev/null',
        { encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) {
      return { error: 'Failed to stop', detail: err.message };
    }
  }

  if (url === '/api/webdav/restart' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl restart apache2 2>/dev/null || sudo systemctl restart nginx 2>/dev/null',
        { encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) {
      return { error: 'Failed to restart', detail: err.message };
    }
  }

  // PUT /api/webdav/share/:name — toggle WebDAV on a share
  const shareToggle = url.match(/^\/api\/webdav\/share\/([a-zA-Z0-9_-]+)$/);
  if (shareToggle && method === 'PUT') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const name = shareToggle[1];
    const shares = getShares();
    const share = shares.find(s => s.name === name);
    if (!share) return { error: 'Share not found' };
    share.webdav = body.enabled !== false;
    saveShares(shares);
    return { ok: true, name, webdavEnabled: share.webdav };
  }

  return null;
}

function handleSmb(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  // GET /api/smb/status — full SMB status
  if (url === '/api/smb/status' && method === 'GET') {
    const config = getSmbConfig();
    const status = getSmbStatus();
    const shares = getShares();
    
    // Enrich shares with SMB-specific info
    const smbShares = shares.map(s => {
      const perms = s.permissions || {};
      const rwUsers = Object.entries(perms).filter(([, v]) => v === 'rw').map(([k]) => k);
      const roUsers = Object.entries(perms).filter(([, v]) => v === 'ro').map(([k]) => k);
      return {
        name: s.name,
        displayName: s.displayName,
        path: s.path,
        pool: s.pool,
        smbEnabled: s.smb !== false,
        rwUsers,
        roUsers,
        recycleBin: s.recycleBin !== false,
        description: s.description || '',
      };
    });

    return {
      ...status,
      config,
      shares: smbShares,
    };
  }

  // POST /api/smb/config — update SMB config (admin only)
  if (url === '/api/smb/config' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const current = getSmbConfig();
    const updated = { ...current, ...body };
    
    // Sanitize
    if (updated.workgroup) updated.workgroup = updated.workgroup.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!['SMB2', 'SMB2_02', 'SMB2_10', 'SMB3', 'SMB3_00', 'SMB3_02', 'SMB3_11'].includes(updated.minProtocol)) {
      updated.minProtocol = 'SMB2';
    }
    if (!['SMB2', 'SMB2_02', 'SMB2_10', 'SMB3', 'SMB3_00', 'SMB3_02', 'SMB3_11'].includes(updated.maxProtocol)) {
      updated.maxProtocol = 'SMB3';
    }
    
    saveSmbConfig(updated);
    return { ok: true, config: updated };
  }

  // POST /api/smb/start — start smbd (admin only)
  if (url === '/api/smb/start' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      // Generate config first
      const config = getSmbConfig();
      const shares = getShares();
      const conf = generateSmbConf(config, shares);
      
      // Fix permissions on all share directories
      fixSharePermissions(shares);
      
      // Write smb.conf
      try {
        run(`sudo cp /etc/samba/smb.conf /etc/samba/smb.conf.bak 2>/dev/null`);
        fs.writeFileSync('/tmp/nimbus-smb.conf', conf);
        run('sudo cp /tmp/nimbus-smb.conf /etc/samba/smb.conf');
      } catch {}
      
      execSync('sudo systemctl start smbd nmbd 2>/dev/null || sudo systemctl start smbd 2>/dev/null', 
        { encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) {
      return { error: 'Failed to start SMB', detail: err.message };
    }
  }

  // POST /api/smb/stop — stop smbd (admin only)
  if (url === '/api/smb/stop' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      execSync('sudo systemctl stop smbd nmbd 2>/dev/null || sudo systemctl stop smbd 2>/dev/null', 
        { encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) {
      return { error: 'Failed to stop SMB', detail: err.message };
    }
  }

  // POST /api/smb/restart — restart smbd (admin only)
  if (url === '/api/smb/restart' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      const config = getSmbConfig();
      const shares = getShares();
      const conf = generateSmbConf(config, shares);
      
      // Fix permissions on all share directories
      fixSharePermissions(shares);
      
      try {
        fs.writeFileSync('/tmp/nimbus-smb.conf', conf);
        run('sudo cp /tmp/nimbus-smb.conf /etc/samba/smb.conf');
      } catch {}
      
      execSync('sudo systemctl restart smbd nmbd 2>/dev/null || sudo systemctl restart smbd 2>/dev/null', 
        { encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) {
      return { error: 'Failed to restart SMB', detail: err.message };
    }
  }

  // POST /api/smb/apply — regenerate smb.conf without restart (admin only)
  if (url === '/api/smb/apply' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    try {
      const config = getSmbConfig();
      const shares = getShares();
      const conf = generateSmbConf(config, shares);
      
      // Fix permissions on all share directories
      fixSharePermissions(shares);
      
      fs.writeFileSync('/tmp/nimbus-smb.conf', conf);
      run('sudo cp /tmp/nimbus-smb.conf /etc/samba/smb.conf');
      // Reload without restart
      run('sudo smbcontrol all reload-config 2>/dev/null');
      return { ok: true, preview: conf };
    } catch (err) {
      return { error: 'Failed to apply config', detail: err.message };
    }
  }

  // GET /api/smb/preview — preview generated smb.conf (admin only)
  if (url === '/api/smb/preview' && method === 'GET') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const config = getSmbConfig();
    const shares = getShares();
    const conf = generateSmbConf(config, shares);
    return { conf };
  }

  // PUT /api/smb/share/:name — toggle SMB on a share (admin only)
  const shareToggle = url.match(/^\/api\/smb\/share\/([a-zA-Z0-9_-]+)$/);
  if (shareToggle && method === 'PUT') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const name = shareToggle[1];
    const shares = getShares();
    const share = shares.find(s => s.name === name);
    if (!share) return { error: 'Share not found' };
    
    share.smb = body.enabled !== false;
    saveShares(shares);
    return { ok: true, name, smbEnabled: share.smb };
  }

  // POST /api/smb/sync-users — sync all NimbusOS users to Linux/Samba (admin only)
  if (url === '/api/smb/sync-users' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const users = getUsers();
    const results = [];
    for (const user of users) {
      ensureLinuxUser(user.username);
      // We can't recover plaintext passwords, so just ensure Linux user exists
      // Samba password must be set separately if user was created before this feature
      const linuxExists = !!run(`id "${user.username}" 2>/dev/null`);
      const smbExists = !!run(`sudo pdbedit -L 2>/dev/null | grep -q "^${user.username}:" && echo yes`);
      results.push({ 
        username: user.username, 
        linuxUser: linuxExists, 
        sambaUser: smbExists,
      });
    }
    // Also fix ownership on all share directories
    const shares = getShares();
    for (const share of shares) {
      if (fs.existsSync(share.path)) {
        run(`sudo chmod 2775 "${share.path}" 2>/dev/null`);
        // Add nimbus group
        run(`sudo chgrp nimbus "${share.path}" 2>/dev/null`);
      }
    }
    return { ok: true, users: results };
  }

  // POST /api/smb/set-password — set Samba password for a user (admin only)
  if (url === '/api/smb/set-password' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { username, password } = body;
    if (!username || !password) return { error: 'Username and password required' };
    const ok = ensureSmbUser(username, password);
    return ok ? { ok: true } : { error: 'Failed to set SMB password' };
  }

  return null;
}

// ═══════════════════════════════════
// Virtual Machines (QEMU/KVM) API
// ═══════════════════════════════════
const VM_DIR = '/var/lib/nimbusos/vms';
const ISO_DIR = '/var/lib/nimbusos/isos';

function handleVMs(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  // GET /api/vms/status — check if KVM is available
  if (url === '/api/vms/status' && method === 'GET') {
    const virshInstalled = !!(run('which virsh 2>/dev/null'));
    const qemuInstalled = !!(run('which qemu-system-x86_64 2>/dev/null'));
    const kvmSupport = run('grep -Ec "(vmx|svm)" /proc/cpuinfo 2>/dev/null') || '0';
    const kvmLoaded = !!(run('lsmod 2>/dev/null | grep kvm'));
    const libvirtdRunning = run('systemctl is-active libvirtd 2>/dev/null') === 'active';
    const version = run('virsh version --daemon 2>/dev/null | head -1') || '';
    
    // Ensure dirs exist
    run(`mkdir -p "${VM_DIR}" "${ISO_DIR}" 2>/dev/null`);
    
    return {
      installed: virshInstalled && qemuInstalled,
      kvmSupport: parseInt(kvmSupport) > 0,
      kvmLoaded,
      libvirtdRunning,
      version,
    };
  }

  // GET /api/vms/list — list all VMs
  if (url === '/api/vms/list' && method === 'GET') {
    const raw = run('virsh list --all 2>/dev/null') || '';
    const vms = [];
    const lines = raw.split('\n').filter(l => l.trim() && !l.includes('Id') && !l.includes('---'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const id = parts[0] === '-' ? null : parts[0];
      const name = parts[1];
      const status = parts.slice(2).join(' ');
      
      // Get VM details
      let cpu = '—', ram = '—', disk = '—', ip = '—';
      try {
        const info = run(`virsh dominfo "${name}" 2>/dev/null`) || '';
        const cpuMatch = info.match(/CPU\(s\):\s+(\d+)/);
        const ramMatch = info.match(/Max memory:\s+(\d+)/);
        if (cpuMatch) cpu = cpuMatch[1];
        if (ramMatch) ram = Math.round(parseInt(ramMatch[1]) / 1024 / 1024) + ' GB';
      } catch {}
      
      // Try to get IP if running
      if (status === 'running') {
        try {
          const ips = run(`virsh domifaddr "${name}" 2>/dev/null`) || '';
          const ipMatch = ips.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch) ip = ipMatch[1];
        } catch {}
      }
      
      // Get disk size
      try {
        const blk = run(`virsh domblklist "${name}" --details 2>/dev/null`) || '';
        const diskLine = blk.split('\n').find(l => l.includes('disk'));
        if (diskLine) {
          const diskPath = diskLine.trim().split(/\s+/).pop();
          if (diskPath && fs.existsSync(diskPath)) {
            const sz = run(`qemu-img info "${diskPath}" 2>/dev/null | grep "virtual size"`) || '';
            const szMatch = sz.match(/virtual size:\s+(.+?)(?:\s+\(|$)/);
            if (szMatch) disk = szMatch[1];
          }
        }
      } catch {}
      
      vms.push({ id, name, status, cpu, ram, disk, ip });
    }
    return { vms };
  }

  // GET /api/vms/overview — host stats
  if (url === '/api/vms/overview' && method === 'GET') {
    const hostname = run('hostname') || 'NimbusNAS';
    const cpuUsage = run("top -bn1 | grep '%Cpu' | awk '{print $2}' 2>/dev/null") || '0';
    const memInfo = run("free -m | awk '/Mem:/{printf \"%.0f\", $3/$2*100}' 2>/dev/null") || '0';
    const nodeInfo = run('virsh nodeinfo 2>/dev/null') || '';
    const totalCPUs = (nodeInfo.match(/CPU\(s\):\s+(\d+)/) || [,'?'])[1];
    const totalRAM = (nodeInfo.match(/Memory size:\s+(\d+)/) || [,'?'])[1];
    
    // Count VMs
    const raw = run('virsh list --all 2>/dev/null') || '';
    const lines = raw.split('\n').filter(l => l.trim() && !l.includes('Id') && !l.includes('---'));
    const running = lines.filter(l => l.includes('running')).length;
    const total = lines.length;
    
    return { hostname, cpuUsage, memUsage: memInfo, totalCPUs, totalRAM, running, total };
  }

  // POST /api/vms/create — create a new VM
  if (url === '/api/vms/create' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { name, os, cpus, ram, ramUnit, disk, diskUnit, networkType, iso, autoStart, firmware } = body;
    if (!name) return { error: 'Name required' };
    
    // Sanitize name
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
    const diskPath = `${VM_DIR}/${safeName}.qcow2`;
    const diskSize = `${disk}${diskUnit === 'TB' ? 'T' : 'G'}`;
    const ramMB = ramUnit === 'GB' ? parseInt(ram) * 1024 : parseInt(ram);
    
    try {
      // Create disk
      execSync(`qemu-img create -f qcow2 "${diskPath}" ${diskSize}`, { encoding: 'utf-8', timeout: 30000 });
      
      // Build virt-install command
      let cmd = `virt-install --name "${safeName}"`;
      cmd += ` --vcpus ${cpus || 2}`;
      cmd += ` --memory ${ramMB || 2048}`;
      cmd += ` --disk path="${diskPath}",format=qcow2`;
      cmd += ` --os-variant generic`;
      cmd += ` --graphics vnc,listen=0.0.0.0`;
      
      // Network
      if (networkType === 'bridge') cmd += ` --network bridge=br0,model=virtio`;
      else if (networkType === 'nat') cmd += ` --network network=default,model=virtio`;
      else cmd += ` --network none`;
      
      // Firmware
      if (firmware === 'UEFI') cmd += ` --boot uefi`;
      
      // ISO
      if (iso) cmd += ` --cdrom "${ISO_DIR}/${iso}"`;
      else cmd += ` --import --noautoconsole`;
      
      if (!iso) cmd += ` --noautoconsole`;
      
      const log = execSync(cmd + ' 2>&1', { encoding: 'utf-8', timeout: 60000 });
      
      if (autoStart) {
        run(`virsh autostart "${safeName}" 2>/dev/null`);
      }
      
      return { ok: true, name: safeName, log };
    } catch (err) {
      return { error: err.message || 'Failed to create VM' };
    }
  }

  // POST /api/vms/action — start/stop/pause/resume/delete/restart
  if (url === '/api/vms/action' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { name, action } = body;
    if (!name || !action) return { error: 'Name and action required' };
    
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
    let result;
    
    switch (action) {
      case 'start':
        result = run(`virsh start "${safeName}" 2>&1`);
        break;
      case 'stop':
        result = run(`virsh shutdown "${safeName}" 2>&1`);
        break;
      case 'force-stop':
        result = run(`virsh destroy "${safeName}" 2>&1`);
        break;
      case 'pause':
        result = run(`virsh suspend "${safeName}" 2>&1`);
        break;
      case 'resume':
        result = run(`virsh resume "${safeName}" 2>&1`);
        break;
      case 'restart':
        result = run(`virsh reboot "${safeName}" 2>&1`);
        break;
      case 'delete':
        run(`virsh destroy "${safeName}" 2>/dev/null`);
        run(`virsh undefine "${safeName}" --remove-all-storage 2>&1`);
        result = 'VM deleted';
        break;
      case 'autostart-on':
        result = run(`virsh autostart "${safeName}" 2>&1`);
        break;
      case 'autostart-off':
        result = run(`virsh autostart --disable "${safeName}" 2>&1`);
        break;
      default:
        return { error: 'Unknown action' };
    }
    
    return { ok: true, result };
  }

  // GET /api/vms/isos — list available ISOs
  if (url === '/api/vms/isos' && method === 'GET') {
    run(`mkdir -p "${ISO_DIR}" 2>/dev/null`);
    const files = run(`ls -lh "${ISO_DIR}"/*.iso 2>/dev/null`) || '';
    const isos = [];
    for (const line of files.split('\n').filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 9) {
        const size = parts[4];
        const name = path.basename(parts.slice(8).join(' '));
        isos.push({ name, size });
      }
    }
    return { isos, path: ISO_DIR };
  }

  // GET /api/vms/networks — list virtual networks
  if (url === '/api/vms/networks' && method === 'GET') {
    const raw = run('virsh net-list --all 2>/dev/null') || '';
    const networks = [];
    const lines = raw.split('\n').filter(l => l.trim() && !l.includes('Name') && !l.includes('---'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        networks.push({ name: parts[0], state: parts[1], autostart: parts[2] || '—', persistent: parts[3] || '—' });
      }
    }
    
    // Also get bridge info
    const bridges = run('brctl show 2>/dev/null | tail -n +2') || '';
    
    return { networks, bridges };
  }

  // GET /api/vms/vnc/:name — get VNC port for a VM
  if (url.startsWith('/api/vms/vnc/') && method === 'GET') {
    const vmName = url.split('/').pop();
    const display = run(`virsh vncdisplay "${vmName}" 2>/dev/null`) || '';
    const port = display.trim() ? 5900 + parseInt(display.trim().replace(':', '')) : null;
    return { port, display: display.trim() };
  }

  // GET /api/vms/logs — recent libvirt logs
  if (url === '/api/vms/logs' && method === 'GET') {
    const logs = run('journalctl -u libvirtd --no-pager -n 50 --output=short 2>/dev/null') || '';
    return { logs };
  }

  // POST /api/vms/snapshot — create/list/revert snapshots
  if (url === '/api/vms/snapshot' && method === 'POST') {
    if (session.role !== 'admin') return { error: 'Admin required' };
    const { name, action: snapAction, snapshotName } = body;
    if (!name) return { error: 'VM name required' };
    
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
    
    if (snapAction === 'create') {
      const snapName = snapshotName || `snap-${Date.now()}`;
      const result = run(`virsh snapshot-create-as "${safeName}" "${snapName}" 2>&1`);
      return { ok: true, result };
    }
    if (snapAction === 'list') {
      const result = run(`virsh snapshot-list "${safeName}" 2>/dev/null`) || '';
      return { snapshots: result };
    }
    if (snapAction === 'revert') {
      if (!snapshotName) return { error: 'Snapshot name required' };
      const result = run(`virsh snapshot-revert "${safeName}" "${snapshotName}" 2>&1`);
      return { ok: true, result };
    }
    if (snapAction === 'delete') {
      if (!snapshotName) return { error: 'Snapshot name required' };
      const result = run(`virsh snapshot-delete "${safeName}" "${snapshotName}" 2>&1`);
      return { ok: true, result };
    }
    
    return { error: 'Unknown snapshot action' };
  }

  return null;
}

function handleNativeApps(url, method, body, req) {
  const session = getSessionUser(req);
  
  // GET /api/native-apps — list detected native apps
  if (url === '/api/native-apps' && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const apps = detectAllNativeApps();
    return { apps };
  }
  
  // GET /api/native-apps/available — list all known native apps (installed or not)
  if (url === '/api/native-apps/available' && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const available = Object.entries(KNOWN_NATIVE_APPS).map(([id, def]) => {
      const status = detectNativeApp(id);
      return {
        id,
        name: def.name,
        description: def.description || '',
        category: def.category || 'system',
        icon: def.icon,
        color: def.color,
        port: def.port,
        installed: status.installed,
        running: status.running,
        installCommand: def.installCommand,
        uninstallCommand: def.uninstallCommand || null,
        isDesktop: def.isDesktop || false,
        isNativeApp: def.isNativeApp || false,
        nimbusApp: def.nimbusApp || null,
      };
    });
    return { apps: available };
  }
  
  // POST /api/native-apps/:id/start — start a native service
  const startMatch = url.match(/^\/api\/native-apps\/([a-z]+)\/start$/);
  if (startMatch && method === 'POST') {
    if (!session) return { error: 'Not authenticated' };
    if (session.role !== 'admin') return { error: 'Admin required' };
    
    const appId = startMatch[1];
    const appDef = KNOWN_NATIVE_APPS[appId];
    if (!appDef) return { error: 'Unknown app' };
    
    try {
      execSync(`sudo systemctl start ${appId}-daemon || sudo systemctl start ${appId}d || sudo systemctl start ${appId}`, 
        { encoding: 'utf-8', timeout: 30000 });
      return { ok: true, appId };
    } catch (err) {
      return { error: 'Failed to start service', detail: err.message };
    }
  }
  
  // POST /api/native-apps/:id/stop — stop a native service
  const stopMatch = url.match(/^\/api\/native-apps\/([a-z]+)\/stop$/);
  if (stopMatch && method === 'POST') {
    if (!session) return { error: 'Not authenticated' };
    if (session.role !== 'admin') return { error: 'Admin required' };
    
    const appId = stopMatch[1];
    const appDef = KNOWN_NATIVE_APPS[appId];
    if (!appDef) return { error: 'Unknown app' };
    
    try {
      execSync(`sudo systemctl stop ${appId}-daemon || sudo systemctl stop ${appId}d || sudo systemctl stop ${appId}`, 
        { encoding: 'utf-8', timeout: 30000 });
      return { ok: true, appId };
    } catch (err) {
      return { error: 'Failed to stop service', detail: err.message };
    }
  }
  
  // POST /api/native-apps/:id/install — install a native app
  const installMatch = url.match(/^\/api\/native-apps\/([a-zA-Z0-9_-]+)\/install$/);
  if (installMatch && method === 'POST') {
    if (!session) return { error: 'Not authenticated' };
    if (session.role !== 'admin') return { error: 'Admin required' };
    
    const appId = installMatch[1];
    const appDef = KNOWN_NATIVE_APPS[appId];
    if (!appDef) return { error: 'Unknown app' };
    if (!appDef.installCommand) return { error: 'No install command defined' };
    
    try {
      const log = execSync(appDef.installCommand, { encoding: 'utf-8', timeout: 300000, stdio: 'pipe' });
      // Register as installed
      registerNativeApp({ id: appId, name: appDef.name, icon: appDef.icon, color: appDef.color, port: appDef.port, isDesktop: appDef.isDesktop || false, nimbusApp: appDef.nimbusApp || null });
      return { ok: true, appId, log };
    } catch (err) {
      return { error: 'Installation failed', detail: err.stderr || err.message };
    }
  }
  
  // POST /api/native-apps/:id/uninstall — uninstall a native app
  const uninstallMatch = url.match(/^\/api\/native-apps\/([a-zA-Z0-9_-]+)\/uninstall$/);
  if (uninstallMatch && method === 'POST') {
    if (!session) return { error: 'Not authenticated' };
    if (session.role !== 'admin') return { error: 'Admin required' };
    
    const appId = uninstallMatch[1];
    const appDef = KNOWN_NATIVE_APPS[appId];
    if (!appDef) return { error: 'Unknown app' };
    
    try {
      if (appDef.uninstallCommand) {
        execSync(appDef.uninstallCommand, { encoding: 'utf-8', timeout: 120000, stdio: 'pipe' });
      }
      // Remove from native apps list
      const apps = getNativeApps().filter(a => a.id !== appId);
      saveNativeApps(apps);
      return { ok: true, appId };
    } catch (err) {
      return { error: 'Uninstall failed', detail: err.stderr || err.message };
    }
  }

  // GET /api/native-apps/:id/status — check status of specific native app
  const statusMatch = url.match(/^\/api\/native-apps\/([a-z]+)\/status$/);
  if (statusMatch && method === 'GET') {
    if (!session) return { error: 'Not authenticated' };
    
    const appId = statusMatch[1];
    const appDef = KNOWN_NATIVE_APPS[appId];
    if (!appDef) return { error: 'Unknown app' };
    
    const status = detectNativeApp(appId);
    return { 
      id: appId, 
      name: appDef.name,
      ...status,
      port: appDef.port
    };
  }
  
  return null;
}

// ═══════════════════════════════════
// File browsing API (for File Manager)
// ═══════════════════════════════════
function handleFiles(url, method, body, req) {
  const session = getSessionUser(req);
  if (!session) return { error: 'Not authenticated' };

  // GET /api/files?share=name&path=/subdir
  if (url.startsWith('/api/files') && method === 'GET') {
    const urlObj = new URL('http://localhost' + req.url);
    const shareName = urlObj.searchParams.get('share');
    const subPath = urlObj.searchParams.get('path') || '/';

    if (!shareName) {
      // Return list of shares this user can access
      const shares = getShares();
      const accessible = shares.filter(s => {
        if (session.role === 'admin') return true;
        const perm = (s.permissions || {})[session.username];
        return perm === 'rw' || perm === 'ro';
      }).map(s => ({
        name: s.name,
        displayName: s.displayName,
        description: s.description,
        permission: session.role === 'admin' ? 'rw' : ((s.permissions || {})[session.username] || 'none'),
      }));
      return { shares: accessible };
    }

    // Check permission
    const shares = getShares();
    const share = shares.find(s => s.name === shareName);
    if (!share) return { error: 'Shared folder not found' };

    const perm = session.role === 'admin' ? 'rw' : ((share.permissions || {})[session.username] || 'none');
    if (perm === 'none') return { error: 'Access denied' };

    // Read directory
    // SECURITY: Normalize and validate path to prevent traversal
    const normalizedSubPath = path.normalize(subPath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(share.path, normalizedSubPath);
    
    // Security: prevent path traversal - must be within share.path
    const resolvedFull = path.resolve(fullPath);
    const resolvedShare = path.resolve(share.path);
    if (!resolvedFull.startsWith(resolvedShare)) {
      return { error: 'Invalid path: access denied' };
    }

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const files = entries.map(e => {
        const filePath = path.join(fullPath, e.name);
        let size = 0;
        let modified = null;
        try {
          const stat = fs.statSync(filePath);
          size = stat.size;
          modified = stat.mtime.toISOString();
        } catch {}
        return {
          name: e.name,
          isDirectory: e.isDirectory(),
          size,
          modified,
        };
      }).sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return { files, path: subPath, share: shareName, permission: perm };
    } catch (err) {
      return { error: 'Cannot read directory', detail: err.message };
    }
  }

  // POST /api/files/mkdir — create directory
  if (url === '/api/files/mkdir' && method === 'POST') {
    const { share: shareName, path: dirPath, name: dirName } = body;
    if (!shareName || !dirName) return { error: 'Missing share or name' };

    const shares = getShares();
    const share = shares.find(s => s.name === shareName);
    if (!share) return { error: 'Shared folder not found' };

    const perm = session.role === 'admin' ? 'rw' : ((share.permissions || {})[session.username] || 'none');
    if (perm !== 'rw') return { error: 'Write access denied' };

    // SECURITY: Sanitize directory name
    if (dirName.includes('..') || dirName.includes('/') || dirName.includes('\\')) {
      return { error: 'Invalid directory name' };
    }
    
    const normalizedDirPath = path.normalize(dirPath || '').replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(share.path, normalizedDirPath, dirName);
    
    // Verify within share
    const resolvedFull = path.resolve(fullPath);
    const resolvedShare = path.resolve(share.path);
    if (!resolvedFull.startsWith(resolvedShare)) {
      return { error: 'Invalid path: access denied' };
    }

    try {
      fs.mkdirSync(fullPath, { recursive: true });
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // POST /api/files/delete — delete file or directory
  if (url === '/api/files/delete' && method === 'POST') {
    const { share: shareName, path: filePath } = body;
    if (!shareName || !filePath) return { error: 'Missing share or path' };

    const shares = getShares();
    const share = shares.find(s => s.name === shareName);
    if (!share) return { error: 'Shared folder not found' };

    const perm = session.role === 'admin' ? 'rw' : ((share.permissions || {})[session.username] || 'none');
    if (perm !== 'rw') return { error: 'Write access denied' };

    // SECURITY: Validate path
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(share.path, normalizedPath);
    const resolvedFull = path.resolve(fullPath);
    const resolvedShare = path.resolve(share.path);
    
    if (!resolvedFull.startsWith(resolvedShare) || resolvedFull === resolvedShare) {
      return { error: 'Invalid path: access denied' };
    }

    try {
      fs.rmSync(fullPath, { recursive: true });
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // POST /api/files/rename
  if (url === '/api/files/rename' && method === 'POST') {
    const { share: shareName, oldPath, newPath } = body;
    if (!shareName || !oldPath || !newPath) return { error: 'Missing params' };

    const shares = getShares();
    const share = shares.find(s => s.name === shareName);
    if (!share) return { error: 'Shared folder not found' };

    const perm = session.role === 'admin' ? 'rw' : ((share.permissions || {})[session.username] || 'none');
    if (perm !== 'rw') return { error: 'Write access denied' };

    // SECURITY: Validate both paths
    const normalizedOld = path.normalize(oldPath).replace(/^(\.\.[\/\\])+/, '');
    const normalizedNew = path.normalize(newPath).replace(/^(\.\.[\/\\])+/, '');
    const fullOld = path.join(share.path, normalizedOld);
    const fullNew = path.join(share.path, normalizedNew);
    const resolvedOld = path.resolve(fullOld);
    const resolvedNew = path.resolve(fullNew);
    const resolvedShare = path.resolve(share.path);
    
    if (!resolvedOld.startsWith(resolvedShare) || !resolvedNew.startsWith(resolvedShare)) {
      return { error: 'Invalid path: access denied' };
    }

    try {
      fs.renameSync(fullOld, fullNew);
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // POST /api/files/paste — copy or move
  if (url === '/api/files/paste' && method === 'POST') {
    const { srcShare, srcPath, destShare, destPath, action } = body;
    if (!srcShare || !srcPath || !destShare || !destPath) return { error: 'Missing params' };

    const shares = getShares();
    const src = shares.find(s => s.name === srcShare);
    const dest = shares.find(s => s.name === destShare);
    if (!src || !dest) return { error: 'Share not found' };

    const destPerm = session.role === 'admin' ? 'rw' : ((dest.permissions || {})[session.username] || 'none');
    if (destPerm !== 'rw') return { error: 'Write access denied on destination' };

    // SECURITY: Validate both paths
    const normalizedSrc = path.normalize(srcPath).replace(/^(\.\.[\/\\])+/, '');
    const normalizedDest = path.normalize(destPath).replace(/^(\.\.[\/\\])+/, '');
    const fullSrc = path.join(src.path, normalizedSrc);
    const fullDest = path.join(dest.path, normalizedDest);
    const resolvedSrc = path.resolve(fullSrc);
    const resolvedDest = path.resolve(fullDest);
    const resolvedSrcShare = path.resolve(src.path);
    const resolvedDestShare = path.resolve(dest.path);
    
    if (!resolvedSrc.startsWith(resolvedSrcShare) || !resolvedDest.startsWith(resolvedDestShare)) {
      return { error: 'Invalid path: access denied' };
    }

    try {
      if (action === 'cut') {
        fs.renameSync(fullSrc, fullDest);
      } else {
        fs.cpSync(fullSrc, fullDest, { recursive: true });
      }
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  return null;
}

// Handle file upload (multipart) — called directly from HTTP handler
function handleFileUpload(req, res, session) {
  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) {
    res.writeHead(400, CORS_HEADERS);
    return res.end(JSON.stringify({ error: 'No boundary' }));
  }

  let rawData = [];
  req.on('data', chunk => rawData.push(chunk));
  req.on('end', () => {
    const buffer = Buffer.concat(rawData);
    const text = buffer.toString('latin1');
    const parts = text.split('--' + boundary).slice(1, -1);

    let shareName = '', uploadPath = '', fileName = '', fileData = null;

    for (const part of parts) {
      const headerEnd = part.indexOf('\r\n\r\n');
      const header = part.substring(0, headerEnd);
      const body = part.substring(headerEnd + 4, part.length - 2);

      if (header.includes('name="share"')) {
        shareName = body.trim();
      } else if (header.includes('name="path"')) {
        uploadPath = body.trim();
      } else if (header.includes('name="file"')) {
        const fnMatch = header.match(/filename="([^"]+)"/);
        if (fnMatch) fileName = fnMatch[1];
        // Get binary data from original buffer
        const headerBytes = Buffer.from(part.substring(0, headerEnd + 4), 'latin1').length;
        const partStart = buffer.indexOf('--' + boundary);
        // Simpler: just use the text body and convert back
        fileData = Buffer.from(body, 'latin1');
      }
    }

    if (!shareName || !fileName) {
      res.writeHead(400, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Missing data' }));
    }

    const shares = getShares();
    const share = shares.find(s => s.name === shareName);
    if (!share) {
      res.writeHead(400, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Share not found' }));
    }

    const perm = session.role === 'admin' ? 'rw' : ((share.permissions || {})[session.username] || 'none');
    if (perm !== 'rw') {
      res.writeHead(403, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Write access denied' }));
    }

    // SECURITY: Sanitize filename and validate path
    const safeFileName = fileName.replace(/[\/\\:*?"<>|]/g, '_').replace(/\.\./g, '');
    if (!safeFileName || safeFileName.length > 255) {
      res.writeHead(400, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Invalid filename' }));
    }
    
    const normalizedPath = path.normalize(uploadPath || '').replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(share.path, normalizedPath, safeFileName);
    const resolvedFull = path.resolve(fullPath);
    const resolvedShare = path.resolve(share.path);
    
    if (!resolvedFull.startsWith(resolvedShare)) {
      res.writeHead(400, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Invalid path: access denied' }));
    }

    try {
      fs.writeFileSync(fullPath, fileData);
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ ok: true, name: safeFileName }));
    } catch (err) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Handle file download — called directly from HTTP handler
function handleFileDownload(req, res, session) {
  const urlObj = new URL('http://localhost' + req.url);
  const shareName = urlObj.searchParams.get('share');
  const filePath = urlObj.searchParams.get('path');

  if (!shareName || !filePath) {
    res.writeHead(400, CORS_HEADERS);
    return res.end(JSON.stringify({ error: 'Missing params' }));
  }

  const shares = getShares();
  const share = shares.find(s => s.name === shareName);
  if (!share) {
    res.writeHead(404, CORS_HEADERS);
    return res.end(JSON.stringify({ error: 'Share not found' }));
  }

  const perm = session.role === 'admin' ? 'rw' : ((share.permissions || {})[session.username] || 'none');
  if (perm === 'none') {
    res.writeHead(403, CORS_HEADERS);
    return res.end(JSON.stringify({ error: 'Access denied' }));
  }

  // SECURITY: Validate path
  const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(share.path, normalizedPath);
  const resolvedFull = path.resolve(fullPath);
  const resolvedShare = path.resolve(share.path);
  
  if (!resolvedFull.startsWith(resolvedShare)) {
    res.writeHead(400, CORS_HEADERS);
    return res.end(JSON.stringify({ error: 'Invalid path: access denied' }));
  }

  try {
    const stat = fs.statSync(fullPath);
    const fileName = path.basename(fullPath);
    const ext = fileName.split('.').pop().toLowerCase();

    // MIME type map for previewing
    const mimeTypes = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
      mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/quicktime',
      mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
      pdf: 'application/pdf',
      txt: 'text/plain', md: 'text/plain', log: 'text/plain', csv: 'text/plain',
      json: 'application/json', xml: 'text/xml', yml: 'text/yaml', yaml: 'text/yaml',
      js: 'text/javascript', jsx: 'text/javascript', ts: 'text/javascript',
      py: 'text/plain', sh: 'text/plain', css: 'text/css', html: 'text/html',
      c: 'text/plain', cpp: 'text/plain', h: 'text/plain', java: 'text/plain',
      rs: 'text/plain', go: 'text/plain', rb: 'text/plain', php: 'text/plain',
      sql: 'text/plain', toml: 'text/plain', ini: 'text/plain', conf: 'text/plain',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const isDownload = contentType === 'application/octet-stream';
    const fileSize = stat.size;

    // Range request support (needed for audio/video seeking)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
      });
      const stream = fs.createReadStream(fullPath, { start, end });
      stream.pipe(res);
      return;
    }

    const resHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': contentType,
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
    };
    if (isDownload) {
      resHeaders['Content-Disposition'] = `attachment; filename="${fileName}"`;
    }

    res.writeHead(200, resHeaders);
    const stream = fs.createReadStream(fullPath);
    stream.pipe(res);
  } catch (err) {
    res.writeHead(404, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'File not found' }));
  }
}

// ═══════════════════════════════════
// Helper: safe exec
// ═══════════════════════════════════
function run(cmd) {
  try { return execSync(cmd, { timeout: 5000, encoding: 'utf-8' }).trim(); }
  catch { return null; }
}

function readFile(path) {
  try { return fs.readFileSync(path, 'utf-8').trim(); }
  catch { return null; }
}

// Detect available tools once at startup
const HAS_SMARTCTL = !!run('which smartctl 2>/dev/null');
const HAS_SENSORS = !!run('which sensors 2>/dev/null');
const HAS_DOCKER = !!run('which docker 2>/dev/null');

// ═══════════════════════════════════
// CPU
// ═══════════════════════════════════
let prevCpu = null;

function getCpuUsage() {
  const stat = readFile('/proc/stat');
  if (!stat) return { percent: 0, cores: os.cpus().length, model: os.cpus()[0]?.model || 'Unknown' };

  const line = stat.split('\n')[0]; // "cpu  user nice system idle iowait irq softirq steal"
  const parts = line.split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + parts[4];
  const total = parts.reduce((a, b) => a + b, 0);

  let percent = 0;
  if (prevCpu) {
    const diffIdle = idle - prevCpu.idle;
    const diffTotal = total - prevCpu.total;
    percent = diffTotal > 0 ? Math.round((1 - diffIdle / diffTotal) * 100) : 0;
  }
  prevCpu = { idle, total };

  return {
    percent,
    cores: os.cpus().length,
    model: os.cpus()[0]?.model || 'Unknown',
  };
}

// ═══════════════════════════════════
// Memory
// ═══════════════════════════════════
function getMemory() {
  const info = readFile('/proc/meminfo');
  if (!info) return { total: 0, used: 0, percent: 0 };

  const parse = (key) => {
    const m = info.match(new RegExp(`${key}:\\s+(\\d+)`));
    return m ? parseInt(m[1]) * 1024 : 0; // kB to bytes
  };

  const total = parse('MemTotal');
  const available = parse('MemAvailable');
  const used = total - available;

  return {
    total,
    used,
    totalGB: (total / 1073741824).toFixed(1),
    usedGB: (used / 1073741824).toFixed(1),
    percent: total > 0 ? Math.round((used / total) * 100) : 0,
  };
}

// ═══════════════════════════════════
// ═══════════════════════════════════
// Firewall / Port Management
// ═══════════════════════════════════

function getFirewallRules() {
  const rules = [];
  
  // Try iptables first
  const iptOutput = run('iptables -L INPUT -n --line-numbers 2>/dev/null');
  if (iptOutput) {
    const lines = iptOutput.split('\n').filter(l => l.match(/^\d+/));
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const num = parts[0];
        const action = parts[1]; // ACCEPT, DROP, REJECT
        const proto = parts[2]; // tcp, udp, all
        const src = parts[4]; // source
        const dst = parts[5]; // destination
        // Extract port from remaining
        const dptMatch = line.match(/dpt:(\d+)/);
        const dptsMatch = line.match(/dpts:(\d+:\d+)/);
        const port = dptMatch ? dptMatch[1] : dptsMatch ? dptsMatch[1].replace(':', '-') : '*';
        
        rules.push({
          num: parseInt(num),
          action,
          protocol: proto,
          source: src === '0.0.0.0/0' ? 'Any' : src,
          destination: dst === '0.0.0.0/0' ? 'Any' : dst,
          port,
          raw: line.trim(),
        });
      }
    });
  }

  // Check if ufw is active
  const ufwStatus = run('ufw status numbered 2>/dev/null');
  const ufwActive = ufwStatus && ufwStatus.includes('Status: active');
  
  let ufwRules = [];
  if (ufwActive && ufwStatus) {
    const ufwLines = ufwStatus.split('\n').filter(l => l.match(/^\[\s*\d+\]/));
    ufwLines.forEach(line => {
      const numMatch = line.match(/^\[\s*(\d+)\]/);
      const num = numMatch ? parseInt(numMatch[1]) : 0;
      
      const actionMatch = line.match(/\b(ALLOW|DENY|REJECT|LIMIT)\b/i);
      const action = actionMatch ? actionMatch[1].toUpperCase() : 'ALLOW';
      
      // Parse port/proto
      const portMatch = line.match(/(\d+(?::\d+)?)\/(tcp|udp)/i);
      const port = portMatch ? portMatch[1].replace(':', '-') : '*';
      const proto = portMatch ? portMatch[2] : 'any';
      
      // Parse source
      const inMatch = line.match(/\bIN\b/i);
      const fromMatch = line.match(/from\s+(\S+)/i);
      const source = fromMatch ? fromMatch[1] : 'Anywhere';

      ufwRules.push({ num, action, protocol: proto, source, port, raw: line.trim() });
    });
  }

  // Detect backend (ufw, iptables, nftables)
  const hasUfw = !!run('which ufw 2>/dev/null');
  const hasNft = !!run('which nft 2>/dev/null');
  const backend = ufwActive ? 'ufw' : hasUfw ? 'ufw (inactive)' : hasNft ? 'nftables' : 'iptables';

  return {
    backend,
    ufwActive,
    rules: ufwActive ? ufwRules : rules,
    defaultPolicy: ufwActive 
      ? (ufwStatus.includes('Default: deny') ? 'deny' : 'allow')
      : run('iptables -L INPUT 2>/dev/null | head -1')?.includes('DROP') ? 'deny' : 'allow',
  };
}

function getListeningPorts() {
  const ports = [];
  const ss = run('ss -tlnp 2>/dev/null') || run('netstat -tlnp 2>/dev/null');
  if (ss) {
    ss.split('\n').slice(1).filter(Boolean).forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) return;
      const localAddr = parts[3] || '';
      const addrMatch = localAddr.match(/^(.*):(\d+)$/);
      if (!addrMatch) return;
      const addr = addrMatch[1];
      const port = parseInt(addrMatch[2]);
      const processInfo = parts.slice(5).join(' ');
      const procMatch = processInfo.match(/users:\(\("([^"]+)"/);
      const pidMatch = processInfo.match(/pid=(\d+)/);
      const process = procMatch ? procMatch[1] : '';
      const pid = pidMatch ? parseInt(pidMatch[1]) : null;
      if (port === 0) return;
      ports.push({
        port, address: addr === '*' || addr === '0.0.0.0' || addr === '::' ? '0.0.0.0' : addr,
        protocol: 'tcp', process, pid, exposed: addr === '*' || addr === '0.0.0.0' || addr === '::',
      });
    });
  }
  const ssUdp = run('ss -ulnp 2>/dev/null');
  if (ssUdp) {
    ssUdp.split('\n').slice(1).filter(Boolean).forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) return;
      const localAddr = parts[3] || '';
      const addrMatch = localAddr.match(/^(.*):(\d+)$/);
      if (!addrMatch) return;
      const addr = addrMatch[1];
      const port = parseInt(addrMatch[2]);
      const processInfo = parts.slice(5).join(' ');
      const procMatch = processInfo.match(/users:\(\("([^"]+)"/);
      const pidMatch = processInfo.match(/pid=(\d+)/);
      const process = procMatch ? procMatch[1] : '';
      const pid = pidMatch ? parseInt(pidMatch[1]) : null;
      if (port === 0) return;
      ports.push({
        port, address: addr === '*' || addr === '0.0.0.0' || addr === '::' ? '0.0.0.0' : addr,
        protocol: 'udp', process, pid, exposed: addr === '*' || addr === '0.0.0.0' || addr === '::',
      });
    });
  }
  const seen = new Set();
  return ports.filter(p => {
    const key = `${p.port}/${p.protocol}/${p.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.port - b.port);
}

function getFirewallScan() {
  const ports = getListeningPorts();
  const fw = getFirewallRules();
  
  // Detect docker containers and their port mappings
  const dockerPorts = [];
  const dockerPs = run('docker ps --format "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Ports}}" 2>/dev/null');
  if (dockerPs) {
    dockerPs.split('\n').filter(Boolean).forEach(line => {
      const [id, name, image, portsStr] = line.split('\t');
      if (!portsStr) return;
      // Parse "0.0.0.0:8080->80/tcp, :::8080->80/tcp" etc
      const portMappings = portsStr.split(',').map(s => s.trim());
      portMappings.forEach(mapping => {
        const m = mapping.match(/(?:(\d+\.\d+\.\d+\.\d+)|::):(\d+)->(\d+)\/(tcp|udp)/);
        if (m) {
          dockerPorts.push({
            hostPort: parseInt(m[2]),
            containerPort: parseInt(m[3]),
            protocol: m[4],
            containerName: name,
            containerImage: image,
            containerId: id,
          });
        }
      });
    });
  }

  // Known service labels
  const SERVICE_LABELS = {
    'node': 'Node.js', 'nginx': 'Nginx', 'apache2': 'Apache', 'httpd': 'Apache',
    'sshd': 'SSH', 'postgres': 'PostgreSQL', 'mysqld': 'MySQL', 'mariadbd': 'MariaDB',
    'redis-server': 'Redis', 'mongod': 'MongoDB', 'docker-proxy': 'Docker',
    'code-server': 'Code Server', 'java': 'Java', 'python3': 'Python', 'python': 'Python',
    'grafana': 'Grafana', 'prometheus': 'Prometheus', 'influxd': 'InfluxDB',
    'smbd': 'Samba (SMB)', 'named': 'DNS (BIND)', 'dnsmasq': 'DNS (dnsmasq)',
    'pihole-FTL': 'Pi-hole', 'jellyfin': 'Jellyfin', 'plex': 'Plex Media Server',
    'navidrome': 'Navidrome', 'syncthing': 'Syncthing', 'wireguard': 'WireGuard',
    'openvpn': 'OpenVPN', 'cups': 'CUPS (Printing)', 'avahi-daemon': 'Avahi (mDNS)',
    'unifi': 'UniFi Controller', 'homebridge': 'Homebridge',
  };

  // Build services list: group ports by process, cross-reference with fw rules & docker
  const groups = {};
  ports.forEach(p => {
    const docker = dockerPorts.find(d => d.hostPort === p.port && d.protocol === p.protocol);
    const key = docker ? `docker:${docker.containerName}` : (p.process || `unknown:${p.port}`);
    
    if (!groups[key]) {
      const label = docker
        ? docker.containerName
        : (SERVICE_LABELS[p.process] || p.process || 'Unknown');
      groups[key] = {
        name: label,
        process: p.process,
        isDocker: !!docker,
        containerName: docker?.containerName || null,
        containerImage: docker?.containerImage || null,
        ports: [],
      };
    }
    
    // Check if this port has a firewall ALLOW rule
    const isAllowed = fw.rules.some(r => {
      const rPort = String(r.port);
      const pPort = String(p.port);
      const actionOk = ['ALLOW', 'ACCEPT', 'LIMIT'].includes(r.action);
      if (rPort === pPort && actionOk) return true;
      // Range check "8000-8100"
      if (rPort.includes('-')) {
        const [lo, hi] = rPort.split('-').map(Number);
        if (p.port >= lo && p.port <= hi && actionOk) return true;
      }
      return false;
    });

    groups[key].ports.push({
      port: p.port,
      protocol: p.protocol,
      address: p.address,
      exposed: p.exposed,
      firewallAllowed: isAllowed,
    });
  });

  return {
    firewall: fw,
    services: Object.values(groups),
    dockerContainers: dockerPorts.length,
  };
}

// ═══════════════════════════════════
// UPnP Port Forwarding (Router)
// ═══════════════════════════════════

const dgram = require('dgram');
const { URL } = require('url');

// SSDP discovery — find the router's UPnP control URL
function upnpDiscover(timeout = 3000) {
  return new Promise((resolve, reject) => {
    const SSDP_ADDR = '239.255.255.250';
    const SSDP_PORT = 1900;
    const searchTarget = 'urn:schemas-upnp-org:device:InternetGatewayDevice:1';
    
    const msg = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 3\r\n' +
      `ST: ${searchTarget}\r\n` +
      '\r\n'
    );

    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let found = false;

    sock.on('message', (data) => {
      if (found) return;
      const response = data.toString();
      const locMatch = response.match(/LOCATION:\s*(.*?)\r\n/i);
      if (locMatch) {
        found = true;
        sock.close();
        resolve(locMatch[1].trim());
      }
    });

    sock.on('error', (err) => { sock.close(); reject(err); });
    sock.bind(() => {
      sock.addMembership(SSDP_ADDR);
      sock.send(msg, 0, msg.length, SSDP_PORT, SSDP_ADDR);
    });

    setTimeout(() => {
      if (!found) { sock.close(); reject(new Error('UPnP gateway not found')); }
    }, timeout);
  });
}

// Fetch XML from URL using http/https
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? require('https') : require('http');
    mod.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function httpPost(url, body, soapAction) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? require('https') : require('http');
    const options = {
      hostname: parsed.hostname, port: parsed.port, path: parsed.pathname,
      method: 'POST', timeout: 5000,
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'Content-Length': Buffer.byteLength(body),
        'SOAPAction': `"${soapAction}"`,
      },
    };
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Parse router description XML to find WANIPConnection control URL
async function getControlUrl(descUrl) {
  const xml = await httpGet(descUrl);
  const parsed = new URL(descUrl);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  
  // Look for WANIPConnection or WANPPPConnection service
  const serviceTypes = [
    'urn:schemas-upnp-org:service:WANIPConnection:1',
    'urn:schemas-upnp-org:service:WANPPPConnection:1',
    'urn:schemas-upnp-org:service:WANIPConnection:2',
  ];
  
  for (const st of serviceTypes) {
    const stIdx = xml.indexOf(st);
    if (stIdx === -1) continue;
    const ctrlMatch = xml.substring(stIdx).match(/<controlURL>(.*?)<\/controlURL>/i);
    if (ctrlMatch) {
      const ctrlPath = ctrlMatch[1];
      const serviceType = st;
      return { 
        controlUrl: ctrlPath.startsWith('http') ? ctrlPath : baseUrl + ctrlPath, 
        serviceType 
      };
    }
  }
  throw new Error('WANIPConnection service not found in router');
}

// Get external IP from router
async function upnpGetExternalIP(controlUrl, serviceType) {
  const body = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body><u:GetExternalIPAddress xmlns:u="${serviceType}"></u:GetExternalIPAddress></s:Body>
</s:Envelope>`;
  const res = await httpPost(controlUrl, body, `${serviceType}#GetExternalIPAddress`);
  const ipMatch = res.body.match(/<NewExternalIPAddress>(.*?)<\/NewExternalIPAddress>/i);
  return ipMatch ? ipMatch[1] : null;
}

// List existing port mappings
async function upnpListMappings(controlUrl, serviceType) {
  const mappings = [];
  for (let i = 0; i < 100; i++) {
    const body = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body><u:GetGenericPortMappingEntry xmlns:u="${serviceType}">
    <NewPortMappingIndex>${i}</NewPortMappingIndex>
  </u:GetGenericPortMappingEntry></s:Body>
</s:Envelope>`;
    try {
      const res = await httpPost(controlUrl, body, `${serviceType}#GetGenericPortMappingEntry`);
      if (res.status !== 200 || res.body.includes('SpecifiedArrayIndexInvalid') || res.body.includes('Fault')) break;
      
      const get = (tag) => { const m = res.body.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 'i')); return m ? m[1] : ''; };
      mappings.push({
        externalPort: parseInt(get('NewExternalPort')) || 0,
        internalPort: parseInt(get('NewInternalPort')) || 0,
        internalClient: get('NewInternalClient'),
        protocol: get('NewProtocol'),
        description: get('NewPortMappingDescription'),
        enabled: get('NewEnabled') === '1',
        leaseDuration: parseInt(get('NewLeaseDuration')) || 0,
      });
    } catch { break; }
  }
  return mappings;
}

// Add a port mapping
async function upnpAddMapping(controlUrl, serviceType, externalPort, internalPort, protocol, internalClient, description, leaseDuration = 0) {
  const body = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body><u:AddPortMapping xmlns:u="${serviceType}">
    <NewRemoteHost></NewRemoteHost>
    <NewExternalPort>${externalPort}</NewExternalPort>
    <NewProtocol>${protocol.toUpperCase()}</NewProtocol>
    <NewInternalPort>${internalPort}</NewInternalPort>
    <NewInternalClient>${internalClient}</NewInternalClient>
    <NewEnabled>1</NewEnabled>
    <NewPortMappingDescription>${description}</NewPortMappingDescription>
    <NewLeaseDuration>${leaseDuration}</NewLeaseDuration>
  </u:AddPortMapping></s:Body>
</s:Envelope>`;
  const res = await httpPost(controlUrl, body, `${serviceType}#AddPortMapping`);
  if (res.status !== 200 && !res.body.includes('AddPortMappingResponse')) {
    const errMatch = res.body.match(/<errorDescription>(.*?)<\/errorDescription>/i);
    throw new Error(errMatch ? errMatch[1] : `UPnP error (HTTP ${res.status})`);
  }
  return true;
}

// Remove a port mapping
async function upnpRemoveMapping(controlUrl, serviceType, externalPort, protocol) {
  const body = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body><u:DeletePortMapping xmlns:u="${serviceType}">
    <NewRemoteHost></NewRemoteHost>
    <NewExternalPort>${externalPort}</NewExternalPort>
    <NewProtocol>${protocol.toUpperCase()}</NewProtocol>
  </u:DeletePortMapping></s:Body>
</s:Envelope>`;
  const res = await httpPost(controlUrl, body, `${serviceType}#DeletePortMapping`);
  if (res.status !== 200 && !res.body.includes('DeletePortMappingResponse')) {
    const errMatch = res.body.match(/<errorDescription>(.*?)<\/errorDescription>/i);
    throw new Error(errMatch ? errMatch[1] : `UPnP error (HTTP ${res.status})`);
  }
  return true;
}

// Get local IP for the interface that reaches the gateway
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && !name.startsWith('docker') && !name.startsWith('br-') && !name.startsWith('veth')) {
        return addr.address;
      }
    }
  }
  return '0.0.0.0';
}

// Cached UPnP gateway info (re-discover every 10 min)
let upnpCache = { controlUrl: null, serviceType: null, ts: 0 };
async function getUpnpGateway() {
  const now = Date.now();
  if (upnpCache.controlUrl && (now - upnpCache.ts) < 600000) return upnpCache;
  try {
    const descUrl = await upnpDiscover(4000);
    const { controlUrl, serviceType } = await getControlUrl(descUrl);
    upnpCache = { controlUrl, serviceType, ts: now, descUrl };
    return upnpCache;
  } catch (e) {
    throw new Error(`Router UPnP not available: ${e.message}`);
  }
}

// ═══════════════════════════════════
// Hardware / GPU Driver Management
// ═══════════════════════════════════
function getHardwareGpuInfo() {
  const result = {
    gpus: [],
    currentDriver: null,
    driverVersion: null,
    availableDrivers: [],
    kernelModules: [],
  };

  // Detect GPUs via lspci
  const lspci = run('lspci -nn 2>/dev/null | grep -iE "VGA|3D|Display"');
  if (lspci) {
    lspci.split('\n').filter(Boolean).forEach(line => {
      const vendor = line.toLowerCase().includes('nvidia') ? 'nvidia'
        : line.toLowerCase().includes('amd') || line.toLowerCase().includes('ati') ? 'amd'
        : line.toLowerCase().includes('intel') ? 'intel' : 'unknown';
      const pciMatch = line.match(/\[([0-9a-f]{4}:[0-9a-f]{4})\]/i);
      result.gpus.push({
        description: line.replace(/^\S+\s+/, '').trim(),
        vendor,
        pciId: pciMatch ? pciMatch[1] : null,
      });
    });
  }
  
  // ARM/SBC fallback: detect GPU from device tree or kernel
  if (result.gpus.length === 0) {
    // Raspberry Pi VideoCore
    const vcgencmd = run('vcgencmd get_mem gpu 2>/dev/null');
    if (vcgencmd) {
      const model = run('cat /proc/device-tree/model 2>/dev/null') || 'Raspberry Pi';
      const gpuMem = vcgencmd.replace('gpu=', '').replace('M', ' MB').trim();
      result.gpus.push({
        description: `${model.trim()} — VideoCore (${gpuMem})`,
        vendor: 'broadcom',
        pciId: null,
      });
      result.currentDriver = 'v3d';
    }
    // Generic ARM GPU via /sys
    if (result.gpus.length === 0) {
      const gpuDevs = run('ls /sys/class/drm/card*/device/driver 2>/dev/null | head -1');
      if (gpuDevs) {
        const driverName = run('basename $(readlink /sys/class/drm/card0/device/driver) 2>/dev/null') || 'unknown';
        const model = run('cat /proc/device-tree/model 2>/dev/null') || 'ARM Device';
        result.gpus.push({
          description: `${model.trim()} — ${driverName}`,
          vendor: 'arm',
          pciId: null,
        });
        result.currentDriver = driverName;
      }
    }
  }

  // Current NVIDIA driver
  if (HAS_NVIDIA) {
    const ver = run('nvidia-smi --query-gpu=driver_version --format=csv,noheader,nounits 2>/dev/null');
    if (ver) {
      result.currentDriver = 'nvidia';
      result.driverVersion = ver.trim().split('\n')[0];
    }
  }

  // AMD driver
  const amdgpu = run('lsmod 2>/dev/null | grep amdgpu');
  if (amdgpu) {
    result.currentDriver = result.currentDriver || 'amdgpu';
    const amdVer = run('modinfo amdgpu 2>/dev/null | grep ^version:');
    if (amdVer) result.driverVersion = result.driverVersion || amdVer.replace('version:', '').trim();
  }

  // Intel driver
  const i915 = run('lsmod 2>/dev/null | grep i915');
  if (i915) {
    result.currentDriver = result.currentDriver || 'i915';
  }

  // Nouveau fallback
  const nouveau = run('lsmod 2>/dev/null | grep nouveau');
  if (nouveau) {
    result.currentDriver = result.currentDriver || 'nouveau';
    result.driverVersion = result.driverVersion || 'open-source';
  }

  // Loaded GPU kernel modules
  const mods = run('lsmod 2>/dev/null | grep -iE "nvidia|amdgpu|radeon|i915|nouveau"');
  if (mods) {
    result.kernelModules = mods.split('\n').filter(Boolean).map(l => {
      const parts = l.split(/\s+/);
      return { name: parts[0], size: parts[1], usedBy: parts[3] || '' };
    });
  }

  // Available drivers via ubuntu-drivers
  const ubuntuDrivers = run('ubuntu-drivers devices 2>/dev/null');
  if (ubuntuDrivers) {
    ubuntuDrivers.split('\n').filter(l => l.includes('driver')).forEach(line => {
      const match = line.match(/(nvidia-driver-\S+|xserver-xorg-video-\S+)/);
      if (match) {
        result.availableDrivers.push({
          package: match[1],
          recommended: line.toLowerCase().includes('recommended'),
          installed: line.toLowerCase().includes('installed'),
        });
      }
    });
  }

  // Fallback: check installed nvidia packages
  if (result.availableDrivers.length === 0 && result.gpus.some(g => g.vendor === 'nvidia')) {
    const aptList = run('apt list --installed 2>/dev/null | grep nvidia-driver');
    if (aptList) {
      aptList.split('\n').filter(Boolean).forEach(line => {
        const pkg = line.split('/')[0];
        if (pkg) result.availableDrivers.push({ package: pkg, installed: true, recommended: false });
      });
    }
  }

  return result;
}

// GPU (detect once at startup, skip if absent)
// ═══════════════════════════════════
const HAS_NVIDIA = !!run('which nvidia-smi 2>/dev/null');
const HAS_AMD_DRM = (() => {
  try {
    return fs.readdirSync('/sys/class/drm').some(d => {
      if (!d.match(/^card\d$/)) return false;
      return readFile(`/sys/class/drm/${d}/device/gpu_busy_percent`) !== null;
    });
  } catch { return false; }
})();

function getGpu() {
  const gpus = [];

  if (HAS_NVIDIA) {
    const nvidia = run('nvidia-smi --query-gpu=index,name,utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null');
    if (nvidia) {
      nvidia.split('\n').forEach(line => {
        const [index, name, util, temp, memUsed, memTotal] = line.split(',').map(s => s.trim());
        gpus.push({
          index: parseInt(index),
          name,
          utilization: parseInt(util),
          temperature: parseInt(temp),
          memUsed: parseInt(memUsed),
          memTotal: parseInt(memTotal),
          memPercent: memTotal > 0 ? Math.round((parseInt(memUsed) / parseInt(memTotal)) * 100) : 0,
          driver: 'nvidia',
        });
      });
    }
  }

  if (HAS_AMD_DRM) {
    try {
      const amdDevs = fs.readdirSync('/sys/class/drm').filter(d => d.match(/^card\d$/));
      for (const card of amdDevs) {
        const busy = readFile(`/sys/class/drm/${card}/device/gpu_busy_percent`);
        const temp = readFile(`/sys/class/drm/${card}/device/hwmon/hwmon*/temp1_input`);
        if (busy !== null) {
          gpus.push({
            index: gpus.length,
            name: `AMD GPU (${card})`,
            utilization: parseInt(busy) || 0,
            temperature: temp ? Math.round(parseInt(temp) / 1000) : 0,
            memUsed: 0, memTotal: 0, memPercent: 0,
            driver: 'amd',
          });
        }
      }
    } catch {}
  }

  return gpus;
}

// ═══════════════════════════════════
// Temperature (auto-detect sources)
// ═══════════════════════════════════
function getTemps(gpusCache) {
  const temps = {};

  // CPU temp via /sys/class/thermal
  try {
    const zones = fs.readdirSync('/sys/class/thermal').filter(z => z.startsWith('thermal_zone'));
    for (const zone of zones) {
      const type = readFile(`/sys/class/thermal/${zone}/type`);
      const temp = readFile(`/sys/class/thermal/${zone}/temp`);
      if (type && temp) {
        temps[type] = Math.round(parseInt(temp) / 1000);
      }
    }
  } catch {}

  // Try lm-sensors as fallback
  if (Object.keys(temps).length === 0 && HAS_SENSORS) {
    const sensors = run('sensors -u 2>/dev/null');
    if (sensors) {
      const m = sensors.match(/temp1_input:\s+([\d.]+)/);
      if (m) temps['cpu'] = Math.round(parseFloat(m[1]));
    }
  }

  // GPU temps — use cached gpus if available to avoid double nvidia-smi
  const gpus = gpusCache || getGpu();
  gpus.forEach((g, i) => {
    if (g.temperature > 0) temps[`gpu${i}`] = g.temperature;
  });

  return temps;
}

// ═══════════════════════════════════
// Network
// ═══════════════════════════════════
let prevNet = {};

function getNetwork() {
  const interfaces = [];
  const netDir = '/sys/class/net';

  // Get all IPs in one call instead of per-interface
  const allIps = {};
  const ipOutput = run("ip -4 -o addr show 2>/dev/null");
  if (ipOutput) {
    ipOutput.split('\n').forEach(line => {
      const m = line.match(/^\d+:\s+(\S+)\s+inet\s+([\d.]+)/);
      if (m) allIps[m[1]] = m[2];
    });
  }

  // Only physical network interfaces (exclude virtual, docker, bridges, etc.)
  const isPhysicalInterface = (dev) => {
    // Exclude: lo, docker*, br-*, veth*, virbr*, tun*, tap*
    if (dev === 'lo') return false;
    if (dev.startsWith('docker')) return false;
    if (dev.startsWith('br-')) return false;
    if (dev.startsWith('veth')) return false;
    if (dev.startsWith('virbr')) return false;
    if (dev.startsWith('tun')) return false;
    if (dev.startsWith('tap')) return false;
    // Check if it's a physical device
    const physicalPath = `/sys/class/net/${dev}/device`;
    try {
      fs.statSync(physicalPath);
      return true; // Has a physical device backing
    } catch {
      // No physical device, but allow common naming patterns
      return dev.startsWith('eth') || dev.startsWith('enp') || dev.startsWith('eno') || dev.startsWith('ens') || dev.startsWith('wl');
    }
  };

  try {
    const devs = fs.readdirSync(netDir).filter(d => isPhysicalInterface(d));
    for (const dev of devs) {
      const operstate = readFile(`${netDir}/${dev}/operstate`) || 'unknown';
      
      // Only include interfaces that are UP
      if (operstate !== 'up') continue;
      
      const speed = readFile(`${netDir}/${dev}/speed`);
      const rxBytes = parseInt(readFile(`${netDir}/${dev}/statistics/rx_bytes`) || '0');
      const txBytes = parseInt(readFile(`${netDir}/${dev}/statistics/tx_bytes`) || '0');
      const mac = readFile(`${netDir}/${dev}/address`) || '';
      const isWifi = dev.startsWith('wl');
      
      // Get WiFi info if wireless
      let ssid = null, signal = null;
      if (isWifi) {
        ssid = run(`iwgetid -r ${dev} 2>/dev/null`) || run(`nmcli -t -f active,ssid dev wifi 2>/dev/null | grep '^yes' | cut -d: -f2`) || null;
        const sigRaw = run(`iwconfig ${dev} 2>/dev/null | grep -i signal`);
        if (sigRaw) {
          const sigMatch = sigRaw.match(/Signal level[=:]?\s*(-?\d+)/i);
          if (sigMatch) signal = parseInt(sigMatch[1]);
        }
      }

      const prev = prevNet[dev];
      let rxRate = 0, txRate = 0;
      if (prev) {
        const dt = (Date.now() - prev.time) / 1000;
        if (dt > 0) {
          rxRate = Math.round((rxBytes - prev.rx) / dt);
          txRate = Math.round((txBytes - prev.tx) / dt);
        }
      }
      prevNet[dev] = { rx: rxBytes, tx: txBytes, time: Date.now() };

      interfaces.push({
        name: dev,
        type: isWifi ? 'wifi' : 'ethernet',
        status: operstate,
        speed: speed && parseInt(speed) > 0 ? `${speed} Mbps` : isWifi && ssid ? 'WiFi' : '—',
        ip: allIps[dev] || '—',
        mac,
        ssid: ssid ? ssid.trim() : null,
        signal,
        rxBytes, txBytes,
        rxRate, txRate,
        rxRateFormatted: formatBytes(rxRate) + '/s',
        txRateFormatted: formatBytes(txRate) + '/s',
      });
    }
  } catch {}

  return interfaces;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

// ═══════════════════════════════════
// Disks (with caching for expensive operations)
// ═══════════════════════════════════
let diskCache = null;
let diskCacheTime = 0;
const DISK_CACHE_MS = 60000; // refresh hardware info every 60s

function getDisks() {
  const now = Date.now();

  // Cache lsblk + smartctl results — they don't change often
  if (!diskCache || (now - diskCacheTime) > DISK_CACHE_MS) {
    const disks = [];
    const lsblk = run('lsblk -Jbdo NAME,SIZE,MODEL,TYPE,TRAN 2>/dev/null');
    if (lsblk) {
      try {
        const data = JSON.parse(lsblk);
        (data.blockdevices || []).forEach(dev => {
          if (dev.type !== 'disk') return;
          if (dev.name.startsWith('loop') || dev.name.startsWith('ram') || dev.name.startsWith('zram')) return;
          if (parseInt(dev.size) <= 0) return;

          let temp = null;
          if (HAS_SMARTCTL) {
            const smart = run(`smartctl -A /dev/${dev.name} 2>/dev/null | grep -i temperature | head -1`);
            if (smart) {
              const m = smart.match(/(\d+)\s*$/);
              if (m) temp = parseInt(m[1]);
            }
          }

          disks.push({
            name: `/dev/${dev.name}`,
            model: (dev.model || 'Unknown').trim(),
            size: parseInt(dev.size),
            sizeFormatted: formatBytes(parseInt(dev.size)),
            temperature: temp,
            transport: dev.tran || '—',
            type: 'disk',
          });
        });
      } catch {}
    }

    // RAID detection
    const mdstat = readFile('/proc/mdstat');
    const raids = [];
    if (mdstat) {
      const matches = mdstat.matchAll(/^(md\d+)\s*:\s*active\s+(\w+)\s+(.+)/gm);
      for (const m of matches) {
        raids.push({ name: m[1], type: m[2], devices: m[3].trim() });
      }
    }

    diskCache = { disks, raids };
    diskCacheTime = now;
  }

  // df is cheap, always refresh for current usage
  const mounts = [];
  const df = run('df -B1 --output=source,size,used,avail,target 2>/dev/null');
  if (df) {
    df.split('\n').slice(1).forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[0].startsWith('/dev/')) {
        if (parts[0].includes('loop')) return;
        mounts.push({
          device: parts[0],
          total: parseInt(parts[1]),
          used: parseInt(parts[2]),
          available: parseInt(parts[3]),
          mount: parts[4],
          totalFormatted: formatBytes(parseInt(parts[1])),
          usedFormatted: formatBytes(parseInt(parts[2])),
          percent: Math.round((parseInt(parts[2]) / parseInt(parts[1])) * 100),
        });
      }
    });
  }

  return { ...diskCache, mounts };
}

// ═══════════════════════════════════
// Uptime
// ═══════════════════════════════════
function getUptime() {
  const raw = readFile('/proc/uptime');
  if (!raw) return '—';
  const secs = parseFloat(raw.split(' ')[0]);
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ═══════════════════════════════════
// System summary (for widgets)
// ═══════════════════════════════════
function getSystemSummary() {
  const cpu = getCpuUsage();
  const mem = getMemory();
  const gpus = getGpu();
  const temps = getTemps(gpus); // pass gpus to avoid double nvidia-smi call
  const network = getNetwork();
  const diskInfo = getDisks();
  const uptime = getUptime();

  // Pick main temp (prefer cpu, x86_pkg_temp, or first available)
  const mainTemp = temps['x86_pkg_temp'] || temps['cpu'] || temps['coretemp']
    || Object.values(temps)[0] || null;

  // Pick primary network interface (first with an IP)
  const primaryNet = network.find(n => n.ip !== '—' && n.status === 'up') || network[0] || null;

  return {
    cpu,
    memory: mem,
    gpus,
    temps,
    mainTemp,
    network,
    primaryNet,
    disks: diskInfo,
    uptime,
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
  };
}

// ═══════════════════════════════════
// Docker (auto-detect socket, with caching)
// ═══════════════════════════════════
let containerCache = { data: null, time: 0 };
const CONTAINER_CACHE_MS = 5000; // docker stats is very slow, cache 5s

function getContainers() {
  if (!HAS_DOCKER) return [];
  const now = Date.now();
  if (containerCache.data && (now - containerCache.time) < CONTAINER_CACHE_MS) {
    return containerCache.data;
  }

  const raw = run('docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.State}}|{{.CreatedAt}}" 2>/dev/null');
  if (!raw) return [];

  const containers = raw.split('\n').filter(Boolean).map(line => {
    const [id, name, image, status, ports, state, created] = line.split('|');
    return { id, name, image, status, ports: ports || '—', state, created };
  });

  // docker stats --no-stream blocks for ~1-2s, cache aggressively
  const stats = run('docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}" 2>/dev/null');
  if (stats) {
    const statMap = {};
    stats.split('\n').filter(Boolean).forEach(line => {
      const [name, cpu, mem, memPct] = line.split('|');
      statMap[name] = { cpu: cpu || '0%', mem: mem || '—', memPct: memPct || '0%' };
    });
    containers.forEach(c => {
      const s = statMap[c.name];
      if (s) { c.cpu = s.cpu; c.mem = s.mem; c.memPct = s.memPct; }
      else { c.cpu = '—'; c.mem = '—'; c.memPct = '—'; }
    });
  }

  containerCache = { data: containers, time: now };
  return containers;
}

function containerAction(id, action) {
  const allowed = ['start', 'stop', 'restart', 'pause', 'unpause'];
  if (!allowed.includes(action)) return { error: 'Invalid action' };
  
  // SECURITY: Sanitize container ID
  const safeId = sanitizeDockerName(id);
  if (!safeId) return { error: 'Invalid container ID' };
  
  const result = run(`docker ${action} ${safeId} 2>&1`);
  return { ok: true, action, id: safeId, output: result };
}

// ═══════════════════════════════════
// HTTP Server (with response caching)
// ═══════════════════════════════════
let systemCache = { data: null, time: 0 };
const SYSTEM_CACHE_MS = 1500; // 1.5s cache - prevents double hits from widgets+monitor

function getCachedSystem() {
  const now = Date.now();
  if (!systemCache.data || (now - systemCache.time) > SYSTEM_CACHE_MS) {
    systemCache = { data: getSystemSummary(), time: now };
  }
  return systemCache.data;
}

// ═══════════════════════════════════════════════════
// STORAGE MANAGER
// ═══════════════════════════════════════════════════

const NIMBUS_POOLS_DIR = '/nimbus/pools';
const STORAGE_CONFIG_FILE = path.join(CONFIG_DIR, 'storage.json');

function getStorageConfig() {
  try { return JSON.parse(fs.readFileSync(STORAGE_CONFIG_FILE, 'utf8')); }
  catch { return { pools: [], primaryPool: null, alerts: { email: null }, configuredAt: null }; }
}

function saveStorageConfig(config) {
  fs.writeFileSync(STORAGE_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Check if system has at least one pool
function hasPool() {
  const config = getStorageConfig();
  return config.pools && config.pools.length > 0;
}

// Detect and classify all disks per the architecture document
function detectStorageDisks() {
  const result = { eligible: [], nvme: [], usb: [], provisioned: [] };
  
  // Get all block devices with extended info
  const lsblkRaw = run('lsblk -J -b -o NAME,SIZE,TYPE,ROTA,MOUNTPOINT,MODEL,SERIAL,TRAN,RM,FSTYPE,LABEL,PKNAME 2>/dev/null');
  if (!lsblkRaw) return result;
  
  let data;
  try { data = JSON.parse(lsblkRaw); } catch { return result; }
  
  const devices = data.blockdevices || [];
  
  // Find which disk has the root partition
  const rootDisk = findRootDisk(devices);
  
  for (const dev of devices) {
    if (dev.type !== 'disk') continue;
    if (dev.name.startsWith('loop') || dev.name.startsWith('ram') || dev.name.startsWith('zram')) continue;
    
    const size = parseInt(dev.size) || 0;
    if (size <= 0) continue;
    
    const diskInfo = {
      name: dev.name,
      path: `/dev/${dev.name}`,
      model: (dev.model || 'Unknown').trim(),
      serial: (dev.serial || '').trim(),
      size: size,
      sizeFormatted: formatBytes(size),
      transport: dev.tran || 'unknown',
      rotational: dev.rota === true || dev.rota === '1' || dev.rota === 1,
      removable: dev.rm === true || dev.rm === '1' || dev.rm === 1,
      partitions: [],
      smart: null,
      temperature: null,
      isBoot: dev.name === rootDisk,
      freeSpace: 0,
      freeSpaceFormatted: '0 B',
    };
    
    // Get partitions
    let usedSpace = 0;
    if (dev.children) {
      for (const child of dev.children) {
        const partSize = parseInt(child.size) || 0;
        usedSpace += partSize;
        diskInfo.partitions.push({
          name: child.name,
          path: `/dev/${child.name}`,
          size: partSize,
          sizeFormatted: formatBytes(partSize),
          fstype: child.fstype || null,
          label: child.label || null,
          mountpoint: child.mountpoint || null,
        });
      }
    }
    
    // Calculate free space on disk (total - all partitions)
    diskInfo.freeSpace = Math.max(0, size - usedSpace);
    diskInfo.freeSpaceFormatted = formatBytes(diskInfo.freeSpace);
    
    // Get SMART + temperature
    if (HAS_SMARTCTL) {
      const smartHealth = run(`smartctl -H /dev/${dev.name} 2>/dev/null`);
      if (smartHealth) {
        diskInfo.smart = smartHealth.includes('PASSED') ? 'PASSED' : 
                         smartHealth.includes('FAILED') ? 'FAILED' : 'UNKNOWN';
      }
      const smartTemp = run(`smartctl -A /dev/${dev.name} 2>/dev/null | grep -i temperature | head -1`);
      if (smartTemp) {
        const m = smartTemp.match(/(\d+)\s*$/);
        if (m) diskInfo.temperature = parseInt(m[1]);
      }
    }
    
    // CLASSIFY per document rules
    // Rule: USB -> skip ONLY if small/removable (pendrives, SD cards)
    // Large USB disks (HDDs, SSDs via USB) are eligible — important for RPi, mini PCs
    const isUsb = diskInfo.transport === 'usb';
    const minPoolDiskSize = 10 * 1024 * 1024 * 1024; // 10GB minimum for pool disks
    
    if (isUsb && (diskInfo.removable || size < minPoolDiskSize)) {
      diskInfo.classification = 'usb';
      result.usb.push(diskInfo);
      continue;
    }
    
    // Rule: NVMe
    if (dev.name.startsWith('nvme')) {
      diskInfo.classification = dev.name === rootDisk ? 'nvme-system' : 'nvme-cache';
      result.nvme.push(diskInfo);
      continue;
    }
    
    // Check if already part of a NIMBUS pool (by label OR by storage config)
    const hasNimbusLabel = diskInfo.partitions.some(p => 
      p.label && p.label.startsWith('NIMBUS-')
    );
    const storageConf = getStorageConfig();
    const inPool = (storageConf.pools || []).some(pool => 
      (pool.disks || []).includes(diskInfo.path)
    );
    
    if (hasNimbusLabel || inPool) {
      diskInfo.classification = 'provisioned';
      diskInfo.poolName = inPool ? (storageConf.pools || []).find(p => (p.disks || []).includes(diskInfo.path))?.name : null;
      result.provisioned.push(diskInfo);
      continue;
    }
    
    // Detect existing RAID/LVM superblocks (from Synology, old arrays, etc.)
    let hasRaidSuperblock = false;
    let hasForeignData = false;
    for (const part of diskInfo.partitions) {
      const superCheck = run(`mdadm --examine ${part.path} 2>/dev/null`);
      if (superCheck && superCheck.includes('Magic')) hasRaidSuperblock = true;
      if (part.fstype === 'LVM2_member' || part.fstype === 'linux_raid_member') hasRaidSuperblock = true;
    }
    // Also check raw disk for RAID superblock
    const diskSuperCheck = run(`mdadm --examine ${diskInfo.path} 2>/dev/null`);
    if (diskSuperCheck && diskSuperCheck.includes('Magic')) hasRaidSuperblock = true;
    
    diskInfo.hasRaidSuperblock = hasRaidSuperblock;
    diskInfo.hasExistingData = diskInfo.partitions.length > 0;
    diskInfo.needsWipe = hasRaidSuperblock || diskInfo.hasExistingData;
    
    // Rule: Boot disk with free space OR clean disk -> eligible
    // Boot disk participates in pool using its free space (system partitions stay intact)
    // Non-boot disk uses entire disk
    if (diskInfo.isBoot) {
      // Boot disk: eligible ONLY if it has enough free space (min 5GB)
      const minFreeBytes = 5 * 1024 * 1024 * 1024; // 5GB
      if (diskInfo.freeSpace >= minFreeBytes) {
        diskInfo.classification = diskInfo.rotational ? 'hdd' : 'ssd';
        diskInfo.availableSpace = diskInfo.freeSpace;
        diskInfo.availableSpaceFormatted = formatBytes(diskInfo.freeSpace);
        diskInfo.hasExistingData = false; // System partitions are expected
        result.eligible.push(diskInfo);
      }
      // If not enough free space, boot disk just doesn't appear as eligible
      // (no separate 'boot' category needed)
    } else {
      // Non-boot disk: use entire disk
      diskInfo.classification = diskInfo.rotational ? 'hdd' : 'ssd';
      diskInfo.availableSpace = size;
      diskInfo.availableSpaceFormatted = formatBytes(size);
      diskInfo.hasExistingData = diskInfo.partitions.length > 0;
      result.eligible.push(diskInfo);
    }
  }
  
  return result;
}

function findRootDisk(devices) {
  for (const dev of devices) {
    if (dev.children) {
      for (const child of dev.children) {
        if (child.mountpoint === '/') return dev.name;
      }
    }
    if (dev.mountpoint === '/') return dev.name;
  }
  return null;
}

// Get RAID array status from /proc/mdstat
function getRAIDStatus() {
  const mdstat = readFile('/proc/mdstat');
  const arrays = [];
  
  if (!mdstat) return arrays;
  
  const lines = mdstat.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(md\d+)\s*:\s*active\s+(\w+)\s+(.+)/);
    if (!match) continue;
    
    const name = match[1];
    const level = match[2];
    const devicesStr = match[3];
    
    // Parse member devices
    const members = [];
    const devMatches = devicesStr.matchAll(/(\w+)\[(\d+)\](\((?:S|F)\))?/g);
    for (const dm of devMatches) {
      members.push({
        device: dm[1],
        index: parseInt(dm[2]),
        spare: dm[3] === '(S)',
        failed: dm[3] === '(F)',
      });
    }
    
    // Next line has blocks and status
    let status = 'active';
    let progress = null;
    let totalBlocks = 0;
    if (i + 1 < lines.length) {
      const statusLine = lines[i + 1];
      const blocksMatch = statusLine.match(/(\d+)\s+blocks/);
      if (blocksMatch) totalBlocks = parseInt(blocksMatch[1]);
      
      if (statusLine.includes('[_')) status = 'degraded';
    }
    if (i + 2 < lines.length) {
      const progressLine = lines[i + 2];
      const rebuildMatch = progressLine.match(/recovery\s*=\s*([\d.]+)%/);
      const reshapeMatch = progressLine.match(/reshape\s*=\s*([\d.]+)%/);
      if (rebuildMatch) {
        status = 'rebuilding';
        progress = parseFloat(rebuildMatch[1]);
      } else if (reshapeMatch) {
        status = 'reshaping';
        progress = parseFloat(reshapeMatch[1]);
      }
    }
    
    // Get detailed info
    const detail = run(`mdadm --detail /dev/${name} 2>/dev/null`);
    let uuid = null, arraySize = 0;
    if (detail) {
      const uuidMatch = detail.match(/UUID\s*:\s*(\S+)/);
      if (uuidMatch) uuid = uuidMatch[1];
      const sizeMatch = detail.match(/Array Size\s*:\s*(\d+)/);
      if (sizeMatch) arraySize = parseInt(sizeMatch[1]) * 1024; // KB to bytes
    }
    
    arrays.push({
      name, level, status, progress, members, uuid,
      totalBlocks, arraySize, arraySizeFormatted: formatBytes(arraySize),
    });
  }
  
  return arrays;
}

// Get pool info (RAID arrays that are mounted as nimbus pools)
function getStoragePools() {
  const config = getStorageConfig();
  const raids = getRAIDStatus();
  const pools = [];
  
  for (const poolConf of (config.pools || [])) {
    const raid = raids.find(r => r.name === poolConf.arrayName);
    const mountInfo = run(`df -B1 --output=size,used,avail ${poolConf.mountPoint} 2>/dev/null`);
    
    let total = 0, used = 0, available = 0;
    if (mountInfo) {
      const lines = mountInfo.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].trim().split(/\s+/);
        total = parseInt(parts[0]) || 0;
        used = parseInt(parts[1]) || 0;
        available = parseInt(parts[2]) || 0;
      }
    }
    
    // Determine pool status
    let poolStatus = 'unknown';
    if (raid) {
      poolStatus = raid.status; // RAID array: use mdstat status
    } else if (poolConf.raidLevel === 'single' || poolConf.arrayName === null) {
      // Single disk pool: check if mounted and has data
      poolStatus = total > 0 ? 'active' : 'unmounted';
    }
    
    pools.push({
      name: poolConf.name,
      arrayName: poolConf.arrayName,
      arrayPath: poolConf.arrayName ? `/dev/${poolConf.arrayName}` : null,
      mountPoint: poolConf.mountPoint,
      raidLevel: poolConf.raidLevel,
      filesystem: poolConf.filesystem || 'ext4',
      createdAt: poolConf.createdAt,
      disks: poolConf.disks || [],
      status: poolStatus,
      rebuildProgress: raid ? raid.progress : null,
      members: raid ? raid.members : [],
      total, used, available,
      totalFormatted: formatBytes(total),
      usedFormatted: formatBytes(used),
      availableFormatted: formatBytes(available),
      usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
      isPrimary: poolConf.name === config.primaryPool,
    });
  }
  
  return pools;
}

// Create a new RAID pool
function createPool(name, disks, level, filesystem = 'ext4') {
  // Validate name
  if (!name || !/^[a-zA-Z0-9-]{1,32}$/.test(name)) {
    return { error: 'Invalid pool name. Use alphanumeric + hyphens, max 32 chars.' };
  }
  const reserved = ['system', 'config', 'temp', 'swap', 'root', 'boot'];
  if (reserved.includes(name.toLowerCase())) {
    return { error: `"${name}" is a reserved name.` };
  }
  
  // Check name not taken
  const config = getStorageConfig();
  if ((config.pools || []).find(p => p.name === name)) {
    return { error: `Pool "${name}" already exists.` };
  }
  
  // Validate disks
  if (!disks || !Array.isArray(disks) || disks.length < 1) {
    return { error: 'At least 1 disk required.' };
  }
  
  // Validate RAID level vs disk count
  const levelInt = parseInt(level);
  const isSingleDisk = disks.length === 1;
  
  if (!isSingleDisk) {
    const minDisks = { 0: 2, 1: 2, 5: 3, 6: 4, 10: 4 };
    if (minDisks[levelInt] === undefined) {
      return { error: `Invalid RAID level: ${level}. Use 0, 1, 5, 6, or 10.` };
    }
    if (disks.length < minDisks[levelInt]) {
      return { error: `RAID ${level} requires at least ${minDisks[levelInt]} disks. You selected ${disks.length}.` };
    }
    if (levelInt === 10 && disks.length % 2 !== 0) {
      return { error: 'RAID 10 requires an even number of disks.' };
    }
  }
  
  // Validate filesystem
  if (!['ext4', 'xfs'].includes(filesystem)) {
    return { error: 'Filesystem must be ext4 or xfs.' };
  }
  
  // Verify disks are eligible
  const detected = detectStorageDisks();
  const eligiblePaths = detected.eligible.map(d => d.path);
  for (const disk of disks) {
    if (!eligiblePaths.includes(disk)) {
      return { error: `Disk ${disk} is not eligible for pool creation.` };
    }
  }
  
  // Find next available md device
  const raids = getRAIDStatus();
  const usedMds = raids.map(r => parseInt(r.name.replace('md', '')));
  let mdNum = 0;
  while (usedMds.includes(mdNum)) mdNum++;
  const mdName = `md${mdNum}`;
  const mdPath = `/dev/${mdName}`;
  const mountPoint = `${NIMBUS_POOLS_DIR}/${name}`;
  
  try {
    // 1. Partition each disk
    // Boot disks: add new partition in free space (keep system partitions)
    // Non-boot disks: wipe and use entire disk
    const detected = detectStorageDisks();
    const partitions = [];
    
    // Check if basic tools exist
    const hasSgdisk = !!(run('which sgdisk 2>/dev/null'));
    const hasMdadm = !!(run('which mdadm 2>/dev/null'));
    
    for (const disk of disks) {
      const diskInfo = detected.eligible.find(d => d.path === disk);
      const isBoot = diskInfo && diskInfo.isBoot;
      
      // Clear any existing RAID superblocks and LVM from this disk
      if (!isBoot && hasMdadm) {
        // Stop any arrays this disk is part of
        const mdstat = readFile('/proc/mdstat') || '';
        const diskName = disk.replace('/dev/', '');
        for (const line of mdstat.split('\n')) {
          if (line.includes(diskName)) {
            const arrayMatch = line.match(/^(md\d+)/);
            if (arrayMatch) {
              execSync(`mdadm --stop /dev/${arrayMatch[1]} 2>/dev/null || true`, { timeout: 10000 });
            }
          }
        }
        // Clear superblocks from all existing partitions
        if (diskInfo && diskInfo.partitions) {
          for (const part of diskInfo.partitions) {
            execSync(`mdadm --zero-superblock ${part.path} 2>/dev/null || true`, { timeout: 5000 });
            execSync(`pvremove -f ${part.path} 2>/dev/null || true`, { timeout: 5000 });
          }
        }
        execSync(`mdadm --zero-superblock ${disk} 2>/dev/null || true`, { timeout: 5000 });
      }
      
      if (isBoot) {
        // Boot disk: find next available partition number and create in free space
        if (!hasSgdisk) return { error: 'sgdisk is required for boot disk partitioning. Install: sudo apt install gdisk' };
        const existingParts = diskInfo.partitions.length;
        const nextPartNum = existingParts + 1;
        execSync(`sgdisk -n ${nextPartNum}:0:0 -t ${nextPartNum}:FD00 -c ${nextPartNum}:"NIMBUS-DATA" ${disk}`, { timeout: 10000 });
        partitions.push(`${disk}${nextPartNum}`);
        console.log(`[Storage] Boot disk ${disk}: created partition ${nextPartNum} in free space`);
      } else if (isSingleDisk) {
        // Single non-boot disk: simple approach that works on any platform (Pi, mini PC, etc)
        
        // First: unmount ALL partitions on this disk
        if (diskInfo && diskInfo.partitions) {
          for (const part of diskInfo.partitions) {
            if (part.mountpoint) {
              console.log(`[Storage] Unmounting ${part.path} (was mounted at ${part.mountpoint})`);
              execSync(`umount -f ${part.path} 2>/dev/null || true`, { timeout: 10000 });
            }
          }
        }
        // Also try unmounting the disk itself
        execSync(`umount -f ${disk} 2>/dev/null || true`, { timeout: 5000 });
        // Remove any fstab entries for this disk
        execSync(`sed -i '\\|${disk}|d' /etc/fstab 2>/dev/null || true`, { timeout: 5000 });
        
        // Wait for unmount
        execSync('sleep 1');
        
        // Wipe and repartition
        execSync(`wipefs -a ${disk} 2>/dev/null || true`, { timeout: 10000 });
        
        if (hasSgdisk) {
          execSync(`sgdisk -Z ${disk} 2>/dev/null || true`, { timeout: 10000 });
          execSync(`sgdisk -n 1:0:0 -t 1:8300 -c 1:"NIMBUS-DATA" ${disk}`, { timeout: 10000 });
        } else {
          // Fallback: use sfdisk (always available on Debian/Ubuntu)
          execSync(`echo ";" | sfdisk --force ${disk} 2>/dev/null || true`, { timeout: 10000 });
        }
        
        // Detect partition name (handle /dev/sda1 vs /dev/mmcblk0p1)
        execSync(`partprobe ${disk} 2>/dev/null || true`, { timeout: 5000 });
        execSync('sleep 2');
        
        // Find the new partition
        const newParts = run(`lsblk -lnp -o NAME ${disk} 2>/dev/null`) || '';
        const partLines = newParts.trim().split('\n').filter(l => l.trim() !== disk);
        if (partLines.length > 0) {
          partitions.push(partLines[partLines.length - 1].trim());
        } else {
          // No partition table needed — format the whole disk directly
          partitions.push(disk);
        }
        console.log(`[Storage] Single disk ${disk}: partition ${partitions[partitions.length - 1]}`);
      } else {
        // Multi-disk RAID: need sgdisk
        if (!hasSgdisk) return { error: 'sgdisk is required for RAID. Install: sudo apt install gdisk' };
        execSync(`sgdisk -Z ${disk} 2>/dev/null || true`, { timeout: 10000 });
        execSync(`sgdisk -n 1:0:0 -t 1:FD00 -c 1:"NIMBUS-DATA" ${disk}`, { timeout: 10000 });
        partitions.push(`${disk}1`);
        console.log(`[Storage] Clean disk ${disk}: wiped and created partition 1`);
      }
    }
    
    execSync(`partprobe ${disks.join(' ')} 2>/dev/null || true`, { timeout: 10000 });
    
    // Wait for partitions to appear
    execSync('sleep 2');
    
    // 2. Create RAID array (or single disk)
    if (isSingleDisk) {
      // Single disk: no RAID, just format the partition directly
      const mkfsCmd = filesystem === 'xfs' 
        ? `mkfs.xfs -f -L nimbus-${name} ${partitions[0]}`
        : `mkfs.ext4 -F -L nimbus-${name} ${partitions[0]}`;
      execSync(mkfsCmd, { timeout: 120000 });
      
      // Mount
      execSync(`mkdir -p ${mountPoint}`, { timeout: 5000 });
      execSync(`mount ${partitions[0]} ${mountPoint}`, { timeout: 10000 });
      
      // fstab
      const uuid = run(`blkid -s UUID -o value ${partitions[0]}`) || '';
      execSync(`echo "UUID=${uuid.trim()} ${mountPoint} ${filesystem} defaults,noatime 0 2" >> /etc/fstab`);
      
    } else {
      // RAID array
      const raidLevel = levelInt === 10 ? '10' : `${levelInt}`;
      const mdadmCmd = `mdadm --create ${mdPath} --level=${raidLevel} --raid-devices=${disks.length} --metadata=1.2 --run ${partitions.join(' ')}`;
      execSync(mdadmCmd, { timeout: 30000 });
      
      // Format
      const mkfsCmd = filesystem === 'xfs'
        ? `mkfs.xfs -f -L nimbus-${name} ${mdPath}`
        : `mkfs.ext4 -F -L nimbus-${name} ${mdPath}`;
      execSync(mkfsCmd, { timeout: 120000 });
      
      // Mount
      execSync(`mkdir -p ${mountPoint}`, { timeout: 5000 });
      execSync(`mount ${mdPath} ${mountPoint}`, { timeout: 10000 });
      
      // fstab + mdadm config
      const uuid = run(`blkid -s UUID -o value ${mdPath}`) || '';
      execSync(`echo "UUID=${uuid.trim()} ${mountPoint} ${filesystem} defaults,noatime 0 2" >> /etc/fstab`);
      execSync('mdadm --detail --scan > /etc/mdadm/mdadm.conf 2>/dev/null || true');
      execSync('update-initramfs -u 2>/dev/null || true', { timeout: 60000 });
    }
    
    // 3. Create directory structure
    const dirs = ['docker/containers', 'docker/stacks', 'docker/volumes', 'shares', 'system-backup/config', 'system-backup/snapshots'];
    for (const dir of dirs) {
      execSync(`mkdir -p ${mountPoint}/${dir}`);
    }
    
    // 4. Save pool config
    const isFirstPool = !config.pools || config.pools.length === 0;
    if (!config.pools) config.pools = [];
    config.pools.push({
      name,
      arrayName: isSingleDisk ? null : mdName,
      mountPoint,
      raidLevel: isSingleDisk ? 'single' : `raid${levelInt}`,
      filesystem,
      disks,
      createdAt: new Date().toISOString(),
    });
    if (isFirstPool) {
      config.primaryPool = name;
      config.configuredAt = new Date().toISOString();
    }
    saveStorageConfig(config);
    
    // 5. If first pool, save as primary and create docker directory structure
    if (isFirstPool) {
      // Just prepare the directory structure — Docker will be installed from App Store
      const dockerDir = `${mountPoint}/docker`;
      const dirs2 = ['containers', 'stacks', 'volumes', 'data'];
      for (const dir of dirs2) {
        execSync(`mkdir -p ${dockerDir}/${dir}`);
      }
      
      // Initial config backup
      backupConfigToPool(mountPoint);
    }
    
    console.log(`[Storage] Pool "${name}" created at ${mountPoint} (${isSingleDisk ? 'single disk' : 'RAID ' + levelInt})`);
    
    return {
      ok: true,
      pool: { name, mountPoint, raidLevel: isSingleDisk ? 'single' : `raid${levelInt}`, disks },
      isFirstPool,
    };
    
  } catch (err) {
    console.error('[Storage] Pool creation failed:', err.message);
    return { error: 'Pool creation failed: ' + err.message };
  }
}

// Wipe a disk: stop any RAID arrays, clear superblocks, remove all partitions
function wipeDisk(diskPath) {
  // Safety: verify the disk exists and is not the boot disk
  const detected = detectStorageDisks();
  const allDisks = [...detected.eligible, ...detected.provisioned];
  const diskInfo = allDisks.find(d => d.path === diskPath);
  
  if (!diskInfo) {
    return { error: `Disk ${diskPath} not found or not wipeable` };
  }
  if (diskInfo.isBoot) {
    return { error: 'Cannot wipe the boot disk' };
  }
  
  // Check if disk is part of an active pool
  const config = getStorageConfig();
  const inPool = (config.pools || []).find(p => (p.disks || []).includes(diskPath));
  if (inPool) {
    return { error: `Disk is part of pool "${inPool.name}". Destroy the pool first.` };
  }
  
  const hasSgdisk = !!(run('which sgdisk 2>/dev/null'));
  const hasMdadm = !!(run('which mdadm 2>/dev/null'));
  
  try {
    // 1. Unmount ALL mounted partitions on this disk
    for (const part of diskInfo.partitions) {
      if (part.mountpoint) {
        console.log(`[Storage] Unmounting ${part.path} from ${part.mountpoint}`);
        execSync(`umount -f ${part.path} 2>/dev/null || true`, { timeout: 10000 });
      }
    }
    execSync(`umount -f ${diskPath} 2>/dev/null || true`, { timeout: 5000 });
    // Remove fstab entries for this disk
    const diskName = diskPath.replace('/dev/', '');
    execSync(`sed -i '\\|${diskPath}|d' /etc/fstab 2>/dev/null || true`, { timeout: 5000 });
    execSync(`sed -i '\\|${diskName}|d' /etc/fstab 2>/dev/null || true`, { timeout: 5000 });
    
    execSync('sleep 1');
    
    // 2. Stop any RAID arrays this disk participates in
    if (hasMdadm) {
      const mdstat = readFile('/proc/mdstat') || '';
      const lines = mdstat.split('\n');
      for (const line of lines) {
        if (line.includes(diskName)) {
          const arrayMatch = line.match(/^(md\d+)/);
          if (arrayMatch) {
            console.log(`[Storage] Stopping array /dev/${arrayMatch[1]} (contains ${diskPath})`);
            execSync(`mdadm --stop /dev/${arrayMatch[1]} 2>/dev/null || true`, { timeout: 10000 });
          }
        }
      }
      
      // 3. Clear RAID superblocks from all partitions
      for (const part of diskInfo.partitions) {
        execSync(`mdadm --zero-superblock ${part.path} 2>/dev/null || true`, { timeout: 5000 });
      }
      execSync(`mdadm --zero-superblock ${diskPath} 2>/dev/null || true`, { timeout: 5000 });
    }
    
    // 4. Remove all LVM
    for (const part of diskInfo.partitions) {
      execSync(`pvremove -f ${part.path} 2>/dev/null || true`, { timeout: 5000 });
    }
    
    // 5. Wipe filesystem signatures
    execSync(`wipefs -a ${diskPath} 2>/dev/null || true`, { timeout: 10000 });
    for (const part of diskInfo.partitions) {
      execSync(`wipefs -a ${part.path} 2>/dev/null || true`, { timeout: 5000 });
    }
    
    // 6. Wipe partition table
    if (hasSgdisk) {
      execSync(`sgdisk -Z ${diskPath}`, { timeout: 10000 });
    } else {
      // Fallback: dd the first and last MB to kill MBR/GPT
      execSync(`dd if=/dev/zero of=${diskPath} bs=1M count=1 2>/dev/null || true`, { timeout: 10000 });
      execSync(`dd if=/dev/zero of=${diskPath} bs=1M seek=$(( $(blockdev --getsize64 ${diskPath}) / 1048576 - 1 )) count=1 2>/dev/null || true`, { timeout: 10000 });
    }
    
    execSync(`partprobe ${diskPath} 2>/dev/null || true`, { timeout: 5000 });
    
    // 7. Clear disk cache
    diskCache = null;
    
    console.log(`[Storage] Disk ${diskPath} wiped successfully`);
    return { ok: true, disk: diskPath };
    
  } catch (err) {
    console.error(`[Storage] Wipe failed for ${diskPath}:`, err.message);
    return { error: 'Wipe failed: ' + err.message };
  }
}

// Destroy a pool: unmount, remove fstab entry, stop RAID, clear config
function destroyPool(poolName) {
  const config = getStorageConfig();
  const poolConf = (config.pools || []).find(p => p.name === poolName);
  
  if (!poolConf) {
    return { error: `Pool "${poolName}" not found` };
  }
  
  try {
    // 1. Unmount
    execSync(`umount ${poolConf.mountPoint} 2>/dev/null || true`, { timeout: 10000 });
    
    // 2. Stop RAID array if exists
    if (poolConf.arrayName) {
      execSync(`mdadm --stop /dev/${poolConf.arrayName} 2>/dev/null || true`, { timeout: 10000 });
    }
    
    // 3. Clear RAID superblocks from member disks
    for (const disk of (poolConf.disks || [])) {
      // Find the partition that was used
      const parts = run(`lsblk -ln -o NAME ${disk} 2>/dev/null`) || '';
      for (const part of parts.split('\n').filter(Boolean)) {
        execSync(`mdadm --zero-superblock /dev/${part.trim()} 2>/dev/null || true`, { timeout: 5000 });
      }
    }
    
    // 4. Remove fstab entry
    execSync(`sed -i '/${poolName.replace(/[/\\]/g, '\\/')}/d' /etc/fstab 2>/dev/null || true`);
    // Also remove by mount point
    const escapedMount = poolConf.mountPoint.replace(/\//g, '\\/');
    execSync(`sed -i '/${escapedMount}/d' /etc/fstab 2>/dev/null || true`);
    
    // 5. Remove mount point directory
    execSync(`rm -rf ${poolConf.mountPoint} 2>/dev/null || true`);
    
    // 6. Update mdadm config
    execSync('mdadm --detail --scan > /etc/mdadm/mdadm.conf 2>/dev/null || true');
    
    // 7. Remove from storage config
    config.pools = (config.pools || []).filter(p => p.name !== poolName);
    if (config.primaryPool === poolName) {
      config.primaryPool = config.pools.length > 0 ? config.pools[0].name : null;
    }
    saveStorageConfig(config);
    
    // 8. Clear disk cache
    diskCache = null;
    
    console.log(`[Storage] Pool "${poolName}" destroyed`);
    return { ok: true, pool: poolName };
    
  } catch (err) {
    console.error(`[Storage] Destroy pool failed:`, err.message);
    return { error: 'Destroy failed: ' + err.message };
  }
}

// Backup config files to pool
function backupConfigToPool(mountPoint) {
  if (!mountPoint) {
    const config = getStorageConfig();
    if (!config.primaryPool) return;
    const pool = (config.pools || []).find(p => p.name === config.primaryPool);
    if (!pool) return;
    mountPoint = pool.mountPoint;
  }
  
  const backupDir = path.join(mountPoint, 'system-backup', 'config');
  const snapshotDir = path.join(mountPoint, 'system-backup', 'snapshots', 
    new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  
  try {
    execSync(`mkdir -p ${backupDir} ${snapshotDir}`);
    
    // Copy current configs
    const files = ['users.json', 'shares.json', 'docker.json', 'installed-apps.json', 'storage.json'];
    for (const file of files) {
      const src = path.join(CONFIG_DIR, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(backupDir, file));
        fs.copyFileSync(src, path.join(snapshotDir, file));
      }
    }
    
    // Keep only last 5 snapshots
    const snapshotsBase = path.join(mountPoint, 'system-backup', 'snapshots');
    const snapshots = fs.readdirSync(snapshotsBase).sort().reverse();
    for (let i = 5; i < snapshots.length; i++) {
      execSync(`rm -rf "${path.join(snapshotsBase, snapshots[i])}"`);
    }
    
    console.log('[Storage] Config backed up to pool');
  } catch (err) {
    console.error('[Storage] Backup failed:', err.message);
  }
}

// Detect existing NIMBUS pools (for re-import after reinstall)
function detectExistingPools() {
  const found = [];
  
  // Scan for NIMBUS-DATA labels
  const blkid = run('blkid 2>/dev/null') || '';
  const nimbusPartitions = [];
  for (const line of blkid.split('\n')) {
    if (line.includes('NIMBUS-DATA')) {
      const devMatch = line.match(/^(\/dev\/\S+):/);
      if (devMatch) nimbusPartitions.push(devMatch[1]);
    }
  }
  
  if (nimbusPartitions.length === 0) return found;
  
  // Try to assemble arrays
  execSync('mdadm --assemble --scan 2>/dev/null || true', { timeout: 15000 });
  
  // Check assembled arrays
  const raids = getRAIDStatus();
  for (const raid of raids) {
    // Check if this array has a nimbus label
    const label = run(`blkid -s LABEL -o value /dev/${raid.name} 2>/dev/null`) || '';
    if (label.trim().startsWith('nimbus-')) {
      const poolName = label.trim().replace('nimbus-', '');
      
      // Check for system-backup
      const tmpMount = `/tmp/nimbus-import-${raid.name}`;
      let hasBackup = false;
      try {
        execSync(`mkdir -p ${tmpMount} && mount -o ro /dev/${raid.name} ${tmpMount} 2>/dev/null`, { timeout: 10000 });
        hasBackup = fs.existsSync(path.join(tmpMount, 'system-backup', 'config'));
        execSync(`umount ${tmpMount} 2>/dev/null || true`);
      } catch {}
      
      found.push({
        arrayName: raid.name,
        poolName,
        raidLevel: raid.level,
        status: raid.status,
        members: raid.members,
        arraySize: raid.arraySize,
        arraySizeFormatted: raid.arraySizeFormatted,
        hasConfigBackup: hasBackup,
      });
    }
  }
  
  return found;
}

// Storage monitoring - check RAID health and disk temps
let storageAlerts = [];

function checkStorageHealth() {
  const alerts = [];
  const raids = getRAIDStatus();
  const pools = getStoragePools();
  
  // Check RAID status
  for (const raid of raids) {
    if (raid.status === 'degraded') {
      alerts.push({ severity: 'critical', type: 'raid_degraded', array: raid.name, 
        message: `RAID array ${raid.name} is DEGRADED - a disk has failed` });
    }
    if (raid.status === 'rebuilding') {
      alerts.push({ severity: 'warning', type: 'raid_rebuilding', array: raid.name,
        message: `RAID array ${raid.name} is rebuilding (${raid.progress}%)` });
    }
  }
  
  // Check pool usage
  for (const pool of pools) {
    if (pool.usagePercent >= 95) {
      alerts.push({ severity: 'critical', type: 'pool_full', pool: pool.name,
        message: `Pool "${pool.name}" is ${pool.usagePercent}% full` });
    } else if (pool.usagePercent >= 85) {
      alerts.push({ severity: 'warning', type: 'pool_warning', pool: pool.name,
        message: `Pool "${pool.name}" is ${pool.usagePercent}% full` });
    }
  }
  
  // Check disk temps
  const detected = detectStorageDisks();
  const allDisks = [...detected.eligible, ...detected.provisioned];
  for (const disk of allDisks) {
    if (disk.temperature && disk.temperature > 60) {
      alerts.push({ severity: 'critical', type: 'disk_hot', disk: disk.path,
        message: `Disk ${disk.model} is at ${disk.temperature}C - dangerously hot` });
    } else if (disk.temperature && disk.temperature > 50) {
      alerts.push({ severity: 'warning', type: 'disk_warm', disk: disk.path,
        message: `Disk ${disk.model} is at ${disk.temperature}C - running warm` });
    }
  }
  
  storageAlerts = alerts;
  return alerts;
}

// Start storage monitoring interval
setInterval(checkStorageHealth, 60000); // Every 60s
setInterval(() => { if (hasPool()) backupConfigToPool(); }, 6 * 60 * 60 * 1000); // Every 6h

const routes = {
  '/api/system': () => getCachedSystem(),
  '/api/cpu': () => getCpuUsage(),
  '/api/memory': () => getMemory(),
  '/api/gpu': () => getGpu(),
  '/api/temps': () => getTemps(),
  '/api/network': () => getNetwork(),
  '/api/storage/disks': () => detectStorageDisks(),
  '/api/storage/pools': () => getStoragePools(),
  '/api/storage/status': () => ({ pools: getStoragePools(), alerts: storageAlerts, hasPool: hasPool() }),
  '/api/storage/alerts': () => ({ alerts: storageAlerts }),
  '/api/storage/detect-existing': () => ({ pools: detectExistingPools() }),
  '/api/disks': () => getDisks(),
  '/api/uptime': () => ({ uptime: getUptime() }),
  '/api/containers': () => getContainers(),
  '/api/hostname': () => ({ hostname: os.hostname() }),
  '/api/hardware/gpu-info': () => getHardwareGpuInfo(),
  '/api/firewall/rules': () => getFirewallRules(),
  '/api/firewall/ports': () => getListeningPorts(),
  '/api/firewall/scan': () => getFirewallScan(),
};

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const url = req.url.split('?')[0];
  const method = req.method;

  // ── Serve app icons ──
  if (url.startsWith('/app-icons/') && method === 'GET') {
    const iconName = path.basename(url);
    // Security: only allow alphanumeric names with image extensions
    if (!/^[a-zA-Z0-9_-]+\.(svg|png|jpg|jpeg|webp|ico)$/.test(iconName)) {
      res.writeHead(400);
      return res.end('Invalid icon name');
    }
    const iconPath = path.join(__dirname, '..', 'public', 'app-icons', iconName);
    if (fs.existsSync(iconPath)) {
      const ext = path.extname(iconName).toLowerCase();
      const mimeTypes = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': mimeTypes[ext] || 'image/png' });
      return res.end(fs.readFileSync(iconPath));
    }
    res.writeHead(404);
    return res.end('Icon not found');
  }

  // ── Serve user wallpapers ──
  const wpUrlMatch = url.match(/^\/api\/user\/wallpaper\/([a-zA-Z0-9_.-]+)\/(wallpaper\.(png|jpg|jpeg|webp|gif))$/);
  if (wpUrlMatch && method === 'GET') {
    const wpUser = wpUrlMatch[1];
    const wpFile = wpUrlMatch[2];
    const userPath = path.join(NIMBUS_ROOT, 'userdata', wpUser);
    const wallpaperPath = path.join(userPath, wpFile);
    if (fs.existsSync(wallpaperPath)) {
      const ext = path.extname(wpFile).toLowerCase();
      const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': mimeTypes[ext] || 'image/png', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(wallpaperPath));
    }
    res.writeHead(404);
    return res.end('Wallpaper not found');
  }

  // ── Auth routes (need body parsing for POST/PUT/DELETE/PATCH) ──
  if (url.startsWith('/api/auth/') || url.startsWith('/api/users') || url.startsWith('/api/user/')) {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleAuth(url, method, parsed, req);
          if (result === null) {
            res.writeHead(404, CORS_HEADERS);
            return res.end(JSON.stringify({ error: 'Not found' }));
          }
          if (result.__binary) {
            res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': result.mime });
            return res.end(fs.readFileSync(result.path));
          }
          res.writeHead(result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, CORS_HEADERS);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    // GET auth routes
    const result = handleAuth(url, method, {}, req);
    if (result === null) {
      res.writeHead(404, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    // Binary file response (e.g. wallpaper image)
    if (result.__binary) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': result.mime });
      return res.end(fs.readFileSync(result.path));
    }
    res.writeHead(result.error ? (result.error === 'Unauthorized' ? 401 : 400) : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result));
  }

  // ── Shares routes ──
  if (url.startsWith('/api/shares')) {
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleShares(url, method, parsed, req);
          if (result === null) {
            res.writeHead(404, CORS_HEADERS);
            return res.end(JSON.stringify({ error: 'Not found' }));
          }
          res.writeHead(result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, CORS_HEADERS);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    const result = handleShares(url, method, {}, req);
    if (result === null) {
      res.writeHead(404, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    res.writeHead(result.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result));
  }

  // ── Docker routes ──
  if (url.startsWith('/api/docker')) {
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleDocker(url, method, parsed, req);
          if (result === null) {
            res.writeHead(404, CORS_HEADERS);
            return res.end(JSON.stringify({ error: 'Not found' }));
          }
          const statusCode = result.error ? (result.code === 'NO_PERMISSION' ? 403 : 400) : 200;
          res.writeHead(statusCode, CORS_HEADERS);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, CORS_HEADERS);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    const result = handleDocker(url, method, {}, req);
    if (result === null) {
      res.writeHead(404, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    const statusCode = result.error ? (result.code === 'NO_PERMISSION' ? 403 : 400) : 200;
    res.writeHead(statusCode, CORS_HEADERS);
    return res.end(JSON.stringify(result));
  }

  // ── DDNS routes ──
  if (url.startsWith('/api/ddns')) {
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleDdns(url, method, parsed, req);
          res.writeHead(!result ? 404 : result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: err.message })); }
      });
      return;
    }
    const result = handleDdns(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── Portal config routes ──
  if (url.startsWith('/api/portal')) {
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handlePortal(url, method, parsed, req);
          res.writeHead(!result ? 404 : result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: err.message })); }
      });
      return;
    }
    const result = handlePortal(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── Reverse Proxy routes ──
  if (url.startsWith('/api/proxy')) {
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleProxy(url, method, parsed, req);
          res.writeHead(!result ? 404 : result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: err.message })); }
      });
      return;
    }
    const result = handleProxy(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── SSH routes ──
  if (url.startsWith('/api/ssh')) {
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleSsh(url, method, parsed, req);
          res.writeHead(!result ? 404 : result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: err.message })); }
      });
      return;
    }
    const result = handleSsh(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── FTP routes ──
  if (url.startsWith('/api/ftp')) {
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleFtp(url, method, parsed, req);
          res.writeHead(!result ? 404 : result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: err.message })); }
      });
      return;
    }
    const result = handleFtp(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── NFS routes ──
  if (url.startsWith('/api/nfs')) {
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleNfs(url, method, parsed, req);
          res.writeHead(!result ? 404 : result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: err.message })); }
      });
      return;
    }
    const result = handleNfs(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── DNS routes ──
  if (url.startsWith('/api/dns')) {
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleDns(url, method, parsed, req);
          const statusCode = !result ? 404 : result.error ? 400 : 200;
          res.writeHead(statusCode, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) {
          res.writeHead(500, CORS_HEADERS);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    const result = handleDns(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── Certs routes ──
  if (url.startsWith('/api/certs')) {
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleCerts(url, method, parsed, req);
          const statusCode = !result ? 404 : result.error ? 400 : 200;
          res.writeHead(statusCode, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) {
          res.writeHead(500, CORS_HEADERS);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    const result = handleCerts(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── WebDAV routes ──
  if (url.startsWith('/api/webdav')) {
    if (['POST', 'PUT'].includes(method)) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleWebdav(url, method, parsed, req);
          const statusCode = !result ? 404 : result.error ? 400 : 200;
          res.writeHead(statusCode, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) {
          res.writeHead(500, CORS_HEADERS);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    const result = handleWebdav(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── SMB routes ──
  if (url.startsWith('/api/smb')) {
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleSmb(url, method, parsed, req);
          if (result === null) {
            res.writeHead(404, CORS_HEADERS);
            return res.end(JSON.stringify({ error: 'Not found' }));
          }
          const statusCode = result.error ? 400 : 200;
          res.writeHead(statusCode, CORS_HEADERS);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, CORS_HEADERS);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    const result = handleSmb(url, method, {}, req);
    if (result === null) {
      res.writeHead(404, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    const statusCode = result.error ? 400 : 200;
    res.writeHead(statusCode, CORS_HEADERS);
    return res.end(JSON.stringify(result));
  }

  // ── Virtual Machines routes ──
  if (url.startsWith('/api/vms')) {
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleVMs(url, method, parsed, req);
          res.writeHead(!result ? 404 : result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result || { error: 'Not found' }));
        } catch (err) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: err.message })); }
      });
      return;
    }
    const result = handleVMs(url, method, {}, req);
    res.writeHead(result?.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result || { error: 'Not found' }));
  }

  // ── Native Apps routes ──
  if (url.startsWith('/api/native-apps')) {
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleNativeApps(url, method, parsed, req);
          if (result === null) {
            res.writeHead(404, CORS_HEADERS);
            return res.end(JSON.stringify({ error: 'Not found' }));
          }
          const statusCode = result.error ? 400 : 200;
          res.writeHead(statusCode, CORS_HEADERS);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, CORS_HEADERS);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    const result = handleNativeApps(url, method, {}, req);
    if (result === null) {
      res.writeHead(404, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    const statusCode = result.error ? 400 : 200;
    res.writeHead(statusCode, CORS_HEADERS);
    return res.end(JSON.stringify(result));
  }

  // ── UPnP routes (async — router port forwarding) ──
  if (url.startsWith('/api/upnp')) {
    const sendJson = (data, code = 200) => {
      res.writeHead(data.error ? 400 : code, CORS_HEADERS);
      res.end(JSON.stringify(data));
    };

    if (url === '/api/upnp/status' && method === 'GET') {
      (async () => {
        try {
          const gw = await getUpnpGateway();
          const [mappings, externalIp] = await Promise.all([
            upnpListMappings(gw.controlUrl, gw.serviceType),
            upnpGetExternalIP(gw.controlUrl, gw.serviceType).catch(() => null),
          ]);
          sendJson({ ok: true, available: true, externalIp, localIp: getLocalIP(), mappings, gateway: gw.descUrl || gw.controlUrl });
        } catch (e) {
          sendJson({ ok: true, available: false, error: e.message, localIp: getLocalIP(), mappings: [] });
        }
      })();
      return;
    }

    if (['POST'].includes(method)) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const auth = req.headers['authorization'] || '';
          const token = auth.replace('Bearer ', '');
          const session = SESSIONS[token];
          if (!session || session.role !== 'admin') { sendJson({ error: 'Unauthorized' }, 401); return; }

          if (url === '/api/upnp/add') {
            const { externalPort, internalPort, protocol, description } = parsed;
            if (!externalPort || !protocol) { sendJson({ error: 'externalPort and protocol required' }); return; }
            const gw = await getUpnpGateway();
            const localIp = getLocalIP();
            await upnpAddMapping(gw.controlUrl, gw.serviceType,
              parseInt(externalPort), parseInt(internalPort || externalPort),
              protocol, localIp, description || `NimbusOS:${externalPort}`, 0);
            sendJson({ ok: true, message: `Port ${externalPort}/${protocol} → ${localIp}:${internalPort || externalPort}` });
          } else if (url === '/api/upnp/remove') {
            const { externalPort, protocol } = parsed;
            if (!externalPort || !protocol) { sendJson({ error: 'externalPort and protocol required' }); return; }
            const gw = await getUpnpGateway();
            await upnpRemoveMapping(gw.controlUrl, gw.serviceType, parseInt(externalPort), protocol);
            sendJson({ ok: true, message: `Mapping ${externalPort}/${protocol} removed` });
          } else {
            sendJson({ error: 'Not found' }, 404);
          }
        } catch (e) {
          sendJson({ error: e.message });
        }
      });
      return;
    }
    res.writeHead(404, CORS_HEADERS);
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  // ── File upload (multipart) ──
  if (url === '/api/files/upload' && method === 'POST') {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '');
    const session = SESSIONS[token];
    if (!session) { res.writeHead(401, CORS_HEADERS); return res.end(JSON.stringify({ error: 'Not authenticated' })); }
    return handleFileUpload(req, res, session);
  }

  // ── File download ──
  if (url.startsWith('/api/files/download') && method === 'GET') {
    const urlObj = new URL('http://localhost' + req.url);
    const tkn = urlObj.searchParams.get('token');
    const session = SESSIONS[tkn];
    if (!session) { res.writeHead(401, CORS_HEADERS); return res.end(JSON.stringify({ error: 'Not authenticated' })); }
    return handleFileDownload(req, res, session);
  }

  // ── Files routes ──
  if (url.startsWith('/api/files')) {
    if (['POST'].includes(method)) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const result = handleFiles(url, method, parsed, req);
          if (result === null) {
            res.writeHead(404, CORS_HEADERS);
            return res.end(JSON.stringify({ error: 'Not found' }));
          }
          res.writeHead(result.error ? 400 : 200, CORS_HEADERS);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, CORS_HEADERS);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    const result = handleFiles(url, method, {}, req);
    if (result === null) {
      res.writeHead(404, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    res.writeHead(result.error ? 400 : 200, CORS_HEADERS);
    return res.end(JSON.stringify(result));
  }

  // ── POST /api/containers/:id/:action ── PROTECTED
  const containerMatch = url.match(/^\/api\/containers\/([a-zA-Z0-9_.-]+)\/(start|stop|restart|pause|unpause)$/);
  if (containerMatch && req.method === 'POST') {
    // Verify authentication
    const session = getSessionUser(req);
    if (!session) {
      res.writeHead(401, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Not authenticated' }));
    }
    
    // Verify Docker permissions
    const dockerConfig = getDockerConfig();
    const hasPermission = session.role === 'admin' || dockerConfig.permissions.includes(session.username);
    if (!hasPermission) {
      res.writeHead(403, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'No permission to manage Docker' }));
    }
    
    // Sanitize container name
    const containerName = sanitizeDockerName(containerMatch[1]);
    if (!containerName) {
      res.writeHead(400, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Invalid container name' }));
    }
    
    try {
      const data = containerAction(containerName, containerMatch[2]);
      res.writeHead(200, CORS_HEADERS);
      return res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, CORS_HEADERS);
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // POST /api/terminal — execute a command (ADMIN ONLY - HIGH RISK)
  if (url === '/api/terminal' && req.method === 'POST') {
    // Verify authentication
    const session = getSessionUser(req);
    if (!session) {
      res.writeHead(401, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Not authenticated' }));
    }
    
    // ADMIN ONLY - terminal access is extremely sensitive
    if (session.role !== 'admin') {
      res.writeHead(403, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Terminal access requires admin privileges' }));
    }
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { cmd, cwd } = JSON.parse(body);
        if (!cmd || typeof cmd !== 'string') {
          res.writeHead(400, CORS_HEADERS);
          return res.end(JSON.stringify({ error: 'Missing cmd' }));
        }
        
        // Limit command length
        if (cmd.length > 10000) {
          res.writeHead(400, CORS_HEADERS);
          return res.end(JSON.stringify({ error: 'Command too long' }));
        }

        const { spawn } = require('child_process');
        const workDir = cwd || os.homedir();

        // Spawn bash with the command
        const child = spawn('bash', ['-c', cmd], {
          cwd: workDir,
          env: { ...process.env, TERM: 'xterm-256color', COLUMNS: '120', LINES: '40' },
          timeout: 30000, // 30s max
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', d => stdout += d.toString());
        child.stderr.on('data', d => stderr += d.toString());

        child.on('close', (code) => {
          res.writeHead(200, CORS_HEADERS);
          res.end(JSON.stringify({
            stdout: stdout,
            stderr: stderr,
            code: code,
            cwd: workDir,
          }));
        });

        child.on('error', (err) => {
          res.writeHead(200, CORS_HEADERS);
          res.end(JSON.stringify({
            stdout: '',
            stderr: err.message,
            code: 1,
            cwd: workDir,
          }));
        });

      } catch (err) {
        res.writeHead(500, CORS_HEADERS);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── Storage Manager routes (POST) ──
  if (url.startsWith('/api/storage/') && ['POST', 'DELETE'].includes(method)) {
    const session = getSessionUser(req);
    if (!session || session.role !== 'admin') {
      res.writeHead(401, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Unauthorized - admin required' }));
    }
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        let result = null;
        
        // POST /api/storage/pool — create pool
        if (url === '/api/storage/pool' && method === 'POST') {
          const { name, disks, level, filesystem } = parsed;
          result = createPool(name, disks, level, filesystem);
        }
        
        // POST /api/storage/scan — rescan disks
        else if (url === '/api/storage/scan' && method === 'POST') {
          diskCache = null; // Clear disk cache
          result = { ok: true, disks: detectStorageDisks() };
        }
        
        // POST /api/storage/reimport — re-import existing pools
        else if (url === '/api/storage/reimport' && method === 'POST') {
          const { pools: poolsToImport } = parsed;
          if (!poolsToImport || !Array.isArray(poolsToImport)) {
            result = { error: 'Provide pools array to import' };
          } else {
            const config = getStorageConfig();
            const imported = [];
            for (const pool of poolsToImport) {
              const mountPoint = `${NIMBUS_POOLS_DIR}/${pool.poolName}`;
              try {
                execSync(`mkdir -p ${mountPoint}`);
                execSync(`mount /dev/${pool.arrayName} ${mountPoint}`, { timeout: 10000 });
                const uuid = run(`blkid -s UUID -o value /dev/${pool.arrayName}`) || '';
                execSync(`echo "UUID=${uuid.trim()} ${mountPoint} ext4 defaults,noatime 0 2" >> /etc/fstab`);
                
                if (!config.pools) config.pools = [];
                config.pools.push({
                  name: pool.poolName,
                  arrayName: pool.arrayName,
                  mountPoint,
                  raidLevel: pool.raidLevel,
                  filesystem: 'ext4',
                  disks: pool.members.map(m => m.device),
                  createdAt: new Date().toISOString(),
                  imported: true,
                });
                if (!config.primaryPool) config.primaryPool = pool.poolName;
                imported.push(pool.poolName);
              } catch (err) {
                console.error(`[Storage] Failed to import ${pool.poolName}:`, err.message);
              }
            }
            saveStorageConfig(config);
            
            // Restore config backup if available
            if (imported.length > 0) {
              const primaryMount = `${NIMBUS_POOLS_DIR}/${imported[0]}`;
              const backupConfig = path.join(primaryMount, 'system-backup', 'config');
              if (fs.existsSync(backupConfig)) {
                result = { ok: true, imported, hasConfigBackup: true };
              } else {
                result = { ok: true, imported, hasConfigBackup: false };
              }
            } else {
              result = { error: 'No pools imported successfully' };
            }
          }
        }
        
        // POST /api/storage/backup — force config backup
        else if (url === '/api/storage/backup' && method === 'POST') {
          backupConfigToPool();
          result = { ok: true };
        }
        
        // POST /api/storage/wipe — wipe a disk (clear RAID/partitions)
        else if (url === '/api/storage/wipe' && method === 'POST') {
          const { disk } = parsed;
          if (!disk) { result = { error: 'Provide disk path' }; }
          else { result = wipeDisk(disk); }
        }
        
        // POST /api/storage/pool/destroy — destroy a pool
        else if (url === '/api/storage/pool/destroy' && method === 'POST') {
          const { name } = parsed;
          if (!name) { result = { error: 'Provide pool name' }; }
          else { result = destroyPool(name); }
        }
        
        if (result === null) {
          res.writeHead(404, CORS_HEADERS);
          return res.end(JSON.stringify({ error: 'Not found' }));
        }
        
        res.writeHead(result.error ? 400 : 200, CORS_HEADERS);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, CORS_HEADERS);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── System Update routes ──
  // ── System power actions ──
  if (url === '/api/system/reboot' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session || session.role !== 'admin') { res.writeHead(401, CORS_HEADERS); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ ok: true, message: 'System rebooting...' }));
      setTimeout(() => { try { execSync('sudo reboot'); } catch {} }, 1000);
    });
    return;
  }
  
  if (url === '/api/system/shutdown' && method === 'POST') {
    const session = getSessionUser(req);
    if (!session || session.role !== 'admin') { res.writeHead(401, CORS_HEADERS); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ ok: true, message: 'System shutting down...' }));
      setTimeout(() => { try { execSync('sudo shutdown -h now'); } catch {} }, 1000);
    });
    return;
  }

  if (url.startsWith('/api/system/update')) {
    const session = getSessionUser(req);
    if (!session || session.role !== 'admin') {
      res.writeHead(401, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    // GET /api/system/update/check — check for updates
    if (url === '/api/system/update/check' && method === 'GET') {
      try {
        // Get current version from package.json
        const pkgPath = path.join(__dirname, '..', 'package.json');
        const currentPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const currentVersion = currentPkg.version || '0.0.0';

        // Fetch latest package.json from GitHub
        const repoUrl = 'https://raw.githubusercontent.com/andresgv-beep/nimbus-os-beta-1/main/package.json';
        const remotePkg = execSync(`curl -fsSL "${repoUrl}" 2>/dev/null`, { timeout: 10000, encoding: 'utf8' });
        const remote = JSON.parse(remotePkg);
        const latestVersion = remote.version || '0.0.0';

        const updateAvailable = latestVersion !== currentVersion;

        res.writeHead(200, CORS_HEADERS);
        return res.end(JSON.stringify({
          currentVersion,
          latestVersion,
          updateAvailable,
          installDir: '/opt/nimbusos'
        }));
      } catch (err) {
        res.writeHead(200, CORS_HEADERS);
        return res.end(JSON.stringify({ error: 'Failed to check: ' + err.message }));
      }
    }

    // POST /api/system/update/apply — apply update
    if (url === '/api/system/update/apply' && method === 'POST') {
      try {
        const updateScript = path.join(__dirname, '..', 'scripts', 'update.sh');
        if (!fs.existsSync(updateScript)) {
          res.writeHead(400, CORS_HEADERS);
          return res.end(JSON.stringify({ error: 'Update script not found' }));
        }

        // Ensure log directory exists
        if (!fs.existsSync('/var/log/nimbusos')) {
          fs.mkdirSync('/var/log/nimbusos', { recursive: true });
        }

        // Launch update fully detached from this process
        // nohup + setsid ensures the script survives when systemctl kills Node
        const { spawn } = require('child_process');
        const logFile = fs.openSync('/var/log/nimbusos/update.log', 'a');
        const child = spawn('setsid', ['bash', updateScript], {
          detached: true,
          stdio: ['ignore', logFile, logFile],
        });
        child.unref();

        res.writeHead(200, CORS_HEADERS);
        return res.end(JSON.stringify({ ok: true, message: 'Update started. The service will restart shortly.' }));
      } catch (err) {
        res.writeHead(500, CORS_HEADERS);
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    res.writeHead(404, CORS_HEADERS);
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  const handler = routes[url];

  if (handler) {
    // ── PROTECTED SYSTEM ROUTES ──
    // Require authentication for all system monitoring endpoints
    const session = getSessionUser(req);
    if (!session) {
      res.writeHead(401, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Not authenticated' }));
    }
    
    // For containers, also check Docker permissions
    if (url === '/api/containers') {
      const dockerConfig = getDockerConfig();
      const hasPermission = session.role === 'admin' || dockerConfig.permissions.includes(session.username);
      if (!hasPermission) {
        res.writeHead(403, CORS_HEADERS);
        return res.end(JSON.stringify({ error: 'No permission to view containers' }));
      }
    }
    
    try {
      const data = handler();
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ error: err.message }));
    }
  } else {
    // ── Static file serving (production mode) ──
    // Serve built frontend from dist/ folder
    const DIST_DIR = path.join(__dirname, '..', 'dist');
    const PUBLIC_DIR = path.join(__dirname, '..', 'public');
    
    if (fs.existsSync(DIST_DIR)) {
      // Map URL to file
      let filePath = path.join(DIST_DIR, url === '/' ? 'index.html' : url);
      
      // Security: prevent path traversal
      if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      
      // If file doesn't exist, serve index.html (SPA fallback)
      // BUT NOT for /api/ routes — those should return 404 JSON
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (url.startsWith('/api/')) {
          res.writeHead(404, CORS_HEADERS);
          return res.end(JSON.stringify({ error: 'Endpoint not found' }));
        }
        filePath = path.join(DIST_DIR, 'index.html');
      }
      
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const MIME_TYPES = {
          '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
          '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
          '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
          '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
        };
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        // Cache static assets (not html)
        const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
        
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': contentType, 'Cache-Control': cacheControl });
        return res.end(data);
      }
    }
    
    // Check public dir for app-icons etc
    const pubFile = path.join(PUBLIC_DIR, url);
    if (fs.existsSync(pubFile) && pubFile.startsWith(PUBLIC_DIR) && !fs.statSync(pubFile).isDirectory()) {
      const ext = path.extname(pubFile).toLowerCase();
      const ct = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'application/octet-stream';
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': ct });
      return res.end(fs.readFileSync(pubFile));
    }
    
    res.writeHead(404, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ╔══════════════════════════════════╗`);
  console.log(`  ║   NimbusOS API Server v0.1.0     ║`);
  console.log(`  ║   http://0.0.0.0:${PORT}             ║`);
  console.log(`  ╚══════════════════════════════════╝\n`);
  console.log(`  Endpoints:`);
  Object.keys(routes).forEach(r => console.log(`    GET ${r}`));
  console.log(`\n  Auto-detecting hardware...`);

  // ── Mount storage pools on startup ──
  try {
    const storageConf = getStorageConfig();
    if (storageConf.pools && storageConf.pools.length > 0) {
      // Ensure mount points exist and mount all fstab entries
      for (const pool of storageConf.pools) {
        try {
          execSync(`mkdir -p ${pool.mountPoint}`, { timeout: 5000 });
        } catch {}
      }
      // Mount everything in fstab that isn't mounted yet
      execSync('mount -a 2>/dev/null || true', { timeout: 15000 });
      
      // Verify mounts
      for (const pool of storageConf.pools) {
        const mounted = run(`mountpoint -q ${pool.mountPoint} 2>/dev/null && echo yes || echo no`);
        if (mounted && mounted.trim() === 'yes') {
          console.log(`    Storage: Pool "${pool.name}" mounted at ${pool.mountPoint}`);
        } else {
          console.log(`    Storage: WARNING - Pool "${pool.name}" failed to mount at ${pool.mountPoint}`);
        }
      }
      
      // Run initial health check
      checkStorageHealth();
      
      // Initial config backup
      backupConfigToPool();
    } else {
      // No config — try to detect existing RAID arrays (e.g. after reinstall)
      console.log(`    Storage: No pools configured, scanning for existing arrays...`);
      const existing = detectExistingPools();
      if (existing.length > 0) {
        console.log(`    Storage: Found ${existing.length} existing pool(s)! Auto-importing...`);
        const config = getStorageConfig();
        config.pools = config.pools || [];
        
        for (const pool of existing) {
          const mountPoint = `${NIMBUS_POOLS_DIR}/${pool.poolName}`;
          try {
            execSync(`mkdir -p ${mountPoint}`, { timeout: 5000 });
            // Array already assembled by detectExistingPools, just mount
            const isMounted = run(`mountpoint -q ${mountPoint} 2>/dev/null && echo yes || echo no`);
            if (!isMounted || isMounted.trim() !== 'yes') {
              execSync(`mount /dev/${pool.arrayName} ${mountPoint}`, { timeout: 10000 });
            }
            
            // Add to fstab
            const uuid = run(`blkid -s UUID -o value /dev/${pool.arrayName}`) || '';
            if (uuid.trim()) {
              // Check if already in fstab
              const fstab = readFile('/etc/fstab') || '';
              if (!fstab.includes(uuid.trim())) {
                execSync(`echo "UUID=${uuid.trim()} ${mountPoint} ext4 defaults,noatime 0 2" >> /etc/fstab`);
              }
            }
            
            // Determine disk paths from members
            const diskPaths = (pool.members || []).map(m => {
              const devName = m.device || m;
              // Convert partition path to disk path (sda1 -> /dev/sda)
              const diskName = typeof devName === 'string' ? devName.replace(/\d+$/, '') : devName;
              return diskName.startsWith('/dev/') ? diskName : `/dev/${diskName}`;
            });
            
            config.pools.push({
              name: pool.poolName,
              arrayName: pool.arrayName,
              mountPoint,
              raidLevel: pool.raidLevel,
              filesystem: 'ext4',
              disks: diskPaths,
              createdAt: new Date().toISOString(),
              imported: true,
            });
            
            if (!config.primaryPool) config.primaryPool = pool.poolName;
            console.log(`    Storage: Auto-imported pool "${pool.poolName}" at ${mountPoint}`);
            
            // Restore config backup if available
            const backupConfig = path.join(mountPoint, 'system-backup', 'config');
            if (fs.existsSync(backupConfig)) {
              console.log(`    Storage: Config backup found, restoring...`);
              try {
                const backupFiles = fs.readdirSync(backupConfig);
                for (const file of backupFiles) {
                  if (file === 'storage.json') continue; // Don't overwrite what we just created
                  const src = path.join(backupConfig, file);
                  const dst = path.join(CONFIG_DIR, file);
                  if (!fs.existsSync(dst)) { // Only restore if file doesn't already exist
                    fs.copyFileSync(src, dst);
                    console.log(`    Storage: Restored ${file}`);
                  }
                }
              } catch (restoreErr) {
                console.log(`    Storage: Config restore failed: ${restoreErr.message}`);
              }
            }
          } catch (err) {
            console.error(`    Storage: Failed to auto-import ${pool.poolName}: ${err.message}`);
          }
        }
        
        saveStorageConfig(config);
        console.log(`    Storage: Auto-import complete. ${config.pools.length} pool(s) active.`);
      } else {
        console.log(`    Storage: No existing pools found (locked mode)`);
      }
    }
  } catch (err) {
    console.log(`    Storage: Startup check failed: ${err.message}`);
  }

  // Auto-configure Docker if installed but not configured
  try {
    const dockerConfig = getDockerConfig();
    if (!dockerConfig.installed && isDockerInstalled()) {
      const defaultPath = path.join(NIMBUS_ROOT, 'volumes', 'docker');
      const containersPath = path.join(defaultPath, 'containers');
      const volumesPath = path.join(defaultPath, 'volumes');
      const stacksPath = path.join(defaultPath, 'stacks');
      fs.mkdirSync(containersPath, { recursive: true });
      fs.mkdirSync(volumesPath, { recursive: true });
      fs.mkdirSync(stacksPath, { recursive: true });
      dockerConfig.installed = true;
      dockerConfig.dockerAvailable = true;
      dockerConfig.path = defaultPath;
      dockerConfig.permissions = [];
      dockerConfig.installedAt = new Date().toISOString();
      saveDockerConfig(dockerConfig);
      console.log(`    Docker: Auto-configured at ${defaultPath}`);
    } else if (dockerConfig.installed) {
      console.log(`    Docker: Configured at ${dockerConfig.path}`);
    }
  } catch (err) {
    console.log(`    Docker: Auto-config failed: ${err.message}`);
  }

  // Initial detection log
  const summary = getSystemSummary();
  console.log(`    CPU: ${summary.cpu.model} (${summary.cpu.cores} cores)`);
  console.log(`    RAM: ${summary.memory.totalGB} GB`);
  if (summary.gpus.length > 0) {
    summary.gpus.forEach(g => console.log(`    GPU: ${g.name} (${g.memTotal} MB VRAM)`));
  } else {
    console.log(`    GPU: None detected`);
  }
  console.log(`    Network: ${summary.network.map(n => n.name).join(', ')}`);
  console.log(`    Disks: ${summary.disks.disks.length} detected`);
  console.log(`    Hostname: ${summary.hostname}`);
  console.log(`    Uptime: ${summary.uptime}\n`);
});

