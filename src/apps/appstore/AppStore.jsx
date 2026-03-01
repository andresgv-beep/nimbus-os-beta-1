import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@context';
import styles from './AppStore.module.css';

/* ═══════════════════════════════════════════════════════════
   GITHUB CATALOG CONFIG
   ═══════════════════════════════════════════════════════════ */
const CATALOG_URL = 'https://raw.githubusercontent.com/andresgv-beep/nimbusos-appstore/main/catalog.json';

// Docker base app (always included)
const DOCKER_APP = {
  id: 'docker',
  name: 'Docker',
  description: 'Motor de contenedores. Requerido para instalar otras aplicaciones.',
  icon: '🐳',
  category: 'system',
  official: true,
  version: '24.0',
};

const CATEGORIES = {
  all: { label: 'Todas', icon: '📦' },
  system: { label: 'Sistema', icon: '⚙️' },
  media: { label: 'Multimedia', icon: '🎬' },
  cloud: { label: 'Cloud', icon: '☁️' },
  downloads: { label: 'Descargas', icon: '⬇️' },
  homelab: { label: 'Home Lab', icon: '🏠' },
  development: { label: 'Desarrollo', icon: '💻' },
  security: { label: 'Seguridad', icon: '🔐' },
  monitoring: { label: 'Monitorización', icon: '📊' },
};

/* ═══════════════════════════════════════════════════════════
   DOCKER INSTALL WIZARD
   ═══════════════════════════════════════════════════════════ */
