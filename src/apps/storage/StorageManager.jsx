import { useState, useEffect, useCallback } from 'react';
import { HardDriveIcon, ShieldIcon, ActivityIcon, PlusIcon, RefreshCwIcon, AlertTriangleIcon, CheckCircleIcon, XCircleIcon } from '@icons';
import { useAuth } from '@context';
import styles from './StorageManager.module.css';

const API = '';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
}

export default function StorageManager() {
  const { token } = useAuth();
  const [view, setView] = useState('overview');
  const [disks, setDisks] = useState(null);
  const [pools, setPools] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const headers = { 'Authorization': `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    try {
      const [diskRes, statusRes] = await Promise.all([
        fetch(`${API}/api/storage/disks`, { headers }),
        fetch(`${API}/api/storage/status`, { headers }),
      ]);
      const diskData = await diskRes.json();
      const statusData = await statusRes.json();
      setDisks(diskData);
      setPools(statusData.pools || []);
      setAlerts(statusData.alerts || []);
      setError('');
    } catch {
      setError('Failed to load storage data');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const iv = setInterval(fetchData, 30000); return () => clearInterval(iv); }, [fetchData]);

  const rescan = async () => { setLoading(true); await fetch(`${API}/api/storage/scan`, { method: 'POST', headers }); await fetchData(); };

  if (loading && !disks) return <div className={styles.layout}><div className={styles.main}><div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading storage data...</div></div></div>;

  const hasPools = pools && pools.length > 0;
  const allDisks = disks ? [...(disks.eligible||[]), ...(disks.provisioned||[]), ...(disks.nvme||[]), ...(disks.usb||[])] : [];
  const critAlerts = alerts.filter(a => a.severity === 'critical');
  const warnAlerts = alerts.filter(a => a.severity === 'warning');

  return (
    <div className={styles.layout}>
      <div className={styles.sidebar}>
        <div className={styles.sectionLabel}>Storage</div>
        {[['overview','Overview',HardDriveIcon],['disks','Physical Disks',HardDriveIcon],['pools','Pools',ShieldIcon],['smart','SMART Health',ActivityIcon]].map(([id,label,Icon])=>(
          <div key={id} className={`${styles.sidebarItem} ${view===id?styles.active:''}`} onClick={()=>setView(id)}>
            <span className={styles.sidebarIcon}><Icon size={16}/></span>{label}
          </div>
        ))}
        <div className={styles.sectionLabel}>Actions</div>
        <div className={`${styles.sidebarItem} ${view==='create'?styles.active:''}`} onClick={()=>setView('create')}>
          <span className={styles.sidebarIcon}><PlusIcon size={16}/></span>Create Pool
        </div>
        <div className={styles.sidebarItem} onClick={rescan}>
          <span className={styles.sidebarIcon}><RefreshCwIcon size={16}/></span>Rescan Disks
        </div>
      </div>

      <div className={styles.main}>
        {error && <div className={styles.alertBanner} style={{background:'rgba(239,68,68,0.15)',color:'#f87171'}}>{error}</div>}
        {critAlerts.map((a,i)=>(<div key={`c${i}`} className={styles.alertBanner} style={{background:'rgba(239,68,68,0.15)',color:'#f87171'}}><AlertTriangleIcon size={16}/> {a.message}</div>))}
        {warnAlerts.map((a,i)=>(<div key={`w${i}`} className={styles.alertBanner} style={{background:'rgba(245,158,11,0.15)',color:'#fbbf24'}}><AlertTriangleIcon size={16}/> {a.message}</div>))}

        {!hasPools && view!=='create' && <NoPools onCreateClick={()=>setView('create')} eligible={(disks?.eligible||[]).length}/>}
        {view==='overview' && hasPools && <OverviewPage pools={pools} allDisks={allDisks}/>}
        {view==='disks' && <DisksPage disks={disks} allDisks={allDisks} token={token} onRefresh={fetchData}/>}
        {view==='pools' && <PoolsPage pools={pools} token={token} onRefresh={fetchData}/>}
        {view==='smart' && <SmartPage allDisks={allDisks}/>}
        {view==='create' && <CreatePoolPage disks={disks} token={token} onCreated={()=>{setView('overview');fetchData();}}/>}
      </div>
    </div>
  );
}

function NoPools({onCreateClick, eligible}) {
  return (
    <div style={{textAlign:'center',padding:'60px 20px'}}>
      <HardDriveIcon size={64} style={{color:'var(--text-muted)',marginBottom:16}}/>
      <h2 style={{color:'var(--text-primary)',marginBottom:8}}>No Storage Pool Configured</h2>
      <p style={{color:'var(--text-muted)',marginBottom:24,maxWidth:400,margin:'0 auto 24px'}}>
        Create a storage pool to unlock all NimbusOS features: App Store, Docker, File Manager, and Shared Folders.
      </p>
      {eligible > 0
        ? <button className={styles.btnPrimary} onClick={onCreateClick}><PlusIcon size={16}/> Create Your First Pool ({eligible} disk{eligible!==1?'s':''} available)</button>
        : <p style={{color:'#f87171'}}>No eligible disks detected. Connect HDD or SSD drives to create a pool.</p>}
    </div>
  );
}

function OverviewPage({pools, allDisks}) {
  const totalSize = pools.reduce((s,p)=>s+(p.total||0),0);
  const totalUsed = pools.reduce((s,p)=>s+(p.used||0),0);
  const allHealthy = pools.every(p=>p.status==='active');

  return (<div>
    <div className={styles.statsRow}>
      <div className={styles.stat}><div className={styles.statValue} style={{color:'var(--accent)'}}>{pools.length}</div><div className={styles.statLabel}>Pool{pools.length!==1?'s':''}</div></div>
      <div className={styles.stat}><div className={styles.statValue} style={{color:'var(--accent-green)'}}>{formatBytes(totalUsed)}</div><div className={styles.statLabel}>Used / {formatBytes(totalSize)}</div></div>
      <div className={styles.stat}><div className={styles.statValue} style={{color:'var(--accent-blue)'}}>{allDisks.length}</div><div className={styles.statLabel}>Physical Disks</div></div>
      <div className={styles.stat}><div className={styles.statValue} style={{color:allHealthy?'var(--accent-green)':'#f87171'}}>{allHealthy?'Healthy':'Degraded'}</div><div className={styles.statLabel}>Status</div></div>
    </div>
    {pools.map(pool=>(<PoolCard key={pool.name} pool={pool}/>))}
  </div>);
}

function PoolCard({pool, onDestroy}) {
  return (
    <div className={styles.raidCard}>
      <div className={styles.raidHeader}>
        <div>
          <div className={styles.raidTitle}><ShieldIcon size={16}/> {pool.name} {pool.isPrimary?'(Primary)':''}</div>
          <div className={styles.raidSub}>{pool.raidLevel.toUpperCase()} · {pool.filesystem} · {pool.mountPoint} · {pool.disks.length} disk{pool.disks.length!==1?'s':''}</div>
        </div>
        <div className={styles.statusBadge}>
          <span className={styles.statusDot} style={{background:pool.status==='active'?'var(--accent-green)':pool.status==='degraded'?'#f87171':'#fbbf24'}}/>
          {pool.status==='active'?'Healthy':pool.status==='degraded'?'DEGRADED':pool.status}
        </div>
      </div>
      <div className={styles.raidDisks}>
        {pool.disks.map((disk,i)=>{
          const failed = pool.members?.find(m=>m.device?.includes(disk.replace('/dev/','')))?.failed;
          return (<div key={i} className={`${styles.raidDiskBox} ${failed?styles.raidFailed:styles.raidActive}`}>
            <div className={styles.raidDiskLabel}>Disk {i+1}</div><span>{disk}</span>
            {failed && <span style={{color:'#f87171',fontSize:'0.75rem'}}>FAILED</span>}
          </div>);
        })}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginTop:8}}>
        <div style={{flex:1,display:'flex',alignItems:'center',gap:8}}>
          {pool.total>0 && (<>
            <span style={{fontSize:'var(--text-xs)',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{formatBytes(pool.used)} / {formatBytes(pool.total)}</span>
            <div className={styles.progressBar} style={{flex:1}}><div className={styles.progressFill} style={{width:`${pool.usagePercent}%`,background:pool.usagePercent>90?'#f87171':pool.usagePercent>75?'#fbbf24':'var(--accent-green)'}}/></div>
            <span style={{fontSize:'var(--text-xs)',color:'var(--text-muted)'}}>{pool.usagePercent}%</span>
          </>)}
        </div>
        {onDestroy && (
          <button onClick={()=>onDestroy(pool)} className={styles.btn}
            style={{fontSize:'var(--text-xs)',padding:'3px 8px',color:'#f87171',borderColor:'rgba(239,68,68,0.3)',whiteSpace:'nowrap'}}>
            Destroy
          </button>
        )}
      </div>
      {pool.rebuildProgress!==null && (
        <div className={styles.raidSync}><span>Rebuild:</span><div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${pool.rebuildProgress}%`,background:'#fbbf24'}}/></div><span>{pool.rebuildProgress}%</span></div>
      )}
    </div>
  );
}

