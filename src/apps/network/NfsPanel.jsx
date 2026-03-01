import { useState, useEffect } from 'react';
import { ServiceIcon } from '@icons/services/index.jsx';
import { FolderOutlineIcon, PackageIcon, InfoIcon } from '@icons';
import { useAuth } from '@context';
import styles from './ServicePanel.module.css';

function Toggle({ on, onChange, disabled }) {
  return (
    <div className={`${styles.toggle} ${on ? styles.toggleOn : ''} ${disabled ? styles.toggleDisabled : ''}`}
      onClick={disabled ? undefined : onChange}>
      <div className={styles.toggleDot} />
    </div>
  );
}

export default function NfsPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);

  const headers = { 'Authorization': `Bearer ${token}` };

  const fetchStatus = () => {
    fetch('/api/nfs/status', { headers })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchStatus(); }, []);

  const doAction = async (action) => {
    setActionPending(true);
    try {
      await fetch(`/api/nfs/${action}`, { method: 'POST', headers });
      setTimeout(() => { fetchStatus(); setActionPending(false); }, 1500);
    } catch { setActionPending(false); }
  };

  if (loading) {
    return <div className={styles.loadingWrap}><div className={styles.spinner} /><span>Loading NFS status…</span></div>;
  }

  const isInstalled = data?.installed;
  const isRunning = data?.running;
  const exports = data?.exports || [];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.svcIcon}><ServiceIcon id="nfs" size={22} /></div>
          <div>
            <h3 className={styles.title}>NFS</h3>
            <p className={styles.desc}>Network File System for Linux/Unix clients</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {isInstalled && (
            <Toggle on={isRunning} onChange={() => doAction(isRunning ? 'stop' : 'start')} />
          )}
        </div>
      </div>

      {!isInstalled && (
        <div className={styles.notInstalled}>
          <div className={styles.notInstalledIcon}><PackageIcon size={40} /></div>
          <div className={styles.notInstalledTitle}>NFS server not installed</div>
          <p className={styles.notInstalledDesc}>
            Install nfs-kernel-server to share directories with Linux/Unix clients.
          </p>
          <code className={styles.installCmd}>sudo apt install -y nfs-kernel-server</code>
        </div>
      )}

      {isInstalled && (
        <>
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
              <div className={styles.statValue}>2049</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Exports</div>
              <div className={styles.statValue}>{exports.length}</div>
            </div>
          </div>

          {data?.version && (
            <div className={styles.versionBar}><span className={styles.mono}>{data.version}</span></div>
          )}

          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>Exported Directories</div>
            {exports.length === 0 ? (
              <div className={styles.emptyState} style={{ padding: 20 }}>
                <div className={styles.emptyTitle}>No exports configured</div>
                <p className={styles.emptyDesc}>
                  Add exports to <span className={styles.mono}>/etc/exports</span> and run <span className={styles.mono}>sudo exportfs -ra</span>
                </p>
              </div>
            ) : (
              <div className={styles.itemList}>
                {exports.map((exp, i) => (
                  <div key={i} className={styles.itemRow}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemIcon}><FolderOutlineIcon size={20} /></div>
                      <div className={styles.itemInfo}>
                        <div className={styles.itemName}>{exp.path}</div>
                        <div className={styles.itemSub}>{exp.clients}</div>
                      </div>
                    </div>
                    <div className={styles.itemMeta}>
                      <span className={`${styles.badge} ${styles.badgeGood}`}>Exported</span>
                      <span className={`${styles.badge} ${styles.badgeInfo}`}>{exp.options}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active NFS clients */}
          {(data?.activeClients || []).length > 0 && (
            <div className={styles.configCard} style={{ marginTop: 12 }}>
              <div className={styles.configCardTitle}>Connected Clients</div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Client</th><th>Export</th></tr></thead>
                  <tbody>
                    {data.activeClients.map((c, i) => (
                      <tr key={i}>
                        <td className={`${styles.cellBold} ${styles.mono}`}>{c.client}</td>
                        <td className={styles.mono}>{c.export}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={styles.infoBar}>
            To add exports, edit <span className={styles.mono}>/etc/exports</span> and apply with{' '}
            <span className={styles.mono}>sudo exportfs -ra</span>. NFS clients connect using{' '}
            <span className={styles.mono}>mount -t nfs server:/path /mnt</span>
          </div>
        </>
      )}
    </div>
  );
}
