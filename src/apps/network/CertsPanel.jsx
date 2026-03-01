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

export default function CertsPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('certs');
  const [requesting, setRequesting] = useState(false);
  const [renewing, setRenewing] = useState(null);
  const [newCert, setNewCert] = useState({ domain: '', email: '', method: 'standalone' });
  const [requestLog, setRequestLog] = useState(null);

  const headers = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchCerts = () => {
    fetch('/api/certs/status', { headers })
      .then(r => r.json())
      .then(d => {
        if (!d.error) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchCerts(); }, []);

  const requestCert = async () => {
    if (!newCert.domain || !newCert.email) return;
    setRequesting(true);
    setRequestLog(null);
    try {
      const r = await fetch('/api/certs/request', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(newCert),
      });
      const d = await r.json();
      setRequestLog(d);
      if (d.ok) {
        setNewCert({ domain: '', email: '', method: 'standalone' });
        fetchCerts();
      }
    } catch (e) {
      setRequestLog({ error: e.message });
    }
    setRequesting(false);
  };

  const renewCert = async (domain) => {
    setRenewing(domain);
    try {
      await fetch('/api/certs/renew', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ domain }),
      });
      fetchCerts();
    } catch {}
    setRenewing(null);
  };

  const deleteCert = async (domain) => {
    if (!confirm(`Delete certificate for ${domain}?`)) return;
    await fetch('/api/certs/delete', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ domain }),
    });
    fetchCerts();
  };

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <span>Loading certificates…</span>
      </div>
    );
  }

  const certs = data?.certificates || [];
  const certbotInstalled = data?.certbotInstalled;
  const validCount = certs.filter(c => c.valid).length;
  const expiringSoon = certs.filter(c => c.daysLeft <= 30 && c.daysLeft > 0).length;

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.svcIcon} style={{ background: 'rgba(76,175,80,0.1)' }}>🔒</div>
          <div>
            <h3 className={styles.title}>SSL Certificates</h3>
            <p className={styles.desc}>Manage TLS certificates for encrypted connections</p>
          </div>
        </div>
      </div>

      {/* Not installed */}
      {!certbotInstalled && (
        <div className={styles.notInstalled}>
          <div className={styles.notInstalledIcon}>📦</div>
          <div className={styles.notInstalledTitle}>Certbot not installed</div>
          <p className={styles.notInstalledDesc}>
            Install Certbot to manage Let's Encrypt certificates automatically.
          </p>
          <code className={styles.installCmd}>sudo apt install -y certbot</code>
        </div>
      )}

      {certbotInstalled && (
        <>
          {/* Stats */}
          <div className={`${styles.statsGrid} ${styles.statsGrid3}`}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Certificates</div>
              <div className={styles.statValue}>{certs.length}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Valid</div>
              <div className={styles.statValue} style={{ color: 'var(--accent-green)' }}>{validCount}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Expiring Soon</div>
              <div className={styles.statValue} style={{ color: expiringSoon > 0 ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
                {expiringSoon}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'certs', label: 'Certificates', icon: '🔒' },
              { id: 'request', label: 'Request New', icon: '➕' },
            ]}
          />

          {/* TAB: Certificates List */}
          {tab === 'certs' && (
            <div>
              {certs.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🔒</div>
                  <div className={styles.emptyTitle}>No certificates found</div>
                  <p className={styles.emptyDesc}>
                    Request a Let's Encrypt certificate to enable HTTPS for your domains.
                  </p>
                </div>
              ) : (
                <div className={styles.itemList}>
                  {certs.map((cert, i) => {
                    const isExpiringSoon = cert.daysLeft <= 30 && cert.daysLeft > 0;
                    const isExpired = cert.daysLeft <= 0;
                    return (
                      <div key={i} className={styles.itemRow}>
                        <div className={styles.itemMain}>
                          <div className={styles.itemIcon}>
                            {isExpired ? '❌' : isExpiringSoon ? '⚠️' : '✅'}
                          </div>
                          <div className={styles.itemInfo}>
                            <div className={styles.itemName}>{cert.domain}</div>
                            <div className={styles.itemSub}>
                              Expires: {cert.expiry} ({cert.daysLeft}d left)
                            </div>
                          </div>
                        </div>
                        <div className={styles.itemMeta}>
                          <span className={`${styles.badge} ${
                            isExpired ? styles.badgeDanger 
                            : isExpiringSoon ? styles.badgeWarn 
                            : styles.badgeGood
                          }`}>
                            {isExpired ? 'Expired' : isExpiringSoon ? 'Expiring' : 'Valid'}
                          </span>
                          <span className={`${styles.badge} ${styles.badgeInfo}`}>{cert.issuer || "Let's Encrypt"}</span>
                          <button
                            className={styles.btnSecondary}
                            onClick={() => renewCert(cert.domain)}
                            disabled={renewing === cert.domain}
                            style={{ padding: '4px 12px', fontSize: 'var(--text-xs)' }}
                          >
                            {renewing === cert.domain ? '…' : '↻ Renew'}
                          </button>
                          <button
                            className={styles.deleteBtn}
                            onClick={() => deleteCert(cert.domain)}
                            title="Delete certificate"
                          >✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Auto-renewal info */}
              <div className={styles.infoBar} style={{ marginTop: 16 }}>
                💡 Let's Encrypt certificates auto-renew via systemd timer or cron. 
                Run <span className={styles.mono}>sudo certbot renew --dry-run</span> to test renewal.
              </div>
            </div>
          )}

          {/* TAB: Request New */}
          {tab === 'request' && (
            <div className={styles.configSection}>
              <div className={styles.configCard}>
                <div className={styles.configCardTitle}>Request Let's Encrypt Certificate</div>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.fieldLabel}>Domain</label>
                    <input
                      className={`${styles.fieldInput} ${styles.fieldInputFull} ${styles.mono}`}
                      placeholder="nas.example.com"
                      value={newCert.domain}
                      onChange={e => setNewCert(p => ({ ...p, domain: e.target.value }))}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.fieldLabel}>Email</label>
                    <input
                      className={`${styles.fieldInput} ${styles.fieldInputFull}`}
                      placeholder="admin@example.com"
                      value={newCert.email}
                      onChange={e => setNewCert(p => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                  <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                    <label className={styles.fieldLabel}>Verification method</label>
                    <select
                      className={`${styles.fieldSelect}`}
                      style={{ maxWidth: '100%' }}
                      value={newCert.method}
                      onChange={e => setNewCert(p => ({ ...p, method: e.target.value }))}
                    >
                      <option value="standalone">Standalone (port 80 must be free)</option>
                      <option value="webroot">Webroot (requires running web server)</option>
                      <option value="dns">DNS challenge (manual TXT record)</option>
                    </select>
                  </div>
                </div>
                <div className={styles.configActions}>
                  <button
                    className={styles.btnPrimary}
                    onClick={requestCert}
                    disabled={requesting || !newCert.domain || !newCert.email}
                  >
                    {requesting ? 'Requesting…' : '🔒 Request Certificate'}
                  </button>
                </div>
              </div>

              {/* Request Log */}
              {requestLog && (
                <div className={styles.configCard}>
                  <div className={styles.configCardTitle}>
                    {requestLog.ok ? '✅ Certificate Obtained' : '❌ Request Failed'}
                  </div>
                  <pre className={styles.codeBlock}>
                    {requestLog.log || requestLog.error || JSON.stringify(requestLog, null, 2)}
                  </pre>
                </div>
              )}

              {/* Requirements */}
              <div className={styles.infoBar}>
                ⚠️ Requirements: Your domain must point to this server's public IP. 
                For standalone mode, port 80 must be available. 
                For DNS challenge, you'll need to create a TXT record manually.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
