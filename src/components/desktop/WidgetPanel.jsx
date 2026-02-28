import { useState, useEffect, useRef } from 'react';
import { useTheme, useAuth } from '@context';
import { ActivityIcon, GlobeIcon, HardDriveIcon } from '@icons';
import styles from './WidgetPanel.module.css';

const API = '/api/system';
const POLL_MS = 5000;

// ═══════════════════════════════════
// Shared components
// ═══════════════════════════════════
function Bar({ label, value, percent, color }) {
  return (
    <div className={styles.barRow}>
      <div className={styles.barLabel}><span>{label}</span><span style={{ color }}>{value}</span></div>
      <div className={styles.bar}><div className={styles.barFill} style={{ width: `${percent}%`, background: color }} /></div>
    </div>
  );
}

function Metric({ label, value, style }) {
  return (
    <div className={styles.metricRow}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue} style={style}>{value}</span>
    </div>
  );
}

function formatRate(bytes) {
  if (!bytes || bytes === 0) return '0 B/s';
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

// ═══════════════════════════════════
// Data hook — polls backend
// ═══════════════════════════════════
function useSystemData(token) {
  const [data, setData] = useState(null);
  const [live, setLive] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!token) {
      console.log('[Widget] No token available');
      return;
    }
    
    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch(API, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          const errText = await res.text();
          console.log('[Widget] API error:', res.status, errText);
          throw new Error('API error');
        }
        const json = await res.json();
        if (mounted) {
          setData(json);
          setLive(true);
        }
      } catch (err) {
        console.log('[Widget] Fetch error:', err.message);
        if (mounted) setLive(false);
      }
    };

    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => { mounted = false; clearInterval(timerRef.current); };
  }, [token]);

  return { data, live };
}

// ═══════════════════════════════════
// System Widget
// ═══════════════════════════════════
function SystemWidget({ data, live }) {
  if (!live || !data) {
    return (
      <div className={styles.widget}>
        <div className={styles.widgetTitle}><ActivityIcon size={16} /> System</div>
        <div className={styles.offline}>Waiting for server...</div>
        <div className={styles.offlineHint}>Run: node server/index.js</div>
      </div>
    );
  }

  const { cpu, memory, gpus, mainTemp, uptime } = data;

  return (
    <div className={styles.widget}>
      <div className={styles.widgetTitle}>
        <ActivityIcon size={16} /> System
        <span className={styles.liveIndicator}>● LIVE</span>
      </div>
      <Bar label="CPU" value={`${cpu.percent}%`} percent={cpu.percent} color="var(--accent)" />
      <Bar label="Memory" value={`${memory.usedGB} / ${memory.totalGB} GB`} percent={memory.percent} color="var(--accent-purple)" />
      {gpus.map((gpu, i) => (
        <Bar key={i} label={gpus.length > 1 ? `GPU ${i}` : 'GPU'} value={`${gpu.utilization}%`} percent={gpu.utilization} color="var(--accent-blue)" />
      ))}
      {gpus.length === 0 && (
        <Metric label="GPU" value="—" />
      )}
      <div className={styles.divider} />
      <Metric label="Temp" value={mainTemp ? `${mainTemp}°C` : '—'} />
      {gpus.length > 0 && gpus[0].temperature > 0 && (
        <Metric label="GPU Temp" value={`${gpus[0].temperature}°C`} />
      )}
      <Metric label="Uptime" value={uptime} />
    </div>
  );
}

