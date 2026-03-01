import { useState, useEffect } from 'react';
import { useAuth } from '@context';
import { WifiIcon, GlobeIcon, ShieldIcon } from '@icons';
import Icon from '@icons';
import SmbPanel from './SmbPanel';
import DnsPanel from './DnsPanel';
import CertsPanel from './CertsPanel';
import WebDavPanel from './WebDavPanel';
import SshPanel from './SshPanel';
import FtpPanel from './FtpPanel';
import NfsPanel from './NfsPanel';
import styles from './Network.module.css';

/* ─── Sidebar config ─── */
const SIDEBAR = [
  { id: 'ifaces', label: 'Interfaces', icon: WifiIcon, section: 'Network' },
  { id: 'dns', label: 'DNS', icon: GlobeIcon },
  { id: 'ports', label: 'Port Exposure', icon: GlobeIcon, section: 'External Access' },
  { id: 'ddns', label: 'DDNS', icon: GlobeIcon },
  { id: 'proxy', label: 'Reverse Proxy', icon: GlobeIcon },
  { id: 'certs', label: 'Certificates', icon: ShieldIcon },
  { id: 'smb', label: 'SMB / CIFS', icon: GlobeIcon, section: 'Services' },
  { id: 'ftp', label: 'FTP / SFTP', icon: GlobeIcon },
  { id: 'ssh', label: 'SSH', icon: ShieldIcon },
  { id: 'nfs', label: 'NFS', icon: GlobeIcon },
  { id: 'webdav', label: 'WebDAV', icon: GlobeIcon },
  { id: 'firewall', label: 'Firewall', icon: ShieldIcon, section: 'Security' },
  { id: 'fail2ban', label: 'Fail2ban', icon: ShieldIcon },
];

/* ─── Reusable Toggle ─── */
function Toggle({ on, onChange }) {
  return (
    <div className={`${styles.toggle} ${on ? styles.toggleOn : ''}`} onClick={onChange}>
      <div className={styles.toggleDot} />
    </div>
  );
}

