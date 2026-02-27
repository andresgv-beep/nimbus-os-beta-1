import { useState } from 'react';
import { ShieldIcon, GlobeIcon, HardDriveIcon } from '@icons';
import Icon from '@icons';
import styles from './VirtualMachines.module.css';

/* ─── Sidebar ─── */
const SIDEBAR = [
  { id: 'overview', label: 'Overview', icon: GlobeIcon, section: 'General' },
  { id: 'vms', label: 'Virtual Machines', icon: ShieldIcon },
  { id: 'storage', label: 'Storage', icon: HardDriveIcon, section: 'Resources' },
  { id: 'network', label: 'Network', icon: GlobeIcon },
  { id: 'images', label: 'Images', icon: HardDriveIcon },
  { id: 'settings', label: 'Settings', icon: ShieldIcon, section: 'System' },
  { id: 'logs', label: 'Logs', icon: ShieldIcon },
];

/* ─── Mock VM Data ─── */
const VMS = [
  { name: 'ubuntu-server', os: 'Linux', status: 'running', cpu: 4, ram: '8 GB', disk: '80 GB', ip: '192.168.1.110', cpuUsage: '12%' },
  { name: 'windows-11', os: 'Windows', status: 'stopped', cpu: 6, ram: '16 GB', disk: '120 GB', ip: '—', cpuUsage: '—' },
  { name: 'debian-dev', os: 'Linux', status: 'running', cpu: 2, ram: '4 GB', disk: '40 GB', ip: '192.168.1.112', cpuUsage: '3%' },
];

/* ─── Wizard Steps ─── */
const WIZARD_STEPS = [
  'Operating System',
  'General',
  'Storage',
  'Network',
  'Other Settings',
  'Summary',
];

const OS_OPTIONS = [
  { id: 'windows', label: 'Microsoft Windows', desc: 'Windows 10, 11, Server 2022. Includes VirtIO drivers for best performance.' },
  { id: 'linux', label: 'Linux', desc: 'Ubuntu, Debian, Fedora, CentOS, Arch and other distributions.' },
  { id: 'other', label: 'Other', desc: 'FreeBSD, custom ISOs, or any other operating system.' },
];