// ═══════════════════════════════════
// Network Widget
// ═══════════════════════════════════
function NetworkWidget({ data, live }) {
  if (!live || !data) {
    return (
      <div className={styles.widget}>
        <div className={styles.widgetTitle}><GlobeIcon size={16} /> Network</div>
        <div className={styles.offline}>—</div>
      </div>
    );
  }

  const { primaryNet, network } = data;
  const iface = primaryNet || network[0];

  if (!iface) {
    return (
      <div className={styles.widget}>
        <div className={styles.widgetTitle}><GlobeIcon size={16} /> Network</div>
        <div className={styles.offline}>No interfaces</div>
      </div>
    );
  }

  return (
    <div className={styles.widget}>
      <div className={styles.widgetTitle}><GlobeIcon size={16} /> Network</div>
      <Metric label={iface.name} value={iface.speed} style={{ color: 'var(--accent-green)' }} />
      <Metric label="↓ Download" value={formatRate(iface.rxRate)} />
      <Metric label="↑ Upload" value={formatRate(iface.txRate)} />
      <Metric label="IP" value={iface.ip} />
      {network.length > 1 && (
        <>
          <div className={styles.divider} />
          {network.filter(n => n !== iface).map((n, i) => (
            <Metric key={i} label={n.name} value={n.ip !== '—' ? n.ip : n.status} />
          ))}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════
// Disk Widget
// ═══════════════════════════════════
function DiskWidget({ data, live, token }) {
  const [storageData, setStorageData] = useState(null);
  
  useEffect(() => {
    if (!token) return;
    const fetchStorage = async () => {
      try {
        const res = await fetch('/api/storage/status', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) setStorageData(await res.json());
      } catch {}
    };
    fetchStorage();
    const iv = setInterval(fetchStorage, 30000);
    return () => clearInterval(iv);
  }, [token]);

  if (!live || !data) {
    return (
      <div className={styles.widget}>
        <div className={styles.widgetTitle}><HardDriveIcon size={16} /> Disk Health</div>
        <div className={styles.offline}>—</div>
      </div>
    );
  }

  const { disks } = data;
  const { disks: physicalDisks } = disks;
  const pools = storageData?.pools || [];
  const hasPool = storageData?.hasPool;

  return (
    <div className={styles.widget}>
      <div className={styles.widgetTitle}><HardDriveIcon size={16} /> Disk Health</div>
      {physicalDisks.map((d, i) => (
        <div key={i} className={styles.diskRow}>
          <div className={styles.diskDot} />
          <div>
            <div className={styles.diskName}>{d.name} — {d.model}</div>
            <div className={styles.diskStatus}>
              {d.sizeFormatted}
              {d.temperature ? ` · ${d.temperature}°C` : ''}
            </div>
          </div>
        </div>
      ))}
      {pools.length > 0 && (
        <>
          <div className={styles.divider} />
          {pools.map((p, i) => (
            <div key={i}>
              <Metric label={p.arrayName || p.name} value={p.raidLevel.toUpperCase()} style={{ color: p.status === 'active' ? 'var(--accent-green)' : '#f87171' }} />
              <Bar label={p.mountPoint} value={`${p.usedFormatted} / ${p.totalFormatted}`} percent={p.usagePercent} color={p.usagePercent > 90 ? '#f87171' : 'var(--accent)'} />
            </div>
          ))}
        </>
      )}
      {!hasPool && (
        <>
          <div className={styles.divider} />
          <div className={styles.diskStatus} style={{ color: '#fbbf24', fontSize: '0.75rem' }}>No storage pool configured</div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════
// Notifications (static for now)
// ═══════════════════════════════════
function NotifWidget() {
  return (
    <div className={styles.widget}>
      <div className={styles.widgetTitle}>Notifications</div>
      {[
        { text: 'NimbusOS started successfully', time: 'Just now', color: 'var(--accent-green)' },
        { text: 'All disks healthy', time: 'Just now', color: 'var(--accent-green)' },
        { text: 'System monitoring active', time: 'Just now', color: 'var(--accent-blue)' },
      ].map((n, i) => (
        <div key={i} className={styles.notifItem}>
          <div className={styles.notifDot} style={{ background: n.color }} />
          <div>
            <div className={styles.notifText}>{n.text}</div>
            <div className={styles.notifTime}>{n.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════
// Main panel
// ═══════════════════════════════════
export default function WidgetPanel() {
  const { showWidgets, visibleWidgets, widgetScale } = useTheme();
  const { token } = useAuth();
  const { data, live } = useSystemData(token);

  if (!showWidgets) return null;

  const scale = widgetScale / 100;
  const panelStyle = {
    width: `${340 * scale}px`,
    fontSize: `${100 * scale}%`,
  };

  return (
    <div className={styles.panel} style={panelStyle}>
      {visibleWidgets.system && <SystemWidget data={data} live={live} />}
      {visibleWidgets.network && <NetworkWidget data={data} live={live} />}
      {visibleWidgets.disk && <DiskWidget data={data} live={live} token={token} />}
      {visibleWidgets.notifications && <NotifWidget />}
    </div>
  );
}
