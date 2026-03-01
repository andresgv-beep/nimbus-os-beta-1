import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@context';
import { useContextMenu } from '@components/desktop/ContextMenu';
import { FolderIcon, FolderOutlineIcon } from '@icons';
import FileTypeIcon from '@icons/FileTypeIcon';
import { HomeIcon, TrashIcon, HardDriveIcon, UploadIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, RefreshIcon, DownloadIcon } from '@icons';
import Icon from '@icons';
import styles from './FileManager.module.css';

const VIEWS = [
  { id: 'list', label: 'List' },
  { id: 'small', label: 'Small icons' },
  { id: 'medium', label: 'Medium icons' },
  { id: 'large', label: 'Large icons' },
];

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + sizes[i];
}

function formatDate(iso) {
  if (!iso) return '—';
  return iso.split('T')[0];
}

export default function FileManager() {
  const { token } = useAuth();
  const [shares, setShares] = useState([]);
  const [currentShare, setCurrentShare] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [view, setView] = useState('medium');
  const [sortBy, setSortBy] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [clipboard, setClipboard] = useState(null); // { action: 'copy'|'cut', share, path, files: [] }
  const [renaming, setRenaming] = useState(null); // { file, newName }
  const [showProps, setShowProps] = useState(null); // file object
  const [preview, setPreview] = useState(null); // { file, url, type }
  const { show } = useContextMenu();

  const headers = { 'Authorization': `Bearer ${token}` };

  // Fetch shared folders
  const fetchShares = useCallback(async () => {
    try {
      const res = await fetch('/api/files', { headers });
      const data = await res.json();
      if (data.shares) setShares(data.shares);
    } catch {}
  }, [token]);

  useEffect(() => { fetchShares(); }, [fetchShares]);

  // Refresh shares periodically and on window focus
  useEffect(() => {
    const interval = setInterval(fetchShares, 30000);
    const onFocus = () => fetchShares();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [fetchShares]);

  // Fetch files when share or path changes
  const fetchFiles = useCallback(async () => {
    if (!currentShare) { setFiles([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/files?share=${currentShare}&path=${encodeURIComponent(currentPath)}`, { headers });
      const data = await res.json();
      if (data.files) setFiles(data.files);
      else if (data.error) setFiles([]);
    } catch { setFiles([]); }
    setLoading(false);
    setSelected(new Set());
  }, [currentShare, currentPath, token]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // Navigate into folder
  const navigate = (share, path) => {
    setHistory(prev => [...prev.slice(0, histIdx + 1), { share: currentShare, path: currentPath }]);
    setHistIdx(prev => prev + 1);
    setCurrentShare(share);
    setCurrentPath(path);
    setSearch('');
  };

  const goBack = () => {
    if (histIdx >= 0) {
      const prev = history[histIdx];
      setHistIdx(h => h - 1);
      setCurrentShare(prev.share);
      setCurrentPath(prev.path);
    } else if (currentPath !== '/') {
      const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
      setCurrentPath(parent);
    } else if (currentShare) {
      setCurrentShare(null);
      setCurrentPath('/');
    }
  };

  const goForward = () => {
    if (histIdx < history.length - 1) {
      const next = history[histIdx + 1];
      setHistIdx(h => h + 1);
      setCurrentShare(next.share);
      setCurrentPath(next.path);
    }
  };

  // File type detection
  const getFileType = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) return 'audio';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['txt', 'md', 'log', 'json', 'xml', 'yml', 'yaml', 'ini', 'conf', 'cfg',
         'js', 'jsx', 'ts', 'tsx', 'py', 'sh', 'bash', 'css', 'html', 'htm',
         'c', 'cpp', 'h', 'java', 'rs', 'go', 'rb', 'php', 'sql', 'csv',
         'toml', 'env', 'gitignore', 'dockerfile', 'makefile'].includes(ext)) return 'text';
    return null;
  };

  // Open item (double click)
  const openItem = (file) => {
    if (file.isDirectory) {
      const newPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      navigate(currentShare, newPath);
      return;
    }
    const type = getFileType(file.name);
    if (!type) return; // unknown type, do nothing
    const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    const url = `/api/files/download?share=${currentShare}&path=${encodeURIComponent(filePath)}&token=${token}`;
    setPreview({ file, url, type });
  };

  // Create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentShare) return;
    try {
      await fetch('/api/files/mkdir', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ share: currentShare, path: currentPath, name: newFolderName.trim() }),
      });
    } catch {}
    setShowNewFolder(false);
    setNewFolderName('');
    fetchFiles();
  };

  // Delete
  const handleDelete = async (file) => {
    const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    if (!confirm(`Delete "${file.name}"?`)) return;
    try {
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ share: currentShare, path: filePath }),
      });
    } catch {}
    fetchFiles();
  };

  // Upload files
  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = e.target.files;
      if (!files.length) return;
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('share', currentShare);
        formData.append('path', currentPath);
        try {
          await fetch('/api/files/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
          });
        } catch {}
      }
      fetchFiles();
    };
    input.click();
  };

  // Download file
  const handleDownload = () => {
    if (selected.size === 0) return;
    for (const idx of selected) {
      const file = sortedFiles[idx];
      if (!file || file.isDirectory) continue;
      const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      window.open(`/api/files/download?share=${currentShare}&path=${encodeURIComponent(filePath)}&token=${token}`, '_blank');
    }
  };

  // Rename
  const handleRename = async () => {
    if (!renaming || !renaming.newName.trim() || renaming.newName === renaming.file.name) {
      setRenaming(null);
      return;
    }
    const oldPath = currentPath === '/' ? `/${renaming.file.name}` : `${currentPath}/${renaming.file.name}`;
    const newPath = currentPath === '/' ? `/${renaming.newName.trim()}` : `${currentPath}/${renaming.newName.trim()}`;
    try {
      await fetch('/api/files/rename', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ share: currentShare, oldPath, newPath }),
      });
    } catch {}
    setRenaming(null);
    fetchFiles();
  };

  // Copy / Cut
  const handleCopy = (file) => {
    const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    setClipboard({ action: 'copy', share: currentShare, path: filePath, name: file.name });
  };

  const handleCut = (file) => {
    const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    setClipboard({ action: 'cut', share: currentShare, path: filePath, name: file.name });
  };

  // Paste
  const handlePaste = async () => {
    if (!clipboard) return;
    const destPath = currentPath === '/' ? `/${clipboard.name}` : `${currentPath}/${clipboard.name}`;
    try {
      await fetch('/api/files/paste', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srcShare: clipboard.share,
          srcPath: clipboard.path,
          destShare: currentShare,
          destPath,
          action: clipboard.action,
        }),
      });
    } catch {}
    if (clipboard.action === 'cut') setClipboard(null);
    fetchFiles();
  };

  // Sort + filter
  const sortedFiles = useMemo(() => {
    let f = [...files];
    if (search) f = f.filter(x => x.name.toLowerCase().includes(search.toLowerCase()));
    f.sort((a, b) => {
      if (sortBy === 'name') return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      if (sortBy === 'size') return sortAsc ? a.size - b.size : b.size - a.size;
      if (sortBy === 'modified') return sortAsc ? String(a.modified).localeCompare(String(b.modified)) : String(b.modified).localeCompare(String(a.modified));
      return 0;
    });
    f.sort((a, b) => (a.isDirectory ? -1 : 1) - (b.isDirectory ? -1 : 1));
    return f;
  }, [files, search, sortBy, sortAsc]);

  const toggleSelect = (i, e) => {
    if (e?.ctrlKey || e?.metaKey) {
      setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
    } else {
      setSelected(new Set([i]));
    }
  };

  // Get current share info
  const shareInfo = shares.find(s => s.name === currentShare);
  const canWrite = shareInfo?.permission === 'rw';

  // Context menus
  const fileCtx = (e, file, idx) => {
    e.preventDefault(); e.stopPropagation();
    toggleSelect(idx);
    const items = [];
    if (file.isDirectory) {
      items.push({ label: 'Open', action: () => openItem(file) });
    } else {
      items.push({ label: 'Download', action: () => {
        const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
        window.open(`/api/files/download?share=${currentShare}&path=${encodeURIComponent(filePath)}&token=${token}`, '_blank');
      }});
    }
    items.push({ divider: true });
    if (canWrite) {
      items.push({ label: 'Rename', shortcut: 'F2', action: () => setRenaming({ file, newName: file.name }) });
      items.push({ label: 'Copy', shortcut: 'Ctrl+C', action: () => handleCopy(file) });
      items.push({ label: 'Cut', shortcut: 'Ctrl+X', action: () => handleCut(file) });
      items.push({ divider: true });
      items.push({ label: 'Delete', danger: true, shortcut: 'Del', action: () => handleDelete(file) });
    } else {
      items.push({ label: 'Copy', shortcut: 'Ctrl+C', action: () => handleCopy(file) });
    }
    items.push({ divider: true });
    items.push({ label: 'Properties', action: () => setShowProps(file) });
    show(e.clientX, e.clientY, items);
  };

  const emptyCtx = (e) => {
    if (e.target.closest(`.${styles.fileItem}`) || e.target.closest(`.${styles.listRow}`)) return;
    e.preventDefault();
    const items = [];
    if (canWrite) {
      items.push({ label: 'New Folder', action: () => { setShowNewFolder(true); setNewFolderName(''); } });
      items.push({ label: 'Upload', action: handleUpload });
      if (clipboard) {
        items.push({ divider: true });
        items.push({ label: `Paste "${clipboard.name}"`, shortcut: 'Ctrl+V', action: handlePaste });
      }
    }
    items.push({ divider: true });
    items.push({ label: 'Refresh', action: fetchFiles });
    items.push({ label: 'Select All', shortcut: 'Ctrl+A', action: () => setSelected(new Set(sortedFiles.map((_, i) => i))) });
    show(e.clientX, e.clientY, items);
  };

  const viewMenu = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    show(rect.left, rect.bottom + 4, VIEWS.map(v => ({
      label: v.label,
      icon: view === v.id ? <Icon name="check" size={15} /> : null,
      action: () => setView(v.id),
    })));
  };

  // Path breadcrumbs
  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);

  // Icon sizes
  const iconSize = view === 'small' ? 48 : view === 'large' ? 80 : 64;
  const isGrid = view !== 'list';
  const gridCols = view === 'small' ? '110px' : view === 'large' ? '150px' : '130px';

  // ─── Shares root view ───
  if (!currentShare) {
    return (
      <div className={styles.layout}>
        <div className={styles.sidebar}>
          <div className={styles.sectionLabel}>Shared Folders</div>
          {shares.map(s => (
            <div key={s.name}
              className={styles.sidebarItem}
              onClick={() => navigate(s.name, '/')}
            >
              <span className={styles.sidebarIcon}><FolderOutlineIcon size={16} /></span>
              {s.displayName || s.name}
            </div>
          ))}
          {shares.length === 0 && (
            <div style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              No shared folders available. Ask admin to create folders in Control Panel.
            </div>
          )}
        </div>
        <div className={styles.main}>
          <div className={styles.toolbar}>
            <div className={styles.pathBar}>
              <span className={`${styles.pathSeg} ${styles.pathCurrent}`}>Shared Folders</span>
            </div>
          </div>
          <div className={styles.grid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(130px, 1fr))` }}>
            {shares.map(s => (
              <div key={s.name} className={styles.fileItem} onDoubleClick={() => navigate(s.name, '/')}>
                <div className={styles.fileIcon}><FolderIcon size={64} /></div>
                <div className={styles.fileName}>{s.displayName || s.name}</div>
                <div className={styles.fileMeta}>{s.permission === 'rw' ? 'Read/Write' : 'Read only'}</div>
              </div>
            ))}
            {shares.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 'var(--space-5)', color: 'var(--text-muted)' }}>
                No shared folders available
              </div>
            )}
          </div>
          <div className={styles.statusbar}>
            <span>{shares.length} shared folder{shares.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── File browser view ───
  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sectionLabel}>Shared Folders</div>
        {shares.map(s => (
          <div key={s.name}
            className={`${styles.sidebarItem} ${currentShare === s.name ? styles.active : ''}`}
            onClick={() => navigate(s.name, '/')}
          >
            <span className={styles.sidebarIcon}><FolderOutlineIcon size={16} /></span>
            {s.displayName || s.name}
          </div>
        ))}
      </div>

      <div className={styles.main}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <button className={styles.toolBtn} onClick={goBack}><ChevronLeftIcon size={16} /></button>
          <button className={styles.toolBtn} onClick={goForward}><ChevronRightIcon size={16} /></button>
          <div className={styles.pathBar}>
            <span className={styles.pathSeg} onClick={() => { setCurrentShare(null); setCurrentPath('/'); }} style={{ cursor: 'pointer' }}>
              Shares
            </span>
            <span className={styles.pathSep}>/</span>
            <span className={currentPath === '/' ? `${styles.pathSeg} ${styles.pathCurrent}` : styles.pathSeg}
              onClick={() => setCurrentPath('/')} style={{ cursor: 'pointer' }}>
              {shareInfo?.displayName || currentShare}
            </span>
            {pathParts.map((part, i) => (
              <span key={i}>
                <span className={styles.pathSep}>/</span>
                <span
                  className={i === pathParts.length - 1 ? `${styles.pathSeg} ${styles.pathCurrent}` : styles.pathSeg}
                  onClick={() => setCurrentPath('/' + pathParts.slice(0, i + 1).join('/'))}
                  style={{ cursor: 'pointer' }}
                >
                  {part}
                </span>
              </span>
            ))}
          </div>
          <div className={styles.searchBox}>
            <SearchIcon size={14} />
            <input className={styles.searchInput} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Toolbar 2 */}
        <div className={styles.toolbar2}>
          <div className={styles.actionGroup}>
            {canWrite && (
              <>
                <button className={styles.actionBtn} onClick={() => { setShowNewFolder(true); setNewFolderName(''); }}><PlusIcon size={14} /> New Folder</button>
                <button className={styles.actionBtn} onClick={handleUpload}><UploadIcon size={14} /> Upload</button>
              </>
            )}
            <button className={styles.actionBtn} onClick={handleDownload} disabled={selected.size === 0}><DownloadIcon size={14} /> Download</button>
            <button className={styles.actionBtn} onClick={fetchFiles}><RefreshIcon size={14} /> Refresh</button>
          </div>
          <div className={styles.viewGroup}>
            <button className={styles.viewBtn} onClick={viewMenu}>
              {view === 'list' ? '☰' : '▦'} ▾
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : isGrid ? (
          <div className={styles.grid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridCols}, 1fr))` }} onContextMenu={emptyCtx}>
            {sortedFiles.map((file, i) => (
              <div key={i}
                className={`${styles.fileItem} ${selected.has(i) ? styles.selected : ''}`}
                onClick={(e) => toggleSelect(i, e)}
                onDoubleClick={() => openItem(file)}
                onContextMenu={(e) => fileCtx(e, file, i)}
              >
                <div className={styles.fileIcon}>
                  {file.isDirectory ? <FolderIcon size={iconSize} /> : <FileTypeIcon filename={file.name} size={iconSize} />}
                </div>
                <div className={styles.fileName}>{file.name}</div>
              </div>
            ))}
            {sortedFiles.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 'var(--space-5)', color: 'var(--text-muted)' }}>
                {search ? 'No matches' : 'Empty folder'}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.listWrap} onContextMenu={emptyCtx}>
            <div className={styles.listHeader}>
              <span className={styles.listColName} onClick={() => { setSortBy('name'); setSortAsc(sortBy === 'name' ? !sortAsc : true); }}>
                Name {sortBy === 'name' && (sortAsc ? '↑' : '↓')}
              </span>
              <span className={styles.listCol} onClick={() => { setSortBy('size'); setSortAsc(sortBy === 'size' ? !sortAsc : true); }}>
                Size {sortBy === 'size' && (sortAsc ? '↑' : '↓')}
              </span>
              <span className={styles.listCol} onClick={() => { setSortBy('modified'); setSortAsc(sortBy === 'modified' ? !sortAsc : true); }}>
                Modified {sortBy === 'modified' && (sortAsc ? '↑' : '↓')}
              </span>
            </div>
            {sortedFiles.map((file, i) => (
              <div key={i}
                className={`${styles.listRow} ${selected.has(i) ? styles.listSelected : ''}`}
                onClick={(e) => toggleSelect(i, e)}
                onDoubleClick={() => openItem(file)}
                onContextMenu={(e) => fileCtx(e, file, i)}
              >
                <span className={styles.listColName}>
                  {file.isDirectory ? <FolderIcon size={20} /> : <FileTypeIcon filename={file.name} size={20} />}
                  {file.name}
                </span>
                <span className={styles.listCol}>{file.isDirectory ? '—' : formatSize(file.size)}</span>
                <span className={styles.listCol}>{formatDate(file.modified)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Statusbar */}
        <div className={styles.statusbar}>
          <span>{sortedFiles.length} items{selected.size > 0 ? ` · ${selected.size} selected` : ''}</span>
          <span>{canWrite ? 'Read/Write' : 'Read only'}</span>
        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolder && createPortal(
        <div className={styles.newFolderOverlay}>
          <div className={styles.newFolderModal}>
            <div className={styles.newFolderTitle}>New Folder</div>
            <input
              className={styles.newFolderInput}
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
              placeholder="Folder name"
              autoFocus
            />
            <div className={styles.newFolderActions}>
              <button className={styles.nfCancel} onClick={() => setShowNewFolder(false)}>Cancel</button>
              <button className={styles.nfCreate} onClick={handleCreateFolder}>Create</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Rename Modal */}
      {renaming && createPortal(
        <div className={styles.newFolderOverlay}>
          <div className={styles.newFolderModal}>
            <div className={styles.newFolderTitle}>Rename</div>
            <input
              className={styles.newFolderInput}
              value={renaming.newName}
              onChange={e => setRenaming({ ...renaming, newName: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(null); }}
              autoFocus
            />
            <div className={styles.newFolderActions}>
              <button className={styles.nfCancel} onClick={() => setRenaming(null)}>Cancel</button>
              <button className={styles.nfCreate} onClick={handleRename}>Rename</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Properties Modal */}
      {showProps && createPortal(
        <div className={styles.newFolderOverlay}>
          <div className={styles.newFolderModal}>
            <div className={styles.newFolderTitle}>Properties</div>
            <div className={styles.propsGrid}>
              <span className={styles.propsLabel}>Name</span>
              <span className={styles.propsValue}>{showProps.name}</span>
              <span className={styles.propsLabel}>Type</span>
              <span className={styles.propsValue}>{showProps.isDirectory ? 'Folder' : showProps.name.split('.').pop().toUpperCase() + ' File'}</span>
              <span className={styles.propsLabel}>Size</span>
              <span className={styles.propsValue}>{showProps.isDirectory ? '—' : formatSize(showProps.size)}</span>
              <span className={styles.propsLabel}>Modified</span>
              <span className={styles.propsValue}>{showProps.modified ? new Date(showProps.modified).toLocaleString() : '—'}</span>
              <span className={styles.propsLabel}>Location</span>
              <span className={styles.propsValue}>{currentShare}:{currentPath}</span>
              <span className={styles.propsLabel}>Permission</span>
              <span className={styles.propsValue}>{canWrite ? 'Read / Write' : 'Read only'}</span>
            </div>
            <div className={styles.newFolderActions}>
              <button className={styles.nfCreate} onClick={() => setShowProps(null)}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* File Preview Viewer */}
      {preview && createPortal(
        <FilePreview preview={preview} onClose={() => setPreview(null)} />,
        document.body
      )}
    </div>
  );
}

/* ═══════════════════════════════════
   File Preview Component
   ═══════════════════════════════════ */
function FilePreview({ preview, onClose }) {
  const { file, url, type } = preview;
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading] = useState(type === 'text');

  useEffect(() => {
    if (type === 'text') {
      setLoading(true);
      fetch(url)
        .then(r => r.text())
        .then(t => { setTextContent(t); setLoading(false); })
        .catch(() => { setTextContent('Error loading file'); setLoading(false); });
    }
  }, [url, type]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className={styles.previewOverlay} onClick={onClose}>
      <div className={`${styles.previewContainer} ${styles['preview_' + type]}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.previewHeader}>
          <span className={styles.previewTitle}>{file.name}</span>
          <div className={styles.previewActions}>
            <a href={url} download={file.name} className={styles.previewBtn} onClick={e => e.stopPropagation()}>
              ↓ Download
            </a>
            <button className={styles.previewClose} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Content */}
        <div className={styles.previewBody}>
          {type === 'image' && (
            <img src={url} alt={file.name} className={styles.previewImage} />
          )}

          {type === 'video' && (
            <video src={url} controls autoPlay className={styles.previewVideo}>
              Your browser does not support video playback.
            </video>
          )}

          {type === 'audio' && (
            <div className={styles.previewAudio}>
              <div className={styles.audioIcon}>♪</div>
              <div className={styles.audioName}>{file.name}</div>
              <audio src={url} controls autoPlay style={{ width: '100%', marginTop: '16px' }} />
            </div>
          )}

          {type === 'pdf' && (
            <iframe src={url} className={styles.previewPdf} title={file.name} />
          )}

          {type === 'text' && (
            loading ? (
              <div className={styles.previewTextLoading}>Loading...</div>
            ) : (
              <pre className={styles.previewText}>{textContent}</pre>
            )
          )}
        </div>
      </div>
    </div>
  );
}
