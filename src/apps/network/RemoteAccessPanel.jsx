import { useState, useEffect, useCallback } from 'react';
import { ServiceIcon } from '@icons/services/index.jsx';
import {
  GlobeIcon, LockIcon, CheckCircleIcon, AlertTriangleIcon,
  InfoIcon,
} from '@icons';
import { useAuth } from '@context';
import styles from './ServicePanel.module.css';
import ra from './RemoteAccess.module.css';

/* ─── Reusables ─── */
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

function StepBadge({ num, done, active }) {
  return (
    <div className={`${ra.stepBadge} ${done ? ra.stepDone : ''} ${active ? ra.stepActive : ''}`}>
      {done ? '✓' : num}
    </div>
  );
}

function StatusDot({ ok }) {
  return (
    <span className={`${ra.statusDot} ${ok ? ra.dotOk : ra.dotOff}`} />
  );
}

/* ─── Constants ─── */
const PROVIDERS = [
  { id: 'duckdns', name: 'Duck DNS', domainSuffix: '.duckdns.org', needsUsername: false, supportsDnsChallenge: true, url: 'duckdns.org' },
  { id: 'cloudflare', name: 'Cloudflare', domainSuffix: '', needsUsername: false, supportsDnsChallenge: true, tokenLabel: 'API Token', url: 'cloudflare.com' },
  { id: 'noip', name: 'No-IP', domainSuffix: '', needsUsername: true, supportsDnsChallenge: false, url: 'noip.com' },
  { id: 'dynu', name: 'Dynu', domainSuffix: '', needsUsername: true, supportsDnsChallenge: false, url: 'dynu.com' },
  { id: 'freedns', name: 'FreeDNS', domainSuffix: '', needsUsername: false, supportsDnsChallenge: false, url: 'freedns.afraid.org' },
];

