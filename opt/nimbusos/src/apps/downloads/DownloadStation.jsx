import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@context';
import {
  PlusIcon, PlayIcon, RefreshCwIcon, TrashIcon, SearchIcon,
  CloudIcon, CheckCircleIcon, AlertTriangleIcon, XCircleIcon,
} from '@icons';
import styles from './DownloadStation.module.css';

// Transmission status codes
const STATUS = { STOPPED: 0, CHECK_WAIT: 1, CHECK: 2, DL_WAIT: 3, DOWNLOADING: 4, SEED_WAIT: 5, SEEDING: 6 };
const STATUS_LABELS = {
  [STATUS.STOPPED]: 'Stopped', [STATUS.CHECK_WAIT]: 'Queued', [STATUS.CHECK]: 'Verifying',
  [STATUS.DL_WAIT]: 'Queued', [STATUS.DOWNLOADING]: 'Downloading', [STATUS.SEED_WAIT]: 'Queued',
  [STATUS.SEEDING]: 'Seeding',
};
const STATUS_COLORS = {
  [STATUS.STOPPED]: 'var(--text-muted)', [STATUS.DOWNLOADING]: 'var(--accent-green, #66BB6A)',
  [STATUS.SEEDING]: 'var(--accent-blue, #42A5F5)', [STATUS.CHECK]: 'var(--accent-amber, #FFA726)',
};

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + sizes[i];
}

function formatSpeed(bytes) { return formatSize(bytes) + '/s'; }

function formatEta(seconds) {
  if (seconds < 0) return '∞';
  if (seconds === 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Status icon component
function StatusIcon({ status }) {
  const size = 14;
  switch (status) {
    case STATUS.DOWNLOADING: case STATUS.DL_WAIT:
      return <CloudIcon size={size} style={{ color: STATUS_COLORS[STATUS.DOWNLOADING] }} />;
    case STATUS.SEEDING: case STATUS.SEED_WAIT:
      return <CloudIcon size={size} style={{ color: STATUS_COLORS[STATUS.SEEDING], transform: 'rotate(180deg)' }} />;
    case STATUS.STOPPED:
      return <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} />;
    case STATUS.CHECK: case STATUS.CHECK_WAIT:
      return <RefreshCwIcon size={size} style={{ color: STATUS_COLORS[STATUS.CHECK] }} />;
    default:
      return <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} />;
  }
}

// ─── Setup screen ───
function SetupScreen({ onInstall, installing }) {
  return (
    <div className={styles.setup}>
      <div className={styles.setupIcon}>
        <CloudIcon size={32} style={{ color: 'var(--accent)' }} />
      </div>
      <div className={styles.setupTitle}>Download Station</div>
      <div className={styles.setupDesc}>
        Download files via BitTorrent directly to your NimbusOS storage pools.
        Transmission will be installed as a native service.
      </div>
      <button className={styles.btnPrimary} onClick={onInstall} disabled={installing}>
        {installing ? <><div className={styles.spinner} /> Installing...</> : 'Install Transmission'}
      </button>
    </div>
  );
}

// ─── Add Torrent Modal ───
function AddTorrentModal({ onClose, onAdd, shares }) {
  const [magnet, setMagnet] = useState('');
  const [file, setFile] = useState(null);
  const [downloadDir, setDownloadDir] = useState('');
  const [paused, setPaused] = useState(false);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onload = () => setMagnet(''); // clear magnet if file selected
      reader.readAsArrayBuffer(f);
    }
  };

  const handleAdd = async () => {
    const data = { paused };
    if (downloadDir) data.downloadDir = downloadDir;
    
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        data.metainfo = btoa(new Uint8Array(reader.result).reduce((s, b) => s + String.fromCharCode(b), ''));
        onAdd(data);
      };
      reader.readAsArrayBuffer(file);
    } else if (magnet) {
      data.magnet = magnet;
      onAdd(data);
    }
  };

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>Add Torrent</div>
        
        <label className={styles.fieldLabel}>Magnet Link or URL</label>
        <input className={styles.input} placeholder="magnet:?xt=urn:btih:... or http://..." 
          value={magnet} onChange={e => { setMagnet(e.target.value); setFile(null); }} />
        
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '12px 0', fontSize: '12px' }}>— or —</div>
        
        <label className={styles.fieldLabel}>Torrent File</label>
        <input type="file" accept=".torrent" ref={fileRef} onChange={handleFile} style={{ display: 'none' }} />
        <button className={styles.btnSecondary} onClick={() => fileRef.current?.click()} style={{ width: '100%' }}>
          {file ? file.name : 'Choose .torrent file...'}
        </button>
        
        <label className={styles.fieldLabel}>Download To</label>
        <select className={styles.select} value={downloadDir} onChange={e => setDownloadDir(e.target.value)}>
          <option value="">Default location</option>
          {shares.map(s => (
            <option key={s.name} value={s.path}>{s.name} ({s.pool})</option>
          ))}
        </select>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} />
          Add paused (don't start downloading yet)
        </label>
        
        <div className={styles.modalActions}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleAdd} disabled={!magnet && !file}>Add Torrent</button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ───