function DiskItem({disk, color, onWipe}) {
  return (
    <div className={styles.diskItem}>
      <div className={styles.diskIcon} style={{background:`${color}15`,color}}><HardDriveIcon size={22}/></div>
      <div className={styles.diskInfo}>
        <div className={styles.diskName}>
          {disk.path} — {disk.model}
          {disk.poolName && <span style={{color:'var(--accent)',marginLeft:8,fontSize:'var(--text-xs)'}}>Pool: {disk.poolName}</span>}
        </div>
        <div className={styles.diskDetail}>
          {disk.serial&&`${disk.serial} · `}{disk.sizeFormatted} · {disk.classification==='hdd'?'HDD':disk.classification==='ssd'?'SSD':disk.classification} · {disk.transport}
          {disk.isBoot?' · 🖥 Boot disk':''}
          {disk.availableSpaceFormatted&&disk.isBoot?` · ${disk.availableSpaceFormatted} free`:''}
          {disk.temperature?` · ${disk.temperature}°C`:''}
          {disk.hasRaidSuperblock?' · ⚠ RAID superblock':''}
          {disk.hasExistingData&&!disk.hasRaidSuperblock?' · ⚠ Has data':''}
        </div>
      </div>
      {disk.needsWipe && !disk.isBoot && onWipe && (
        <button onClick={()=>onWipe(disk)} className={styles.btn} style={{fontSize:'var(--text-xs)',padding:'4px 10px',color:'#fbbf24',borderColor:'rgba(251,191,36,0.3)'}}>
          Wipe
        </button>
      )}
      <div className={styles.statusBadge}>
        {disk.smart==='PASSED'?<><CheckCircleIcon size={14} style={{color:'var(--accent-green)'}}/> Healthy</>:
         disk.smart==='FAILED'?<><XCircleIcon size={14} style={{color:'#f87171'}}/> FAILED</>:
         <span style={{color:'var(--text-muted)'}}>—</span>}
      </div>
    </div>
  );
}

