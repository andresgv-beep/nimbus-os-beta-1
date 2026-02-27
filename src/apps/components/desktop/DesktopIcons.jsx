import { useState } from 'react';
import { useWindows, useTheme } from '@context';
import { APP_REGISTRY, getAppMeta } from '@/apps';
import Icon from '@icons';
import styles from './DesktopIcons.module.css';

const DESKTOP_APPS = ['files', 'storage', 'monitor', 'containers', 'network', 'vms', 'terminal', 'texteditor', 'mediaplayer', 'controlpanel', 'appstore', 'settings'];

export default function DesktopIcons() {
  const { openWindow } = useWindows();
  const { pinnedApps, togglePin } = useTheme();
  const [ctxMenu, setCtxMenu] = useState(null);

  const handleOpen = (appId) => {
    const meta = getAppMeta(appId);
    openWindow(appId, meta?.defaultSize);
  };

  const handleCtx = (e, appId) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, appId });
  };

  const pinnedSet = new Set(pinnedApps);

  return (
    <>
      {ctxMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }} onMouseDown={() => setCtxMenu(null)}>
          <div
            style={{
              position: 'fixed', left: ctxMenu.x, top: ctxMenu.y,
              background: 'var(--bg-window)', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              padding: '4px', minWidth: 180, zIndex: 3001,
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div
              style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => { handleOpen(ctxMenu.appId); setCtxMenu(null); }}
            >
              Open
            </div>
            <div
              style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:8,flexShrink:0}}>
                <line x1="12" y1="17" x2="12" y2="22"/>
                <path d="M5 17h14"/>
                <path d="M9 5v5l-2 4h10l-2-4V5"/>
                <path d="M15 5a3 3 0 0 1-6 0V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1z"/>
              </svg>
              {pinnedSet.has(ctxMenu.appId) ? 'Unpin from taskbar' : 'Pin to taskbar'}
            </div>
          </div>
        </div>
      )}

      <div className={styles.grid}>
        {DESKTOP_APPS.map(appId => {
          const meta = APP_REGISTRY[appId];
          return (
            <div
              key={appId}
              className={styles.icon}
              onDoubleClick={() => handleOpen(appId)}
              onContextMenu={(e) => handleCtx(e, appId)}
            >
              {meta.appIcon ? (
                <img src={meta.appIcon} alt="" draggable={false} className={styles.appIcon} />
              ) : (
                <div className={styles.iconBg} style={{ background: meta.color }}>
                  <Icon name={meta.icon} size={24} stroke="white" />
                </div>
              )}
              <span className={styles.label}>{meta.title}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
