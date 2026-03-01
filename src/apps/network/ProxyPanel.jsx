import { useState, useEffect } from 'react';
import { ServiceIcon } from '@icons/services/index.jsx';
import { LockIcon, UnlockIcon, PackageIcon, LinkIcon, InfoIcon } from '@icons';
import { useAuth } from '@context';
import styles from './ServicePanel.module.css';

function Toggle({ on, onChange }) {
  return (
    <div className={`${styles.toggle} ${on ? styles.toggleOn : ''}`} onClick={onChange}>
      <div className={styles.toggleDot} />
    </div>
  );
}

export default function ProxyPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState({ domain: '', target: 'localhost:5000', ssl: false });
  const [adding, setAdding] = useState(false);
  const [sslForm, setSslForm] = useState({ domain: '', email: '' });
  const [requestingSSL, setRequestingSSL] = useState(null);
  const [sslLog, setSslLog] = useState(null);

  const headers = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  const fetchStatus = () => {
    fetch('/api/proxy/status', { headers })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchStatus(); }, []);

  const addRule = async () => {
    if (!newRule.domain || !newRule.target) return;
    setAdding(true);
    try {
      await fetch('/api/proxy/add', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(newRule) });
      setNewRule({ domain: '', target: 'localhost:5000', ssl: false });
      setShowAdd(false);
      fetchStatus();
    } catch {}
    setAdding(false);
  };

  const deleteRule = async (domain) => {
    if (!confirm(`Delete proxy rule for ${domain}?`)) return;
    await fetch('/api/proxy/delete', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ domain }) });
    fetchStatus();
  };

  const toggleRule = async (domain) => {
    await fetch('/api/proxy/toggle', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ domain }) });
    fetchStatus();
  };

  const requestSSL = async (domain) => {
    if (!sslForm.email) return;
    setRequestingSSL(domain);
    setSslLog(null);
    try {
      const r = await fetch('/api/proxy/ssl', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ domain, email: sslForm.email }),
      });
      const d = await r.json();
      setSslLog(d);
      if (d.ok) fetchStatus();
    } catch (e) { setSslLog({ error: e.message }); }
    setRequestingSSL(null);
  };

  if (loading) {
    return <div className={styles.loadingWrap}><div className={styles.spinner} /><span>Loading proxy status…</span></div>;
  }

  const isInstalled = data?.installed;
  const isRunning = data?.running;
  const rules = data?.rules || [];
  const activeRules = rules.filter(r => r.enabled);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.svcIcon}><ServiceIcon id="proxy" size={22} /></div>
          <div>
            <h3 className={styles.title}>Reverse Proxy</h3>
            <p className={styles.desc}>Route external traffic to internal services via domain-based rules</p>
          </div>
        </div>
      </div>

      {!isInstalled && (
        <div className={styles.notInstalled}>
          <div className={styles.notInstalledIcon}><PackageIcon size={40} /></div>
          <div className={styles.notInstalledTitle}>Nginx not installed</div>
          <p className={styles.notInstalledDesc}>Install Nginx to use reverse proxy functionality.</p>
          <code className={styles.installCmd}>sudo apt install -y nginx</code>
        </div>
      )}

      {isInstalled && (
        <>
          <div className={`${styles.statsGrid} ${styles.statsGrid3}`}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Nginx</div>
              <div className={`${styles.statusBadge} ${isRunning ? styles.statusOn : styles.statusOff}`}>
                <span className={styles.statusDot} />
                {isRunning ? 'Running' : 'Stopped'}
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Proxy Rules</div>
              <div className={styles.statValue}>
                {activeRules.length}<span className={styles.statOf}>/ {rules.length}</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>SSL Certificates</div>
              <div className={styles.statValue}>{rules.filter(r => r.ssl && r.certPath).length}</div>
            </div>
          </div>

          {data?.version && (
            <div className={styles.versionBar}><span className={styles.mono}>{data.version}</span></div>
          )}

          {/* Rules list */}
          <div className={styles.configCard}>
            <div className={styles.configCardTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Proxy Rules
              <button className={styles.btnPrimary} onClick={() => setShowAdd(!showAdd)} style={{ padding: '4px 14px', fontSize: 'var(--text-xs)' }}>
                {showAdd ? 'Cancel' : '+ Add Rule'}
              </button>
            </div>

            {/* Add form */}
            {showAdd && (
              <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.fieldLabel}>Domain</label>
                    <input
                      className={`${styles.fieldInput} ${styles.fieldInputFull} ${styles.mono}`}
                      placeholder="nas.example.duckdns.org"
                      value={newRule.domain}
                      onChange={e => setNewRule(p => ({ ...p, domain: e.target.value }))}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.fieldLabel}>Target (host:port)</label>
                    <input
                      className={`${styles.fieldInput} ${styles.fieldInputFull} ${styles.mono}`}
                      placeholder="localhost:5000"
                      value={newRule.target}
                      onChange={e => setNewRule(p => ({ ...p, target: e.target.value }))}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                  <button className={styles.btnPrimary} onClick={addRule} disabled={adding || !newRule.domain || !newRule.target}>
                    {adding ? 'Adding…' : 'Add Rule'}
                  </button>
                </div>
              </div>
            )}

            {rules.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><LinkIcon size={32} /></div>
                <div className={styles.emptyTitle}>No proxy rules</div>
                <p className={styles.emptyDesc}>Add a rule to route external traffic to your services. Point a domain to this server's IP first.</p>
              </div>
            ) : (
              <div className={styles.itemList}>
                {rules.map((rule, i) => (
                  <div key={i} className={styles.itemRow} style={{ opacity: rule.enabled ? 1 : 0.5 }}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemIcon}>{rule.ssl && rule.certPath ? <LockIcon size={20} style={{color:'var(--accent-green)'}} /> : <UnlockIcon size={20} />}</div>
                      <div className={styles.itemInfo}>
                        <div className={styles.itemName}>{rule.domain}</div>
                        <div className={styles.itemSub}>→ {rule.target}</div>
                      </div>
                    </div>
                    <div className={styles.itemMeta}>
                      {rule.ssl && rule.certPath ? (
                        <span className={`${styles.badge} ${styles.badgeGood}`}>SSL</span>
                      ) : (
                        <button
                          className={styles.btnSecondary}
                          onClick={() => setSslForm({ domain: rule.domain, email: '' })}
                          style={{ padding: '3px 10px', fontSize: 'var(--text-xs)' }}
                        >🔒 Enable SSL</button>
                      )}
                      <span className={`${styles.badge} ${rule.enabled ? styles.badgeGood : styles.badgeWarn}`}>
                        {rule.enabled ? 'Active' : 'Disabled'}
                      </span>
                      <Toggle on={rule.enabled} onChange={() => toggleRule(rule.domain)} />
                      <button className={styles.deleteBtn} onClick={() => deleteRule(rule.domain)} title="Delete">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SSL request form */}
          {sslForm.domain && (
            <div className={styles.configCard} style={{ marginTop: 12 }}>
              <div className={styles.configCardTitle}>🔒 Request SSL for {sslForm.domain}</div>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.fieldLabel}>Email (for Let's Encrypt)</label>
                  <input
                    className={`${styles.fieldInput} ${styles.fieldInputFull}`}
                    placeholder="admin@example.com"
                    value={sslForm.email}
                    onChange={e => setSslForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className={styles.formGroup} style={{ justifyContent: 'flex-end' }}>
                  <div className={styles.btnRow}>
                    <button className={styles.btnSecondary} onClick={() => { setSslForm({ domain: '', email: '' }); setSslLog(null); }}>Cancel</button>
                    <button
                      className={styles.btnPrimary}
                      onClick={() => requestSSL(sslForm.domain)}
                      disabled={requestingSSL || !sslForm.email}
                    >
                      {requestingSSL ? 'Requesting…' : 'Request Certificate'}
                    </button>
                  </div>
                </div>
              </div>
              {sslLog && (
                <pre className={styles.codeBlock} style={{ marginTop: 12, maxHeight: 200 }}>
                  {sslLog.ok ? `✅ Certificate obtained!\n\n${sslLog.log || ''}` : `❌ ${sslLog.error}\n\n${sslLog.log || ''}`}
                </pre>
              )}
            </div>
          )}

          <div className={styles.infoBar}>
            Point your domain's DNS (A record) to this server's public IP. 
            For DDNS domains, configure DDNS first in the DDNS section. 
            SSL certificates from Let's Encrypt require port 80 to be accessible from the internet.
          </div>
        </>
      )}
    </div>
  );
}
