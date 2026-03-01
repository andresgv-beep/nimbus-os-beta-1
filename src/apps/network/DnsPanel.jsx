import { useState, useEffect } from 'react';
import { useAuth } from '@context';
import styles from './ServicePanel.module.css';

function Toggle({ on, onChange }) {
  return (
    <div className={`${styles.toggle} ${on ? styles.toggleOn : ''}`} onClick={onChange}>
      <div className={styles.toggleDot} />
    </div>
  );
}

export default function DnsPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [localDns, setLocalDns] = useState({ primary: '', secondary: '', search: '' });
  const [saving, setSaving] = useState(false);

  const headers = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchDns = () => {
    fetch('/api/dns/status', { headers })
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setData(d);
          setLocalDns({
            primary: d.servers?.[0] || '',
            secondary: d.servers?.[1] || '',
            search: (d.search || []).join(' '),
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchDns(); }, []);

  const saveDns = async () => {
    setSaving(true);
    try {
      await fetch('/api/dns/config', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          servers: [localDns.primary, localDns.secondary].filter(Boolean),
          search: localDns.search.split(/\s+/).filter(Boolean),
        }),
      });
      setEditing(false);
      fetchDns();
    } catch {}
    setSaving(false);
  };

  const PRESETS = [
    { name: 'Cloudflare', primary: '1.1.1.1', secondary: '1.0.0.1' },
    { name: 'Google', primary: '8.8.8.8', secondary: '8.8.4.4' },
    { name: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112' },
    { name: 'OpenDNS', primary: '208.67.222.222', secondary: '208.67.220.220' },
  ];

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <span>Loading DNS configuration…</span>
      </div>
    );
  }

  const servers = data?.servers || [];
  const resolvedMethod = data?.method || 'unknown';

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.svcIcon}>🌐</div>
          <div>
            <h3 className={styles.title}>DNS Configuration</h3>
            <p className={styles.desc}>Domain name resolution settings for this server</p>
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className={`${styles.statsGrid} ${styles.statsGrid3}`}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Primary DNS</div>
          <div className={`${styles.statValue} ${styles.mono}`} style={{ fontSize: 'var(--text-lg)' }}>
            {servers[0] || '—'}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Secondary DNS</div>
          <div className={`${styles.statValue} ${styles.mono}`} style={{ fontSize: 'var(--text-lg)' }}>
            {servers[1] || '—'}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Method</div>
          <div className={styles.statValue} style={{ fontSize: 'var(--text-lg)' }}>
            {resolvedMethod}
          </div>
        </div>
      </div>

      {/* Current Config */}
      <div className={styles.configCard}>
        <div className={styles.configCardTitle}>DNS Servers</div>
        
        {!editing ? (
          <>
            {servers.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🌐</div>
                <div className={styles.emptyTitle}>No DNS servers configured</div>
              </div>
            ) : (
              <div className={styles.itemList}>
                {servers.map((s, i) => (
                  <div key={i} className={styles.itemRow}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemIcon}>{i === 0 ? '🔵' : '⚪'}</div>
                      <div className={styles.itemInfo}>
                        <div className={styles.itemName}>{s}</div>
                        <div className={styles.itemSub}>{i === 0 ? 'Primary' : 'Secondary'}</div>
                      </div>
                    </div>
                    <div className={styles.itemMeta}>
                      {s === '1.1.1.1' || s === '1.0.0.1' ? (
                        <span className={`${styles.badge} ${styles.badgeInfo}`}>Cloudflare</span>
                      ) : s === '8.8.8.8' || s === '8.8.4.4' ? (
                        <span className={`${styles.badge} ${styles.badgeInfo}`}>Google</span>
                      ) : s === '9.9.9.9' ? (
                        <span className={`${styles.badge} ${styles.badgeInfo}`}>Quad9</span>
                      ) : s.startsWith('192.168.') || s.startsWith('10.') || s.startsWith('172.') ? (
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>Local</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {(data?.search || []).length > 0 && (
              <div className={styles.fieldRow} style={{ marginTop: 12 }}>
                <span className={styles.fieldLabel}>Search domains</span>
                <span className={styles.mono}>{data.search.join(', ')}</span>
              </div>
            )}

            <div className={styles.configActions}>
              <button className={styles.btnPrimary} onClick={() => setEditing(true)}>
                Edit DNS
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.formGrid} style={{ marginBottom: 12 }}>
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Primary DNS</label>
                <input
                  className={`${styles.fieldInput} ${styles.fieldInputFull} ${styles.mono}`}
                  value={localDns.primary}
                  onChange={e => setLocalDns(p => ({ ...p, primary: e.target.value }))}
                  placeholder="1.1.1.1"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Secondary DNS</label>
                <input
                  className={`${styles.fieldInput} ${styles.fieldInputFull} ${styles.mono}`}
                  value={localDns.secondary}
                  onChange={e => setLocalDns(p => ({ ...p, secondary: e.target.value }))}
                  placeholder="1.0.0.1"
                />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.fieldLabel}>Search domains</label>
                <input
                  className={`${styles.fieldInput} ${styles.fieldInputFull} ${styles.mono}`}
                  value={localDns.search}
                  onChange={e => setLocalDns(p => ({ ...p, search: e.target.value }))}
                  placeholder="home.local lan"
                />
              </div>
            </div>

            {/* Presets */}
            <div className={styles.configCardTitle} style={{ marginTop: 8 }}>Quick Presets</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {PRESETS.map(p => (
                <button
                  key={p.name}
                  className={styles.btnSecondary}
                  onClick={() => setLocalDns(prev => ({ ...prev, primary: p.primary, secondary: p.secondary }))}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div className={styles.configActions}>
              <button className={styles.btnSecondary} onClick={() => setEditing(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={saveDns} disabled={saving}>
                {saving ? 'Saving…' : 'Save DNS'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Info */}
      <div className={styles.infoBar}>
        💡 DNS changes take effect immediately. If using DHCP, DNS may be overridden on next lease renewal.
        For persistent changes, consider setting a static DNS in your network interface configuration.
      </div>
    </div>
  );
}
