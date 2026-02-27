/**
 * NimbusOS Backend API Server
 * Auto-detects system hardware and provides real-time metrics
 * Zero config — reads from /proc, /sys, nvidia-smi, lm-sensors, etc.
 */

const http = require('http');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const os = require('os');

const PORT = 3100;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ═══════════════════════════════════
// Helper: safe exec
// ═══════════════════════════════════
function run(cmd) {
  try { return execSync(cmd, { timeout: 5000, encoding: 'utf-8' }).trim(); }
  catch { return null; }
}

function readFile(path) {
  try { return fs.readFileSync(path, 'utf-8').trim(); }
  catch { return null; }
}

// ═══════════════════════════════════
// CPU
// ═══════════════════════════════════
let prevCpu = null;

function getCpuUsage() {
  const stat = readFile('/proc/stat');
  if (!stat) return { percent: 0, cores: os.cpus().length, model: os.cpus()[0]?.model || 'Unknown' };

  const line = stat.split('\n')[0]; // "cpu  user nice system idle iowait irq softirq steal"
  const parts = line.split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + parts[4];
  const total = parts.reduce((a, b) => a + b, 0);

  let percent = 0;
  if (prevCpu) {
    const diffIdle = idle - prevCpu.idle;
    const diffTotal = total - prevCpu.total;
    percent = diffTotal > 0 ? Math.round((1 - diffIdle / diffTotal) * 100) : 0;
  }
  prevCpu = { idle, total };

  return {
    percent,
    cores: os.cpus().length,
    model: os.cpus()[0]?.model || 'Unknown',
  };
}

// ═══════════════════════════════════
// Memory
// ═══════════════════════════════════
function getMemory() {
  const info = readFile('/proc/meminfo');
  if (!info) return { total: 0, used: 0, percent: 0 };

  const parse = (key) => {
    const m = info.match(new RegExp(`${key}:\\s+(\\d+)`));
    return m ? parseInt(m[1]) * 1024 : 0; // kB to bytes
  };

  const total = parse('MemTotal');
  const available = parse('MemAvailable');
  const used = total - available;

  return {
    total,
    used,
    totalGB: (total / 1073741824).toFixed(1),
    usedGB: (used / 1073741824).toFixed(1),
    percent: total > 0 ? Math.round((used / total) * 100) : 0,
  };
}

// ═══════════════════════════════════
// GPU (NVIDIA auto-detect)
// ═══════════════════════════════════
function getGpu() {
  const gpus = [];

  // Try nvidia-smi
  const nvidia = run('nvidia-smi --query-gpu=index,name,utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null');
  if (nvidia) {
    nvidia.split('\n').forEach(line => {
      const [index, name, util, temp, memUsed, memTotal] = line.split(',').map(s => s.trim());
      gpus.push({
        index: parseInt(index),
        name,
        utilization: parseInt(util),
        temperature: parseInt(temp),
        memUsed: parseInt(memUsed),
        memTotal: parseInt(memTotal),
        memPercent: memTotal > 0 ? Math.round((parseInt(memUsed) / parseInt(memTotal)) * 100) : 0,
        driver: 'nvidia',
      });
    });
  }

  // Try AMD (via /sys)
  try {
    const amdDevs = fs.readdirSync('/sys/class/drm').filter(d => d.match(/^card\d$/));
    for (const card of amdDevs) {
      const busy = readFile(`/sys/class/drm/${card}/device/gpu_busy_percent`);
      const temp = readFile(`/sys/class/drm/${card}/device/hwmon/hwmon*/temp1_input`);
      if (busy !== null) {
        gpus.push({
          index: gpus.length,
          name: `AMD GPU (${card})`,
          utilization: parseInt(busy) || 0,
          temperature: temp ? Math.round(parseInt(temp) / 1000) : 0,
          memUsed: 0, memTotal: 0, memPercent: 0,
          driver: 'amd',
        });
      }
    }
  } catch {}

  return gpus;
}

