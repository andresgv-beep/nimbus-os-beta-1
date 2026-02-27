import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@context';
import styles from './MediaPlayer.module.css';

const MEDIA_EXTS = {
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'],
  video: ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv'],
};

function isMedia(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (MEDIA_EXTS.audio.includes(ext)) return 'audio';
  if (MEDIA_EXTS.video.includes(ext)) return 'video';
  return null;
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function MediaPlayer() {
  const { token } = useAuth();
  const [playlist, setPlaylist] = useState([]);
  const [playlistLoaded, setPlaylistLoaded] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [showBrowser, setShowBrowser] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('none'); // none, one, all

  const mediaRef = useRef(null);
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const current = playlist[currentIdx] || null;
  const isVideo = current?.type === 'video';
  
  // Load playlist from server on mount
  useEffect(() => {
    const loadPlaylist = async () => {
      if (!token) {
        setPlaylistLoaded(true);
        return;
      }
      
      try {
        const res = await fetch('/api/user/playlist', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.playlist && Array.isArray(data.playlist)) {
          console.log('[MediaPlayer] Loaded playlist:', data.playlist.length, 'items');
          setPlaylist(data.playlist);
        }
      } catch (err) {
        console.error('[MediaPlayer] Failed to load playlist:', err.message);
      }
      
      setPlaylistLoaded(true);
    };
    
    loadPlaylist();
  }, [token]);
  
  // Save playlist to server (debounced)
  const savePlaylistToServer = useCallback((newPlaylist) => {
    if (!token) return;
    
    // Clear pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce by 2 seconds
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch('/api/user/playlist', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ playlist: newPlaylist })
        });
        console.log('[MediaPlayer] Saved playlist:', newPlaylist.length, 'items');
      } catch (err) {
        console.error('[MediaPlayer] Failed to save playlist:', err.message);
      }
    }, 2000);
  }, [token]);
  
  // Wrapper for setPlaylist that also saves to server
  const updatePlaylist = useCallback((updater) => {
    setPlaylist(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      savePlaylistToServer(next);
      return next;
    });
  }, [savePlaylistToServer]);

  // Setup audio context + analyser
  const setupAnalyser = useCallback(() => {
    const el = mediaRef.current;
    if (!el || audioCtxRef.current) return;

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaElementSource(el);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch {}
  }, []);

  // Cache accent color — parsed once, refreshed only when accent changes
  const accentRgbRef = useRef([233, 84, 32]);
  const accentRawRef = useRef('');

  const refreshAccentColor = useCallback(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#E95420';
    if (accent === accentRawRef.current) return; // no change
    accentRawRef.current = accent;
    // Parse hex directly — avoids DOM injection
    const hex = accent.replace('#', '');
    if (hex.length === 6) {
      accentRgbRef.current = [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }, []);

  // Draw visualizer
  const drawVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return; // don't loop if not ready

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width = canvas.offsetWidth * dpr;
    const h = canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, cw, ch);

    // Use cached RGB — refresh only when CSS var changes (cheap check)
    refreshAccentColor();
    const rgb = accentRgbRef.current;

    // Draw bars centered
    const barCount = 64;
    const totalGap = barCount - 1;
    const gap = 3;
    const totalBarsWidth = cw * 0.9;
    const barWidth = (totalBarsWidth - totalGap * gap) / barCount;
    const startX = (cw - totalBarsWidth) / 2;
    const step = Math.floor(bufferLength / barCount);
    const centerY = ch * 0.55;

    for (let i = 0; i < barCount; i++) {
      const val = dataArray[i * step] / 255;
      const barH = val * centerY * 0.85;
      const x = startX + i * (barWidth + gap);

      // Main bar going up from center
      const alpha = 0.3 + val * 0.7;
      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, centerY - barH, barWidth, barH, 2);
      ctx.fill();

      // Mirror reflection going down
      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha * 0.15})`;
      ctx.beginPath();
      ctx.roundRect(x, centerY + 2, barWidth, barH * 0.35, 2);
      ctx.fill();
    }

    animRef.current = requestAnimationFrame(drawVisualizer);
  }, []);

  useEffect(() => {
    if (playing && !isVideo) {
      drawVisualizer();
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, isVideo, drawVisualizer]);

  // Play track
  const playTrack = (idx) => {
    if (idx < 0 || idx >= playlist.length) return;
    setCurrentIdx(idx);
    setTimeout(() => {
      const el = mediaRef.current;
      if (el) {
        el.src = playlist[idx].url;
        el.load();
        if (!isVideo) setupAnalyser();
        el.play().then(() => {
          setPlaying(true);
        }).catch(() => {});
      }
    }, 50);
  };

  // Play/pause
  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      if (!el.src && playlist.length > 0) {
        playTrack(0);
      } else {
        if (!isVideo) setupAnalyser();
        el.play().then(() => {
          setPlaying(true);
        }).catch(() => {});
      }
    }
  };

  // Next / Prev
  const next = () => {
    if (playlist.length === 0) return;
    if (shuffle) {
      playTrack(Math.floor(Math.random() * playlist.length));
    } else {
      const nxt = currentIdx + 1;
      if (nxt < playlist.length) playTrack(nxt);
      else if (repeat === 'all') playTrack(0);
    }
  };

  const prev = () => {
    if (playlist.length === 0) return;
    const el = mediaRef.current;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      return;
    }
    if (currentIdx > 0) playTrack(currentIdx - 1);
    else if (repeat === 'all') playTrack(playlist.length - 1);
  };

  // Time update
  const onTimeUpdate = () => {
    const el = mediaRef.current;
    if (el) {
      setCurrentTime(el.currentTime);
      setDuration(el.duration || 0);
    }
  };

  // Track ended
  const onEnded = () => {
    if (repeat === 'one') {
      const el = mediaRef.current;
      if (el) { el.currentTime = 0; el.play(); }
    } else {
      next();
    }
  };

  // Seek
  const handleSeek = (e) => {
    const el = mediaRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    el.currentTime = pct * duration;
  };

  // Volume
  useEffect(() => {
    const el = mediaRef.current;
    if (el) el.volume = volume;
  }, [volume]);

  // Add files to playlist
  const addFiles = (files) => {
    updatePlaylist(prev => [...prev, ...files]);
    if (currentIdx === -1 && files.length > 0) {
      setTimeout(() => playTrack(playlist.length), 50);
    }
  };

  const removeTrack = (idx) => {
    updatePlaylist(prev => prev.filter((_, i) => i !== idx));
    if (idx === currentIdx) {
      if (playlist.length > 1) playTrack(Math.min(idx, playlist.length - 2));
      else { setCurrentIdx(-1); setPlaying(false); }
    } else if (idx < currentIdx) {
      setCurrentIdx(prev => prev - 1);
    }
  };

  const clearPlaylist = () => {
    updatePlaylist([]);
    setCurrentIdx(-1);
    setPlaying(false);
    const el = mediaRef.current;
    if (el) { el.pause(); el.src = ''; }
  };

  const cycleRepeat = () => {
    setRepeat(r => r === 'none' ? 'all' : r === 'all' ? 'one' : 'none');
  };

  return (
    <div className={styles.layout}>
      {/* Playlist Sidebar */}
      <div className={styles.playlist}>
        <div className={styles.plHeader}>
          <span className={styles.plTitle}>Playlist</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className={styles.plBtn} onClick={() => setShowBrowser(true)}>+ Add</button>
            <button className={styles.plBtn} onClick={clearPlaylist}>Clear</button>
          </div>
        </div>
        <div className={styles.plList}>
          {playlist.length === 0 && (
            <div className={styles.plEmpty}>
              No tracks yet<br/>
              <button className={styles.plBtn} style={{ marginTop: '8px' }} onClick={() => setShowBrowser(true)}>
                Browse Files
              </button>
            </div>
          )}
          {playlist.map((track, i) => (
            <div key={i}
              className={`${styles.plItem} ${i === currentIdx ? styles.plItemActive : ''}`}
              onClick={() => playTrack(i)}
            >
              <span className={`${styles.plIdx} ${i === currentIdx && playing ? styles.plItemPlaying : ''}`}>
                {i === currentIdx && playing ? '▶' : i + 1}
              </span>
              <div className={styles.plItemInfo}>
                <div className={styles.plItemName}>{track.name}</div>
                <div className={styles.plItemMeta}>{track.type}</div>
              </div>
              <button className={styles.plRemove} onClick={(e) => { e.stopPropagation(); removeTrack(i); }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className={styles.main}>
        {/* Display area */}
        {isVideo ? (
          <div className={styles.videoWrap}>
            <video
              ref={mediaRef}
              className={styles.video}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
              onLoadedMetadata={onTimeUpdate}
            />
          </div>
        ) : (
          <div className={styles.visualizer}>
            <canvas ref={canvasRef} className={styles.vizCanvas} />
            <div className={styles.vizInfo}>
              <div className={styles.vizAlbumArt}>♪</div>
              <div className={styles.vizTitle}>{current?.name || 'No track selected'}</div>
              <div className={styles.vizSubtitle}>
                {current ? `${current.share} — ${current.type}` : 'Add files to start playing'}
              </div>
            </div>
            {/* Hidden audio element */}
            <audio
              ref={isVideo ? undefined : mediaRef}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
              onLoadedMetadata={onTimeUpdate}
              crossOrigin="anonymous"
              preload="auto"
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* Controls */}
        <div className={styles.controls}>
          {/* Progress */}
          <div className={styles.progressRow}>
            <span className={styles.timeLabel}>{formatTime(currentTime)}</span>
            <div className={styles.progressBar} onClick={handleSeek}>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
              </div>
            </div>
            <span className={styles.timeLabel}>{formatTime(duration)}</span>
          </div>

          {/* Buttons */}
          <div className={styles.controlRow}>
            <div className={styles.controlGroup}>
              <button className={styles.ctrlBtn}
                onClick={() => setShuffle(!shuffle)}
                style={{ color: shuffle ? 'var(--accent)' : undefined }}
                title="Shuffle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                  <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                  <line x1="4" y1="4" x2="9" y2="9"/>
                </svg>
              </button>
              <button className={styles.ctrlBtn}
                onClick={cycleRepeat}
                style={{ color: repeat !== 'none' ? 'var(--accent)' : undefined }}
                title={`Repeat: ${repeat}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
                {repeat === 'one' && <span style={{ fontSize: '9px', position: 'absolute', fontWeight: 700 }}>1</span>}
              </button>
            </div>

            <div className={styles.controlGroup}>
              <button className={styles.ctrlBtn} onClick={prev} title="Previous">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <rect x="3" y="5" width="3" height="14" rx="1"/>
                  <polygon points="21,5 9,12 21,19"/>
                </svg>
              </button>
              <button className={styles.ctrlBtnPlay} onClick={togglePlay}>
                {playing ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="none">
                    <rect x="6" y="4" width="4" height="16" rx="1"/>
                    <rect x="14" y="4" width="4" height="16" rx="1"/>
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="none">
                    <polygon points="6,3 21,12 6,21"/>
                  </svg>
                )}
              </button>
              <button className={styles.ctrlBtn} onClick={next} title="Next">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <rect x="18" y="5" width="3" height="14" rx="1"/>
                  <polygon points="3,5 15,12 3,19"/>
                </svg>
              </button>
            </div>

            <div className={styles.volumeWrap}>
              <button className={styles.ctrlBtn} onClick={() => setVolume(v => v > 0 ? 0 : 0.8)} title="Mute">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/>
                  {volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}
                  {volume > 0.4 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>}
                  {volume === 0 && <><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>}
                </svg>
              </button>
              <input
                type="range" min="0" max="1" step="0.01"
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className={styles.volumeSlider}
              />
            </div>
          </div>
        </div>
      </div>

      {/* File Browser */}
      {showBrowser && createPortal(
        <MediaBrowser
          token={token}
          onAdd={(files) => { addFiles(files); setShowBrowser(false); }}
          onClose={() => setShowBrowser(false)}
        />,
        document.body
      )}
    </div>
  );
}

