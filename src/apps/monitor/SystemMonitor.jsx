import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@context';
import styles from './SystemMonitor.module.css';

const API = '/api/system';
const POLL_MS = 5000;
const HISTORY_LEN = 35;

function MiniChart({ color, data }) {
  return (
    <div className={styles.chart}>
      {data.map((h, i) => (
        <div
          key={i}
          className={styles.chartBar}
          style={{ height: `${h}%`, background: color, opacity: 0.3 + (h / 100) * 0.7 }}
        />
      ))}
    </div>
  );
}

function formatRate(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

export default function SystemMonitor() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [live, setLive] = useState(false);
  const cpuHistory = useRef(new Array(HISTORY_LEN).fill(0));
  const ramHistory = useRef(new Array(HISTORY_LEN).fill(0));
  const netHistory = useRef(new Array(HISTORY_LEN).fill(0));
  const gpuHistory = useRef(new Array(HISTORY_LEN).fill(0));
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!token) return;
    
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch(API, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!mounted) return;
        setData(json);
        setLive(true);

        // Push to history (mutate in place to avoid GC pressure)
        cpuHistory.current.shift(); cpuHistory.current.push(json.cpu.percent);
        ramHistory.current.shift(); ramHistory.current.push(json.memory.percent);
        const rx = json.primaryNet ? json.primaryNet.rxRate : 0;
        const netPct = Math.min(100, (rx / (125 * 1024 * 1024)) * 100);
        netHistory.current.shift(); netHistory.current.push(netPct);
        if (json.gpus.length > 0) {
          gpuHistory.current.shift(); gpuHistory.current.push(json.gpus[0].utilization);
        }
        forceRender(n => n + 1);
      } catch {
        if (mounted) setLive(false);
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, [token]);

  if (!live || !data) {
    return (
      <div className={styles.container}>
        <div className={styles.offline}>
          <div className={styles.offlineTitle}>Waiting for server...</div>
          <div className={styles.offlineHint}>Run: node server/index.cjs</div>
        </div>
      </div>
    );
  }

  const { cpu, memory, gpus, primaryNet, network, disks, temps, mainTemp, uptime, hostname, platform } = data;
  const gpu = gpus[0] || null;
  const iface = primaryNet || network[0];

  // Build sysinfo from detected data
  const sysInfo = [
    ['Hostname', hostname],
    ['OS', platform],
    ['CPU', `${cpu.model} (${cpu.cores} threads)`],
    ...(gpu ? [['GPU', `${gpu.name} (${gpu.memTotal} MB)`]] : []),
    ['RAM', `${memory.totalGB} GB`],
    ['Uptime', uptime],
    ['NimbusOS', 'v0.1.0'],
    ...(iface ? [['IP', iface.ip]] : []),
    ...(mainTemp ? [['CPU Temp', `${mainTemp}°C`]] : []),
    ...(gpu && gpu.temperature > 0 ? [['GPU Temp', `${gpu.temperature}°C`]] : []),
  ];

  // Detect running services
  const services = [];
  const containers = data.containers || [];
  if (containers.length > 0 || true) {
    services.push({ name: 'Docker Engine', status: 'running', detail: `${disks.disks.length} disks` });
  }
  if (iface && iface.status === 'up') {
    services.push({ name: `Network (${iface.name})`, status: 'running', detail: iface.speed });
  }

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {/* CPU */}
        <div className={styles.card}>
          <div className={styles.label}>CPU Usage</div>
          <div className={styles.value} style={{ color: 'var(--accent)' }}>
            {cpu.percent}<span className={styles.unit}>%</span>
          </div>
          <div className={styles.sub}>{cpu.model.split(' ').slice(0, 4).join(' ')} · {cpu.cores} threads{mainTemp ? ` · ${mainTemp}°C` : ''}</div>
          <MiniChart color="var(--accent)" data={cpuHistory.current} />
        </div>

        {/* Memory */}
        <div className={styles.card}>
          <div className={styles.label}>Memory</div>
          <div className={styles.value} style={{ color: 'var(--accent-purple)' }}>
            {memory.usedGB}<span className={styles.unit}> / {memory.totalGB} GB</span>
          </div>
          <div className={styles.sub}>{memory.percent}% used</div>
          <MiniChart color="var(--accent-purple)" data={ramHistory.current} />
        </div>

        {/* GPU (if detected) */}
        {gpu && (
          <div className={styles.card}>
            <div className={styles.label}>GPU</div>
            <div className={styles.value} style={{ color: 'var(--accent-blue)' }}>
              {gpu.utilization}<span className={styles.unit}>%</span>
            </div>
            <div className={styles.sub}>{gpu.name} · {gpu.memUsed}/{gpu.memTotal} MB · {gpu.temperature}°C</div>
            <MiniChart color="var(--accent-blue)" data={gpuHistory.current} />
          </div>
        )}

        {/* Network */}
        <div className={styles.card}>
          <div className={styles.label}>Network</div>
          {iface ? (
            <>
              <div className={styles.netValues}>
                <div>
                  <div className={styles.netValue} style={{ color: 'var(--accent-green)' }}>↓ {formatRate(iface.rxRate)}</div>
                  <div className={styles.sub}>/s download</div>
                </div>
                <div>
                  <div className={styles.netValue} style={{ color: 'var(--accent-blue)' }}>↑ {formatRate(iface.txRate)}</div>
                  <div className={styles.sub}>/s upload</div>
                </div>
              </div>
              <MiniChart color="var(--accent-green)" data={netHistory.current} />
            </>
          ) : (
            <div className={styles.sub}>No network</div>
          )}
        </div>

        {/* Disks */}
        <div className={styles.card}>
          <div className={styles.label}>Disks</div>
          {disks.disks.map((d, i) => (
            <div key={i} className={styles.serviceRow}>
              <span className={`${styles.dot} ${styles.dotRunning}`} />
              <span className={styles.serviceName}>{d.model}</span>
              <span className={styles.serviceDetail}>{d.sizeFormatted}{d.temperature ? ` · ${d.temperature}°C` : ''}</span>
            </div>
          ))}
          {disks.raids.length > 0 && disks.raids.map((r, i) => (
            <div key={`r${i}`} className={styles.serviceRow}>
              <span className={`${styles.dot} ${styles.dotRunning}`} />
              <span className={styles.serviceName}>{r.name}</span>
              <span className={styles.serviceDetail}>{r.type}</span>
            </div>
          ))}
        </div>

        {/* System Info */}
        <div className={`${styles.card} ${styles.span2}`}>
          <div className={styles.label}>System Information</div>
          <div className={styles.infoGrid}>
            {sysInfo.map(([k, v], i) => (
              <div key={i}>
                <span className={styles.infoKey}>{k}:</span> {v}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
