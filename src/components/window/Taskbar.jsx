import { useState, useEffect, useRef, useCallback } from 'react';
import { useWindows, useTheme, useAuth } from '@context';
import { getAppMeta, APP_REGISTRY } from '@/apps';
import Icon, { VolumeIcon, WifiIcon } from '@icons';
import Launcher from './Launcher';
import styles from './Taskbar.module.css';

/* ─── Clock ─── */
function Clock({ use24 }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const now = new Date();
    const msToNextMin = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let intervalId;
    const syncTimer = setTimeout(() => {
      setTime(new Date());
      intervalId = setInterval(() => setTime(new Date()), 30000);
    }, msToNextMin);
    return () => { clearTimeout(syncTimer); if (intervalId) clearInterval(intervalId); };
  }, []);

  const timeStr = use24
    ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateStr = time.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className={styles.clock}>
      <span className={styles.clockTime}>{timeStr}</span>
      <span className={styles.clockDot}>·</span>
      <span className={styles.clockDate}>{dateStr}</span>
    </div>
  );
}

/* ─── Dock App Icon ─── */
function DockAppIcon({ meta, isDocker }) {
  // Placeholder while loading
  if (!meta) {
    return (
      <div className={styles.dockIconColor} style={{ background: '#607D8B' }}>
        <span style={{ fontSize: '20px' }}>📦</span>
      </div>
    );
  }
  
  if (meta.appIcon) {
    return <img src={meta.appIcon} alt="" draggable={false} className={styles.dockImg} />;
  }
  // Docker apps with SVG icon (local or URL)
  if (isDocker && meta.icon && (meta.icon.startsWith('http') || meta.icon.startsWith('/app-icons/'))) {
    return <img src={meta.icon} alt="" draggable={false} className={styles.dockImg} />;
  }
  // Docker apps with emoji
  if (isDocker && meta.icon) {
    return (
      <div className={styles.dockIconColor} style={{ background: meta.color || '#607D8B' }}>
        <span style={{ fontSize: '20px' }}>{meta.icon}</span>
      </div>
    );
  }
  return (
    <div className={styles.dockIconColor} style={{ background: meta.color || '#607D8B' }}>
      <Icon name={meta.icon || 'box'} size={24} stroke="white" />
    </div>
  );
}

