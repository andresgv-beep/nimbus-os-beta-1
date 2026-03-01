import { useState, useEffect } from 'react';
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

export default function FtpPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);

  const headers = { 'Authorization': `Bearer ${token}` };

  const fetchStatus = () => {
    fetch('/api/ftp/status', { headers })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchStatus(); }, []);

  const doAction = async (action) => {
    setActionPending(true);
    try {
      await fetch(`/api/ftp/${action}`, { method: 'POST', headers });
      setTimeout(() => { fetchStatus(); setActionPending(false); }, 1500);
    } catch { setActionPending(false); }
  };

  if (loading) {
    return <div className={styles.loadingWrap}><div className={styles.spinner} /><span>Loading FTP status…</span></div>;
  }

  const isInstalled = data?.installed;
  const isRunning = data?.running;
  const cfg = data?.config || {};
  const sftpAvailable = data?.sftpAvailable;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.svcIcon} style={{ background: 'rgba(255,167,38,0.1)' }}>📤</div>
          <div>
            <h3 className={styles.title}>FTP / SFTP</h3>
            <p className={styles.desc}>Transfer files via FTP (insecure) or SFTP (secure, recommended)</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {isInstalled && (
            <Toggle on={isRunning} onChange={() => doAction(isRunning ? 'stop' : 'start')} />
          )}
        </div>
      </div>

      {!isInstalled && !sftpAvailable && (
        <div className={styles.notInstalled}>
          <div className={styles.notInstalledIcon}>📦</div>
          <div className={styles.notInstalledTitle}>FTP server not installed</div>
          <p className={styles.notInstalledDesc}>
            Install vsftpd for FTP access. SFTP is available automatically if SSH is running.
          </p>
          <code className={styles.installCmd}>sudo apt install -y vsftpd</code>
        </div>
      )}

      {(isInstalled || sftpAvailable) && (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>FTP Status</div>
              <div className={`${styles.statusBadge} ${isRunning ? styles.statusOn : styles.statusOff}`}>
                <span className={styles.statusDot} />
                {actionPending ? 'Changing…' : isRunning ? 'Running' : isInstalled ? 'Stopped' : 'Not installed'}
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>FTP Port</div>
              <div className={styles.statValue}>{cfg.port || (isInstalled ? '21' : '—')}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>SFTP</div>
              <div className={`${styles.statusBadge} ${sftpAvailable ? styles.statusOn : styles.statusOff}`}>
                <span className={styles.statusDot} />
                {sftpAvailable ? 'Available (via SSH)' : 'Unavailable'}
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>SFTP Port</div>
              <div className={styles.statValue}>{sftpAvailable ? '22' : '—'}</div>
            </div>
          </div>

          {data?.version && (
            <div className={styles.versionBar}><span className={styles.mono}>{data.version}</span></div>
          )}

          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>FTP Configuration</div>
            {isInstalled ? (
              <>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Anonymous access</span>
                  <span className={`${styles.badge} ${cfg.anonymousEnable === 'YES' ? styles.badgeWarn : styles.badgeGood}`}>
                    {cfg.anonymousEnable === 'YES' ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Local users</span>
                  <span className={`${styles.badge} ${styles.badgeGood}`}>
                    {cfg.localEnable === 'NO' ? 'Disabled' : 'Enabled'}
                  </span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Write access</span>
                  <span>{cfg.writeEnable === 'YES' ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Chroot users</span>
                  <span>{cfg.chrootLocalUser === 'YES' ? 'Yes (restricted to home)' : 'No'}</span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Passive mode ports</span>
                  <span className={styles.mono}>{cfg.pasvMinPort && cfg.pasvMaxPort ? `${cfg.pasvMinPort}–${cfg.pasvMaxPort}` : 'Default'}</span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>SSL/TLS</span>
                  <span className={`${styles.badge} ${cfg.sslEnable === 'YES' ? styles.badgeGood : styles.badgeWarn}`}>
                    {cfg.sslEnable === 'YES' ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.emptyState} style={{ padding: 20 }}>
                <div className={styles.emptyTitle}>FTP not installed</div>
                <p className={styles.emptyDesc}>SFTP is available through SSH without additional setup.</p>
              </div>
            )}
          </div>

          <div className={styles.infoBar}>
            💡 SFTP is the recommended file transfer protocol — it's encrypted and uses your SSH credentials.
            FTP transmits data unencrypted and should only be used on trusted networks.
          </div>
        </>
      )}
    </div>
  );
}