// ═══════════════════════════════════
// Temperature (auto-detect sources)
// ═══════════════════════════════════
function getTemps() {
  const temps = {};

  // CPU temp via /sys/class/thermal
  try {
    const zones = fs.readdirSync('/sys/class/thermal').filter(z => z.startsWith('thermal_zone'));
    for (const zone of zones) {
      const type = readFile(`/sys/class/thermal/${zone}/type`);
      const temp = readFile(`/sys/class/thermal/${zone}/temp`);
      if (type && temp) {
        temps[type] = Math.round(parseInt(temp) / 1000);
      }
    }
  } catch {}

  // Try lm-sensors as fallback
  if (Object.keys(temps).length === 0) {
    const sensors = run('sensors -u 2>/dev/null');
    if (sensors) {
      const m = sensors.match(/temp1_input:\s+([\d.]+)/);
      if (m) temps['cpu'] = Math.round(parseFloat(m[1]));
    }
  }

  // GPU temps from getGpu
  const gpus = getGpu();
  gpus.forEach((g, i) => {
    if (g.temperature > 0) temps[`gpu${i}`] = g.temperature;
  });

  return temps;
}

// ═══════════════════════════════════
// Network
// ═══════════════════════════════════
let prevNet = {};

function getNetwork() {
  const interfaces = [];
  const netDir = '/sys/class/net';

  try {
    const devs = fs.readdirSync(netDir).filter(d => d !== 'lo');
    for (const dev of devs) {
      const operstate = readFile(`${netDir}/${dev}/operstate`) || 'unknown';
      const speed = readFile(`${netDir}/${dev}/speed`); // Mbps, may be -1
      const rxBytes = parseInt(readFile(`${netDir}/${dev}/statistics/rx_bytes`) || '0');
      const txBytes = parseInt(readFile(`${netDir}/${dev}/statistics/tx_bytes`) || '0');

      // Get IP
      const ipOutput = run(`ip -4 addr show ${dev} 2>/dev/null | grep -oP 'inet \\K[\\d.]+'`);

      // Get MAC
      const mac = readFile(`${netDir}/${dev}/address`) || '';

      // Compute rates
      const prev = prevNet[dev];
      let rxRate = 0, txRate = 0;
      if (prev) {
        const dt = (Date.now() - prev.time) / 1000;
        if (dt > 0) {
          rxRate = Math.round((rxBytes - prev.rx) / dt);
          txRate = Math.round((txBytes - prev.tx) / dt);
        }
      }
      prevNet[dev] = { rx: rxBytes, tx: txBytes, time: Date.now() };

      interfaces.push({
        name: dev,
        status: operstate,
        speed: speed && parseInt(speed) > 0 ? `${speed} Mbps` : '—',
        ip: ipOutput || '—',
        mac,
        rxBytes, txBytes,
        rxRate, txRate,
        rxRateFormatted: formatBytes(rxRate) + '/s',
        txRateFormatted: formatBytes(txRate) + '/s',
      });
    }
  } catch {}

  return interfaces;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

// ═══════════════════════════════════
// Disks
// ═══════════════════════════════════
function getDisks() {
  const disks = [];

  // lsblk for block devices
  const lsblk = run('lsblk -bdno NAME,SIZE,MODEL,TYPE,MOUNTPOINT,FSTYPE 2>/dev/null');
  if (lsblk) {
    lsblk.split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const [name, size, ...rest] = parts;
        const type = rest.find(r => ['disk', 'part'].includes(r)) || 'disk';
        const model = rest.filter(r => !['disk', 'part', 'lvm', 'rom'].includes(r) && !r.startsWith('/'))[0] || '';
        const mount = rest.find(r => r.startsWith('/')) || '';

        if (type === 'disk' && parseInt(size) > 0) {
          // Get SMART temp
          const smart = run(`smartctl -A /dev/${name} 2>/dev/null | grep -i temperature | head -1`);
          let temp = null;
          if (smart) {
            const m = smart.match(/(\d+)\s*$/);
            if (m) temp = parseInt(m[1]);
          }

          disks.push({
            name: `/dev/${name}`,
            model: model || 'Unknown',
            size: parseInt(size),
            sizeFormatted: formatBytes(parseInt(size)),
            temperature: temp,
            type: 'disk',
          });
        }
      }
    });
  }

  // df for filesystem usage
  const df = run('df -B1 --output=source,size,used,avail,target 2>/dev/null');
  const mounts = [];
  if (df) {
    df.split('\n').slice(1).forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[0].startsWith('/dev/')) {
        mounts.push({
          device: parts[0],
          total: parseInt(parts[1]),
          used: parseInt(parts[2]),
          available: parseInt(parts[3]),
          mount: parts[4],
          totalFormatted: formatBytes(parseInt(parts[1])),
          usedFormatted: formatBytes(parseInt(parts[2])),
          percent: Math.round((parseInt(parts[2]) / parseInt(parts[1])) * 100),
        });
      }
    });
  }

  // RAID detection
  const mdstat = readFile('/proc/mdstat');
  const raids = [];
  if (mdstat) {
    const matches = mdstat.matchAll(/^(md\d+)\s*:\s*active\s+(\w+)\s+(.+)/gm);
    for (const m of matches) {
      raids.push({ name: m[1], type: m[2], devices: m[3].trim() });
    }
  }

  return { disks, mounts, raids };
}

