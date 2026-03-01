import { useState, useEffect } from 'react';
import { useAuth } from '@context';
import styles from './ControlPanel.module.css';

export default function PortalPage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [httpPort, setHttpPort] = useState('');
  const [httpsPort, setHttpsPort] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [dirty, setDirty] = useState(false);

  const headers = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch('/api/portal/status', { headers })
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setData(d);
          setHttpPort(String(d.httpPort || 5000));
          setHttpsPort(String(d.httpsPort || 5001));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      const r = await fetch('/api/portal/config', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ httpPort: parseInt(httpPort), httpsPort: parseInt(httpsPort) }),
      });
      const d = await r.json();
      setResult(d);
      setDirty(false);
    } catch (e) {
      setResult({ error: e.message });
    }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;

  const currentPort = data?.httpPort || 5000;

  return (
    <div>
      <h3 className={styles.title}>Web Portal</h3>
      <p className={styles.desc} style={{ marginBottom: 16 }}>
        Configure the ports used to access NimbusOS web interface.
        Changes require a service restart to take effect.
      </p>

      <div className={styles.tableCard} style={{ padding: 20 }}>
        <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 12 }}>
          Current Access
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, padding: '12px 16px', background: 'rgba(74,144,164,0.06)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>HTTP</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 600 }}>
              :{currentPort}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              http://{window.location.hostname}:{currentPort}
            </div>
          </div>
          <div style={{ flex: 1, padding: '12px 16px', background: 'rgba(76,175,80,0.06)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>HTTPS</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 600 }}>
              :{data?.httpsPort || 5001}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              {data?.httpsEnabled ? '🟢 Enabled' : '⚪ Not configured'}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          Change Ports
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 4 }}>HTTP Port</label>
            <input
              className={styles.input}
              type="number"
              min="1"
              max="65535"
              value={httpPort}
              onChange={e => { setHttpPort(e.target.value); setDirty(true); }}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Default: 5000</div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 4 }}>HTTPS Port</label>
            <input
              className={styles.input}
              type="number"
              min="1"
              max="65535"
              value={httpsPort}
              onChange={e => { setHttpsPort(e.target.value); setDirty(true); }}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Default: 5001</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          {dirty && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-amber)', background: 'rgba(255,167,38,0.08)', padding: '3px 10px', borderRadius: 'var(--radius-full)' }}>
              Unsaved changes
            </span>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button className={styles.actionBtn} onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save Ports'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div style={{
          marginTop: 12, padding: '12px 16px', borderRadius: 'var(--radius)',
          background: result.ok ? 'rgba(76,175,80,0.06)' : 'rgba(239,83,80,0.06)',
          border: `1px solid ${result.ok ? 'rgba(76,175,80,0.15)' : 'rgba(239,83,80,0.15)'}`,
          fontSize: 'var(--text-sm)',
        }}>
          {result.ok ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>✅ Port configuration saved</div>
              <div style={{ color: 'var(--text-muted)' }}>{result.message}</div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--accent-amber)' }}>
                sudo systemctl restart nimbusos
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--accent-red)' }}>❌ {result.error}</div>
          )}
        </div>
      )}

      <div style={{
        marginTop: 16, padding: '12px 16px', fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)', background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)', lineHeight: 1.5,
      }}>
        💡 After changing ports, NimbusOS needs to be restarted. You will need to reconnect
        using the new port. Common ports: 80 (HTTP standard), 443 (HTTPS standard), 8080, 8443.
        Avoid ports already in use by other services.
      </div>
    </div>
  );
}