/* ─── Create VM Wizard ─── */
function CreateWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    os: 'linux', name: '', cpus: '4', ram: '4', ramUnit: 'GB',
    disk: '40', diskUnit: 'GB', videoCard: 'virtio',
    networkType: 'bridge', iso: '', autoStart: false,
    firmware: 'UEFI', description: '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const next = () => setStep(s => Math.min(s + 1, WIZARD_STEPS.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  return (
    <div className={styles.wizardOverlay} onClick={onClose}>
      <div className={styles.wizard} onClick={e => e.stopPropagation()}>
        <div className={styles.wizardHeader}>
          <span>Create Virtual Machine</span>
          <button className={styles.wizardClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.wizardStepBar}>
          <div className={styles.wizardStepTitle}>{WIZARD_STEPS[step]}</div>
        </div>

        <div className={styles.wizardBody}>
          {step === 0 && (
            <div className={styles.osSelect}>
              {OS_OPTIONS.map(o => (
                <label key={o.id} className={`${styles.osOption} ${form.os === o.id ? styles.osSelected : ''}`}
                  onClick={() => set('os', o.id)}>
                  <div className={`${styles.radioCircle} ${form.os === o.id ? styles.radioActive : ''}`}>
                    {form.os === o.id && <div className={styles.radioDot} />}
                  </div>
                  <div>
                    <div className={styles.osName}>{o.label}</div>
                    <div className={styles.osDesc}>{o.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className={styles.formGrid}>
              <label className={styles.formLabel}>Name:</label>
              <input className={styles.formInput} value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. ubuntu-server" />

              <label className={styles.formLabel}>CPUs:</label>
              <select className={styles.formSelect} value={form.cpus} onChange={e => set('cpus', e.target.value)}>
                {[1,2,4,6,8,12,16].map(n => <option key={n} value={n}>{n}</option>)}
              </select>

              <label className={styles.formLabel}>Memory:</label>
              <div className={styles.formRow}>
                <select className={styles.formSelect} value={form.ram} onChange={e => set('ram', e.target.value)}>
                  {[1,2,4,8,16,32,64].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select className={styles.formSelectSm} value={form.ramUnit} onChange={e => set('ramUnit', e.target.value)}>
                  <option value="GB">GB</option><option value="MB">MB</option>
                </select>
              </div>

              <label className={styles.formLabel}>Video card:</label>
              <select className={styles.formSelect} value={form.videoCard} onChange={e => set('videoCard', e.target.value)}>
                <option value="virtio">VirtIO-GPU</option><option value="vga">VGA</option><option value="none">None</option>
              </select>

              <label className={styles.formLabel}>Description:</label>
              <textarea className={styles.formTextarea} value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="(optional)" rows={3} />
            </div>
          )}

          {step === 2 && (
            <div className={styles.formGrid}>
              <label className={styles.formLabel}>Virtual disk:</label>
              <div className={styles.formRow}>
                <input className={styles.formInput} style={{ width: 100 }} value={form.disk}
                  onChange={e => set('disk', e.target.value)} />
                <select className={styles.formSelectSm} value={form.diskUnit} onChange={e => set('diskUnit', e.target.value)}>
                  <option value="GB">GB</option><option value="TB">TB</option>
                </select>
              </div>

              <label className={styles.formLabel}>Volume:</label>
              <div className={styles.volumeTable}>
                <div className={styles.volumeHeader}>
                  <span>Host</span><span>Name</span><span>Status</span><span>Free</span><span>RAID</span>
                </div>
                <div className={`${styles.volumeRow} ${styles.volumeSelected}`}>
                  <span>NimbusNAS</span><span>Volume 1</span>
                  <span className={styles.statusGreen}>Healthy</span>
                  <span>3.02 TB</span><span>RAID 1</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.formGrid}>
              <label className={styles.formLabel}>Network:</label>
              <select className={styles.formSelect} value={form.networkType} onChange={e => set('networkType', e.target.value)}>
                <option value="bridge">Bridge (br0)</option>
                <option value="nat">NAT</option>
                <option value="none">No network</option>
              </select>

              <label className={styles.formLabel}>Model:</label>
              <select className={styles.formSelect} value="virtio">
                <option value="virtio">VirtIO</option><option value="e1000">e1000</option>
              </select>
            </div>
          )}

          {step === 4 && (
            <div className={styles.formGrid}>
              <label className={styles.formLabel}>Boot ISO:</label>
              <div className={styles.formRow}>
                <select className={styles.formSelect}><option>Not mounted</option></select>
                <button className={styles.browseBtn}>Browse</button>
              </div>

              <label className={styles.formLabel}>Auto start:</label>
              <select className={styles.formSelect} value={form.autoStart ? 'yes' : 'no'}
                onChange={e => set('autoStart', e.target.value === 'yes')}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>

              <label className={styles.formLabel}>Firmware:</label>
              <select className={styles.formSelect} value={form.firmware} onChange={e => set('firmware', e.target.value)}>
                <option value="UEFI">UEFI (Recommended)</option><option value="BIOS">Legacy BIOS</option>
              </select>

              <label className={styles.formLabel}>Keyboard:</label>
              <select className={styles.formSelect}><option>Default (en-us)</option><option>es</option><option>fr</option></select>
            </div>
          )}

          {step === 5 && (
            <div className={styles.summary}>
              <div className={styles.summaryTitle}>Review your virtual machine</div>
              <div className={styles.summaryGrid}>
                <span className={styles.summaryLabel}>OS</span><span>{OS_OPTIONS.find(o => o.id === form.os)?.label}</span>
                <span className={styles.summaryLabel}>Name</span><span>{form.name || '(unnamed)'}</span>
                <span className={styles.summaryLabel}>CPUs</span><span>{form.cpus} cores</span>
                <span className={styles.summaryLabel}>Memory</span><span>{form.ram} {form.ramUnit}</span>
                <span className={styles.summaryLabel}>Disk</span><span>{form.disk} {form.diskUnit}</span>
                <span className={styles.summaryLabel}>Network</span><span>{form.networkType}</span>
                <span className={styles.summaryLabel}>Firmware</span><span>{form.firmware}</span>
                <span className={styles.summaryLabel}>Auto start</span><span>{form.autoStart ? 'Yes' : 'No'}</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.wizardFooter}>
          <div className={styles.wizardSteps}>
            {WIZARD_STEPS.map((_, i) => (
              <div key={i} className={`${styles.stepDot} ${i === step ? styles.stepActive : i < step ? styles.stepDone : ''}`} />
            ))}
          </div>
          <div className={styles.wizardActions}>
            {step > 0 && <button className={styles.btnSecondary} onClick={prev}>Back</button>}
            {step < WIZARD_STEPS.length - 1
              ? <button className={styles.btnPrimary} onClick={next}>Next</button>
              : <button className={styles.btnPrimary} onClick={onClose}>Create</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Overview Page ─── */
function OverviewPage() {
  const running = VMS.filter(v => v.status === 'running').length;
  const stopped = VMS.filter(v => v.status === 'stopped').length;
  return (
    <div>
      <div className={styles.healthBanner}>
        <div className={styles.healthIcon}>✓</div>
        <div>
          <div className={styles.healthTitle}>Healthy</div>
          <div className={styles.healthDesc}>Your virtualization environment is running correctly.</div>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={`${styles.overviewCard} ${styles.overviewCardActive}`}>
          <div className={styles.overviewCardHeader}><Icon name="activity" size={16} /> Host<span>1</span></div>
          <div className={styles.overviewCardValue} style={{ color: 'var(--accent-green)' }}>1</div>
          <div className={styles.overviewCardLabel}>Healthy</div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardHeader}><Icon name="box" size={16} /> Virtual Machines<span>{VMS.length}</span></div>
          <div className={styles.overviewCardValue} style={{ color: 'var(--accent-green)' }}>{running}</div>
          <div className={styles.overviewCardLabel}>{running} running · {stopped} stopped</div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardHeader}><Icon name="hardDrive" size={16} /> Storage<span>1</span></div>
          <div className={styles.overviewCardValue} style={{ color: 'var(--accent-green)' }}>1</div>
          <div className={styles.overviewCardLabel}>Healthy</div>
        </div>
      </div>

      <div className={styles.hostInfo}>
        <div className={styles.hostRow}>
          <span className={styles.hostIcon}>🖥</span>
          <span className={styles.hostName}>NimbusNAS</span>
          <span className={styles.hostStat}>CPU</span>
          <span className={styles.hostStatVal}>8%</span>
          <div className={styles.miniBar}><div className={styles.miniBarFill} style={{ width: '8%' }} /></div>
          <span className={styles.hostStat}>RAM</span>
          <span className={styles.hostStatVal}>62%</span>
          <div className={styles.miniBar}><div className={styles.miniBarFill} style={{ width: '62%', background: 'var(--accent)' }} /></div>
        </div>
      </div>
    </div>
  );
}

/* ─── VM List Page ─── */
function VMListPage({ onCreateClick }) {
  return (
    <div>
      <div className={styles.pageToolbar}>
        <button className={styles.btnPrimary} onClick={onCreateClick}>+ New VM</button>
        <button className={styles.btnSecondary}>Connect</button>
        <button className={styles.btnSecondary}>Action ▾</button>
        <button className={styles.btnSecondary}>Power ▾</button>
      </div>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr><th>Name</th><th>OS</th><th>Status</th><th>CPU</th><th>RAM</th><th>Disk</th><th>IP</th><th>CPU Usage</th></tr>
          </thead>
          <tbody>
            {VMS.map((vm, i) => (
              <tr key={i}>
                <td className={styles.cellName}>{vm.name}</td>
                <td>{vm.os}</td>
                <td>
                  <span className={`${styles.badge} ${vm.status === 'running' ? styles.badgeGood : styles.badgeStopped}`}>
                    {vm.status === 'running' ? '● Running' : '● Stopped'}
                  </span>
                </td>
                <td>{vm.cpu} cores</td>
                <td>{vm.ram}</td>
                <td>{vm.disk}</td>
                <td className={styles.mono}>{vm.ip}</td>
                <td>{vm.cpuUsage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Storage Page ─── */
function StoragePage() {
  return (
    <div>
      <h3 className={styles.title}>Storage Volumes</h3>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>Volume</th><th>Status</th><th>Total</th><th>Used</th><th>Free</th><th>RAID</th></tr></thead>
          <tbody>
            <tr>
              <td className={styles.cellName}>Volume 1</td>
              <td><span className={`${styles.badge} ${styles.badgeGood}`}>Healthy</span></td>
              <td>3.6 TB</td><td>580 GB</td><td>3.02 TB</td><td>RAID 1</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Network Page ─── */
function NetworkPage() {
  return (
    <div>
      <h3 className={styles.title}>Virtual Networks</h3>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Type</th><th>Interface</th><th>Subnet</th><th>VMs</th></tr></thead>
          <tbody>
            <tr><td className={styles.cellName}>Default</td><td>Bridge</td><td>br0</td><td>192.168.1.0/24</td><td>3</td></tr>
            <tr><td className={styles.cellName}>NAT Internal</td><td>NAT</td><td>virbr0</td><td>192.168.122.0/24</td><td>0</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Images Page ─── */
function ImagesPage() {
  return (
    <div>
      <h3 className={styles.title}>ISO Images</h3>
      <div className={styles.pageToolbar}>
        <button className={styles.btnPrimary}>Upload ISO</button>
      </div>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Size</th><th>Uploaded</th><th>Used by</th></tr></thead>
          <tbody>
            <tr><td className={styles.cellName}>ubuntu-24.04-server.iso</td><td>2.6 GB</td><td>2026-02-10</td><td>ubuntu-server</td></tr>
            <tr><td className={styles.cellName}>Win11_23H2.iso</td><td>5.8 GB</td><td>2026-02-12</td><td>windows-11</td></tr>
            <tr><td className={styles.cellName}>debian-12.4-amd64.iso</td><td>628 MB</td><td>2026-02-14</td><td>debian-dev</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Settings Page ─── */
function SettingsPage() {
  return (
    <div>
      <h3 className={styles.title}>Virtualization Settings</h3>
      <div className={styles.configCard}>
        <div className={styles.configTitle}>General</div>
        <div className={styles.configRow}><span className={styles.configLabel}>Hypervisor</span><span className={styles.configValue}>KVM / QEMU</span></div>
        <div className={styles.configRow}><span className={styles.configLabel}>Virtualization support</span><span className={`${styles.badge} ${styles.badgeGood}`}>Enabled (VT-x)</span></div>
        <div className={styles.configRow}><span className={styles.configLabel}>Max VMs</span><span className={styles.configValue}>16</span></div>
        <div className={styles.configRow}><span className={styles.configLabel}>Default storage</span><span className={styles.configValue}>Volume 1</span></div>
      </div>
      <div className={styles.configCard}>
        <div className={styles.configTitle}>GPU Passthrough</div>
        <div className={styles.configRow}><span className={styles.configLabel}>IOMMU</span><span className={`${styles.badge} ${styles.badgeGood}`}>Enabled</span></div>
        <div className={styles.configRow}><span className={styles.configLabel}>Available GPUs</span><span className={styles.configValue}>RTX 4070 Ti, RTX 2080 Ti</span></div>
      </div>
    </div>
  );
}

/* ─── Logs Page ─── */
function LogsPage() {
  const logs = [
    { time: '14:32:01', level: 'info', msg: 'VM "ubuntu-server" started successfully' },
    { time: '14:30:55', level: 'info', msg: 'VM "debian-dev" started successfully' },
    { time: '13:12:40', level: 'warn', msg: 'VM "windows-11" shut down unexpectedly' },
    { time: '12:00:00', level: 'info', msg: 'Virtualization service started' },
    { time: '11:59:58', level: 'info', msg: 'KVM modules loaded' },
  ];
  return (
    <div>
      <h3 className={styles.title}>System Logs</h3>
      <div className={styles.logList}>
        {logs.map((l, i) => (
          <div key={i} className={styles.logRow}>
            <span className={styles.logTime}>{l.time}</span>
            <span className={`${styles.logLevel} ${l.level === 'warn' ? styles.logWarn : styles.logInfo}`}>{l.level}</span>
            <span className={styles.logMsg}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function VirtualMachines() {
  const [active, setActive] = useState('overview');
  const [showWizard, setShowWizard] = useState(false);

  const renderPage = () => {
    switch (active) {
      case 'overview': return <OverviewPage />;
      case 'vms': return <VMListPage onCreateClick={() => setShowWizard(true)} />;
      case 'storage': return <StoragePage />;
      case 'network': return <NetworkPage />;
      case 'images': return <ImagesPage />;
      case 'settings': return <SettingsPage />;
      case 'logs': return <LogsPage />;
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
            </div>
          </div>
        ))}
      </div>
      <div className={styles.main}>{renderPage()}</div>
      {showWizard && <CreateWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
