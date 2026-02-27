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
      
      const iconFileName = `${appData.id}.svg`;
      const localIconPath = path.join(iconsDir, iconFileName);
      
      // Download synchronously using curl
      execSync(`curl -s -o "${localIconPath}" "${appData.icon}"`, { timeout: 10000 });
      
      // Use local path for the icon
      iconPath = `/app-icons/${iconFileName}`;
      console.log(`[App] Downloaded icon for ${appData.id}: ${iconPath}`);
    } catch (err) {
      console.error(`[App] Failed to download icon for ${appData.id}:`, err.message);
      iconPath = '📦'; // Fallback to emoji
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
    const { username, password } = body;
    if (!username || !password) return { error: 'Username and password required' };

    const users = getUsers();
    const user = users.find(u => u.username === username.toLowerCase().trim());
    if (!user || !verifyPassword(password, user.password)) {
      return { error: 'Invalid credentials' };
    }

    const token = generateToken();
    SESSIONS[token] = { username: user.username, role: user.role, created: Date.now() };
    saveSessions();

    return { ok: true, token, user: { username: user.username, role: user.role } };
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
    const { name, description } = body;
    if (!name || !name.trim()) return { error: 'Folder name required' };
    if (/[^a-zA-Z0-9_\- ]/.test(name.trim())) return { error: 'Name can only contain letters, numbers, spaces, -, _' };

    const shares = getShares();
    const safeName = name.trim().toLowerCase().replace(/\s+/g, '-');

    if (shares.find(s => s.name === safeName)) return { error: 'Shared folder already exists' };

    // Create actual directory
    const folderPath = path.join(VOLUMES_DIR, 'volume1', safeName);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Default: admin has rw
    const permissions = {};
    permissions[session.username] = 'rw';

    shares.push({
      name: safeName,
      displayName: name.trim(),
      description: description || '',
      path: folderPath,
      volume: 'volume1',
      created: new Date().toISOString(),
      createdBy: session.username,
      recycleBin: true,
      permissions,        // User permissions: { "user1": "rw", "user2": "ro" }
      appPermissions: [], // App permissions: ["plex", "jellyfin", "immich"]
    });
    saveShares(shares);

    return { ok: true, name: safeName, path: folderPath };
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

  // POST /api/docker/install — configure Docker path (admin only)
  // Docker comes pre-installed in NimbusOS, this just configures the data path
  if (url === '/api/docker/install' && method === 'POST') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    const { path: dockerPath, permissions } = body;
    if (!dockerPath) return { error: 'Docker path required' };
    
    // Determine full path
    const fullPath = dockerPath.startsWith('/') ? dockerPath : path.join(NIMBUS_ROOT, 'volumes', dockerPath);
    const containersPath = path.join(fullPath, 'containers');
    const volumesPath = path.join(fullPath, 'volumes');
    const stacksPath = path.join(fullPath, 'stacks');
    
    // Check if parent directory exists for absolute paths
    if (dockerPath.startsWith('/')) {
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        return { 
          error: 'El directorio padre no existe', 
          detail: `No se puede crear ${fullPath} porque ${parentDir} no existe.`
        };
      }
    }
    
    // Create directories
    try {
      fs.mkdirSync(containersPath, { recursive: true });
      fs.mkdirSync(volumesPath, { recursive: true });
      fs.mkdirSync(stacksPath, { recursive: true });
    } catch (err) {
      return { error: 'Error creando directorios', detail: err.message };
    }
    
    // Check if Docker is available
    const dockerAvailable = isDockerInstalled();
    
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
        volume: 'volume1',
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
  
  // DELETE /api/docker/uninstall — uninstall Docker (admin only)
  if (url === '/api/docker/uninstall' && method === 'DELETE') {
    if (!session || session.role !== 'admin') return { error: 'Unauthorized' };
    
    // Just reset config, don't actually uninstall Docker
    const config = getDockerConfig();
    config.installed = false;
    config.path = null;
    config.permissions = [];
    config.installedAt = null;
    config.containers = [];
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
        icon: def.icon,
        color: def.color,
        port: def.port,
        installed: status.installed,
        running: status.running,
        installCommand: def.installCommand,
        isDesktop: def.isDesktop || false
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

  // Only physical ethernet interfaces (exclude virtual, docker, bridges, etc.)
  const isPhysicalEthernet = (dev) => {
    // Include: eth*, enp*, eno*, ens* (physical ethernet)
    // Exclude: lo, docker*, br-*, veth*, virbr*, tun*, tap*, wl* (wifi)
    if (dev === 'lo') return false;
    if (dev.startsWith('docker')) return false;
    if (dev.startsWith('br-')) return false;
    if (dev.startsWith('veth')) return false;
    if (dev.startsWith('virbr')) return false;
    if (dev.startsWith('tun')) return false;
    if (dev.startsWith('tap')) return false;
    if (dev.startsWith('wl')) return false; // wifi
    // Check if it's a physical device
    const physicalPath = `/sys/class/net/${dev}/device`;
    try {
      fs.statSync(physicalPath);
      return true; // Has a physical device backing
    } catch {
      // No physical device, but allow common ethernet naming patterns
      return dev.startsWith('eth') || dev.startsWith('enp') || dev.startsWith('eno') || dev.startsWith('ens');
    }
  };

  try {
    const devs = fs.readdirSync(netDir).filter(d => isPhysicalEthernet(d));
    for (const dev of devs) {
      const operstate = readFile(`${netDir}/${dev}/operstate`) || 'unknown';
      
      // Only include interfaces that are UP
      if (operstate !== 'up') continue;
      
      const speed = readFile(`${netDir}/${dev}/speed`);
      const rxBytes = parseInt(readFile(`${netDir}/${dev}/statistics/rx_bytes`) || '0');
      const txBytes = parseInt(readFile(`${netDir}/${dev}/statistics/tx_bytes`) || '0');
      const mac = readFile(`${netDir}/${dev}/address`) || '';

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
        status: operstate,
        speed: speed && parseInt(speed) > 0 ? `${speed} Mbps` : '—',
        ip: allIps[dev] || '—',
        mac,
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

const routes = {
  '/api/system': () => getCachedSystem(),
  '/api/cpu': () => getCpuUsage(),
  '/api/memory': () => getMemory(),
  '/api/gpu': () => getGpu(),
  '/api/temps': () => getTemps(),
  '/api/network': () => getNetwork(),
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
    // Security: only allow .svg and alphanumeric names
    if (!/^[a-zA-Z0-9_-]+\.svg$/.test(iconName)) {
      res.writeHead(400);
      return res.end('Invalid icon name');
    }
    const iconPath = path.join(__dirname, '..', 'public', 'app-icons', iconName);
    if (fs.existsSync(iconPath)) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', ...CORS_HEADERS });
      return res.end(fs.readFileSync(iconPath));
    }
    res.writeHead(404);
    return res.end('Icon not found');
  }

  // ── Auth routes (need body parsing for POST/PUT/DELETE) ──
  if (url.startsWith('/api/auth/') || url.startsWith('/api/users')) {
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
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
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

