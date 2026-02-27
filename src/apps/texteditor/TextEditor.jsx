import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@context';
import styles from './TextEditor.module.css';

export default function TextEditor() {
  const { token } = useAuth();
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [fileName, setFileName] = useState('untitled.txt');
  const [filePath, setFilePath] = useState(null); // { share, path }
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [showOpen, setShowOpen] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const editorRef = useRef(null);
  const lineNumRef = useRef(null);

  const headers = { 'Authorization': `Bearer ${token}` };
  const edited = content !== originalContent;

  // Line count
  const lines = content.split('\n');
  const lineCount = lines.length;

  // Sync scroll between line numbers and editor
  const handleScroll = () => {
    if (lineNumRef.current && editorRef.current) {
      lineNumRef.current.scrollTop = editorRef.current.scrollTop;
    }
  };

  // Update cursor position
  const updateCursor = () => {
    const ta = editorRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const text = ta.value.substring(0, pos);
    const line = text.split('\n').length;
    const lastNewline = text.lastIndexOf('\n');
    const col = pos - lastNewline;
    setCursorPos({ line, col });
  };

  // Handle tab key
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = editorRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      setContent(val.substring(0, start) + '  ' + val.substring(end));
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
    }
    // Ctrl+S save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
    // Ctrl+O open
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      setShowOpen(true);
    }
    // Ctrl+N new
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      handleNew();
    }
  };

  // New file
  const handleNew = () => {
    if (edited && !confirm('Discard unsaved changes?')) return;
    setContent('');
    setOriginalContent('');
    setFileName('untitled.txt');
    setFilePath(null);
  };

  // Save
  const handleSave = async () => {
    if (!filePath) {
      setShowSaveAs(true);
      return;
    }
    try {
      const blob = new Blob([content], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, fileName);
      formData.append('share', filePath.share);
      formData.append('path', filePath.dir);
      await fetch('/api/files/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      setOriginalContent(content);
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  };

  // Load file from backend
  const loadFile = async (share, path, name) => {
    try {
      const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;
      const res = await fetch(`/api/files/download?share=${share}&path=${encodeURIComponent(fullPath)}&token=${token}`);
      const text = await res.text();
      setContent(text);
      setOriginalContent(text);
      setFileName(name);
      setFilePath({ share, dir: path });
    } catch (err) {
      alert('Failed to load file');
    }
  };

  // Get file extension for language detection
  const getLanguage = () => {
    const ext = fileName.split('.').pop().toLowerCase();
    const langs = {
      js: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
      py: 'Python', sh: 'Shell', bash: 'Shell',
      html: 'HTML', htm: 'HTML', css: 'CSS', json: 'JSON',
      md: 'Markdown', yml: 'YAML', yaml: 'YAML', xml: 'XML',
      sql: 'SQL', c: 'C', cpp: 'C++', h: 'C Header',
      java: 'Java', rs: 'Rust', go: 'Go', rb: 'Ruby', php: 'PHP',
      txt: 'Plain Text', log: 'Log', csv: 'CSV',
      toml: 'TOML', ini: 'INI', conf: 'Config',
      dockerfile: 'Dockerfile', makefile: 'Makefile',
    };
    return langs[ext] || 'Plain Text';
  };

  const encoding = 'UTF-8';
  const language = getLanguage();

  return (
    <div className={styles.layout}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={handleNew}>New</button>
        <button className={styles.toolBtn} onClick={() => setShowOpen(true)}>Open</button>
        <button className={styles.toolBtn} onClick={handleSave} disabled={!edited && filePath}>Save</button>
        <button className={styles.toolBtn} onClick={() => setShowSaveAs(true)}>Save As</button>
        <div className={styles.separator} />
        <button className={styles.toolBtn} onClick={() => { editorRef.current?.focus(); document.execCommand('undo'); }}>Undo</button>
        <button className={styles.toolBtn} onClick={() => { editorRef.current?.focus(); document.execCommand('redo'); }}>Redo</button>
        <div className={styles.separator} />
        <span className={`${styles.fileName} ${edited ? styles.fileNameEdited : ''}`}>
          {fileName}
        </span>
      </div>

      {/* Editor */}
      <div className={styles.editorWrap}>
        <div className={styles.lineNumbers} ref={lineNumRef}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={editorRef}
          className={styles.editor}
          value={content}
          onChange={e => setContent(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onKeyUp={updateCursor}
          onClick={updateCursor}
          placeholder="Start typing or open a file..."
          spellCheck={false}
          autoFocus
        />
      </div>

      {/* Statusbar */}
      <div className={styles.statusbar}>
        <div className={styles.statusGroup}>
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>{lineCount} lines</span>
          <span>{content.length} chars</span>
        </div>
        <div className={styles.statusGroup}>
          <span>{language}</span>
          <span>{encoding}</span>
          <span>Spaces: 2</span>
        </div>
      </div>

      {/* Open File Browser */}
      {showOpen && createPortal(
        <FileBrowser
          token={token}
          mode="open"
          onSelect={(share, path, name) => { loadFile(share, path, name); setShowOpen(false); }}
          onClose={() => setShowOpen(false)}
        />,
        document.body
      )}

      {/* Save As Browser */}
      {showSaveAs && createPortal(
        <FileBrowser
          token={token}
          mode="save"
          defaultName={fileName}
          onSave={(share, path, name) => {
            setFilePath({ share, dir: path });
            setFileName(name);
            // Save with new path
            const blob = new Blob([content], { type: 'text/plain' });
            const formData = new FormData();
            formData.append('file', blob, name);
            formData.append('share', share);
            formData.append('path', path);
            fetch('/api/files/upload', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
              body: formData,
            }).then(() => {
              setOriginalContent(content);
            });
            setShowSaveAs(false);
          }}
          onClose={() => setShowSaveAs(false)}
        />,
        document.body
      )}
    </div>
  );
}

/* ═══════════════════════════════════
   File Browser (Open / Save As)
   ═══════════════════════════════════ */
function FileBrowser({ token, mode, defaultName, onSelect, onSave, onClose }) {
  const [shares, setShares] = useState([]);
  const [currentShare, setCurrentShare] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saveName, setSaveName] = useState(defaultName || 'untitled.txt');
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
      .then(d => { if (d.files) setFiles(d.files); setSelected(null); });
  }, [currentShare, currentPath, token]);

  const TEXT_EXTS = ['txt', 'md', 'log', 'json', 'xml', 'yml', 'yaml', 'ini', 'conf', 'cfg',
    'js', 'jsx', 'ts', 'tsx', 'py', 'sh', 'bash', 'css', 'html', 'htm',
    'c', 'cpp', 'h', 'java', 'rs', 'go', 'rb', 'php', 'sql', 'csv',
    'toml', 'env', 'gitignore', 'dockerfile', 'makefile'];

  const isText = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    return TEXT_EXTS.includes(ext);
  };

  const handleOpen = () => {
    if (!selected) return;
    const file = files.find(f => f.name === selected);
    if (file?.isDirectory) {
      const newPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      setCurrentPath(newPath);
    } else if (file) {
      onSelect(currentShare, currentPath, file.name);
    }
  };

  const handleSaveHere = () => {
    if (!saveName.trim() || !currentShare) return;
    onSave(currentShare, currentPath, saveName.trim());
  };

  const goUp = () => {
    if (currentPath !== '/') {
      const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
      setCurrentPath(parent);
    } else {
      setCurrentShare(null);
    }
  };

  const pathLabel = currentShare
    ? `${currentShare}:${currentPath}`
    : 'Select a shared folder';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalTitle}>{mode === 'save' ? 'Save As' : 'Open File'}</div>
        <div className={styles.modalPath}>{pathLabel}</div>

        <div className={styles.fileList}>
          {/* Show shares if no share selected */}
          {!currentShare && shares.map(s => (
            <div key={s.name} className={styles.fileListItem}
              onDoubleClick={() => { setCurrentShare(s.name); setCurrentPath('/'); }}>
              <span className={styles.fileListIcon}>📁</span>
              {s.displayName || s.name}
            </div>
          ))}

          {/* Back button */}
          {currentShare && (
            <div className={styles.fileListItem} onClick={goUp}>
              <span className={styles.fileListIcon}>⬆</span>
              ..
            </div>
          )}

          {/* Files */}
          {currentShare && files.map(f => {
            const selectable = f.isDirectory || (mode === 'open' ? isText(f.name) : true);
            return (
              <div key={f.name}
                className={`${styles.fileListItem} ${selected === f.name ? styles.fileListItemActive : ''}`}
                style={{ opacity: selectable ? 1 : 0.4 }}
                onClick={() => selectable && setSelected(f.name)}
                onDoubleClick={() => {
                  if (f.isDirectory) {
                    const newPath = currentPath === '/' ? `/${f.name}` : `${currentPath}/${f.name}`;
                    setCurrentPath(newPath);
                  } else if (mode === 'open' && isText(f.name)) {
                    onSelect(currentShare, currentPath, f.name);
                  }
                }}
              >
                <span className={styles.fileListIcon}>{f.isDirectory ? '📁' : '📄'}</span>
                {f.name}
              </div>
            );
          })}
        </div>

        {mode === 'save' && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <input
              style={{
                width: '100%', height: '34px', padding: '0 12px',
                fontSize: '13px', color: 'var(--text-primary)',
                background: 'var(--bg-sidebar)', border: '1px solid var(--border)',
                borderRadius: '6px', outline: 'none', boxSizing: 'border-box',
                fontFamily: 'var(--font-mono)',
              }}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveHere(); }}
              placeholder="filename.txt"
            />
          </div>
        )}

        <div className={styles.modalActions}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          {mode === 'open' ? (
            <button className={styles.btnPrimary} onClick={handleOpen} disabled={!selected}>Open</button>
          ) : (
            <button className={styles.btnPrimary} onClick={handleSaveHere} disabled={!currentShare}>Save</button>
          )}
        </div>
      </div>
    </div>
  );
}
