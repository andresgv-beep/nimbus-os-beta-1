import { useState, useEffect } from 'react';
import { ServiceIcon } from '@icons/services/index.jsx';
import { InfoIcon } from '@icons';
import { useAuth } from '@context';
import styles from './ServicePanel.module.css';

function Toggle({ on, onChange }) {
  return (
    <div className={`${styles.toggle} ${on ? styles.toggleOn : ''}`} onClick={onChange}>
      <div className={styles.toggleDot} />
    </div>
  );
}

export default function SshPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);

  const headers = { 'Authorization': `Bearer ${token}` };

  const fetchStatus = () => {
    fetch('/api/ssh/status', { headers })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchStatus(); }, []);

  const doAction = async (action) => {
    setActionPending(true);
    try {
      await fetch(`/api/ssh/${action}`, { method: 'POST', headers });
      setTimeout(() => { fetchStatus(); setActionPending(false); }, 1500);
    } catch { setActionPending(false); }
  };

  if (loading) {
    return <div className={styles.loadingWrap}><div className={styles.spinner} /><span>Loading SSH status…</span></div>;
  }

  const cfg = data?.config || {};
  const isRunning = data?.running;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.svcIcon}><ServiceIcon id="ssh" size={22} /></div>
          <div>
            <h3 className={styles.title}>SSH</h3>
            <p className={styles.desc}>Secure shell access to the server via terminal</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <Toggle on={isRunning} onChange={() => doAction(isRunning ? 'stop' : 'start')} />
        </div>
      </div>

      <div className={`${styles.statsGrid} ${styles.statsGrid3}`}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Status</div>
          <div className={`${styles.statusBadge} ${isRunning ? styles.statusOn : styles.statusOff}`}>
            <span className={styles.statusDot} />
            {actionPending ? 'Changing…' : isRunning ? 'Running' : 'Stopped'}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Port</div>
          <div className={styles.statValue}>{cfg.port || '22'}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Sessions</div>
          <div className={styles.statValue}>{data?.activeSessions ?? '—'}</div>
        </div>
      </div>

      {data?.version && (
        <div className={styles.versionBar}>
          <span className={styles.mono}>{data.version}</span>
        </div>
      )}

      <div className={styles.configCard}>
        <div className={styles.configCardTitle}>Configuration</div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Port</span>
          <span className={styles.mono}>{cfg.port || '22'}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Root login</span>
          <span className={`${styles.badge} ${cfg.rootLogin === 'yes' ? styles.badgeWarn : styles.badgeGood}`}>
            {cfg.rootLogin === 'yes' ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Password authentication</span>
          <span className={`${styles.badge} ${styles.badgeGood}`}>
            {cfg.passwordAuth === 'no' ? 'Disabled' : 'Enabled'}
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Public key authentication</span>
          <span className={`${styles.badge} ${styles.badgeGood}`}>
            {cfg.pubkeyAuth === 'no' ? 'Disabled' : 'Enabled'}
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Max auth tries</span>
          <span className={styles.mono}>{cfg.maxAuthTries || '6'}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>X11 forwarding</span>
          <span>{cfg.x11Forwarding === 'yes' ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>

      {(data?.connectedUsers || []).length > 0 && (
        <div className={styles.configCard} style={{ marginTop: 12 }}>
          <div className={styles.configCardTitle}>Connected Users</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>User</th><th>From</th><th>TTY</th><th>Login</th></tr></thead>
              <tbody>
                {data.connectedUsers.map((u, i) => (
                  <tr key={i}>
                    <td className={styles.cellBold}>{u.user}</td>
                    <td className={styles.mono}>{u.from}</td>
                    <td className={styles.mono}>{u.tty}</td>
                    <td>{u.login}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={styles.infoBar}>
        To edit SSH configuration, modify <span className={styles.mono}>/etc/ssh/sshd_config</span> and restart the service.
      </div>
    </div>
  );
}