/* ═══════════════════════════════════
   Media File Browser
   ═══════════════════════════════════ */
function MediaBrowser({ token, onAdd, onClose }) {
  const [shares, setShares] = useState([]);
  const [currentShare, setCurrentShare] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const headers = { 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    fetch('/api/files', { headers })
      .then(r => r.json())
      .then(d => { if (d.shares) setShares(d.shares); });
  }, [token]);

  useEffect(() => {
    if (!currentShare) return;
    fetch(`/api/files?share=${currentShare}&path=${encodeURIComponent(currentPath)}`, { headers })
      .then(r => r.json())
      .then(d => { if (d.files) setFiles(d.files); setSelected(new Set()); });
  }, [currentShare, currentPath, token]);

  const goUp = () => {
    if (currentPath !== '/') {
      setCurrentPath(currentPath.split('/').slice(0, -1).join('/') || '/');
    } else {
      setCurrentShare(null);
    }
  };

  const toggleSelect = (name) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };

  const addSelected = () => {
    const items = files.filter(f => selected.has(f.name) && !f.isDirectory).map(f => {
      const fullPath = currentPath === '/' ? `/${f.name}` : `${currentPath}/${f.name}`;
      return {
        name: f.name,
        type: isMedia(f.name),
        share: currentShare,
        path: fullPath,
        url: `/api/files/download?share=${currentShare}&path=${encodeURIComponent(fullPath)}&token=${token}`,
      };
    }).filter(f => f.type);
    onAdd(items);
  };

  const addAll = () => {
    const items = files.filter(f => !f.isDirectory && isMedia(f.name)).map(f => {
      const fullPath = currentPath === '/' ? `/${f.name}` : `${currentPath}/${f.name}`;
      return {
        name: f.name,
        type: isMedia(f.name),
        share: currentShare,
        path: fullPath,
        url: `/api/files/download?share=${currentShare}&path=${encodeURIComponent(fullPath)}&token=${token}`,
      };
    });
    onAdd(items);
  };

  const mediaCount = files.filter(f => !f.isDirectory && isMedia(f.name)).length;
  const pathLabel = currentShare ? `${currentShare}:${currentPath}` : 'Select a shared folder';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>Add Media</div>
        <div className={styles.modalPath}>{pathLabel}</div>

        <div className={styles.fileList}>
          {!currentShare && shares.map(s => (
            <div key={s.name} className={styles.fileListItem}
              onDoubleClick={() => { setCurrentShare(s.name); setCurrentPath('/'); }}>
              <span className={styles.fileListIcon}>📁</span>
              {s.displayName || s.name}
            </div>
          ))}

          {currentShare && (
            <div className={styles.fileListItem} onClick={goUp}>
              <span className={styles.fileListIcon}>⬆</span> ..
            </div>
          )}

          {currentShare && files.map(f => {
            const mediaType = isMedia(f.name);
            const clickable = f.isDirectory || mediaType;
            return (
              <div key={f.name}
                className={`${styles.fileListItem} ${selected.has(f.name) ? styles.fileListItemActive : ''}`}
                style={{ opacity: clickable ? 1 : 0.35 }}
                onClick={() => {
                  if (f.isDirectory) {
                    const newPath = currentPath === '/' ? `/${f.name}` : `${currentPath}/${f.name}`;
                    setCurrentPath(newPath);
                  } else if (mediaType) {
                    toggleSelect(f.name);
                  }
                }}
              >
                <span className={styles.fileListIcon}>
                  {f.isDirectory ? '📁' : mediaType === 'audio' ? '🎵' : mediaType === 'video' ? '🎬' : '📄'}
                </span>
                {f.name}
              </div>
            );
          })}
        </div>

        <div className={styles.modalActions}>
          {currentShare && mediaCount > 0 && (
            <button className={styles.btnCancel} onClick={addAll}>Add All ({mediaCount})</button>
          )}
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={addSelected} disabled={selected.size === 0}>
            Add {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