/* ─── Main export ─── */
export default function Taskbar() {
  const { windows, openWindow, restoreWindow, minimizeWindow } = useWindows();
  const { autoHideTaskbar, clock24, pinnedApps, togglePin, taskbarPosition } = useTheme();
  const auth = useAuth();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [userMenu, setUserMenu] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [dockerApps, setDockerApps] = useState([]);
  const userMenuRef = useRef(null);

  // Fetch Docker apps
  useEffect(() => {
    if (!auth.token) return;
    fetch('/api/docker/installed-apps', {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.apps) setDockerApps(data.apps);
      })
      .catch(() => {});
  }, [auth.token]);

  const openWindowsMap = {};
  Object.values(windows).forEach(w => { openWindowsMap[w.appId] = w; });

  // Get app metadata - check system apps first, then Docker apps
  const getFullAppMeta = useCallback((appId) => {
    const systemMeta = getAppMeta(appId);
    if (systemMeta) return { ...systemMeta, isDocker: false };
    
    const dockerApp = dockerApps.find(a => a.id === appId);
    if (dockerApp) {
      return {
        id: dockerApp.id,
        title: dockerApp.name,
        icon: dockerApp.icon,
        color: dockerApp.color,
        port: dockerApp.port,
        isDocker: true
      };
    }
    return null;
  }, [dockerApps]);

  const handleAppClick = (appId) => {
    const win = openWindowsMap[appId];
    if (win) {
      if (win.minimized) restoreWindow(win.id);
      else minimizeWindow(win.id);
    } else {
      const meta = getFullAppMeta(appId);
      if (meta?.isDocker) {
        // Check if app must open externally (from catalog)
        const dockerApp = dockerApps.find(a => a.id === appId);
        if (dockerApp?.external) {
          window.open(`http://${window.location.hostname}:${meta.port}`, '_blank');
          return;
        }
        // Open as WebApp
        openWindow(appId, { width: 1100, height: 700 }, {
          isWebApp: true,
          port: meta.port,
          appName: meta.title
        });
      } else {
        openWindow(appId, meta?.defaultSize || {});
      }
    }
  };

  const handleContextMenu = (e, appId, winId) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, appId, winId });
  };

  const closeCtx = () => setCtxMenu(null);

  // Close user menu on click outside
  useEffect(() => {
    if (!userMenu) return;
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenu(false);
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 10);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [userMenu]);

  // Build combined dock list: pinned first, then open-but-not-pinned
  const pinnedSet = new Set(pinnedApps);
  const openUnpinned = Object.values(windows).filter(w => !pinnedSet.has(w.appId));

  return (
    <>
      <Launcher open={launcherOpen} onClose={() => setLauncherOpen(false)} />

      {/* Context menu */}
      {ctxMenu && (
        <div className={styles.ctxOverlay} onMouseDown={closeCtx}>
          <div
            className={styles.ctxMenu}
            style={{ left: ctxMenu.x, bottom: 80 }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className={styles.ctxItem} onClick={() => { togglePin(ctxMenu.appId); closeCtx(); }}>
              {pinnedSet.has(ctxMenu.appId) ? 'Unpin from dock' : 'Pin to dock'}
            </div>
            {ctxMenu.winId && (
              <div className={styles.ctxItem} onClick={() => { minimizeWindow(ctxMenu.winId); closeCtx(); }}>
                Close
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ TOP BAR ═══ */}
      <div className={styles.topbar}>
        {/* Left — empty now */}
        <div className={styles.topLeft} />

        {/* Center — Clock */}
        <div className={styles.topCenter}>
          <Clock use24={clock24} />
        </div>

        {/* Right — Tray icons */}
        <div className={styles.topRight}>
          {/* Background services indicators */}
          <div className={styles.trayIcon} title="Docker">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            </svg>
          </div>

          <div className={styles.traySep} />

          <div className={styles.trayIcon} title="Volume">
            <VolumeIcon size={14} />
          </div>
          <div className={styles.trayIcon} title="Network">
            <WifiIcon size={14} />
          </div>

          <div className={styles.traySep} />

          <div className={styles.trayIcon} title="Notifications">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM DOCK ═══ */}
      <div className={`${styles.dock} ${autoHideTaskbar ? styles.dockAutoHide : ''} ${taskbarPosition === 'left' ? styles.dockLeft : ''}`}>
        {/* Left zone: Hamburger */}
        <div className={styles.dockZoneLeft}>
          <button
            className={`${styles.dockHamburger} ${launcherOpen ? styles.dockHamburgerActive : ''}`}
            onClick={() => setLauncherOpen(p => !p)}
            title="Applications"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {/* Center zone: Apps */}
        <div className={styles.dockZoneCenter}>
          {/* Pinned apps */}
          {pinnedApps.map(appId => {
            const meta = getFullAppMeta(appId);
            const win = openWindowsMap[appId];
            const isOpen = !!win;
            const isMinimized = win?.minimized ?? false;
            return (
              <div
                key={`pin-${appId}`}
                className={`${styles.dockItem} ${isOpen ? styles.dockActive : ''} ${isMinimized ? styles.dockMinimized : ''}`}
                onClick={() => handleAppClick(appId)}
                onContextMenu={(e) => handleContextMenu(e, appId, win?.id)}
                title={meta?.title || appId}
              >
                <div className={styles.dockIcon}>
                  <DockAppIcon meta={meta} isDocker={meta?.isDocker} />
                </div>
                <div className={styles.dockIndicator} />
              </div>
            );
          })}

          {/* Separator if both pinned and unpinned exist */}
          {pinnedApps.length > 0 && openUnpinned.length > 0 && (
            <div className={styles.dockSep} />
          )}

          {/* Open but not pinned */}
          {openUnpinned.map(win => {
            const meta = getFullAppMeta(win.appId);
            return (
              <div
                key={win.id}
                className={`${styles.dockItem} ${styles.dockActive} ${win.minimized ? styles.dockMinimized : ''}`}
                onClick={() => handleAppClick(win.appId)}
                onContextMenu={(e) => handleContextMenu(e, win.appId, win.id)}
                title={meta?.title || win.appId}
              >
                <div className={styles.dockIcon}>
                  <DockAppIcon meta={meta} isDocker={meta?.isDocker} />
                </div>
                <div className={styles.dockIndicator} />
              </div>
            );
          })}
        </div>

        {/* Right zone: User menu */}
        <div className={styles.dockZoneRight}>
          <div className={styles.userMenuWrap} ref={userMenuRef}>
          <div
            className={`${styles.dockUserBtn} ${userMenu ? styles.dockUserBtnActive : ''}`}
            onClick={() => setUserMenu(p => !p)}
            title={auth.user?.username || 'User'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>

          {userMenu && (
            <div className={styles.userDropdown}>
              <div className={styles.userDropdownHeader}>
                <div className={styles.userDropdownAvatar}>
                  {(auth.user?.username || 'A')[0].toUpperCase()}
                </div>
                <span className={styles.userDropdownName}>{auth.user?.username || 'admin'}</span>
              </div>
              <div className={styles.userDropdownSep} />
              <div className={styles.userDropdownItem} onClick={() => { setUserMenu(false); setConfirmDialog({ action: 'lock', title: 'Lock Session', message: 'Are you sure you want to lock the session?' }); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                Lock
              </div>
              <div className={styles.userDropdownItem} onClick={() => { setUserMenu(false); setConfirmDialog({ action: 'restart', title: 'Restart System', message: 'Are you sure you want to restart the system?' }); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Restart
              </div>
              <div className={`${styles.userDropdownItem} ${styles.userDropdownDanger}`} onClick={() => { setUserMenu(false); setConfirmDialog({ action: 'shutdown', title: 'Shut Down', message: 'Are you sure you want to shut down the system?' }); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
                </svg>
                Shutdown
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {confirmDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}
          onClick={() => setConfirmDialog(null)}>
          <div style={{ background: 'var(--bg-window)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '28px 32px', maxWidth: 360, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-medium)', color: 'var(--text-primary)', marginBottom: 12 }}>
              {confirmDialog.title}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
              {confirmDialog.message}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDialog(null)}
                style={{ padding: '8px 20px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={async () => {
                const action = confirmDialog.action;
                setConfirmDialog(null);
                if (action === 'lock') {
                  auth.lock?.();
                } else if (action === 'restart') {
                  await fetch('/api/system/reboot', { method: 'POST', headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' } });
                } else if (action === 'shutdown') {
                  await fetch('/api/system/shutdown', { method: 'POST', headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' } });
                }
              }}
                style={{ padding: '8px 20px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', background: confirmDialog.action === 'shutdown' ? 'var(--accent-red, #ef5350)' : 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer', fontWeight: 'var(--weight-medium)' }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