/* ─── Reusable Service Panel ─── */
function ServicePage({ title, description, enabled, onToggle, port, protocol, fields, shares }) {
  return (
    <div>
      <div className={styles.serviceHeader}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.desc}>{description}</p>
        </div>
        <Toggle on={enabled} onChange={onToggle} />
      </div>

      <div className={styles.serviceGrid}>
        <div className={styles.serviceCard}>
          <div className={styles.serviceCardTitle}>Status</div>
          <div className={`${styles.statusBadge} ${enabled ? styles.statusRunning : styles.statusStopped}`}>
            <span className={styles.statusDot} />
            {enabled ? 'Running' : 'Stopped'}
          </div>
        </div>
        <div className={styles.serviceCard}>
          <div className={styles.serviceCardTitle}>Port</div>
          <div className={styles.serviceValue}>{port}</div>
        </div>
        <div className={styles.serviceCard}>
          <div className={styles.serviceCardTitle}>Protocol</div>
          <div className={styles.serviceValue}>{protocol}</div>
        </div>
      </div>

      {fields && (
        <div className={styles.configCard}>
          <div className={styles.configTitle}>Configuration</div>
          {fields.map((f, i) => (
            <div key={i} className={styles.configRow}>
              <span className={styles.configLabel}>{f.label}</span>
              <span className={styles.configValue}>{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {shares && (
        <div className={styles.configCard}>
          <div className={styles.configTitle}>Shared Folders</div>
          <table className={styles.table}>
            <thead>
              <tr><th>Name</th><th>Path</th><th>Access</th><th>Status</th></tr>
            </thead>
            <tbody>
              {shares.map((s, i) => (
                <tr key={i}>
                  <td className={styles.cellName}>{s.name}</td>
                  <td className={styles.mono}>{s.path}</td>
                  <td>{s.access}</td>
                  <td><span className={`${styles.badge} ${styles.badgeGood}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Port Exposure Page (real data) ─── */
function PortsPage() {
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/firewall/ports').then(r => r.json()).then(data => {
      setPorts(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const exposed = ports.filter(p => p.exposed);
  const internal = ports.filter(p => !p.exposed);

  return (
    <div>
      <h3 className={styles.title}>Listening Ports</h3>
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statValue} style={{ color: 'var(--accent-green)' }}>{internal.length}</div>
          <div className={styles.statLabel}>Internal Only</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue} style={{ color: 'var(--accent-amber)' }}>{exposed.length}</div>
          <div className={styles.statLabel}>Exposed (0.0.0.0)</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{ports.length}</div>
          <div className={styles.statLabel}>Total Ports</div>
        </div>
      </div>
      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Port</th><th>Protocol</th><th>Bind Address</th><th>Process</th><th>Exposure</th></tr>
            </thead>
            <tbody>
              {ports.map((p, i) => (
                <tr key={i}>
                  <td className={styles.mono}>{p.port}</td>
                  <td>{p.protocol.toUpperCase()}</td>
                  <td className={styles.mono}>{p.address}</td>
                  <td className={styles.cellName}>{p.process || '—'}</td>
                  <td>
                    <span className={`${styles.badge} ${p.exposed ? styles.badgeWarn : styles.badgeGood}`}>
                      {p.exposed ? 'Exposed' : 'Internal'}
                    </span>
                  </td>
                </tr>
              ))}
              {ports.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No listening ports detected</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Interfaces Page ─── */
function InterfacesPage() {
  const [ifaces, setIfaces] = useState([]);
  const [net, setNet] = useState({ hostname: '—', gateway: '—', subnet: '—' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/system/info').then(r => r.json()).then(data => {
      const info = data?.network || {};
      setNet({ hostname: info.hostname || '—', gateway: info.gateway || '—', subnet: info.subnet || '—' });
      setIfaces(info.interfaces || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <h3 className={styles.title}>Network Interfaces</h3>
      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Interface</th><th>IP Address</th><th>MAC</th><th>Speed</th><th>Status</th></tr>
            </thead>
            <tbody>
              {ifaces.length > 0 ? ifaces.map((iface, i) => (
                <tr key={i}>
                  <td className={styles.cellName}>{iface.name}</td>
                  <td className={styles.mono}>{iface.ip || '—'}</td>
                  <td className={styles.mono}>{iface.mac || '—'}</td>
                  <td>{iface.speed || '—'}</td>
                  <td><span className={`${styles.badge} ${iface.ip ? styles.badgeGood : ''}`}>{iface.ip ? 'Connected' : 'Down'}</span></td>
                </tr>
              )) : (
                <tr>
                  <td className={styles.cellName}>—</td>
                  <td className={styles.mono}>—</td>
                  <td className={styles.mono}>—</td>
                  <td>—</td>
                  <td><span className={styles.badge}>No interfaces detected</span></td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <div className={styles.configCard}>
        <div className={styles.configTitle}>Network Settings</div>
        <div className={styles.configRow}><span className={styles.configLabel}>Hostname</span><span className={styles.configValue}>{net.hostname}</span></div>
        <div className={styles.configRow}><span className={styles.configLabel}>Gateway</span><span className={styles.configValue}>{net.gateway}</span></div>
        <div className={styles.configRow}><span className={styles.configLabel}>Subnet</span><span className={styles.configValue}>{net.subnet}</span></div>
      </div>
    </div>
  );
}

/* ─── DNS Page ─── */
function DNSPage() {
  return (
    <div>
      <h3 className={styles.title}>DNS Configuration</h3>
      <div className={styles.configCard}>
        <div className={styles.configTitle}>DNS Servers</div>
        <div className={styles.configRow}><span className={styles.configLabel}>Primary</span><span className={styles.configValue}>1.1.1.1 (Cloudflare)</span></div>
        <div className={styles.configRow}><span className={styles.configLabel}>Secondary</span><span className={styles.configValue}>8.8.8.8 (Google)</span></div>
      </div>
    </div>
  );
}

/* ─── DDNS Page ─── */
function DDNSPage() {
  const { token } = useAuth();
  const [config, setConfig] = useState({ enabled: false, provider: '', domain: '', token: '', username: '', interval: 5 });
  const [status, setStatus] = useState({ externalIp: '—', lastLog: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const headers = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  const PROVIDERS = [
    { id: 'duckdns', name: 'DuckDNS', url: 'duckdns.org', domainSuffix: '.duckdns.org', needsUsername: false },
    { id: 'noip', name: 'No-IP', url: 'noip.com', domainSuffix: '', needsUsername: true },
    { id: 'dynu', name: 'Dynu', url: 'dynu.com', domainSuffix: '', needsUsername: true },
    { id: 'cloudflare', name: 'Cloudflare', url: 'cloudflare.com', domainSuffix: '', needsUsername: false, tokenLabel: 'API Token' },
    { id: 'freedns', name: 'FreeDNS (Afraid.org)', url: 'freedns.afraid.org', domainSuffix: '', needsUsername: false },
  ];

  const INTERVALS = [
    { value: 1, label: 'Every 1 minute' }, { value: 5, label: 'Every 5 minutes' },
    { value: 15, label: 'Every 15 minutes' }, { value: 30, label: 'Every 30 minutes' },
    { value: 60, label: 'Every hour' },
  ];

  useEffect(() => {
    fetch('/api/ddns/status', { headers })
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          if (d.config) setConfig(d.config);
          setStatus({ externalIp: d.externalIp || '—', lastLog: d.lastLog || '' });
        }
      }).catch(() => {});
  }, []);

  const selectedProvider = PROVIDERS.find(p => p.id === config.provider);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/ddns/config', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(config) });
    } catch {}
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/ddns/test', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(config) });
      const d = await r.json();
      setTestResult(d);
      // Refresh status
      const sr = await fetch('/api/ddns/status', { headers });
      const sd = await sr.json();
      if (!sd.error) setStatus({ externalIp: sd.externalIp || '—', lastLog: sd.lastLog || '' });
    } catch (e) { setTestResult({ error: e.message }); }
    setTesting(false);
  };

  const selectProvider = (providerId) => {
    setConfig(prev => ({ ...prev, provider: providerId, domain: '', token: '', username: '' }));
    setDropdownOpen(false);
  };

  return (
    <div>
      <div className={styles.serviceHeader}>
        <div>
          <h3 className={styles.title}>Dynamic DNS</h3>
          <p className={styles.desc}>Keep a domain pointing to your external IP</p>
        </div>
        <Toggle on={config.enabled} onChange={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))} />
      </div>
      <div className={styles.serviceGrid}>
        <div className={styles.serviceCard}><div className={styles.serviceCardTitle}>External IP</div><div className={styles.serviceValue} style={{ fontFamily: 'var(--font-mono)' }}>{status.externalIp}</div></div>
        <div className={styles.serviceCard}><div className={styles.serviceCardTitle}>Provider</div><div className={styles.serviceValue}>{selectedProvider?.name || 'Not set'}</div></div>
        <div className={styles.serviceCard}><div className={styles.serviceCardTitle}>Last Update</div><div className={styles.serviceValue} style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>{status.lastLog || 'Never'}</div></div>
      </div>
      <div className={styles.configCard}>
        <div className={styles.configTitle}>Provider</div>
        <div style={{ position: 'relative' }}>
          <div className={styles.input} onClick={() => setDropdownOpen(!dropdownOpen)} style={{ cursor: 'pointer' }}>
            {selectedProvider ? selectedProvider.name : 'Select provider...'}
          </div>
          {dropdownOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', zIndex: 10, marginTop: 4 }}>
              {PROVIDERS.map(p => (
                <div key={p.id} onClick={() => selectProvider(p.id)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>{p.name}</div>
              ))}
            </div>
          )}
        </div>
        {selectedProvider && (
          <>
            <div style={{ marginTop: 12 }}>
              <label className={styles.formLabel}>Domain</label>
              <input className={styles.input} placeholder={`myhost${selectedProvider.domainSuffix}`} value={config.domain}
                onChange={e => setConfig(p => ({ ...p, domain: e.target.value }))} />
            </div>
            {selectedProvider.needsUsername && (
              <div style={{ marginTop: 12 }}>
                <label className={styles.formLabel}>Username</label>
                <input className={styles.input} value={config.username}
                  onChange={e => setConfig(p => ({ ...p, username: e.target.value }))} />
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <label className={styles.formLabel}>{selectedProvider.tokenLabel || 'Token / Password'}</label>
              <input className={styles.input} type={showToken ? 'text' : 'password'} value={config.token}
                onChange={e => setConfig(p => ({ ...p, token: e.target.value }))} />
              <span onClick={() => setShowToken(!showToken)} style={{ cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 8 }}>{showToken ? 'Hide' : 'Show'}</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className={styles.formLabel}>Update interval</label>
              <select className={styles.input} value={config.interval} onChange={e => setConfig(p => ({ ...p, interval: parseInt(e.target.value) }))}>
                {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
          </>
        )}
      </div>
      {testResult && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: testResult.ok ? 'rgba(76,175,80,0.08)' : 'rgba(239,83,80,0.08)', border: `1px solid ${testResult.ok ? 'rgba(76,175,80,0.2)' : 'rgba(239,83,80,0.2)'}`, borderRadius: 'var(--radius)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
          {testResult.ok ? `✅ ${testResult.response}` : `❌ ${testResult.error}`}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className={styles.actionBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        <button className={styles.actionBtnSecondary} onClick={handleTest} disabled={testing || !config.provider || !config.domain || !config.token}>{testing ? 'Testing...' : 'Test Now'}</button>
      </div>
    </div>
  );
}

/* ─── Reverse Proxy Page ─── */
function ProxyPage() {
  return (
    <div>
      <h3 className={styles.title}>Reverse Proxy</h3>
      <p className={styles.desc}>Route external traffic to internal services via domain-based rules</p>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>Domain</th><th>Target</th><th>SSL</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td className={styles.cellName}>nas.example.duckdns.org</td>
              <td className={styles.mono}>{window.location.host}</td>
              <td><span className={`${styles.badge} ${styles.badgeGood}`}>Let's Encrypt</span></td>
              <td><span className={`${styles.badge} ${styles.badgeGood}`}>Active</span></td>
            </tr>
            <tr>
              <td className={styles.cellName}>cloud.example.duckdns.org</td>
              <td className={styles.mono}>{window.location.hostname}:8080</td>
              <td><span className={`${styles.badge} ${styles.badgeGood}`}>Let's Encrypt</span></td>
              <td><span className={`${styles.badge} ${styles.badgeGood}`}>Active</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Certificates Page ─── */
function CertsPage() {
  return (
    <div>
      <h3 className={styles.title}>SSL Certificates</h3>
      <p className={styles.desc}>Manage TLS certificates for encrypted connections</p>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>Domain</th><th>Issuer</th><th>Expires</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td className={styles.cellName}>*.example.duckdns.org</td>
              <td>Let's Encrypt</td>
              <td className={styles.mono}>2026-05-15</td>
              <td><span className={`${styles.badge} ${styles.badgeGood}`}>Valid</span></td>
            </tr>
            <tr>
              <td className={styles.cellName}>NimbusOS (self-signed)</td>
              <td>Self-signed</td>
              <td className={styles.mono}>2027-01-01</td>
              <td><span className={`${styles.badge} ${styles.badgeWarn}`}>Self-signed</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Firewall Page — scan-based service discovery ─── */
function FirewallPage() {
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState('services'); // services | rules | manual | upnp
  const [newRule, setNewRule] = useState({ port: '', protocol: 'tcp', source: '', action: 'allow' });
  const [saving, setSaving] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null); // "port/proto"
  const [upnp, setUpnp] = useState(null);
  const [upnpLoading, setUpnpLoading] = useState(false);
  const [newMapping, setNewMapping] = useState({ externalPort: '', internalPort: '', protocol: 'TCP', description: '' });

  const doScan = () => {
    setScanning(true);
    fetch('/api/firewall/scan').then(r => r.json()).then(data => {
      setScan(data);
      setLoading(false);
      setScanning(false);
    }).catch(() => { setLoading(false); setScanning(false); });
  };

  useEffect(() => { doScan(); }, []);

  const fetchUpnp = () => {
    setUpnpLoading(true);
    fetch('/api/upnp/status').then(r => r.json()).then(data => {
      setUpnp(data);
      setUpnpLoading(false);
    }).catch(() => setUpnpLoading(false));
  };

  const handleUpnpAdd = () => {
    if (!newMapping.externalPort) return;
    setSaving(true);
    fetch('/api/upnp/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMapping),
    }).then(r => r.json()).then(data => {
      setSaving(false);
      if (data.ok) { setNewMapping({ externalPort: '', internalPort: '', protocol: 'TCP', description: '' }); fetchUpnp(); }
    }).catch(() => setSaving(false));
  };

  const handleUpnpRemove = (externalPort, protocol) => {
    if (!confirm(`Remove router mapping ${externalPort}/${protocol}?`)) return;
    setActionInProgress(`upnp:${externalPort}/${protocol}`);
    fetch('/api/upnp/remove', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalPort, protocol }),
    }).then(r => r.json()).then(() => { setActionInProgress(null); fetchUpnp(); })
      .catch(() => setActionInProgress(null));
  };

  // Auto-open port on both firewall + router
  const handleOpenBoth = (port, protocol) => {
    setActionInProgress(`${port}/${protocol}`);
    Promise.all([
      fetch('/api/firewall/add-rule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: String(port), protocol, source: '', action: 'allow' }),
      }),
      fetch('/api/upnp/add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalPort: port, internalPort: port, protocol: protocol.toUpperCase(), description: `NimbusOS:${port}` }),
      }),
    ]).then(() => { setActionInProgress(null); doScan(); fetchUpnp(); })
      .catch(() => setActionInProgress(null));
  };

  const fw = scan?.firewall;

  const handleToggleFirewall = () => {
    fetch('/api/firewall/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable: !fw?.ufwActive }),
    }).then(r => r.json()).then(() => doScan());
  };

  const handleOpenPort = (port, protocol) => {
    setActionInProgress(`${port}/${protocol}`);
    fetch('/api/firewall/add-rule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: String(port), protocol, source: '', action: 'allow' }),
    }).then(r => r.json()).then(() => { setActionInProgress(null); doScan(); })
      .catch(() => setActionInProgress(null));
  };

  const handleClosePort = (port, protocol) => {
    setActionInProgress(`${port}/${protocol}`);
    const rule = (fw?.rules || []).find(r => {
      const rPort = String(r.port);
      return (rPort === String(port)) && ['ALLOW', 'ACCEPT'].includes(r.action);
    });
    if (rule) {
      fetch('/api/firewall/remove-rule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleNum: rule.num }),
      }).then(r => r.json()).then(() => { setActionInProgress(null); doScan(); })
        .catch(() => setActionInProgress(null));
    } else {
      fetch('/api/firewall/add-rule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: String(port), protocol, source: '', action: 'deny' }),
      }).then(r => r.json()).then(() => { setActionInProgress(null); doScan(); })
        .catch(() => setActionInProgress(null));
    }
  };

  const handleAddRule = () => {
    if (!newRule.port) return;
    setSaving(true);
    fetch('/api/firewall/add-rule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRule),
    }).then(r => r.json()).then(data => {
      setSaving(false);
      if (data.ok) { setNewRule({ port: '', protocol: 'tcp', source: '', action: 'allow' }); doScan(); }
    }).catch(() => setSaving(false));
  };

  const handleRemoveRule = (num) => {
    if (!confirm(`Remove rule #${num}?`)) return;
    fetch('/api/firewall/remove-rule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleNum: num }),
    }).then(r => r.json()).then(() => doScan());
  };

  if (loading) {
    return (
      <div>
        <h3 className={styles.title}>Firewall</h3>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Scanning services...</div>
      </div>
    );
  }

  const services = scan?.services || [];
  const allPorts = services.flatMap(s => s.ports);
  const openCount = allPorts.filter(p => p.firewallAllowed).length;
  const blockedCount = allPorts.filter(p => !p.firewallAllowed).length;
  const nimbusPort = window.location.port || '5000';

  return (
    <div>
      {/* Header with toggle */}
      <div className={styles.serviceHeader}>
        <div>
          <h3 className={styles.title}>Firewall</h3>
          <p className={styles.desc}>
            Backend: <span className={styles.mono}>{fw?.backend || 'unknown'}</span>
            {' · '}Default: <span className={styles.mono}>{fw?.defaultPolicy || 'unknown'}</span>
          </p>
        </div>
        <Toggle on={fw?.ufwActive || false} onChange={handleToggleFirewall} />
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{services.length}</div>
          <div className={styles.statLabel}>Services</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue} style={{ color: 'var(--accent-green)' }}>{openCount}</div>
          <div className={styles.statLabel}>Allowed</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue} style={{ color: 'var(--accent-red)' }}>{blockedCount}</div>
          <div className={styles.statLabel}>Blocked</div>
        </div>
        {scan?.dockerContainers > 0 && (
          <div className={styles.stat}>
            <div className={styles.statValue} style={{ color: 'var(--accent)' }}>{scan.dockerContainers}</div>
            <div className={styles.statLabel}>Docker</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.fwTabs}>
        {[
          { id: 'services', label: '🔍 Services' },
          { id: 'rules', label: '📋 Rules' },
          { id: 'upnp', label: '🌐 Router (UPnP)' },
          { id: 'manual', label: '✏️ Add Rule' },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'upnp' && !upnp) fetchUpnp(); }}
            className={`${styles.fwTab} ${tab === t.id ? styles.fwTabActive : ''}`}
          >{t.label}</button>
        ))}
      </div>

      {/* ─── TAB: Services Scan ─── */}
      {tab === 'services' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className={styles.actionBtn} onClick={doScan} disabled={scanning}>
              {scanning ? '⟳ Scanning...' : '🔍 Rescan'}
            </button>
          </div>

          <div className={styles.serviceList}>
            {services.map((svc, si) => (
              <div key={si} className={styles.serviceRow}>
                <div className={styles.serviceRowHeader}>
                  <div className={`${styles.svcIcon} ${svc.isDocker ? styles.svcIconDocker : ''}`}>
                    {svc.isDocker ? '🐳' : '⚙️'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.svcName}>{svc.name}</div>
                    <div className={styles.svcMeta}>
                      {svc.isDocker && svc.containerImage ? svc.containerImage : svc.process || 'system'}
                    </div>
                  </div>
                  {/* Single-port inline action */}
                  {svc.ports.length === 1 && (() => {
                    const p = svc.ports[0];
                    const isCritical = [22, parseInt(nimbusPort)].includes(p.port);
                    const inProgress = actionInProgress === `${p.port}/${p.protocol}`;
                    return (
                      <div className={styles.portActions}>
                        <span className={styles.portLabel}>:{p.port}/{p.protocol}</span>
                        {p.firewallAllowed ? (
                          <button className={styles.actionBtnDanger} onClick={() => handleClosePort(p.port, p.protocol)}
                            disabled={inProgress || isCritical}
                            title={isCritical ? 'Critical port — protected' : 'Block this port'}>
                            {inProgress ? '...' : isCritical ? '🔒' : 'Close'}
                          </button>
                        ) : (
                          <>
                            <button className={styles.actionBtnOpen} onClick={() => handleOpenPort(p.port, p.protocol)}
                              disabled={inProgress}>
                              {inProgress ? '...' : 'Open'}
                            </button>
                            <button className={styles.actionBtnUpnp} onClick={() => handleOpenBoth(p.port, p.protocol)}
                              disabled={inProgress} title="Open firewall + forward on router">
                              {inProgress ? '...' : '🌐+Open'}
                            </button>
                          </>
                        )}
                        <span className={`${styles.badge} ${p.firewallAllowed ? styles.badgeGood : styles.badgeDanger}`}>
                          {p.firewallAllowed ? 'Allowed' : 'Blocked'}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Multi-port sub-rows */}
                {svc.ports.length > 1 && (
                  <div className={styles.portSubList}>
                    {svc.ports.map((p, pi) => {
                      const isCritical = [22, parseInt(nimbusPort)].includes(p.port);
                      const inProgress = actionInProgress === `${p.port}/${p.protocol}`;
                      return (
                        <div key={pi} className={styles.portSubRow}>
                          <span className={styles.portLabel}>:{p.port}/{p.protocol}</span>
                          <span className={styles.portAddr}>{p.address}</span>
                          {p.firewallAllowed ? (
                            <button className={styles.actionBtnDanger} onClick={() => handleClosePort(p.port, p.protocol)}
                              disabled={inProgress || isCritical}>
                              {inProgress ? '...' : isCritical ? '🔒' : 'Close'}
                            </button>
                          ) : (
                            <>
                              <button className={styles.actionBtnOpen} onClick={() => handleOpenPort(p.port, p.protocol)}
                                disabled={inProgress}>
                                {inProgress ? '...' : 'Open'}
                              </button>
                              <button className={styles.actionBtnUpnp} onClick={() => handleOpenBoth(p.port, p.protocol)}
                                disabled={inProgress} title="Open firewall + forward on router">
                                🌐
                              </button>
                            </>
                          )}
                          <span className={`${styles.badge} ${p.firewallAllowed ? styles.badgeGood : styles.badgeDanger}`}>
                            {p.firewallAllowed ? 'Allowed' : 'Blocked'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {services.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                No listening services detected.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: Rules ─── */}
      {tab === 'rules' && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr><th>#</th><th>Port</th><th>Protocol</th><th>Source</th><th>Action</th><th></th></tr>
            </thead>
            <tbody>
              {(fw?.rules || []).map((r, i) => (
                <tr key={i}>
                  <td className={styles.mono}>{r.num}</td>
                  <td className={styles.mono}>{r.port}</td>
                  <td>{(r.protocol || 'any').toUpperCase()}</td>
                  <td className={styles.mono}>{r.source || 'Anywhere'}</td>
                  <td>
                    <span className={`${styles.badge} ${
                      r.action === 'ALLOW' || r.action === 'ACCEPT' ? styles.badgeGood
                      : r.action === 'LIMIT' ? styles.badgeWarn : styles.badgeDanger
                    }`}>{r.action}</span>
                  </td>
                  <td style={{ width: 40 }}>
                    <button className={styles.deleteBtn} onClick={() => handleRemoveRule(r.num)} title="Remove">✕</button>
                  </td>
                </tr>
              ))}
              {(fw?.rules || []).length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                  {fw?.ufwActive ? 'No rules configured' : 'Firewall disabled — enable to manage rules.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── TAB: Router (UPnP) ─── */}
      {tab === 'upnp' && (
        <div>
          {upnpLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Discovering UPnP gateway...</div>
          ) : !upnp ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <button className={styles.actionBtn} onClick={fetchUpnp}>🔍 Discover Router</button>
            </div>
          ) : (
            <>
              {/* Gateway status */}
              <div className={styles.serviceGrid}>
                <div className={styles.serviceCard}>
                  <div className={styles.serviceCardTitle}>UPnP</div>
                  <div className={`${styles.statusBadge} ${upnp.available ? styles.statusRunning : styles.statusStopped}`}>
                    <span className={styles.statusDot} />
                    {upnp.available ? 'Available' : 'Not found'}
                  </div>
                </div>
                <div className={styles.serviceCard}>
                  <div className={styles.serviceCardTitle}>External IP</div>
                  <div className={styles.serviceValue}>{upnp.externalIp || '—'}</div>
                </div>
                <div className={styles.serviceCard}>
                  <div className={styles.serviceCardTitle}>Local IP</div>
                  <div className={styles.serviceValue}>{upnp.localIp || '—'}</div>
                </div>
                <div className={styles.serviceCard}>
                  <div className={styles.serviceCardTitle}>Mappings</div>
                  <div className={styles.serviceValue}>{(upnp.mappings || []).length}</div>
                </div>
              </div>

              {!upnp.available && (
                <div className={styles.configCard}>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    ⚠️ UPnP no disponible. Posibles causas: UPnP desactivado en el router, el router no soporta UPnP/IGD, 
                    o hay un firewall bloqueando SSDP (puerto 1900/UDP). Activa UPnP en la configuración de tu router.
                  </div>
                </div>
              )}

              {upnp.available && (
                <>
                  {/* Add mapping form */}
                  <div className={styles.configCard} style={{ marginBottom: 12 }}>
                    <div className={styles.configTitle}>Forward Port Through Router</div>
                    <div className={styles.ruleForm}>
                      <div>
                        <label className={styles.formLabel}>External Port</label>
                        <input className={styles.input} placeholder="8080" value={newMapping.externalPort}
                          onChange={e => setNewMapping(p => ({ ...p, externalPort: e.target.value }))} />
                      </div>
                      <div>
                        <label className={styles.formLabel}>Internal Port</label>
                        <input className={styles.input} placeholder="Same" value={newMapping.internalPort}
                          onChange={e => setNewMapping(p => ({ ...p, internalPort: e.target.value }))} />
                      </div>
                      <div>
                        <label className={styles.formLabel}>Protocol</label>
                        <select className={styles.input} value={newMapping.protocol} onChange={e => setNewMapping(p => ({ ...p, protocol: e.target.value }))}>
                          <option value="TCP">TCP</option><option value="UDP">UDP</option>
                        </select>
                      </div>
                      <div>
                        <label className={styles.formLabel}>Description</label>
                        <input className={styles.input} placeholder="My Service" value={newMapping.description}
                          onChange={e => setNewMapping(p => ({ ...p, description: e.target.value }))} />
                      </div>
                      <button className={styles.actionBtn} onClick={handleUpnpAdd} disabled={saving} style={{ height: 34, alignSelf: 'end' }}>
                        {saving ? '...' : 'Forward'}
                      </button>
                    </div>
                  </div>

                  {/* Existing mappings table */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button className={styles.actionBtnSecondary} onClick={fetchUpnp}>↻ Refresh</button>
                  </div>
                  <div className={styles.tableCard}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Ext. Port</th><th>→</th><th>Internal</th><th>Protocol</th><th>Description</th><th>Status</th><th></th></tr>
                      </thead>
                      <tbody>
                        {(upnp.mappings || []).map((m, i) => (
                          <tr key={i}>
                            <td className={styles.mono}>{m.externalPort}</td>
                            <td style={{ color: 'var(--text-muted)' }}>→</td>
                            <td className={styles.mono}>{m.internalClient}:{m.internalPort}</td>
                            <td>{m.protocol}</td>
                            <td className={styles.cellName}>{m.description || '—'}</td>
                            <td>
                              <span className={`${styles.badge} ${m.enabled ? styles.badgeGood : styles.badgeDanger}`}>
                                {m.enabled ? 'Active' : 'Disabled'}
                              </span>
                            </td>
                            <td style={{ width: 40 }}>
                              <button className={styles.deleteBtn}
                                onClick={() => handleUpnpRemove(m.externalPort, m.protocol)}
                                disabled={actionInProgress === `upnp:${m.externalPort}/${m.protocol}`}
                                title="Remove mapping">✕</button>
                            </td>
                          </tr>
                        ))}
                        {(upnp.mappings || []).length === 0 && (
                          <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                            No port forwarding rules on router
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── TAB: Manual ─── */}
      {tab === 'manual' && (
        <div className={styles.configCard}>
          <div className={styles.configTitle}>Add Custom Rule</div>
          <div className={styles.ruleForm}>
            <div>
              <label className={styles.formLabel}>Port</label>
              <input className={styles.input} placeholder="80 or 8000-8100" value={newRule.port}
                onChange={e => setNewRule(p => ({ ...p, port: e.target.value }))} />
            </div>
            <div>
              <label className={styles.formLabel}>Protocol</label>
              <select className={styles.input} value={newRule.protocol} onChange={e => setNewRule(p => ({ ...p, protocol: e.target.value }))}>
                <option value="tcp">TCP</option><option value="udp">UDP</option><option value="both">Both</option>
              </select>
            </div>
            <div>
              <label className={styles.formLabel}>Source</label>
              <input className={styles.input} placeholder="Any or 192.168.1.0/24" value={newRule.source}
                onChange={e => setNewRule(p => ({ ...p, source: e.target.value }))} />
            </div>
            <div>
              <label className={styles.formLabel}>Action</label>
              <select className={styles.input} value={newRule.action} onChange={e => setNewRule(p => ({ ...p, action: e.target.value }))}>
                <option value="allow">Allow</option><option value="deny">Deny</option><option value="limit">Limit</option>
              </select>
            </div>
            <button className={styles.actionBtn} onClick={handleAddRule} disabled={saving} style={{ height: 34, alignSelf: 'end' }}>
              {saving ? '...' : 'Add Rule'}
            </button>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className={styles.configCard} style={{ marginTop: 16 }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          ⚠️ Ports 22 (SSH) and {nimbusPort} (NimbusOS) are protected. "Limit" = max 6 conn/30s (recommended for SSH).
        </div>
      </div>
    </div>
  );
}

/* ─── Fail2ban Page ─── */
function Fail2banPage() {
  return (
    <div>
      <h3 className={styles.title}>Fail2ban</h3>
      <div className={styles.serviceGrid}>
        <div className={styles.serviceCard}>
          <div className={styles.serviceCardTitle}>Status</div>
          <div className={`${styles.statusBadge} ${styles.statusRunning}`}><span className={styles.statusDot} /> Active</div>
        </div>
        <div className={styles.serviceCard}>
          <div className={styles.serviceCardTitle}>Banned IPs</div>
          <div className={styles.serviceValue}>3</div>
        </div>
        <div className={styles.serviceCard}>
          <div className={styles.serviceCardTitle}>Total bans (30d)</div>
          <div className={styles.serviceValue}>47</div>
        </div>
      </div>
      <div className={styles.configCard}>
        <div className={styles.configTitle}>Jails</div>
        <div className={styles.configRow}><span className={styles.configLabel}>sshd</span><span className={`${styles.badge} ${styles.badgeGood}`}>Active · 2 bans</span></div>
        <div className={styles.configRow}><span className={styles.configLabel}>nginx-http-auth</span><span className={`${styles.badge} ${styles.badgeGood}`}>Active · 1 ban</span></div>
        <div className={styles.configRow}><span className={styles.configLabel}>nextcloud</span><span className={`${styles.badge} ${styles.badgeGood}`}>Active · 0 bans</span></div>
      </div>
    </div>
  );
}

/* ─── Main Network Component ─── */
export default function Network() {
  const { token } = useAuth();
  const [active, setActive] = useState('ports');
  const [services, setServices] = useState({
    smb: false, ftp: false, ssh: false, nfs: false, webdav: false,
  });

  // Fetch real service status on mount
  useEffect(() => {
    const headers = { 'Authorization': `Bearer ${token}` };
    const checks = [
      { key: 'smb', url: '/api/smb/status' },
      { key: 'ssh', url: '/api/ssh/status' },
      { key: 'ftp', url: '/api/ftp/status' },
      { key: 'nfs', url: '/api/nfs/status' },
      { key: 'webdav', url: '/api/webdav/status' },
    ];
    checks.forEach(({ key, url }) => {
      fetch(url, { headers })
        .then(r => r.json())
        .then(d => {
          if (!d.error) {
            setServices(prev => ({ ...prev, [key]: !!d.running }));
          }
        })
        .catch(() => {});
    });
  }, [token]);

  // Re-check status when switching tabs (so dots update after toggle)
  useEffect(() => {
    const headers = { 'Authorization': `Bearer ${token}` };
    const map = { smb: '/api/smb/status', ssh: '/api/ssh/status', ftp: '/api/ftp/status', nfs: '/api/nfs/status', webdav: '/api/webdav/status' };
    if (map[active]) {
      const timer = setTimeout(() => {
        fetch(map[active], { headers })
          .then(r => r.json())
          .then(d => {
            if (!d.error) setServices(prev => ({ ...prev, [active]: !!d.running }));
          })
          .catch(() => {});
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [active, token]);

  const renderPage = () => {
    switch (active) {
      case 'ifaces': return <InterfacesPage />;
      case 'dns': return <DnsPanel />;
      case 'ports': return <PortsPage />;
      case 'ddns': return <DDNSPage />;
      case 'proxy': return <ProxyPage />;
      case 'certs': return <CertsPanel />;
      case 'firewall': return <FirewallPage />;
      case 'fail2ban': return <Fail2banPage />;
      case 'smb': return <SmbPanel />;
      case 'ftp': return <FtpPanel />;
      case 'ssh': return <SshPanel />;
      case 'nfs': return <NfsPanel />;
      case 'webdav': return <WebDavPanel />;
      default: return null;
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.sidebar}>
        {SIDEBAR.map(item => (
          <div key={item.id}>
            {item.section && <div className={styles.sectionLabel}>{item.section}</div>}
            <div
              className={`${styles.sidebarItem} ${active === item.id ? styles.active : ''}`}
              onClick={() => setActive(item.id)}
            >
              <span className={styles.sidebarIcon}><item.icon size={16} /></span>
              {item.label}
              {['smb', 'ftp', 'ssh', 'nfs', 'webdav'].includes(item.id) && (
                <span className={`${styles.sidebarDot} ${services[item.id] ? styles.dotOn : styles.dotOff}`} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.main}>{renderPage()}</div>
    </div>
  );
}
