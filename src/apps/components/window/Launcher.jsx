import { useEffect, useState } from 'react';
import { useWindows, useAuth } from '@context';
import { APP_REGISTRY, getAppMeta } from '@/apps';
import Icon from '@icons';
import styles from './Launcher.module.css';

const SYSTEM_APPS = ['files', 'storage', 'monitor', 'containers', 'network', 'vms', 'terminal', 'texteditor', 'mediaplayer', 'controlpanel', 'settings', 'appstore'];

export default function Launcher({ open, onClose }) {
  const { openWindow } = useWindows();
  const { token } = useAuth();
  const [installedApps, setInstalledApps] = useState([]);

  // Fetch installed apps from backend
  useEffect(() => {
    if (!open || !token) return;
    
    fetch('/api/docker/installed-apps', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.apps && Array.isArray(data.apps)) {
          setInstalledApps(data.apps);
        }
      })
      .catch(() => {});
  }, [open, token]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const launch = (appId, isWebApp = false, webAppData = null) => {
    onClose();
    
    if (isWebApp && webAppData) {
      // Desktop apps without port - show message
      if (webAppData.isDesktop || !webAppData.port) {
        alert(`${webAppData.name} es una aplicación de escritorio. Ábrela desde el menú de aplicaciones de tu sistema.`);
        return;
      }
      
      // Check if app must open externally (from catalog)
      if (webAppData.external) {
        window.open(`http://${window.location.hostname}:${webAppData.port}`, '_blank');
        return;
      }
      
      openWindow(appId, { width: 1100, height: 700 }, {
        isWebApp: true,
        port: webAppData.port,
        appName: webAppData.name
      });
    } else {
      const meta = getAppMeta(appId);
      if (meta) openWindow(appId, meta.defaultSize);
    }
  };

  // System apps
  const systemApps = SYSTEM_APPS.map(id => ({ id, ...APP_REGISTRY[id], isSystem: true }));
  
  // Docker apps transformed
  const dockerApps = installedApps.map(app => ({
    id: app.id,
    title: app.name,
    icon: app.icon || '📦',
    color: app.color || '#607D8B',
    port: app.port,
    isWebApp: true,
    external: app.external || false,
    isDesktop: app.isDesktop || false
  }));

  // All apps combined
  const allApps = [...systemApps, ...dockerApps];

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.launcher}>
        <div className={styles.grid}>
          {allApps.map(app => (
            <div 
              key={app.id} 
              className={styles.item} 
              onClick={() => app.isWebApp 
                ? launch(app.id, true, { port: app.port, name: app.title, external: app.external, isDesktop: app.isDesktop }) 
                : launch(app.id)
              }
            >
              <div className={styles.iconWrap}>
                {app.appIcon ? (
                  <img src={app.appIcon} alt="" width={56} height={56} draggable={false} className={styles.appIcon} />
                ) : app.isWebApp ? (
                  // Docker apps - check if icon is URL or local path
                  app.icon && (app.icon.startsWith('http') || app.icon.startsWith('/app-icons/')) ? (
                    <img src={app.icon} alt="" width={56} height={56} draggable={false} className={styles.appIcon} />
                  ) : (
                    <div className={styles.itemIcon} style={{ background: app.color }}>
                      <span className={styles.emojiIcon}>{app.icon || '📦'}</span>
                    </div>
                  )
                ) : (
                  <div className={styles.itemIcon} style={{ background: app.color }}>
                    <Icon name={app.icon} size={28} stroke="white" />
                  </div>
                )}
              </div>
              <div className={styles.itemLabel}>{app.title}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