function DisksPage({disks, allDisks, token, onRefresh}) {
  const [wiping, setWiping] = useState(null);
  const [wipeConfirm, setWipeConfirm] = useState(null);
  const [wipeInput, setWipeInput] = useState('');
  const [wipeError, setWipeError] = useState('');

  const doWipe = async () => {
    if (wipeInput !== wipeConfirm.name.replace('/dev/','')) { setWipeError('Type the disk name to confirm'); return; }
    setWiping(wipeConfirm.path);
    setWipeError('');
    try {
      const res = await fetch('/api/storage/wipe', {
        method: 'POST',
        headers: {'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body: JSON.stringify({disk: wipeConfirm.path})
      });
      const data = await res.json();
      if (data.error) setWipeError(data.error);
      else { setWipeConfirm(null); setWipeInput(''); if (onRefresh) onRefresh(); }
    } catch { setWipeError('Wipe failed'); }
    setWiping(null);
  };

  const cats = [
    {title:'Available for Pools',items:disks?.eligible||[],color:'var(--accent-green)'},
    {title:'Pool Members',items:disks?.provisioned||[],color:'var(--accent)'},
    {title:'NVMe (Cache Reserved)',items:disks?.nvme||[],color:'var(--text-muted)'},
    {title:'USB (External)',items:disks?.usb||[],color:'var(--text-muted)'},
  ].filter(c=>c.items.length>0);

  return (<div>
    <div className={styles.sectionHeader}><h3>Physical Disks ({allDisks.length})</h3></div>
    {cats.map(cat=>(<div key={cat.title}>
      <div style={{color:'var(--text-muted)',fontSize:'var(--text-sm)',margin:'16px 0 8px',fontWeight:600}}>{cat.title}</div>
      {cat.items.map((d,i)=><DiskItem key={i} disk={d} color={cat.color} onWipe={d=>setWipeConfirm(d)}/>)}
    </div>))}

    {wipeConfirm&&(
      <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
        <div style={{background:'var(--surface-glass,#1a1a2e)',borderRadius:12,padding:32,maxWidth:480,width:'90%',border:'1px solid rgba(251,191,36,0.3)'}}>
          <h3 style={{color:'#fbbf24',marginBottom:12}}>⚠ Wipe Disk</h3>
          <p style={{color:'var(--text-muted)',marginBottom:8}}>This will remove all partitions, RAID superblocks, and LVM metadata from:</p>
          <p style={{color:'var(--text-primary)',fontWeight:600,marginBottom:16}}>{wipeConfirm.path} — {wipeConfirm.model} ({wipeConfirm.sizeFormatted})</p>
          <p style={{color:'var(--text-muted)',marginBottom:4,fontSize:'var(--text-sm)'}}>Type <strong style={{color:'var(--text-primary)'}}>{wipeConfirm.name.replace('/dev/','')}</strong> to confirm:</p>
          {wipeError&&<p style={{color:'#f87171',fontSize:'var(--text-sm)',marginBottom:8}}>{wipeError}</p>}
          <input type="text" value={wipeInput} onChange={e=>setWipeInput(e.target.value)} autoFocus placeholder={wipeConfirm.name.replace('/dev/','')}
            style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.3)',color:'var(--text-primary)',fontSize:'var(--text-sm)',marginBottom:16,boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:12,justifyContent:'flex-end'}}>
            <button className={styles.btn} onClick={()=>{setWipeConfirm(null);setWipeInput('');setWipeError('');}}>Cancel</button>
            <button className={styles.btnPrimary} onClick={doWipe} disabled={wipeInput!==wipeConfirm.name.replace('/dev/','')||wiping}
              style={{background:wipeInput===wipeConfirm.name.replace('/dev/','')?'#d97706':'rgba(217,119,6,0.3)'}}>
              {wiping?'Wiping...':'Wipe Disk'}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>);
}

function PoolsPage({pools, token, onRefresh}) {
  const [destroyConfirm, setDestroyConfirm] = useState(null);
  const [destroyInput, setDestroyInput] = useState('');
  const [destroying, setDestroying] = useState(false);
  const [destroyError, setDestroyError] = useState('');

  const doDestroy = async () => {
    if (destroyInput !== destroyConfirm.name) { setDestroyError('Type the pool name to confirm'); return; }
    setDestroying(true); setDestroyError('');
    try {
      const res = await fetch('/api/storage/pool/destroy', {
        method: 'POST',
        headers: {'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body: JSON.stringify({name: destroyConfirm.name})
      });
      const data = await res.json();
      if (data.error) setDestroyError(data.error);
      else { setDestroyConfirm(null); setDestroyInput(''); if (onRefresh) onRefresh(); }
    } catch { setDestroyError('Destroy failed'); }
    setDestroying(false);
  };

  if (!pools.length) return <div style={{color:'var(--text-muted)',padding:20}}>No pools created yet.</div>;
  return (<div>
    <div className={styles.sectionHeader}><h3>Storage Pools ({pools.length})</h3></div>
    {pools.map(p=>(
      <PoolCard key={p.name} pool={p} onDestroy={p=>{setDestroyConfirm(p);setDestroyInput('');setDestroyError('');}}/>
    ))}

    {destroyConfirm&&(
      <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
        <div style={{background:'var(--surface-glass,#1a1a2e)',borderRadius:12,padding:32,maxWidth:480,width:'90%',border:'1px solid rgba(239,68,68,0.3)'}}>
          <h3 style={{color:'#f87171',marginBottom:12}}>⚠ Destroy Pool</h3>
          <p style={{color:'var(--text-muted)',marginBottom:8}}>This will permanently destroy pool <strong style={{color:'var(--text-primary)'}}>{destroyConfirm.name}</strong>, unmount it, and remove the RAID array. All data will be lost.</p>
          <p style={{color:'var(--text-muted)',marginBottom:4,fontSize:'var(--text-sm)'}}>Type <strong style={{color:'var(--text-primary)'}}>{destroyConfirm.name}</strong> to confirm:</p>
          {destroyError&&<p style={{color:'#f87171',fontSize:'var(--text-sm)',marginBottom:8}}>{destroyError}</p>}
          <input type="text" value={destroyInput} onChange={e=>setDestroyInput(e.target.value)} autoFocus placeholder={destroyConfirm.name}
            style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.3)',color:'var(--text-primary)',fontSize:'var(--text-sm)',marginBottom:16,boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:12,justifyContent:'flex-end'}}>
            <button className={styles.btn} onClick={()=>setDestroyConfirm(null)}>Cancel</button>
            <button className={styles.btnPrimary} onClick={doDestroy} disabled={destroyInput!==destroyConfirm.name||destroying}
              style={{background:destroyInput===destroyConfirm.name?'#dc2626':'rgba(220,38,38,0.3)'}}>
              {destroying?'Destroying...':'Destroy Pool'}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>);
}

function SmartPage({allDisks}) {
  return (<div>
    <div className={styles.sectionHeader}><h3>SMART Health</h3></div>
    {allDisks.map((d,i)=>(
      <div key={i} className={styles.diskItem}>
        <div className={styles.diskIcon} style={{background:d.smart==='PASSED'?'rgba(34,197,94,0.1)':d.smart==='FAILED'?'rgba(239,68,68,0.1)':'rgba(100,100,100,0.1)',color:d.smart==='PASSED'?'var(--accent-green)':d.smart==='FAILED'?'#f87171':'var(--text-muted)'}}>
          {d.smart==='PASSED'?<CheckCircleIcon size={22}/>:d.smart==='FAILED'?<XCircleIcon size={22}/>:<ActivityIcon size={22}/>}
        </div>
        <div className={styles.diskInfo}>
          <div className={styles.diskName}>{d.path} — {d.model}</div>
          <div className={styles.diskDetail}>{d.sizeFormatted}{d.temperature?` · ${d.temperature}°C`:''}{d.serial?` · ${d.serial}`:''}</div>
        </div>
        <div className={styles.statusBadge} style={{color:d.smart==='PASSED'?'var(--accent-green)':d.smart==='FAILED'?'#f87171':'var(--text-muted)'}}>{d.smart||'N/A'}</div>
      </div>
    ))}
  </div>);
}

function CreatePoolPage({disks, token, onCreated}) {
  const [selectedDisks, setSelectedDisks] = useState([]);
  const [raidLevel, setRaidLevel] = useState('5');
  const [poolName, setPoolName] = useState('');
  const [filesystem, setFilesystem] = useState('ext4');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const eligible = disks?.eligible||[];
  const toggle = p => setSelectedDisks(prev=>prev.includes(p)?prev.filter(d=>d!==p):[...prev,p]);

  const raidOpts = [
    {v:'1',label:'RAID 1 (Mirror)',min:2,desc:'1 disk can fail. 50% usable.'},
    {v:'5',label:'RAID 5 (Parity)',min:3,desc:'1 disk can fail. (N-1)/N usable. Recommended.'},
    {v:'6',label:'RAID 6 (Double Parity)',min:4,desc:'2 disks can fail. (N-2)/N usable.'},
    {v:'10',label:'RAID 10 (Stripe+Mirror)',min:4,desc:'1 per mirror. 50% usable. Even disks.'},
    {v:'0',label:'RAID 0 — NO REDUNDANCY',min:2,desc:'ANY failure = TOTAL loss.'},
  ];
  const validRaid = raidOpts.filter(r=>selectedDisks.length>=r.min&&(r.v!=='10'||selectedDisks.length%2===0));

  const handleCreateClick = () => {
    if(!poolName.trim()){setError('Enter a pool name');return;}
    if(!/^[a-zA-Z0-9-]{1,32}$/.test(poolName)){setError('Alphanumeric + hyphens, max 32 chars');return;}
    setError('');
    setConfirmText('');
    setShowConfirm(true);
  };

  const confirmAndCreate = async()=>{
    if(confirmText !== poolName){setError('Type the pool name exactly to confirm');return;}
    setCreating(true);setError('');setShowConfirm(false);
    try{
      const res = await fetch(`${API}/api/storage/pool`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body:JSON.stringify({name:poolName,disks:selectedDisks,level:selectedDisks.length===1?'0':raidLevel,filesystem})});
      const data = await res.json();
      if(data.error){setError(data.error);}
      else{setSuccess(`Pool "${poolName}" created!${data.isFirstPool?' All features unlocked.':''}`);setTimeout(onCreated,2000);}
    }catch{setError('Failed to create pool');}
    setCreating(false);
  };

  const hasDataDisks = selectedDisks.some(p => {
    const d = eligible.find(e => e.path === p);
    return d && d.hasExistingData;
  });

  return (<div>
    <div className={styles.sectionHeader}><h3>Create Storage Pool</h3></div>
    {success&&<div className={styles.alertBanner} style={{background:'rgba(34,197,94,0.15)',color:'#4ade80'}}><CheckCircleIcon size={16}/> {success}</div>}
    {error&&<div className={styles.alertBanner} style={{background:'rgba(239,68,68,0.15)',color:'#f87171'}}>{error}</div>}

    <div className={styles.raidCard}>
      <div className={styles.raidTitle}>Step 1: Select Disks</div>
      <p style={{color:'var(--text-muted)',fontSize:'var(--text-sm)',margin:'8px 0 16px'}}>All data on selected disks will be permanently destroyed.</p>
      {eligible.length===0
        ?<p style={{color:'#f87171'}}>No eligible disks. Connect HDD or SSD drives.</p>
        :eligible.map((d,i)=>(
          <div key={i} className={styles.diskItem} onClick={()=>toggle(d.path)}
            style={{cursor:'pointer',border:selectedDisks.includes(d.path)?'1px solid var(--accent)':'1px solid transparent',borderRadius:8}}>
            <input type="checkbox" checked={selectedDisks.includes(d.path)} readOnly style={{marginRight:12}}/>
            <div className={styles.diskInfo}>
              <div className={styles.diskName}>{d.path} — {d.model} {d.isBoot?'🖥 Boot':''}</div>
              <div className={styles.diskDetail}>{d.isBoot?`${d.availableSpaceFormatted} available (of ${d.sizeFormatted})`:d.sizeFormatted} · {d.classification==='hdd'?'HDD':'SSD'}{d.hasExistingData?' · ⚠ HAS DATA':''}</div>
            </div>
            <div className={styles.statusBadge}>{d.smart==='PASSED'?<><CheckCircleIcon size={14} style={{color:'var(--accent-green)'}}/> OK</>:'—'}</div>
          </div>
        ))}
    </div>

    {selectedDisks.length>=2&&(
      <div className={styles.raidCard}>
        <div className={styles.raidTitle}>Step 2: RAID Level</div>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:12}}>
          {raidOpts.map(o=>{
            const ok=validRaid.find(v=>v.v===o.v);
            return(<label key={o.v} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,
              background:raidLevel===o.v?'rgba(124,58,237,0.1)':'transparent',border:raidLevel===o.v?'1px solid var(--accent)':'1px solid transparent',
              opacity:ok?1:0.4,cursor:ok?'pointer':'not-allowed'}}>
              <input type="radio" name="raid" value={o.v} checked={raidLevel===o.v} disabled={!ok} onChange={e=>setRaidLevel(e.target.value)}/>
              <div><div style={{fontWeight:600,color:o.v==='0'?'#f87171':'var(--text-primary)'}}>{o.label}</div>
              <div style={{fontSize:'var(--text-xs)',color:'var(--text-muted)'}}>{o.desc} (Min {o.min} disks)</div></div>
            </label>);
          })}
        </div>
      </div>
    )}

    {selectedDisks.length>=1&&(
      <div className={styles.raidCard}>
        <div className={styles.raidTitle}>Step {selectedDisks.length>=2?'3':'2'}: Name & Create</div>
        <div style={{display:'flex',gap:12,marginTop:12,flexWrap:'wrap',alignItems:'center'}}>
          <input type="text" placeholder="Pool name (e.g. storage)" value={poolName}
            onChange={e=>setPoolName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}
            style={{flex:1,minWidth:200,padding:'8px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.2)',color:'var(--text-primary)',fontSize:'var(--text-sm)'}}/>
          <select value={filesystem} onChange={e=>setFilesystem(e.target.value)}
            style={{padding:'8px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.2)',color:'var(--text-primary)'}}>
            <option value="ext4">ext4 (Recommended)</option><option value="xfs">XFS (Large files)</option>
          </select>
          <button className={styles.btnPrimary} onClick={handleCreateClick} disabled={creating||!poolName.trim()}>
            {creating?'Creating...':'Create Pool'}
          </button>
        </div>
        {selectedDisks.length===1&&<p style={{color:'#fbbf24',fontSize:'var(--text-xs)',marginTop:8}}>Single disk — no redundancy. Data lost if disk fails.</p>}
        {raidLevel==='0'&&selectedDisks.length>=2&&<p style={{color:'#f87171',fontSize:'var(--text-xs)',marginTop:8,fontWeight:600}}>WARNING: RAID 0 — ANY disk failure = TOTAL data loss.</p>}
      </div>
    )}

    {/* Confirmation dialog */}
    {showConfirm&&(
      <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
        <div style={{background:'var(--surface-glass,#1a1a2e)',borderRadius:12,padding:32,maxWidth:480,width:'90%',border:'1px solid rgba(239,68,68,0.3)'}}>
          <h3 style={{color:'#f87171',marginBottom:12}}>⚠ Confirm Data Destruction</h3>
          <p style={{color:'var(--text-muted)',marginBottom:8}}>
            This will <strong style={{color:'#f87171'}}>permanently destroy ALL data</strong> on the following disks:
          </p>
          <ul style={{color:'var(--text-primary)',marginBottom:16,paddingLeft:20}}>
            {selectedDisks.map(d=>{
              const disk=eligible.find(e=>e.path===d);
              return <li key={d}>{d} — {disk?.model||'Unknown'} ({disk?.sizeFormatted||'?'}){disk?.hasExistingData?' ⚠ HAS DATA':''}</li>;
            })}
          </ul>
          <p style={{color:'var(--text-muted)',marginBottom:4}}>
            Pool: <strong>{poolName}</strong> · {selectedDisks.length===1?'Single disk':raidOpts.find(r=>r.v===raidLevel)?.label||'RAID '+raidLevel} · {filesystem}
          </p>
          <p style={{color:'var(--text-muted)',marginBottom:16,fontSize:'var(--text-sm)'}}>
            Type <strong style={{color:'var(--text-primary)'}}>{poolName}</strong> to confirm:
          </p>
          <input type="text" value={confirmText} onChange={e=>setConfirmText(e.target.value)} placeholder={poolName}
            autoFocus
            style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.3)',color:'var(--text-primary)',fontSize:'var(--text-sm)',marginBottom:16,boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:12,justifyContent:'flex-end'}}>
            <button className={styles.btn} onClick={()=>{setShowConfirm(false);setConfirmText('');}}>Cancel</button>
            <button className={styles.btnPrimary} onClick={confirmAndCreate}
              disabled={confirmText!==poolName||creating}
              style={{background:confirmText===poolName?'#dc2626':'rgba(220,38,38,0.3)',opacity:confirmText===poolName?1:0.5}}>
              {creating?'Creating...':'Destroy Data & Create Pool'}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>);
}