// ═══════════════════════════════════
// Uptime
// ═══════════════════════════════════
function getUptime() {
  const raw = readFile('/proc/uptime');
  if (!raw) return '—';
  const secs = parseFloat(raw.split(' ')[0]);
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ═══════════════════════════════════
// System summary (for widgets)
// ═══════════════════════════════════
function getSystemSummary() {
  const cpu = getCpuUsage();
  const mem = getMemory();
  const gpus = getGpu();
  const temps = getTemps();
  const network = getNetwork();
  const diskInfo = getDisks();
  const uptime = getUptime();

  // Pick main temp (prefer cpu, x86_pkg_temp, or first available)
  const mainTemp = temps['x86_pkg_temp'] || temps['cpu'] || temps['coretemp']
    || Object.values(temps)[0] || null;

  // Pick primary network interface (first with an IP)
  const primaryNet = network.find(n => n.ip !== '—' && n.status === 'up') || network[0] || null;

  return {
    cpu,
    memory: mem,
    gpus,
    temps,
    mainTemp,
    network,
    primaryNet,
    disks: diskInfo,
    uptime,
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
  };
}

// ═══════════════════════════════════
// Docker (auto-detect socket)
// ═══════════════════════════════════
function getContainers() {
  const raw = run('docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.State}}" 2>/dev/null');
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [id, name, image, status, ports, state] = line.split('|');
    return { id, name, image, status, ports, state };
  });
}

// ═══════════════════════════════════
// HTTP Server
// ═══════════════════════════════════
const routes = {
  '/api/system': () => getSystemSummary(),
  '/api/cpu': () => getCpuUsage(),
  '/api/memory': () => getMemory(),
  '/api/gpu': () => getGpu(),
  '/api/temps': () => getTemps(),
  '/api/network': () => getNetwork(),
  '/api/disks': () => getDisks(),
  '/api/uptime': () => ({ uptime: getUptime() }),
  '/api/containers': () => getContainers(),
  '/api/hostname': () => ({ hostname: os.hostname() }),
};

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const url = req.url.split('?')[0];
  const handler = routes[url];

  if (handler) {
    try {
      const data = handler();
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ error: err.message }));
    }
  } else {
    res.writeHead(404, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ╔══════════════════════════════════╗`);
  console.log(`  ║   NimbusOS API Server v0.1.0     ║`);
  console.log(`  ║   http://0.0.0.0:${PORT}             ║`);
  console.log(`  ╚══════════════════════════════════╝\n`);
  console.log(`  Endpoints:`);
  Object.keys(routes).forEach(r => console.log(`    GET ${r}`));
  console.log(`\n  Auto-detecting hardware...`);

  // Initial detection log
  const summary = getSystemSummary();
  console.log(`    CPU: ${summary.cpu.model} (${summary.cpu.cores} cores)`);
  console.log(`    RAM: ${summary.memory.totalGB} GB`);
  if (summary.gpus.length > 0) {
    summary.gpus.forEach(g => console.log(`    GPU: ${g.name} (${g.memTotal} MB VRAM)`));
  } else {
    console.log(`    GPU: None detected`);
  }
  console.log(`    Network: ${summary.network.map(n => n.name).join(', ')}`);
  console.log(`    Disks: ${summary.disks.disks.length} detected`);
  console.log(`    Hostname: ${summary.hostname}`);
  console.log(`    Uptime: ${summary.uptime}\n`);
});