const INTERVALS = [
  { value: 1, label: '1 min' }, { value: 5, label: '5 min' },
  { value: 15, label: '15 min' }, { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
];

/* ─── Main component ─── */
export default function RemoteAccessPanel() {
  const { token } = useAuth();
  const headers = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState('direct');

  // DDNS config
  const [ddns, setDdns] = useState({
    enabled: false, provider: 'duckdns', domain: '', token: '', username: '', interval: 5,
  });

  // SSL config
  const [ssl, setSsl] = useState({
    enabled: false, email: '', method: 'dns',
  });

  // HTTPS config
  const [httpsPort, setHttpsPort] = useState(5009);
  const [httpsEnabled, setHttpsEnabled] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [sslLog, setSslLog] = useState(null);

  // ── Fetch current config ──
  const fetchStatus = useCallback(() => {
    fetch('/api/remote-access/status', { headers })
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setStatus(d);
          // Populate form fields from saved config (not from status fields)
          const cfg = d.config || {};
          if (cfg.ddns) setDdns(prev => ({ ...prev, ...cfg.ddns }));
          if (cfg.ssl) setSsl(prev => ({ ...prev, ...cfg.ssl }));
          if (cfg.https) {
            setHttpsPort(cfg.https.port || 5009);
            setHttpsEnabled(!!cfg.https.enabled);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // ── Derived state ──
  const provider = PROVIDERS.find(p => p.id === ddns.provider) || PROVIDERS[0];
  const fullDomain = ddns.domain
    ? (provider.domainSuffix && !ddns.domain.includes('.') ? ddns.domain + provider.domainSuffix : ddns.domain)
    : '';

  const ddnsOk = status?.ddns?.working;
  const sslOk = status?.ssl?.valid;
  const httpsOk = status?.https?.running;
  const allConfigured = ddnsOk && sslOk && httpsOk;

  // ── Handlers ──
  const handleSaveDdns = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/remote-access/configure', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
          ddns: { ...ddns, fullDomain },
          ssl: { ...ssl, domain: fullDomain },
          https: { port: httpsPort, enabled: httpsEnabled },
        }),
      });
      const d = await r.json();
      setTestResult(d);
      fetchStatus();
    } catch (e) { setTestResult({ error: e.message }); }
    setSaving(false);
  };

  const handleTestDdns = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/remote-access/test-ddns', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ ...ddns, fullDomain }),
      });
      const d = await r.json();
      setTestResult(d);
      fetchStatus();
    } catch (e) { setTestResult({ error: e.message }); }
    setTesting(false);
  };

  const handleRequestSSL = async () => {
    setSaving(true);
    setSslLog(null);
    try {
      const r = await fetch('/api/remote-access/request-ssl', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
          domain: fullDomain,
          email: ssl.email,
          method: ssl.method,
          provider: ddns.provider,
          dnsToken: ddns.token,
        }),
      });
      const d = await r.json();
      setSslLog(d);
      fetchStatus();
    } catch (e) { setSslLog({ error: e.message }); }
    setSaving(false);
  };

  const handleEnableHttps = async () => {
    setSaving(true);
    try {
      await fetch('/api/remote-access/enable-https', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ port: httpsPort, domain: fullDomain, enabled: !httpsEnabled }),
      });
      fetchStatus();
    } catch {}
    setSaving(false);
  };

  if (loading) {
    return <div className={styles.loadingWrap}><div className={styles.spinner} /><span>Loading remote access…</span></div>;
  }

  return (
    <div className={styles.panel}>
      {/* ─── Header ─── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.svcIcon}><ServiceIcon id="remote" size={22} /></div>
          <div>
            <h3 className={styles.title}>Remote Access</h3>
            <p className={styles.desc}>Access NimbusOS securely from anywhere — DDNS, SSL &amp; HTTPS in one place</p>
          </div>
        </div>
      </div>

      {/* ─── Overview cards ─── */}
      <div className={`${styles.statsGrid} ${styles.statsGrid3}`}>
        <div className={styles.statCard} onClick={() => setActiveStep(1)} style={{ cursor: 'pointer' }}>
          <div className={styles.statLabel}><StatusDot ok={ddnsOk} /> DDNS</div>
          <div className={styles.statValue} style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
            {ddnsOk ? (status?.ddns?.externalIp || 'Active') : 'Not configured'}
          </div>
        </div>
        <div className={styles.statCard} onClick={() => setActiveStep(2)} style={{ cursor: 'pointer' }}>
          <div className={styles.statLabel}><StatusDot ok={sslOk} /> SSL Certificate</div>
          <div className={styles.statValue} style={{ fontSize: 'var(--text-sm)' }}>
            {sslOk ? `Valid · ${status?.ssl?.daysLeft || '??'}d left` : 'No certificate'}
          </div>
        </div>
        <div className={styles.statCard} onClick={() => setActiveStep(3)} style={{ cursor: 'pointer' }}>
          <div className={styles.statLabel}><StatusDot ok={httpsOk} /> HTTPS</div>
          <div className={styles.statValue} style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
            {httpsOk ? `Port ${httpsPort}` : 'Disabled'}
          </div>
        </div>
      </div>

      {/* ─── All configured banner ─── */}
      {allConfigured && (
        <div className={ra.successBanner}>
          <CheckCircleIcon size={18} />
          <span>Remote access active — <span className={styles.mono}>https://{fullDomain}:{httpsPort}</span></span>
        </div>
      )}

      {/* ─── Mode selector ─── */}
      <div className={ra.modeBar}>
        <button className={`${ra.modeBtn} ${mode === 'direct' ? ra.modeBtnActive : ''}`} onClick={() => setMode('direct')}>
          <GlobeIcon size={14} /> Direct Access
        </button>
        <button className={`${ra.modeBtn} ${mode === 'webrtc' ? ra.modeBtnActive : ''}`} onClick={() => setMode('webrtc')} disabled title="Coming soon">
          🔗 WebRTC Relay <span className={ra.comingSoon}>Soon</span>
        </button>
      </div>

      {/* ═══════════════════════════════════ */}
      {/* ─── STEP 1: DDNS ─── */}
      {/* ═══════════════════════════════════ */}
      <div className={`${ra.stepCard} ${activeStep === 1 ? ra.stepCardActive : ''}`}>
        <div className={ra.stepHeader} onClick={() => setActiveStep(activeStep === 1 ? 0 : 1)}>
          <StepBadge num={1} done={ddnsOk} active={activeStep === 1} />
          <div className={ra.stepTitle}>
            <div>Dynamic DNS</div>
            <div className={ra.stepSub}>Keep a domain pointing to your public IP</div>
          </div>
          <div className={ra.stepStatus}>
            {ddnsOk ? <span className={`${styles.badge} ${styles.badgeGood}`}>Active</span>
              : ddns.enabled ? <span className={`${styles.badge} ${styles.badgeWarn}`}>Pending</span>
              : null}
          </div>
          <div className={ra.chevron}>{activeStep === 1 ? '▾' : '▸'}</div>
        </div>

        {activeStep === 1 && (
          <div className={ra.stepBody}>
            {/* Provider */}
            <div className={ra.fieldGroup}>
              <label className={styles.fieldLabel}>Provider</label>
              <div style={{ position: 'relative' }}>
                <div
                  className={`${styles.fieldInput} ${styles.fieldInputFull}`}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>{provider.name}</span>
                  <span style={{ opacity: 0.4 }}>▾</span>
                </div>
                {dropdownOpen && (
                  <div className={ra.dropdown}>
                    {PROVIDERS.map(p => (
                      <div
                        key={p.id}
                        className={`${ra.dropdownItem} ${p.id === ddns.provider ? ra.dropdownItemActive : ''}`}
                        onClick={() => {
                          const newProvider = PROVIDERS.find(pr => pr.id === p.id);
                          setDdns(prev => ({ ...prev, provider: p.id, domain: '', token: '', username: '' }));
                          // If switching to a provider without DNS challenge and method is 'dns', fall back
                          if (!newProvider?.supportsDnsChallenge && ssl.method === 'dns') {
                            setSsl(prev => ({ ...prev, method: 'standalone' }));
                          }
                          setDropdownOpen(false);
                        }}
                      >
                        <span>{p.name}</span>
                        {p.supportsDnsChallenge && <span className={ra.dnsBadge}>DNS challenge</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Domain + interval */}
            <div className={ra.fieldRow}>
              <div className={ra.fieldGroup} style={{ flex: 2 }}>
                <label className={styles.fieldLabel}>Domain</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <input
                    className={`${styles.fieldInput} ${styles.mono}`}
                    placeholder={provider.domainSuffix ? 'mynas' : 'mynas.example.com'}
                    value={ddns.domain}
                    onChange={e => setDdns(p => ({ ...p, domain: e.target.value }))}
                    style={provider.domainSuffix ? { borderRight: 'none', borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}}
                  />
                  {provider.domainSuffix && (
                    <span className={ra.domainSuffix}>{provider.domainSuffix}</span>
                  )}
                </div>
              </div>
              <div className={ra.fieldGroup} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>Interval</label>
                <select className={styles.fieldSelect} value={ddns.interval} onChange={e => setDdns(p => ({ ...p, interval: parseInt(e.target.value) }))}>
                  {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
            </div>

            {/* Username (some providers) */}
            {provider.needsUsername && (
              <div className={ra.fieldGroup}>
                <label className={styles.fieldLabel}>Username</label>
                <input className={`${styles.fieldInput} ${styles.fieldInputFull}`} value={ddns.username}
                  onChange={e => setDdns(p => ({ ...p, username: e.target.value }))} />
              </div>
            )}

            {/* Token */}
            <div className={ra.fieldGroup}>
              <label className={styles.fieldLabel}>{provider.tokenLabel || 'Token'}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className={`${styles.fieldInput} ${styles.fieldInputFull} ${styles.mono}`}
                  type={showToken ? 'text' : 'password'}
                  value={ddns.token}
                  onChange={e => setDdns(p => ({ ...p, token: e.target.value }))}
                  placeholder={`Your ${provider.name} token`}
                />
                <button className={styles.btnSecondary} onClick={() => setShowToken(!showToken)}
                  style={{ padding: '6px 10px', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Enable toggle */}
            <div className={ra.fieldGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Toggle on={ddns.enabled} onChange={() => setDdns(p => ({ ...p, enabled: !p.enabled }))} />
              <span className={ra.toggleLabel}>Enable automatic DDNS updates</span>
            </div>

            {/* Actions */}
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={handleSaveDdns} disabled={saving || !ddns.domain || !ddns.token}>
                {saving ? 'Saving…' : 'Save DDNS'}
              </button>
              <button className={styles.btnSecondary} onClick={handleTestDdns} disabled={testing || !ddns.domain || !ddns.token}>
                {testing ? 'Testing…' : 'Test Now'}
              </button>
            </div>

            {testResult && (
              <div className={`${ra.resultBox} ${testResult.ok ? ra.resultOk : ra.resultErr}`}>
                <pre>{testResult.ok ? `✅ ${testResult.response || 'DDNS update successful'}` : `❌ ${testResult.error || 'Failed'}`}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════ */}
      {/* ─── STEP 2: SSL Certificate ─── */}
      {/* ═══════════════════════════════════ */}
      <div className={`${ra.stepCard} ${activeStep === 2 ? ra.stepCardActive : ''}`}>
        <div className={ra.stepHeader} onClick={() => setActiveStep(activeStep === 2 ? 0 : 2)}>
          <StepBadge num={2} done={sslOk} active={activeStep === 2} />
          <div className={ra.stepTitle}>
            <div>SSL Certificate</div>
            <div className={ra.stepSub}>Free Let's Encrypt certificate{provider.supportsDnsChallenge ? ' via DNS challenge' : ''}</div>
          </div>
          <div className={ra.stepStatus}>
            {sslOk && <span className={`${styles.badge} ${styles.badgeGood}`}>Valid</span>}
          </div>
          <div className={ra.chevron}>{activeStep === 2 ? '▾' : '▸'}</div>
        </div>

        {activeStep === 2 && (
          <div className={ra.stepBody}>
            {/* DNS challenge highlight */}
            {provider.supportsDnsChallenge && (
              <div className={ra.highlightBox}>
                <InfoIcon size={14} />
                <span>
                  <strong>{provider.name}</strong> supports DNS challenge — the certificate can be issued
                  without opening port 80. NimbusOS uses your API token to create the validation record automatically.
                </span>
              </div>
            )}

            {/* Domain + email */}
            <div className={ra.fieldRow}>
              <div className={ra.fieldGroup} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>Domain</label>
                <input className={`${styles.fieldInput} ${styles.fieldInputFull} ${styles.mono}`}
                  value={fullDomain} readOnly style={{ opacity: 0.7 }} />
                <span className={styles.fieldHint}>From your DDNS config</span>
              </div>
              <div className={ra.fieldGroup} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>Email (Let's Encrypt)</label>
                <input className={`${styles.fieldInput} ${styles.fieldInputFull}`}
                  placeholder="admin@example.com" value={ssl.email}
                  onChange={e => setSsl(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>

            {/* Method cards */}
            <div className={ra.fieldGroup}>
              <label className={styles.fieldLabel}>Verification method</label>
              <div className={ra.methodGrid}>
                {[
                  { id: 'dns', label: 'DNS Challenge', desc: 'Automatic via API — no port 80 needed', icon: '🔑', recommended: provider.supportsDnsChallenge },
                  { id: 'standalone', label: 'Standalone', desc: 'Port 80 must be open to the internet', icon: '🌐' },
                  { id: 'webroot', label: 'Webroot', desc: 'Requires running web server on port 80', icon: '📁' },
                ].map(m => (
                  <div
                    key={m.id}
                    className={`${ra.methodCard} ${ssl.method === m.id ? ra.methodCardActive : ''} ${m.id === 'dns' && !provider.supportsDnsChallenge ? ra.methodCardDisabled : ''}`}
                    onClick={() => {
                      if (m.id === 'dns' && !provider.supportsDnsChallenge) return;
                      setSsl(p => ({ ...p, method: m.id }));
                    }}
                  >
                    <div className={ra.methodIcon}>{m.icon}</div>
                    <div>
                      <div className={ra.methodLabel}>
                        {m.label}
                        {m.recommended && <span className={ra.recommendedBadge}>Recommended</span>}
                      </div>
                      <div className={ra.methodDesc}>{m.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={handleRequestSSL}
                disabled={saving || !fullDomain || !ssl.email}>
                {saving ? 'Requesting…' : '🔒 Request Certificate'}
              </button>
            </div>

            {sslLog && (
              <div className={`${ra.resultBox} ${sslLog.ok ? ra.resultOk : ra.resultErr}`}>
                <pre>{sslLog.ok ? `✅ Certificate obtained!\n\n${sslLog.log || ''}` : `❌ ${sslLog.error}\n\n${sslLog.log || ''}`}</pre>
              </div>
            )}

            {sslOk && status?.ssl && (
              <div className={styles.configCard} style={{ marginTop: 8 }}>
                <div className={styles.configCardTitle}>Current Certificate</div>
                <div className={ra.certInfo}>
                  <div><span className={ra.certLabel}>Domain</span> <span className={styles.mono}>{status.ssl.domain}</span></div>
                  <div><span className={ra.certLabel}>Expires</span> <span className={styles.mono}>{status.ssl.expiry}</span></div>
                  <div><span className={ra.certLabel}>Issuer</span> Let's Encrypt</div>
                  <div><span className={ra.certLabel}>Path</span> <span className={styles.mono}>{status.ssl.certPath || '/etc/letsencrypt/live/…'}</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════ */}
      {/* ─── STEP 3: HTTPS ─── */}
      {/* ═══════════════════════════════════ */}
      <div className={`${ra.stepCard} ${activeStep === 3 ? ra.stepCardActive : ''}`}>
        <div className={ra.stepHeader} onClick={() => setActiveStep(activeStep === 3 ? 0 : 3)}>
          <StepBadge num={3} done={httpsOk} active={activeStep === 3} />
          <div className={ra.stepTitle}>
            <div>HTTPS Server</div>
            <div className={ra.stepSub}>Serve NimbusOS over HTTPS on port {httpsPort}</div>
          </div>
          <div className={ra.stepStatus}>
            {httpsOk && <span className={`${styles.badge} ${styles.badgeGood}`}>Running</span>}
          </div>
          <div className={ra.chevron}>{activeStep === 3 ? '▾' : '▸'}</div>
        </div>

        {activeStep === 3 && (
          <div className={ra.stepBody}>
            {!sslOk && (
              <div className={ra.warnBox}>
                <AlertTriangleIcon size={14} />
                <span>You need a valid SSL certificate (Step 2) before enabling HTTPS.</span>
              </div>
            )}

            <div className={ra.fieldRow}>
              <div className={ra.fieldGroup}>
                <label className={styles.fieldLabel}>HTTPS Port</label>
                <input className={`${styles.fieldInput} ${styles.mono}`} type="number"
                  value={httpsPort} onChange={e => setHttpsPort(parseInt(e.target.value) || 5009)}
                  style={{ width: 120 }} />
                <span className={styles.fieldHint}>Default: 5009. Avoid 443 unless no other HTTPS services run.</span>
              </div>
            </div>

            <div className={ra.fieldGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Toggle on={httpsEnabled} onChange={handleEnableHttps} disabled={!sslOk || saving} />
              <span className={ra.toggleLabel}>Enable HTTPS on port {httpsPort}</span>
            </div>

            {httpsOk && (
              <div className={ra.successBanner} style={{ marginTop: 8 }}>
                <LockIcon size={14} />
                <span>NimbusOS is serving HTTPS at <span className={styles.mono}>https://{fullDomain}:{httpsPort}</span></span>
              </div>
            )}

            <div className={styles.infoBar} style={{ marginTop: 12 }}>
              Make sure port <strong>{httpsPort}</strong> is forwarded on your router (or use UPnP from the Firewall tab).
              If you have a firewall enabled, allow this port in the Firewall section.
            </div>
          </div>
        )}
      </div>

      {/* ─── Connection summary ─── */}
      <div className={styles.configCard} style={{ marginTop: 4 }}>
        <div className={styles.configCardTitle}>Connection Details</div>
        <div className={ra.summaryGrid}>
          <div className={ra.summaryRow}>
            <span className={ra.summaryLabel}>Local</span>
            <span className={`${styles.mono} ${ra.summaryValue}`}>
              http://{status?.localIp || 'unknown'}:{status?.nimbusPort || 5000}
            </span>
          </div>
          {fullDomain && (
            <div className={ra.summaryRow}>
              <span className={ra.summaryLabel}>Remote (HTTP)</span>
              <span className={`${styles.mono} ${ra.summaryValue}`}>
                http://{fullDomain}:{status?.nimbusPort || 5000}
              </span>
            </div>
          )}
          {httpsOk && fullDomain && (
            <div className={ra.summaryRow}>
              <span className={ra.summaryLabel}>Remote (HTTPS)</span>
              <span className={`${styles.mono} ${ra.summaryValue}`} style={{ color: 'var(--accent-green)' }}>
                https://{fullDomain}:{httpsPort}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
