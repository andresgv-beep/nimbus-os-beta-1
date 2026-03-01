import { useState, useEffect, useCallback } from 'react';
import { ServiceIcon } from '@icons/services/index.jsx';
import { FolderOutlineIcon, MonitorIcon, UserIcon, SettingsIcon, FileCodeIcon, InfoIcon } from '@icons';
import { useAuth } from '@context';
import styles from './SmbPanel.module.css';

/* ─── Reusable Toggle ─── */
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

/* ─── Tabs ─── */
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

/* ─── Inline Edit Field ─── */
function ConfigField({ label, value, onChange, type = 'text', options, hint, mono }) {
  if (options) {
    return (
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <select className={styles.fieldSelect} value={value} onChange={e => onChange(e.target.value)}>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }
  if (type === 'toggle') {
    return (
      <div className={styles.fieldRow}>
        <div>
          <span className={styles.fieldLabel}>{label}</span>
          {hint && <span className={styles.fieldHint}>{hint}</span>}
        </div>
        <Toggle on={value} onChange={() => onChange(!value)} />
      </div>
    );
  }
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        className={`${styles.fieldInput} ${mono ? styles.mono : ''}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        type={type}
      />
    </div>
  );
}

/* ─── Main SMB Panel ─── */
export default function SmbPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [actionPending, setActionPending] = useState(null);
  const [configDirty, setConfigDirty] = useState(false);
  const [localConfig, setLocalConfig] = useState(null);
  const [confPreview, setConfPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [smbPassword, setSmbPassword] = useState({ user: '', pass: '', show: false });
  const [settingPass, setSettingPass] = useState(false);

  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const authJsonHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchStatus = useCallback(() => {
    fetch('/api/smb/status', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setData(d);
          if (!localConfig) setLocalConfig(d.config);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, localConfig]);

  useEffect(() => { fetchStatus(); }, []);
  // Auto-refresh every 10s for live clients
  useEffect(() => {
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const doAction = async (action) => {
    setActionPending(action);
    try {
      await fetch(`/api/smb/${action}`, { method: 'POST', headers: authHeaders });
      // Small delay to let systemctl settle
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
      await fetch('/api/smb/config', {
        method: 'POST',
        headers: authJsonHeaders,
        body: JSON.stringify(localConfig),
      });
      setConfigDirty(false);
      fetchStatus();
    } catch {}
    setSaving(false);
  };

  const applyAndReload = async () => {
    setActionPending('apply');
    try {
      // Save config first, then apply + restart
      await fetch('/api/smb/config', {
        method: 'POST',
        headers: authJsonHeaders,
        body: JSON.stringify(localConfig),
      });
      await fetch('/api/smb/restart', { method: 'POST', headers: authHeaders });
      setConfigDirty(false);
      setTimeout(() => {
        fetchStatus();
        setActionPending(null);
      }, 2000);
    } catch {
      setActionPending(null);
    }
  };

  const toggleShareSmb = async (shareName, enabled) => {
    await fetch(`/api/smb/share/${shareName}`, {
      method: 'PUT',
      headers: authJsonHeaders,
      body: JSON.stringify({ enabled }),
    });
    fetchStatus();
  };

  const fetchPreview = async () => {
    const r = await fetch('/api/smb/preview', { headers: authHeaders });
    const d = await r.json();
    setConfPreview(d.conf || 'Error loading preview');
  };

  const updateConfig = (key, value) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setConfigDirty(true);
  };

  const syncUsers = async () => {
    setSyncResult('syncing');
    try {
      const r = await fetch('/api/smb/sync-users', { method: 'POST', headers: authHeaders });
      const d = await r.json();
      setSyncResult(d);
    } catch {
      setSyncResult({ error: 'Failed to sync' });
    }
  };

  const setSmbPass = async () => {
    if (!smbPassword.user || !smbPassword.pass) return;
    setSettingPass(true);
    try {
      const r = await fetch('/api/smb/set-password', {
        method: 'POST',
        headers: authJsonHeaders,
        body: JSON.stringify({ username: smbPassword.user, password: smbPassword.pass }),
      });
      const d = await r.json();
      if (d.ok) {
        setSmbPassword({ user: '', pass: '', show: false });
        setSyncResult(null);
        syncUsers(); // refresh status
      }
    } catch {}
    setSettingPass(false);
  };

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <span>Loading SMB status…</span>
      </div>
    );
  }

  const isRunning = data?.running;
  const isInstalled = data?.installed;

  const PROTOCOL_OPTIONS = [
    { value: 'SMB2', label: 'SMB2' },
    { value: 'SMB2_02', label: 'SMB 2.0.2' },
    { value: 'SMB2_10', label: 'SMB 2.1' },
    { value: 'SMB3', label: 'SMB3' },
    { value: 'SMB3_00', label: 'SMB 3.0' },
    { value: 'SMB3_02', label: 'SMB 3.0.2' },
    { value: 'SMB3_11', label: 'SMB 3.1.1' },
  ];

  return (
    <div className={styles.panel}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.svcIcon}><ServiceIcon id="smb" size={22} /></div>
          <div>
            <h3 className={styles.title}>SMB / CIFS</h3>
            <p className={styles.desc}>
              Share folders with Windows, macOS, and Linux devices on your local network
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {isInstalled && (
            <Toggle on={isRunning} onChange={() => doAction(isRunning ? 'stop' : 'start')} />
          )}
        </div>
      </div>

      {/* ── Not installed state ── */}
      {!isInstalled && (
        <div className={styles.notInstalled}>
          <div className={styles.notInstalledIcon}>📦</div>
          <div className={styles.notInstalledTitle}>Samba not installed</div>
          <p className={styles.notInstalledDesc}>
            Install Samba to share folders over SMB/CIFS protocol.
          </p>
          <code className={styles.installCmd}>sudo apt install -y samba</code>
        </div>
      )}

      {isInstalled && (
        <>
          {/* ── Status Cards ── */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Status</div>
              <div className={`${styles.statusBadge} ${isRunning ? styles.statusOn : styles.statusOff}`}>
                <span className={styles.statusDot} />
                {actionPending === 'start' || actionPending === 'stop'
                  ? 'Changing…'
                  : isRunning ? 'Running' : 'Stopped'}
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Port</div>
              <div className={styles.statValue}>445</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Clients</div>
              <div className={styles.statValue}>{data?.clientCount || 0}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Shares</div>
              <div className={styles.statValue}>
                {(data?.shares || []).filter(s => s.smbEnabled).length}
                <span className={styles.statOf}>/ {(data?.shares || []).length}</span>
              </div>
            </div>
          </div>

          {/* ── Version ── */}
          {data?.version && (
            <div className={styles.versionBar}>
              <span className={styles.mono}>{data.version}</span>
              <span className={styles.versionSep}>·</span>
              Protocol: <span className={styles.mono}>{localConfig?.minProtocol}</span> → <span className={styles.mono}>{localConfig?.maxProtocol}</span>
            </div>
          )}

          {/* ── Tabs ── */}
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'overview', label: 'Shares', icon: <FolderOutlineIcon size={14} /> },
              { id: 'clients', label: 'Clients', icon: <MonitorIcon size={14} /> },
              { id: 'users', label: 'Users', icon: <UserIcon size={14} /> },
              { id: 'config', label: 'Config', icon: <SettingsIcon size={14} /> },
              { id: 'conf', label: 'smb.conf', icon: <FileCodeIcon size={14} /> },
            ]}
          />

          {/* ── TAB: Shares ── */}
          {tab === 'overview' && (
            <div className={styles.sharesSection}>
              {(data?.shares || []).length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><FolderOutlineIcon size={32} /></div>
                  <div className={styles.emptyTitle}>No shared folders</div>
                  <p className={styles.emptyDesc}>
                    Create shared folders in Storage Manager, then enable them for SMB here.
                  </p>
                </div>
              ) : (
                <div className={styles.shareList}>
                  {(data?.shares || []).map(share => (
                    <div key={share.name} className={`${styles.shareRow} ${!share.smbEnabled ? styles.shareDisabled : ''}`}>
                      <div className={styles.shareMain}>
                        <div className={styles.shareIcon}><FolderOutlineIcon size={20} /></div>
                        <div className={styles.shareInfo}>
                          <div className={styles.shareName}>{share.displayName || share.name}</div>
                          <div className={styles.sharePath}>{share.path}</div>
                          {share.description && (
                            <div className={styles.shareDesc}>{share.description}</div>
                          )}
                        </div>
                      </div>
                      <div className={styles.shareMeta}>
                        <div className={styles.shareUsers}>
                          {share.rwUsers.length > 0 && (
                            <span className={styles.userBadge} title="Read-Write">
                              ✏️ {share.rwUsers.join(', ')}
                            </span>
                          )}
                          {share.roUsers.length > 0 && (
                            <span className={`${styles.userBadge} ${styles.userBadgeRo}`} title="Read-Only">
                              👁 {share.roUsers.join(', ')}
                            </span>
                          )}
                          {share.rwUsers.length === 0 && share.roUsers.length === 0 && (
                            <span className={styles.noUsers}>No users assigned</span>
                          )}
                        </div>
                        {share.pool && (
                          <span className={styles.poolBadge}>{share.pool}</span>
                        )}
                        <Toggle
                          on={share.smbEnabled}
                          onChange={() => toggleShareSmb(share.name, !share.smbEnabled)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Connection Help */}
              <div className={styles.helpCard}>
                <div className={styles.helpTitle}>Connecting from devices</div>
                <div className={styles.helpGrid}>
                  <div className={styles.helpItem}>
                    <span className={styles.helpOs}>Windows</span>
                    <code className={styles.helpCmd}>\\&#123;server-ip&#125;\ShareName</code>
                    <span className={styles.helpHint}>File Explorer → address bar</span>
                  </div>
                  <div className={styles.helpItem}>
                    <span className={styles.helpOs}>macOS</span>
                    <code className={styles.helpCmd}>smb://&#123;server-ip&#125;/ShareName</code>
                    <span className={styles.helpHint}>Finder → Go → Connect to Server</span>
                  </div>
                  <div className={styles.helpItem}>
                    <span className={styles.helpOs}>Linux</span>
                    <code className={styles.helpCmd}>smb://&#123;server-ip&#125;/ShareName</code>
                    <span className={styles.helpHint}>File manager or mount -t cifs</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: Clients ── */}
          {tab === 'clients' && (
            <div>
              {(data?.clients || []).length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><MonitorIcon size={32} /></div>
                  <div className={styles.emptyTitle}>No active connections</div>
                  <p className={styles.emptyDesc}>
                    {isRunning
                      ? 'No clients are currently connected to SMB shares.'
                      : 'Start the SMB service to accept connections.'}
                  </p>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Machine</th>
                        <th>IP Address</th>
                        {data.clients[0]?.share && <th>Share</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.clients.map((c, i) => (
                        <tr key={i}>
                          <td className={styles.cellBold}>{c.user}</td>
                          <td>{c.machine}</td>
                          <td className={styles.mono}>{c.ip}</td>
                          {c.share && <td>{c.share}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data?.lockedFiles > 0 && (
                <div className={styles.infoBar}>
                  🔒 {data.lockedFiles} file{data.lockedFiles > 1 ? 's' : ''} currently locked
                </div>
              )}
            </div>
          )}

          {/* ── TAB: Users ── */}
          {tab === 'users' && (
            <div className={styles.configSection}>
              <div className={styles.configCard}>
                <div className={styles.configCardTitle}>Samba User Sync</div>
                <p className={styles.desc} style={{ marginBottom: 12 }}>
                  Samba requires Linux system users with their own passwords. Use "Sync Users" to create 
                  Linux accounts for all NimbusOS users, then set their SMB password below.
                </p>
                <button
                  className={styles.btnPrimary}
                  onClick={syncUsers}
                  disabled={syncResult === 'syncing'}
                >
                  {syncResult === 'syncing' ? 'Syncing…' : '🔄 Sync Users'}
                </button>

                {syncResult && syncResult !== 'syncing' && !syncResult.error && (
                  <div className={styles.tableWrap} style={{ marginTop: 12 }}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>User</th><th>Linux Account</th><th>Samba Password</th></tr>
                      </thead>
                      <tbody>
                        {(syncResult.users || []).map((u, i) => (
                          <tr key={i}>
                            <td className={styles.cellBold}>{u.username}</td>
                            <td>
                              <span className={`${styles.badge} ${u.linuxUser ? styles.badgeGood : styles.badgeDanger}`}>
                                {u.linuxUser ? '✓ Created' : '✗ Missing'}
                              </span>
                            </td>
                            <td>
                              <span className={`${styles.badge} ${u.sambaUser ? styles.badgeGood : styles.badgeWarn}`}>
                                {u.sambaUser ? '✓ Set' : '⚠ Not set'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className={styles.configCard}>
                <div className={styles.configCardTitle}>Set SMB Password</div>
                <p className={styles.desc} style={{ marginBottom: 12 }}>
                  Set or update the Samba password for a NimbusOS user. This is required for SMB access.
                </p>
                <div className={styles.passForm}>
                  <div>
                    <label className={styles.fieldLabel}>Username</label>
                    <input
                      className={styles.fieldInput}
                      style={{ maxWidth: '100%', textAlign: 'left' }}
                      placeholder="username"
                      value={smbPassword.user}
                      onChange={e => setSmbPassword(p => ({ ...p, user: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={styles.fieldLabel}>SMB Password</label>
                    <input
                      className={styles.fieldInput}
                      style={{ maxWidth: '100%', textAlign: 'left' }}
                      type={smbPassword.show ? 'text' : 'password'}
                      placeholder="••••••"
                      value={smbPassword.pass}
                      onChange={e => setSmbPassword(p => ({ ...p, pass: e.target.value }))}
                    />
                  </div>
                  <button
                    className={styles.btnPrimary}
                    onClick={setSmbPass}
                    disabled={settingPass || !smbPassword.user || !smbPassword.pass}
                    style={{ alignSelf: 'flex-end' }}
                  >
                    {settingPass ? 'Setting…' : 'Set Password'}
                  </button>
                </div>
              </div>

              <div className={styles.infoBar}>
                When creating new users in Control Panel, their Linux account and SMB password 
                are now set automatically. This page is for existing users created before this feature.
              </div>
            </div>
          )}

          {/* ── TAB: Configuration ── */}
          {tab === 'config' && localConfig && (
            <div className={styles.configSection}>
              <div className={styles.configCard}>
                <div className={styles.configCardTitle}>Identity</div>
                <ConfigField
                  label="Workgroup"
                  value={localConfig.workgroup}
                  onChange={v => updateConfig('workgroup', v)}
                  mono
                />
                <ConfigField
                  label="Server description"
                  value={localConfig.serverString}
                  onChange={v => updateConfig('serverString', v)}
                />
              </div>

              <div className={styles.configCard}>
                <div className={styles.configCardTitle}>Protocol</div>
                <ConfigField
                  label="Minimum protocol"
                  value={localConfig.minProtocol}
                  onChange={v => updateConfig('minProtocol', v)}
                  options={PROTOCOL_OPTIONS}
                />
                <ConfigField
                  label="Maximum protocol"
                  value={localConfig.maxProtocol}
                  onChange={v => updateConfig('maxProtocol', v)}
                  options={PROTOCOL_OPTIONS}
                />
              </div>

              <div className={styles.configCard}>
                <div className={styles.configCardTitle}>Security & Features</div>
                <ConfigField
                  label="Guest access"
                  value={localConfig.guestAccess}
                  onChange={v => updateConfig('guestAccess', v)}
                  type="toggle"
                  hint="Allow anonymous connections"
                />
                <ConfigField
                  label="Recycle bin"
                  value={localConfig.recycleBin}
                  onChange={v => updateConfig('recycleBin', v)}
                  type="toggle"
                  hint="Move deleted files to .recycle"
                />
                <ConfigField
                  label="NetBIOS"
                  value={localConfig.enableNetbios}
                  onChange={v => updateConfig('enableNetbios', v)}
                  type="toggle"
                  hint="Enable legacy name resolution (nmbd)"
                />
                <ConfigField
                  label="Max connections"
                  value={localConfig.maxConnections}
                  onChange={v => updateConfig('maxConnections', parseInt(v) || 0)}
                  type="number"
                  mono
                />
              </div>

              {/* Save / Apply */}
              <div className={styles.configActions}>
                {configDirty && (
                  <span className={styles.unsavedBadge}>Unsaved changes</span>
                )}
                <button
                  className={styles.btnSecondary}
                  onClick={saveConfig}
                  disabled={!configDirty || saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={applyAndReload}
                  disabled={actionPending === 'apply'}
                >
                  {actionPending === 'apply' ? 'Applying…' : 'Save & Restart SMB'}
                </button>
              </div>
            </div>
          )}

          {/* ── TAB: smb.conf preview ── */}
          {tab === 'conf' && (
            <div className={styles.confSection}>
              <div className={styles.confHeader}>
                <span className={styles.confTitle}>Generated smb.conf</span>
                <button className={styles.btnSecondary} onClick={fetchPreview}>
                  {confPreview ? '↻ Refresh' : 'Load Preview'}
                </button>
              </div>
              {confPreview ? (
                <pre className={styles.confCode}>{confPreview}</pre>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><FileCodeIcon size={32} /></div>
                  <div className={styles.emptyTitle}>Preview not loaded</div>
                  <p className={styles.emptyDesc}>
                    Click "Load Preview" to see the generated smb.conf based on current shares and configuration.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
