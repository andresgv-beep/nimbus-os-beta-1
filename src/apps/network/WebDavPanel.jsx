import { useState, useEffect } from 'react';
import { ServiceIcon } from '@icons/services/index.jsx';
import { FolderOutlineIcon, SettingsIcon, PackageIcon, InfoIcon } from '@icons';
import { useAuth } from '@context';
import styles from './ServicePanel.module.css';

function Toggle({ on, onChange, disabled }) {
  return (
    <div
      className={`${styles.toggle} ${on ? styles.toggleOn : ''} ${disabled ? styles.toggleDisabled : ''}`}
      onClick={disabled ? undefined : onChange}
    >
      <div className={styles.toggleDot} />
    </div>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div className={styles.tabs}>
      {tabs.map(t => (
        <button
          key={t.id}
          className={`${styles.tab} ${active === t.id ? styles.tabActive : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className={styles.tabIcon}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function WebDavPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [actionPending, setActionPending] = useState(null);
  const [configDirty, setConfigDirty] = useState(false);
  const [localConfig, setLocalConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  const headers = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchStatus = () => {
    fetch('/api/webdav/status', { headers })
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setData(d);
          if (!localConfig) setLocalConfig(d.config);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchStatus(); }, []);

  const doAction = async (action) => {
    setActionPending(action);
    try {
      await fetch(`/api/webdav/${action}`, { method: 'POST', headers });
      setTimeout(() => {
        fetchStatus();
        setActionPending(null);
      }, 1500);
    } catch {
      setActionPending(null);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await fetch('/api/webdav/config', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(localConfig),
      });
      setConfigDirty(false);
      // Apply and restart
      await fetch('/api/webdav/restart', { method: 'POST', headers });
      setTimeout(fetchStatus, 1500);
    } catch {}
    setSaving(false);
  };

  const toggleShareWebdav = async (shareName, enabled) => {
    await fetch(`/api/webdav/share/${shareName}`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ enabled }),
    });
    fetchStatus();
  };

  const updateConfig = (key, value) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setConfigDirty(true);
  };

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <span>Loading WebDAV status…</span>
      </div>
    );
  }

  const isRunning = data?.running;
  const isInstalled = data?.installed;

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.svcIcon}><ServiceIcon id="webdav" size={22} /></div>
          <div>
            <h3 className={styles.title}>WebDAV</h3>
            <p className={styles.desc}>Access files via HTTP/HTTPS with WebDAV protocol</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {isInstalled && (
            <Toggle on={isRunning} onChange={() => doAction(isRunning ? 'stop' : 'start')} />
          )}
        </div>
      </div>

      {/* Not installed */}
      {!isInstalled && (
        <div className={styles.notInstalled}>
          <div className={styles.notInstalledIcon}><PackageIcon size={40} /></div>
          <div className={styles.notInstalledTitle}>WebDAV server not installed</div>
          <p className={styles.notInstalledDesc}>
            Install Apache or Nginx with WebDAV module to serve files over HTTP.
          </p>
          <code className={styles.installCmd}>sudo apt install -y apache2</code>
        </div>
      )}

      {isInstalled && (
        <>
          {/* Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Status</div>
              <div className={`${styles.statusBadge} ${isRunning ? styles.statusOn : styles.statusOff}`}>
                <span className={styles.statusDot} />
                {actionPending ? 'Changing…' : isRunning ? 'Running' : 'Stopped'}
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>HTTP Port</div>
              <div className={styles.statValue}>{localConfig?.httpPort || data?.config?.httpPort || '80'}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>HTTPS Port</div>
              <div className={styles.statValue}>{localConfig?.httpsPort || data?.config?.httpsPort || '443'}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Shares</div>
              <div className={styles.statValue}>
                {(data?.shares || []).filter(s => s.webdavEnabled).length}
                <span className={styles.statOf}>/ {(data?.shares || []).length}</span>
              </div>
            </div>
          </div>

          {/* Version */}
          {data?.version && (
            <div className={styles.versionBar}>
              <span className={styles.mono}>{data.version}</span>
            </div>
          )}

          {/* Tabs */}
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'overview', label: 'Shares', icon: <FolderOutlineIcon size={14} /> },
              { id: 'config', label: 'Configuration', icon: <SettingsIcon size={14} /> },
            ]}
          />

          {/* TAB: Shares */}
          {tab === 'overview' && (
            <div>
              {(data?.shares || []).length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><FolderOutlineIcon size={32} /></div>
                  <div className={styles.emptyTitle}>No shared folders</div>
                  <p className={styles.emptyDesc}>
                    Create shared folders in Storage Manager, then enable them for WebDAV here.
                  </p>
                </div>
              ) : (
                <div className={styles.itemList}>
                  {(data?.shares || []).map(share => (
                    <div key={share.name} className={styles.itemRow} style={{ opacity: share.webdavEnabled ? 1 : 0.55 }}>
                      <div className={styles.itemMain}>
                        <div className={styles.itemIcon}><FolderOutlineIcon size={20} /></div>
                        <div className={styles.itemInfo}>
                          <div className={styles.itemName}>{share.displayName || share.name}</div>
                          <div className={styles.itemSub}>{share.path}</div>
                        </div>
                      </div>
                      <div className={styles.itemMeta}>
                        {share.pool && (
                          <span className={`${styles.badge} ${styles.badgeInfo}`}>{share.pool}</span>
                        )}
                        <Toggle
                          on={share.webdavEnabled}
                          onChange={() => toggleShareWebdav(share.name, !share.webdavEnabled)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Connection help */}
              <div className={styles.configCard} style={{ marginTop: 16 }}>
                <div className={styles.configCardTitle}>Connecting via WebDAV</div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Windows</span>
                  <span className={styles.mono}>https://&#123;server-ip&#125;/webdav/ShareName</span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>macOS</span>
                  <span className={styles.mono}>https://&#123;server-ip&#125;/webdav/ShareName</span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Linux</span>
                  <span className={styles.mono}>davs://&#123;server-ip&#125;/webdav/ShareName</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Configuration */}
          {tab === 'config' && localConfig && (
            <div className={styles.configSection}>
              <div className={styles.configCard}>
                <div className={styles.configCardTitle}>Ports</div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>HTTP port</span>
                  <input
                    className={`${styles.fieldInput} ${styles.mono}`}
                    value={localConfig.httpPort || ''}
                    onChange={e => updateConfig('httpPort', e.target.value)}
                    type="number"
                  />
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>HTTPS port</span>
                  <input
                    className={`${styles.fieldInput} ${styles.mono}`}
                    value={localConfig.httpsPort || ''}
                    onChange={e => updateConfig('httpsPort', e.target.value)}
                    type="number"
                  />
                </div>
              </div>

              <div className={styles.configCard}>
                <div className={styles.configCardTitle}>Settings</div>
                <div className={styles.fieldRow}>
                  <div>
                    <span className={styles.fieldLabel}>Max upload size (MB)</span>
                  </div>
                  <input
                    className={`${styles.fieldInput} ${styles.mono}`}
                    value={localConfig.maxUploadMB || ''}
                    onChange={e => updateConfig('maxUploadMB', parseInt(e.target.value) || 0)}
                    type="number"
                  />
                </div>
                <div className={styles.fieldRow}>
                  <div>
                    <span className={styles.fieldLabel}>Require authentication</span>
                    <span className={styles.fieldHint}>Use HTTP Basic Auth</span>
                  </div>
                  <Toggle
                    on={localConfig.requireAuth !== false}
                    onChange={() => updateConfig('requireAuth', !localConfig.requireAuth)}
                  />
                </div>
              </div>

              <div className={styles.configActions}>
                {configDirty && <span className={styles.unsavedBadge}>Unsaved changes</span>}
                <button
                  className={styles.btnPrimary}
                  onClick={saveConfig}
                  disabled={!configDirty || saving}
                >
                  {saving ? 'Saving…' : 'Save & Restart'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
