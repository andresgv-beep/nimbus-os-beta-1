import { useState } from 'react';
import { HardDriveIcon, ShieldIcon, ActivityIcon, SearchIcon } from '@icons';
import styles from './StorageManager.module.css';

const SIDEBAR = [
  { id: 'disks', label: 'Disks', icon: HardDriveIcon, section: 'Storage' },
  { id: 'raid', label: 'RAID Arrays', icon: ShieldIcon },
  { id: 'smart', label: 'SMART Health', icon: ActivityIcon },
  { id: 'volumes', label: 'Volumes', icon: HardDriveIcon },
  { id: 'shared', label: 'Shared Folders', icon: HardDriveIcon, section: 'Sharing' },
  { id: 'smb', label: 'SMB / NFS', icon: HardDriveIcon },
  { id: 'scrub', label: 'Scrub', icon: SearchIcon, section: 'Maintenance' },
];

const DISKS = [
  { dev: '/dev/sda', name: 'WD Red Plus 4TB', model: 'WDC WD40EFPX', serial: 'WD-xxxx1234', temp: 37, role: 'RAID 1 member', used: 2.4, total: 3.6, color: 'var(--accent)' },
  { dev: '/dev/sdb', name: 'WD Red Plus 4TB', model: 'WDC WD40EFPX', serial: 'WD-xxxx5678', temp: 36, role: 'RAID 1 member', used: 2.4, total: 3.6, color: 'var(--accent)' },
  { dev: '/dev/sdc', name: 'Samsung 870 EVO 500GB', model: 'Samsung SSD', serial: 'S5xx9012', temp: 31, role: 'Cache drive', used: 0.14, total: 0.465, color: 'var(--accent-green)' },
];

export default function StorageManager() {
  const [activeSection, setActiveSection] = useState('disks');

  return (
    <div className={styles.layout}>
      <div className={styles.sidebar}>
        {SIDEBAR.map(item => (
          <div key={item.id}>
            {item.section && <div className={styles.sectionLabel}>{item.section}</div>}
            <div
              className={`${styles.sidebarItem} ${activeSection === item.id ? styles.active : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span className={styles.sidebarIcon}><item.icon size={16} /></span>
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.main}>
        {/* Overview stats */}
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <div className={styles.statValue} style={{ color: 'var(--accent)' }}>3</div>
            <div className={styles.statLabel}>Physical Disks</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue} style={{ color: 'var(--accent-green)' }}>2.4 TB</div>
            <div className={styles.statLabel}>Used / 3.6 TB</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue} style={{ color: 'var(--accent-blue)' }}>RAID 1</div>
            <div className={styles.statLabel}>Active Array</div>
          </div>
        </div>

        {/* Disks header */}
        <div className={styles.sectionHeader}>
          <h3>Physical Disks</h3>
          <button className={styles.btnPrimary}>+ Create RAID Array</button>
        </div>

        {/* Disk list */}
        {DISKS.map((disk, i) => (
          <div key={i} className={styles.diskItem}>
            <div className={styles.diskIcon} style={{ background: `${disk.color}15`, color: disk.color }}>
              <HardDriveIcon size={22} />
            </div>
            <div className={styles.diskInfo}>
              <div className={styles.diskName}>{disk.dev} — {disk.name}</div>
              <div className={styles.diskDetail}>{disk.model} · Serial: {disk.serial} · {disk.temp}°C · {disk.role}</div>
            </div>
            <div className={styles.diskUsage}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${(disk.used / disk.total) * 100}%`, background: disk.color }} />
              </div>
              <div className={styles.diskUsageText}>{disk.used} TB / {disk.total} TB</div>
            </div>
            <div className={styles.statusBadge}>
              <span className={styles.statusDot} />
              Healthy
            </div>
          </div>
        ))}

        {/* RAID section */}
        <div className={styles.raidCard}>
          <div className={styles.raidHeader}>
            <div>
              <div className={styles.raidTitle}>
                <ShieldIcon size={16} /> md0 — RAID 1 (Mirror)
              </div>
              <div className={styles.raidSub}>ext4 · 3.6 TB usable · Created 2025-12-01</div>
            </div>
            <div className={styles.statusBadge}>
              <span className={styles.statusDot} /> Active — Synced
            </div>
          </div>

          <div className={styles.raidDisks}>
            <div className={`${styles.raidDiskBox} ${styles.raidActive}`}>
              <div className={styles.raidDiskLabel}>Disk 1</div>
              <span>/dev/sda1</span>
              <span className={styles.raidTemp}>37°C</span>
            </div>
            <div className={styles.raidArrow}>⇄</div>
            <div className={`${styles.raidDiskBox} ${styles.raidActive}`}>
              <div className={styles.raidDiskLabel}>Disk 2</div>
              <span>/dev/sdb1</span>
              <span className={styles.raidTemp}>36°C</span>
            </div>
            <div className={`${styles.raidDiskBox} ${styles.raidEmpty}`}>
              <span className={styles.raidTemp}>Empty Slot</span>
              <span>+ Add Disk</span>
            </div>
          </div>

          <div className={styles.raidSync}>
            <span>Sync:</span>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: '100%', background: 'var(--accent-green)' }} />
            </div>
            <span>100% Complete</span>
          </div>

          <div className={styles.raidActions}>
            <button className={styles.btn}>Run SMART Test</button>
            <button className={styles.btn}>Scrub Array</button>
            <button className={styles.btn}>Replace Disk</button>
            <button className={styles.btn}>Details</button>
          </div>
        </div>
      </div>
    </div>
  );
}