function DetailPanel({ torrent }) {
  const [tab, setTab] = useState('general');
  
  if (!torrent) return null;
  
  const tabs = ['General', 'Transfer', 'Peers', 'Files'];
  
  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailTabs}>
        {tabs.map(t => (
          <div key={t} className={`${styles.detailTab} ${tab === t.toLowerCase() ? styles.active : ''}`}
            onClick={() => setTab(t.toLowerCase())}>{t}</div>
        ))}
      </div>
      <div className={styles.detailContent}>
        {tab === 'general' && (
          <>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Name</span><span className={styles.detailValue}>{torrent.name}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Destination</span><span className={styles.detailValue}>{torrent.downloadDir}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Size</span><span className={styles.detailValue}>{formatSize(torrent.totalSize)}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Added</span><span className={styles.detailValue}>{torrent.addedDate ? new Date(torrent.addedDate * 1000).toLocaleString() : '—'}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Status</span><span className={styles.detailValue} style={{ color: STATUS_COLORS[torrent.status] }}>{STATUS_LABELS[torrent.status] || 'Unknown'}</span></div>
            {torrent.errorString && <div className={styles.detailRow}><span className={styles.detailLabel}>Error</span><span className={styles.detailValue} style={{ color: '#f87171' }}>{torrent.errorString}</span></div>}
          </>
        )}
        {tab === 'transfer' && (
          <>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Downloaded</span><span className={styles.detailValue}>{formatSize(torrent.downloadedEver)}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Uploaded</span><span className={styles.detailValue}>{formatSize(torrent.uploadedEver)}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Download Speed</span><span className={styles.detailValue} style={{ color: 'var(--accent-green, #66BB6A)' }}>{formatSpeed(torrent.rateDownload)}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Upload Speed</span><span className={styles.detailValue} style={{ color: 'var(--accent-orange, #E95420)' }}>{formatSpeed(torrent.rateUpload)}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>ETA</span><span className={styles.detailValue}>{formatEta(torrent.eta)}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Ratio</span><span className={styles.detailValue}>{torrent.uploadRatio?.toFixed(2) || '—'}</span></div>
          </>
        )}
        {tab === 'peers' && (
          <>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Connected</span><span className={styles.detailValue}>{torrent.peersConnected}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Downloading from</span><span className={styles.detailValue}>{torrent.peersSendingToUs}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Uploading to</span><span className={styles.detailValue}>{torrent.peersGettingFromUs}</span></div>
          </>
        )}
        {tab === 'files' && (
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            {torrent.files?.map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>{f.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatSize(f.length)}</span>
              </div>
            )) || <span style={{ color: 'var(--text-muted)' }}>No file information available</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───
export default function DownloadStation() {
  const { token } = useAuth();
  const headers = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
  
  const [status, setStatus] = useState(null);
  const [torrents, setTorrents] = useState([]);
  const [stats, setStats] = useState(null);
  const [shares, setShares] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check status
  const checkStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/downloads/status', { headers });
      const d = await r.json();
      setStatus(d);
      setLoading(false);
    } catch { setLoading(false); }
  }, []);

  // Load torrents
  const loadTorrents = useCallback(async () => {
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch('/api/downloads/list', { headers }),
        fetch('/api/downloads/stats', { headers }),
      ]);
      const listData = await listRes.json();
      const statsData = await statsRes.json();
      if (listData.torrents) setTorrents(listData.torrents);
      if (!statsData.error) setStats(statsData);
    } catch {}
  }, []);

  // Load shares for download dir picker
  const loadShares = useCallback(async () => {
    try {
      const r = await fetch('/api/storage/shares', { headers });
      const d = await r.json();
      if (d.shares) setShares(d.shares);
    } catch {}
  }, []);

  useEffect(() => {
    checkStatus();
    loadShares();
  }, []);

  // Poll torrents when Transmission is running
  useEffect(() => {
    if (!status?.transmission?.running) return;
    loadTorrents();
    const iv = setInterval(loadTorrents, 3000);
    return () => clearInterval(iv);
  }, [status?.transmission?.running]);

  // Install Transmission
  const handleInstall = async () => {
    setInstalling(true);
    try {
      const r = await fetch('/api/native-apps/transmission/install', { method: 'POST', headers });
      const d = await r.json();
      if (d.ok) {
        setConfiguring(true);
        // Configure for NimbusOS
        await fetch('/api/downloads/configure', {
          method: 'POST', headers: jsonHeaders,
          body: JSON.stringify({ downloadDir: shares[0]?.path || '/nimbus/downloads' }),
        });
        setConfiguring(false);
        checkStatus();
      }
    } catch {}
    setInstalling(false);
  };

  // Start Transmission
  const handleStart = async () => {
    await fetch('/api/native-apps/transmission/start', { method: 'POST', headers });
    setTimeout(checkStatus, 1500);
  };

  // Add torrent
  const handleAdd = async (data) => {
    await fetch('/api/downloads/add', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(data) });
    setShowAdd(false);
    loadTorrents();
  };

  // Torrent actions
  const doAction = async (action, ids) => {
    if (!ids) ids = selected ? [selected] : [];
    if (ids.length === 0) return;
    await fetch('/api/downloads/action', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ action, ids }) });
    loadTorrents();
  };

  // Filter torrents
  const filtered = torrents.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    switch (filter) {
      case 'downloading': return t.status === STATUS.DOWNLOADING || t.status === STATUS.DL_WAIT;
      case 'completed': return t.percentDone === 1;
      case 'active': return t.rateDownload > 0 || t.rateUpload > 0;
      case 'stopped': return t.status === STATUS.STOPPED;
      case 'seeding': return t.status === STATUS.SEEDING || t.status === STATUS.SEED_WAIT;
      default: return true;
    }
  });

  const selectedTorrent = torrents.find(t => t.id === selected);

  if (loading) return <div className={styles.setup}><div className={styles.spinner} /></div>;

  // Not installed
  if (!status?.transmission?.installed) {
    return <SetupScreen onInstall={handleInstall} installing={installing || configuring} />;
  }

  // Installed but not running
  if (!status?.transmission?.running) {
    return (
      <div className={styles.setup}>
        <div className={styles.setupIcon}><CloudIcon size={32} style={{ color: 'var(--text-muted)' }} /></div>
        <div className={styles.setupTitle}>Transmission is stopped</div>
        <div className={styles.setupDesc}>Start the service to manage your downloads.</div>
        <button className={styles.btnPrimary} onClick={handleStart}>Start Transmission</button>
      </div>
    );
  }

  // Sidebar counts
  const counts = {
    all: torrents.length,
    downloading: torrents.filter(t => t.status === STATUS.DOWNLOADING || t.status === STATUS.DL_WAIT).length,
    completed: torrents.filter(t => t.percentDone === 1).length,
    active: torrents.filter(t => t.rateDownload > 0 || t.rateUpload > 0).length,
    seeding: torrents.filter(t => t.status === STATUS.SEEDING || t.status === STATUS.SEED_WAIT).length,
    stopped: torrents.filter(t => t.status === STATUS.STOPPED).length,
  };

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarSection}>Downloads</div>
        {[
          { id: 'all', label: 'All Downloads' },
          { id: 'downloading', label: 'Downloading' },
          { id: 'completed', label: 'Completed' },
          { id: 'active', label: 'Active' },
          { id: 'seeding', label: 'Seeding' },
          { id: 'stopped', label: 'Stopped' },
        ].map(item => (
          <div key={item.id} className={`${styles.sidebarItem} ${filter === item.id ? styles.active : ''}`}
            onClick={() => setFilter(item.id)}>
            {item.label}
            {counts[item.id] > 0 && <span className={styles.sidebarCount}>{counts[item.id]}</span>}
          </div>
        ))}
      </div>

      {/* Main */}
      <div className={styles.main}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <button className={`${styles.toolBtn} ${styles.accent}`} title="Add Torrent" onClick={() => setShowAdd(true)}>
            <PlusIcon size={18} />
          </button>
          <div className={styles.toolSep} />
          <button className={styles.toolBtn} title="Start" disabled={!selected} onClick={() => doAction('start')}>
            <PlayIcon size={16} />
          </button>
          <button className={styles.toolBtn} title="Stop" disabled={!selected} onClick={() => doAction('stop')}>
            <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="1" fill="currentColor" /></svg>
          </button>
          <div className={styles.toolSep} />
          <button className={styles.toolBtn} title="Remove" disabled={!selected}
            onClick={() => { if (confirm('Remove torrent? (keeps files)')) doAction('remove'); }}>
            <TrashIcon size={16} />
          </button>
          <button className={styles.toolBtn} title="Remove with data" disabled={!selected}
            onClick={() => { if (confirm('Remove torrent AND downloaded files?')) doAction('remove-data'); }}>
            <XCircleIcon size={16} />
          </button>
          <div className={styles.toolSep} />
          <button className={styles.toolBtn} title="Refresh" onClick={loadTorrents}>
            <RefreshCwIcon size={16} />
          </button>
          <input className={styles.searchInput} placeholder="Filter..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Stats */}
        <div className={styles.statsBar}>
          <span className={styles.statDown}>DL: {formatSpeed(stats?.downloadSpeed || 0)}</span>
          <span className={styles.statUp}>UL: {formatSpeed(stats?.uploadSpeed || 0)}</span>
          <span>{filtered.length} torrents</span>
        </div>

        {/* List header */}
        <div className={styles.listHeader}>
          <span></span>
          <span>Name</span>
          <span>Size</span>
          <span>Done</span>
          <span>Down</span>
          <span>Up</span>
          <span>ETA</span>
          <span>Status</span>
        </div>

        {/* Torrent list */}
        <div className={styles.listContainer}>
          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <CloudIcon size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
              <div>{search ? 'No torrents match your filter' : 'No downloads yet'}</div>
              <div style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>Click + to add a torrent</div>
            </div>
          ) : filtered.map(t => (
            <div key={t.id} className={`${styles.torrentRow} ${selected === t.id ? styles.selected : ''}`}
              onClick={() => setSelected(selected === t.id ? null : t.id)} onDoubleClick={() => setSelected(t.id)}>
              <div className={styles.statusIcon}><StatusIcon status={t.status} /></div>
              <div>
                <div className={styles.torrentName}>{t.name}</div>
                <div className={styles.progressBar}>
                  <div className={`${styles.progressFill} ${t.percentDone === 1 ? styles.done : ''}`}
                    style={{ width: `${(t.percentDone * 100).toFixed(1)}%` }} />
                </div>
              </div>
              <div className={styles.torrentCell}>{formatSize(t.totalSize)}</div>
              <div className={styles.torrentCell}>{(t.percentDone * 100).toFixed(1)}%</div>
              <div className={styles.torrentCell} style={{ color: 'var(--accent-green, #66BB6A)' }}>{t.rateDownload > 0 ? formatSpeed(t.rateDownload) : '—'}</div>
              <div className={styles.torrentCell} style={{ color: 'var(--accent-orange, #E95420)' }}>{t.rateUpload > 0 ? formatSpeed(t.rateUpload) : '—'}</div>
              <div className={styles.torrentCell}>{t.status === STATUS.DOWNLOADING ? formatEta(t.eta) : '—'}</div>
              <div className={styles.torrentCell} style={{ color: STATUS_COLORS[t.status] || 'var(--text-muted)' }}>
                {STATUS_LABELS[t.status] || 'Unknown'}
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selectedTorrent && <DetailPanel torrent={selectedTorrent} />}
      </div>

      {/* Add modal */}
      {showAdd && <AddTorrentModal onClose={() => setShowAdd(false)} onAdd={handleAdd} shares={shares} />}
    </div>
  );
}