function DockerInstallWizard({ onClose, onInstalled, token, users }) {
  const [step, setStep] = useState(1);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [pools, setPools] = useState([]);
  
  // Config
  const [selectedPool, setSelectedPool] = useState('');
  const [pathType, setPathType] = useState('pool');
  const [customPath, setCustomPath] = useState('');
  const [permissions, setPermissions] = useState([]); // usernames with access
  
  // Fetch pools
  useEffect(() => {
    fetch('/api/storage/pools', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setPools(data);
          setSelectedPool(data.find(p => p.isPrimary)?.name || data[0].name);
        }
      })
      .catch(() => {});
  }, [token]);
  
  const selectedPoolData = pools.find(p => p.name === selectedPool);
  const dockerPath = selectedPoolData ? selectedPoolData.mountPoint + '/docker' : '';
  
  const handleInstall = async () => {
    setInstalling(true);
    setProgress(0);
    setError('');
    
    setProgress(30);
    
    try {
      const res = await fetch('/api/docker/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          path: dockerPath,
          permissions: permissions
        })
      });
      
      setProgress(80);
      
      const data = await res.json();
      
      if (data.error) {
        setError(data.error + (data.detail ? ': ' + data.detail : ''));
        setInstalling(false);
        return;
      }
      
      setProgress(100);
      await new Promise(r => setTimeout(r, 400));
      onInstalled(data.path || dockerPath);
      onClose();
      
    } catch (err) {
      setError('Error de conexión: ' + err.message);
      setInstalling(false);
    }
  };
  
  const togglePermission = (username) => {
    setPermissions(prev => 
      prev.includes(username) 
        ? prev.filter(u => u !== username)
        : [...prev, username]
    );
  };
  
  return (
    <div className={styles.wizardOverlay} onClick={onClose}>
      <div className={styles.wizard} onClick={e => e.stopPropagation()}>
        <div className={styles.wizardHeader}>
          <span className={styles.wizardIcon}>🐳</span>
          <div>
            <h3>Instalar Docker</h3>
            <span className={styles.wizardVersion}>v24.0</span>
          </div>
          <button className={styles.wizardClose} onClick={onClose}>✕</button>
        </div>
        
        {!installing ? (
          <>
            {/* Step indicators */}
            <div className={styles.wizardSteps}>
              <div className={`${styles.wizardStep} ${step >= 1 ? styles.wizardStepActive : ''}`}>
                <span>1</span> Ubicación
              </div>
              <div className={`${styles.wizardStep} ${step >= 2 ? styles.wizardStepActive : ''}`}>
                <span>2</span> Permisos
              </div>
              <div className={`${styles.wizardStep} ${step >= 3 ? styles.wizardStepActive : ''}`}>
                <span>3</span> Confirmar
              </div>
            </div>
            
            <div className={styles.wizardContent}>
              {/* STEP 1: Path */}
              {step === 1 && (
                <div className={styles.wizardSection}>
                  <h4>Ubicación de Docker</h4>
                  <p className={styles.wizardDesc}>
                    Selecciona el pool donde se guardarán los contenedores y sus datos.
                  </p>
                  
                  {pools.length > 0 ? (
                    <div className={styles.pathOptions}>
                      {pools.map(p => (
                        <label key={p.name} className={`${styles.pathOption} ${selectedPool === p.name ? styles.pathOptionActive : ''}`}>
                          <input 
                            type="radio" 
                            checked={selectedPool === p.name} 
                            onChange={() => setSelectedPool(p.name)}
                          />
                          <div>
                            <strong>{p.name}</strong>
                            <span>{p.raidLevel.toUpperCase()} · {p.totalFormatted} · {p.mountPoint}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div style={{color:'#fbbf24',padding:'12px',border:'1px solid rgba(251,191,36,0.3)',borderRadius:8,fontSize:'0.85rem'}}>
                      ⚠ No hay pools de almacenamiento. Crea uno en Storage Manager primero.
                    </div>
                  )}
                  
                  <div className={styles.pathPreview}>
                    <strong>Estructura:</strong>
                    <code>
                      {dockerPath}/<br/>
                      ├── containers/<br/>
                      ├── stacks/<br/>
                      └── volumes/
                    </code>
                  </div>
                </div>
              )}
              
              {/* STEP 2: Permissions */}
              {step === 2 && (
                <div className={styles.wizardSection}>
                  <h4>Permisos de usuario</h4>
                  <p className={styles.wizardDesc}>
                    Selecciona qué usuarios pueden gestionar Docker y los contenedores.
                    Los administradores siempre tienen acceso.
                  </p>
                  
                  <div className={styles.userList}>
                    {users.map(user => (
                      <label key={user.username} className={styles.userItem}>
                        <input
                          type="checkbox"
                          checked={user.role === 'admin' || permissions.includes(user.username)}
                          disabled={user.role === 'admin'}
                          onChange={() => togglePermission(user.username)}
                        />
                        <div className={styles.userInfo}>
                          <span className={styles.userName}>{user.username}</span>
                          <span className={styles.userRole}>
                            {user.role === 'admin' ? '(Administrador)' : ''}
                          </span>
                        </div>
                        {user.role === 'admin' && (
                          <span className={styles.alwaysAccess}>Siempre tiene acceso</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              
              {/* STEP 3: Confirm */}
              {step === 3 && (
                <div className={styles.wizardSection}>
                  <h4>Confirmar instalación</h4>
                  
                  <div className={styles.confirmBox}>
                    <div className={styles.confirmRow}>
                      <span>Ubicación:</span>
                      <code>{dockerPath}</code>
                    </div>
                    <div className={styles.confirmRow}>
                      <span>Usuarios con acceso:</span>
                      <span>
                        {users.filter(u => u.role === 'admin').map(u => u.username).join(', ')}
                        {permissions.length > 0 && ', ' + permissions.join(', ')}
                      </span>
                    </div>
                  </div>
                  
                  {error && (
                    <div className={styles.wizardError}>{error}</div>
                  )}
                  
                  <p className={styles.confirmNote}>
                    Se creará la estructura de carpetas y Docker quedará listo para instalar aplicaciones.
                  </p>
                </div>
              )}
            </div>
            
            <div className={styles.wizardFooter}>
              {step > 1 && (
                <button className={styles.btnSecondary} onClick={() => setStep(s => s - 1)}>
                  Atrás
                </button>
              )}
              <div style={{flex: 1}} />
              {step < 3 ? (
                <button
                  className={styles.btnPrimary}
                  onClick={() => setStep(s => s + 1)}
                  disabled={pathType === 'custom' && !customPath}
                >
                  Siguiente
                </button>
              ) : (
                <button className={styles.btnPrimary} onClick={handleInstall}>
                  Instalar Docker
                </button>
              )}
            </div>
          </>
        ) : (
          /* Installing progress */
          <div className={styles.wizardContent}>
            <div className={styles.installingSection}>
              <div className={styles.installingIcon}>🐳</div>
              <h4>Instalando Docker...</h4>
              <div className={styles.progressBarLarge}>
                <div className={styles.progressFillLarge} style={{ width: `${progress}%` }} />
              </div>
              <span className={styles.progressText}>{progress}%</span>
              {error && <div className={styles.wizardError}>{error}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CONTAINER/STACK INSTALL WIZARD (for apps)
   ═══════════════════════════════════════════════════════════ */
function ContainerInstallWizard({ app, onClose, onInstalled, token, dockerPath }) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState('');
  
  // Generate random password for DBs
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };
  
  const [credentials, setCredentials] = useState(null);
  
  const handleInstall = async () => {
    setInstalling(true);
    setProgress(0);
    setError('');
    setCredentials(null);
    
    console.log('[Install] App data:', app);
    
    try {
      if (!app.compose) {
        setError('Esta app no tiene configuración de instalación');
        setInstalling(false);
        return;
      }
      
      setProgressMsg('Preparando configuración...');
      setProgress(10);
      
      // Process env variables - add common paths
      const configPath = `${dockerPath}/containers/${app.id}`;
      const processedEnv = {
        CONFIG_PATH: configPath,
        TZ: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid',
        HOST_IP: window.location.hostname,
        DOWNLOADS_PATH: `${configPath}/downloads`,
        MEDIA_PATH: `${configPath}/media`,
        DATA_PATH: `${configPath}/data`,
        MUSIC_PATH: `${configPath}/music`,
        PROJECTS_PATH: `${configPath}/projects`,
        UPLOAD_LOCATION: `${configPath}/upload`,
        DB_DATA_LOCATION: `${configPath}/postgres`,
      };
      
      // Add app-specific env (overrides defaults)
      if (app.env) {
        for (const [key, value] of Object.entries(app.env)) {
          let processedValue = String(value);
          if (processedValue === '{RANDOM}') {
            processedValue = generatePassword();
          }
          processedValue = processedValue.replace('${CONFIG_PATH}', configPath);
          processedEnv[key] = processedValue;
        }
      }
      
      setProgressMsg('Descargando imágenes...');
      setProgress(30);
      
      const res = await fetch('/api/docker/stack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: app.id,
          name: app.name,
          compose: app.compose,
          env: processedEnv,
          icon: app.icon,
          color: app.color || '#607D8B',
          port: app.port,
          external: app.external || false
        })
      });
      
      setProgress(80);
      setProgressMsg('Iniciando servicios...');
      
      const data = await res.json();
      
      if (data.error) {
        setError(data.error + (data.detail ? `: ${data.detail}` : ''));
        setInstalling(false);
        return;
      }
      
      setProgress(100);
      setProgressMsg('¡Instalación completada!');
      
      // Credentials come from catalog definition, not hardcoded detection
      // catalog defines: { "credentials": { "username": "admin", "passwordKey": "WEBPASSWORD" } }
      let appCredentials = null;
      if (app.credentials) {
        appCredentials = {};
        if (app.credentials.username) {
          appCredentials.username = app.credentials.username;
        }
        if (app.credentials.usernameKey && processedEnv[app.credentials.usernameKey]) {
          appCredentials.username = processedEnv[app.credentials.usernameKey];
        }
        if (app.credentials.passwordKey && processedEnv[app.credentials.passwordKey]) {
          appCredentials.password = processedEnv[app.credentials.passwordKey];
        }
        if (app.credentials.password) {
          appCredentials.password = app.credentials.password;
        }
      }
      
      if (appCredentials && (appCredentials.username || appCredentials.password)) {
        setCredentials(appCredentials);
        setInstalling(false);
      } else {
        await new Promise(r => setTimeout(r, 800));
        onInstalled(app.id);
        onClose();
      }
      
    } catch (err) {
      setError('Error de conexión: ' + err.message);
      setInstalling(false);
    }
  };
  
  const handleCloseWithCredentials = () => {
    onInstalled(app.id);
    onClose();
  };
  
  const isIconUrl = app.icon && app.icon.startsWith('http');
  
  return (
    <div className={styles.wizardOverlay} onClick={onClose}>
      <div className={styles.wizard} onClick={e => e.stopPropagation()}>
        <div className={styles.wizardHeader}>
          <span className={styles.wizardIcon}>
            {isIconUrl ? (
              <img src={app.icon} alt={app.name} className={styles.wizardIconImg} />
            ) : (
              app.icon || '📦'
            )}
          </span>
          <div>
            <h3>Instalar {app.name}</h3>
            <span className={styles.wizardVersion}>v{app.version || 'latest'}</span>
          </div>
          <button className={styles.wizardClose} onClick={onClose}>✕</button>
        </div>
        
        <div className={styles.wizardContent}>
          {credentials ? (
            // Show credentials after install
            <div className={styles.installingSection}>
              <div className={styles.successIcon}>✅</div>
              <h4>¡{app.name} instalado correctamente!</h4>
              
              <div className={styles.credentialsBox}>
                <h5>🔐 Credenciales de acceso</h5>
                <p className={styles.credentialsNote}>Guarda esta información, la necesitarás para acceder:</p>
                
                {credentials.username && (
                  <div className={styles.credentialRow}>
                    <span>Usuario:</span>
                    <code>{credentials.username}</code>
                  </div>
                )}
                {credentials.password && (
                  <div className={styles.credentialRow}>
                    <span>Contraseña:</span>
                    <code>{credentials.password}</code>
                  </div>
                )}
                
                <p className={styles.credentialsUrl}>
                  Accede en: <a href={`http://${window.location.hostname}:${app.port}`} target="_blank" rel="noopener noreferrer">
                    http://{window.location.hostname}:{app.port}
                  </a>
                </p>
              </div>
              
              <button className={styles.btnPrimary} onClick={handleCloseWithCredentials} style={{marginTop: '16px'}}>
                Entendido
              </button>
            </div>
          ) : !installing ? (
            <div className={styles.wizardSection}>
              <h4>Confirmar instalación</h4>
              
              {app.isStack ? (
                <div className={styles.confirmBox}>
                  <div className={styles.confirmRow}>
                    <span>Tipo:</span>
                    <code>Stack (múltiples servicios)</code>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>Puerto web:</span>
                    <code>{app.port}</code>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>Datos en:</span>
                    <code>{dockerPath}/stacks/{app.id}/</code>
                  </div>
                  {app.id === 'immich' && (
                    <div className={styles.stackInfo}>
                      <strong>Servicios incluidos:</strong>
                      <ul>
                        <li>Servidor principal</li>
                        <li>Machine Learning (IA)</li>
                        <li>PostgreSQL (base de datos)</li>
                        <li>Redis (caché)</li>
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.confirmBox}>
                  <div className={styles.confirmRow}>
                    <span>Imagen:</span>
                    <code>{app.image}</code>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>Puerto:</span>
                    <code>{app.port}</code>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>Datos en:</span>
                    <code>{dockerPath}/containers/{app.id}/</code>
                  </div>
                </div>
              )}
              
              <p className={styles.confirmNote}>
                Después de instalar, accede a {app.name} en <strong>http://tu-servidor:{app.port}</strong>
              </p>
            </div>
          ) : (
            <div className={styles.installingSection}>
              <div className={styles.installingIcon}>
                {isIconUrl ? (
                  <img src={app.icon} alt={app.name} className={styles.installingIconImg} />
                ) : (
                  app.icon || '📦'
                )}
              </div>
              <h4>Instalando {app.name}...</h4>
              <div className={styles.progressBarLarge}>
                <div className={styles.progressFillLarge} style={{ width: `${progress}%` }} />
              </div>
              <span className={styles.progressText}>{progress}%</span>
              {progressMsg && <span className={styles.progressMsg}>{progressMsg}</span>}
              {error && <div className={styles.wizardError}>{error}</div>}
            </div>
          )}
        </div>
        
        {!installing && !credentials && (
          <div className={styles.wizardFooter}>
            <button className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
            <div style={{flex: 1}} />
            <button className={styles.btnPrimary} onClick={handleInstall}>
              Instalar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   NO PERMISSION MODAL
   ═══════════════════════════════════════════════════════════ */
function NoPermissionModal({ onClose, onGoToPermissions }) {
  return (
    <div className={styles.wizardOverlay} onClick={onClose}>
      <div className={styles.noPermModal} onClick={e => e.stopPropagation()}>
        <div className={styles.noPermIcon}>🔒</div>
        <h3>Sin permisos</h3>
        <p>No tienes permisos para gestionar Docker y los contenedores.</p>
        <p className={styles.noPermHint}>Contacta con el administrador para obtener acceso.</p>
        
        <div className={styles.noPermActions}>
          <button className={styles.btnSecondary} onClick={onClose}>Cerrar</button>
          <button className={styles.btnPrimary} onClick={onGoToPermissions}>
            Ir a Permisos
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   APP CARD
   ═══════════════════════════════════════════════════════════ */
function AppCard({ app, installed, onInstall, onOpen, onUninstall }) {
  const isIconUrl = app.icon && app.icon.startsWith('http');
  
  return (
    <div className={`${styles.appCard} ${installed ? styles.appInstalled : ''}`}>
      <div className={styles.appIcon}>
        {isIconUrl ? (
          <img src={app.icon} alt={app.name} className={styles.appIconImg} />
        ) : (
          app.icon || '📦'
        )}
      </div>
      <div className={styles.appInfo}>
        <div className={styles.appHeader}>
          <h4>{app.name}</h4>
          {app.official && <span className={styles.badgeOfficial}>Oficial</span>}
          {app.isBase && <span className={styles.badgeBase}>Base</span>}
          {installed && <span className={styles.badgeInstalled}>Instalado</span>}
        </div>
        <p className={styles.appDesc}>{app.description}</p>
        <div className={styles.appMeta}>
          <span className={styles.appCategory}>
            {CATEGORIES[app.category]?.icon} {CATEGORIES[app.category]?.label}
          </span>
          {app.port && <span className={styles.appPort}>Puerto: {app.port}</span>}
        </div>
      </div>
      <div className={styles.appActions}>
        {installed ? (
          <>
            {app.port && (
              <button className={styles.btnOpen} onClick={() => onOpen(app)}>Abrir</button>
            )}
            {!app.isBase && (
              <button className={styles.btnSecondary} onClick={() => onUninstall(app)}>
                Desinstalar
              </button>
            )}
          </>
        ) : (
          <button className={styles.btnInstall} onClick={() => onInstall(app)}>
            Instalar
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP STORE
   ═══════════════════════════════════════════════════════════ */
export default function AppStore() {
  const { token, user } = useAuth();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  
  // Catalog from GitHub
  const [catalog, setCatalog] = useState({});
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(null);
  
  // Modals
  const [showDockerWizard, setShowDockerWizard] = useState(false);
  const [installingApp, setInstallingApp] = useState(null);
  const [showNoPermission, setShowNoPermission] = useState(false);
  
  // State from backend
  const [dockerStatus, setDockerStatus] = useState({ installed: false, path: null, hasPermission: true });
  const [installedApps, setInstalledApps] = useState([]);
  const [users, setUsers] = useState([]);
  
  // Fetch catalog from GitHub
  useEffect(() => {
    setCatalogLoading(true);
    fetch(CATALOG_URL)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch catalog');
        return res.json();
      })
      .then(data => {
        // Add id to each app from its key
        const apps = {};
        for (const [id, app] of Object.entries(data.apps || {})) {
          apps[id] = { ...app, id };
        }
        setCatalog(apps);
        setCatalogError(null);
      })
      .catch(err => {
        console.error('Catalog error:', err);
        setCatalogError('No se pudo cargar el catálogo');
      })
      .finally(() => setCatalogLoading(false));
  }, []);
  
  // Fetch Docker status and installed apps
  const fetchDockerStatus = useCallback(async () => {
    try {
      // Get Docker status
      const statusRes = await fetch('/api/docker/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const statusData = await statusRes.json();
      if (!statusData.error) {
        setDockerStatus(statusData);
      }
      
      // Get installed apps from registry (more reliable)
      const appsRes = await fetch('/api/docker/installed-apps', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const appsData = await appsRes.json();
      if (appsData.apps && Array.isArray(appsData.apps)) {
        setInstalledApps(appsData.apps.map(a => a.id));
      }
    } catch {}
  }, [token]);
  
  // Fetch users (for permissions)
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch {}
  }, [token]);
  
  useEffect(() => {
    fetchDockerStatus();
    fetchUsers();
  }, [fetchDockerStatus, fetchUsers]);
  
  // Build full catalog: Docker base + GitHub apps
  const fullCatalog = { docker: DOCKER_APP, ...catalog };
  
  // Filter apps
  const apps = Object.values(fullCatalog).filter(app => {
    if (category !== 'all' && app.category !== category) return false;
    if (search && !app.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  
  // Sort: Docker first, then installed, then by name
  apps.sort((a, b) => {
    if (a.isBase && !b.isBase) return -1;
    if (!a.isBase && b.isBase) return 1;
    const aInst = a.id === 'docker' ? dockerStatus.installed : installedApps.includes(a.id);
    const bInst = b.id === 'docker' ? dockerStatus.installed : installedApps.includes(b.id);
    if (aInst && !bInst) return -1;
    if (!aInst && bInst) return 1;
    return a.name.localeCompare(b.name);
  });
  
  const handleInstallClick = (app) => {
    if (app.id === 'docker') {
      setShowDockerWizard(true);
    } else {
      // Check permission
      if (!dockerStatus.hasPermission) {
        setShowNoPermission(true);
        return;
      }
      setInstallingApp(app);
    }
  };
  
  const handleDockerInstalled = (path) => {
    setDockerStatus({ installed: true, path, hasPermission: true });
  };
  
  const handleAppInstalled = (appId) => {
    setInstalledApps(prev => [...prev, appId]);
  };
  
  const handleUninstall = async (app) => {
    // Docker uninstall — special case
    if (app.id === 'docker') {
      if (!confirm('¿Desinstalar Docker? Se eliminarán TODOS los contenedores y datos de Docker.')) return;
      try {
        const res = await fetch('/api/docker/uninstall', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.error) { alert(`Error: ${data.error}`); return; }
        setDockerStatus({ installed: false, path: null, hasPermission: true });
        setInstalledApps([]);
      } catch (err) { alert(`Error: ${err.message}`); }
      return;
    }
    
    if (!confirm(`¿Desinstalar ${app.name}?`)) return;
    
    try {
      // Check if it's a stack (has compose in catalog)
      const catalogApp = catalog[app.id];
      const isStack = catalogApp?.compose || app.compose;
      
      let res;
      if (isStack) {
        // Delete stack
        res = await fetch(`/api/docker/stack/${app.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } else {
        // Delete simple container
        res = await fetch(`/api/docker/container/${app.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      
      const data = await res.json();
      if (!data.error) {
        // Also unregister from installed-apps
        await fetch(`/api/installed-apps/${app.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setInstalledApps(prev => prev.filter(id => id !== app.id));
      } else {
        alert(`Error al desinstalar: ${data.error}`);
      }
    } catch (err) {
      alert(`Error al desinstalar: ${err.message}`);
    }
  };
  
  const handleOpenApp = (app) => {
    if (app.port) {
      window.open(`http://${window.location.hostname}:${app.port}`, '_blank');
    }
  };
  
  const handleGoToPermissions = () => {
    setShowNoPermission(false);
    // TODO: Open Control Panel > App Permissions
  };
  
  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.searchBox}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Buscar apps..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <div className={styles.categories}>
          {Object.entries(CATEGORIES).map(([id, cat]) => (
            <div
              key={id}
              className={`${styles.categoryItem} ${category === id ? styles.categoryActive : ''}`}
              onClick={() => setCategory(id)}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </div>
          ))}
        </div>
        
        <div className={styles.sidebarFooter}>
          <div className={styles.dockerStatus}>
            <span className={dockerStatus.installed ? styles.statusOnline : styles.statusOffline} />
            Docker {dockerStatus.installed ? 'activo' : 'no instalado'}
          </div>
          {dockerStatus.installed && (
            <div className={styles.dockerPath}>📁 {dockerStatus.path}</div>
          )}
          <div className={styles.installedCount}>
            {installedApps.length} app{installedApps.length !== 1 ? 's' : ''} instalada{installedApps.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className={styles.main}>
        <div className={styles.header}>
          <h2>{CATEGORIES[category]?.label || 'Aplicaciones'}</h2>
          <span className={styles.appCount}>{apps.length} apps</span>
        </div>
        
        {catalogLoading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Cargando catálogo...</p>
          </div>
        )}
        
        {catalogError && (
          <div className={styles.errorBanner}>
            <span>⚠️</span>
            <p>{catalogError}</p>
            <button onClick={() => window.location.reload()}>Reintentar</button>
          </div>
        )}
        
        {!dockerStatus.installed && category === 'all' && !catalogLoading && (
          <div className={styles.dockerBanner}>
            <span className={styles.dockerBannerIcon}>🐳</span>
            <div>
              <strong>Docker no está instalado</strong>
              <p>Instala Docker para poder añadir aplicaciones a tu servidor.</p>
            </div>
            <button className={styles.btnPrimary} onClick={() => setShowDockerWizard(true)}>
              Instalar Docker
            </button>
          </div>
        )}
        
        {!catalogLoading && (
          <div className={styles.appGrid}>
            {apps.map(app => (
              <AppCard
                key={app.id}
                app={app}
                installed={app.id === 'docker' ? dockerStatus.installed : installedApps.includes(app.id)}
                onInstall={handleInstallClick}
                onOpen={handleOpenApp}
                onUninstall={handleUninstall}
              />
            ))}
          </div>
        )}
        
        {apps.length === 0 && !catalogLoading && (
          <div className={styles.emptyState}>
            <span>📭</span>
            <p>No se encontraron aplicaciones</p>
          </div>
        )}
      </div>
      
      {/* Modals */}
      {showDockerWizard && (
        <DockerInstallWizard
          onClose={() => setShowDockerWizard(false)}
          onInstalled={handleDockerInstalled}
          token={token}
          users={users}
        />
      )}
      
      {installingApp && (
        <ContainerInstallWizard
          app={installingApp}
          onClose={() => setInstallingApp(null)}
          onInstalled={handleAppInstalled}
          token={token}
          dockerPath={dockerStatus.path}
        />
      )}
      
      {showNoPermission && (
        <NoPermissionModal
          onClose={() => setShowNoPermission(false)}
          onGoToPermissions={handleGoToPermissions}
        />
      )}
    </div>
  );
}
