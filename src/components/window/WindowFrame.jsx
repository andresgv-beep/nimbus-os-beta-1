import { useCallback, useRef, useEffect, memo } from 'react';
import { useWindows } from '@context';
import { getAppMeta } from '@/apps';
import AppRenderer from '@apps/AppRenderer';
import styles from './WindowFrame.module.css';

const MemoAppRenderer = memo(AppRenderer);

export default function WindowFrame({ window: win }) {
  const { closeWindow, focusWindow, minimizeWindow, maximizeWindow, updateWindowPos, getWindowPos, windows } = useWindows();
  const meta = getAppMeta(win.appId);
  const frameRef = useRef(null);

  // Apply position from posRef to DOM — called whenever geometry may have changed
  const applyPos = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    const pos = getWindowPos(win.id);
    el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    el.style.width  = pos.width  + 'px';
    el.style.height = pos.height + 'px';
  }, [win.id, getWindowPos]);

  // Re-apply whenever maximize/restore/rev changes OR minimized→false (restore from taskbar)
  useEffect(() => {
    applyPos();
  }, [win.id, win.maximized, win._rev, win.minimized, applyPos]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e) => {
    if (e.button !== 0 || win.maximized) return;
    e.preventDefault();
    focusWindow(win.id);

    const el = frameRef.current;
    const pos = getWindowPos(win.id);
    const originX = e.clientX - pos.x;
    const originY = e.clientY - pos.y;

    el.classList.add(styles.dragging);

    const onMove = (ev) => {
      const nx = Math.max(0, ev.clientX - originX);
      const ny = Math.max(0, ev.clientY - originY);
      updateWindowPos(win.id, { x: nx, y: ny });
      el.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const onUp = () => {
      el.classList.remove(styles.dragging);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [win.id, win.maximized, focusWindow, updateWindowPos, getWindowPos]);

  // ── Resize ────────────────────────────────────────────────────────────────
  const onResizeStart = useCallback((direction) => (e) => {
    if (e.button !== 0 || win.maximized) return;
    e.preventDefault();
    e.stopPropagation();

    const el = frameRef.current;
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...getWindowPos(win.id) };

    el.classList.add(styles.dragging);

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let { x, y, width, height } = startRect;

      if (direction.includes('e')) width  = Math.max(320, width  + dx);
      if (direction.includes('s')) height = Math.max(200, height + dy);
      if (direction.includes('w')) {
        const nw = Math.max(320, width - dx);
        x = x + (width - nw);
        width = nw;
      }
      if (direction.includes('n')) {
        const nh = Math.max(200, height - dy);
        y = y + (height - nh);
        height = nh;
      }

      updateWindowPos(win.id, { x, y, width, height });
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.width  = width  + 'px';
      el.style.height = height + 'px';
    };
    const onUp = () => {
      el.classList.remove(styles.dragging);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [win.id, win.maximized, updateWindowPos, getWindowPos]);

  // ── Focus detection ───────────────────────────────────────────────────────
  const allWindows = Object.values(windows);
  const maxZ = allWindows.reduce((m, w) => (!w.minimized && w.zIndex > m ? w.zIndex : m), 0);
  const isFocused = win.zIndex === maxZ;

  // ── Render ────────────────────────────────────────────────────────────────
  // Keep component mounted when minimized so apps like MediaPlayer keep running.
  // Use visibility+pointerEvents instead of unmounting (return null).
  return (
    <div
      ref={frameRef}
      className={`${styles.window} ${isFocused && !win.minimized ? styles.focused : ''}`}
      data-no-ctx
      style={{
        zIndex: win.minimized ? -1 : win.zIndex,   // push behind everything when hidden
        ...(win.maximized && { borderRadius: 0 }),
        visibility: win.minimized ? 'hidden' : 'visible',
        pointerEvents: win.minimized ? 'none' : 'auto',
      }}
      onMouseDown={() => !win.minimized && focusWindow(win.id)}
    >
      <div
        className={styles.header}
        onMouseDown={onDragStart}
        onDoubleClick={() => maximizeWindow(win.id)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/window-id', win.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        <div className={styles.title}>
          {win.isWebApp && win.webAppPort && (
            <span 
              className={styles.btnExternal}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); window.open(`http://${window.location.hostname}:${win.webAppPort}`, '_blank'); }}
              title="Abrir en pestaña nueva"
            >↗</span>
          )}
          {win.webAppName || meta?.title || win.appId}
        </div>
        <div className={styles.controls}>
          <span className={styles.btnMinimize} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }}>−</span>
          <span className={styles.btnMaximize} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); maximizeWindow(win.id); }}>□</span>
          <span className={styles.btnClose}    onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); closeWindow(win.id); }}>✕</span>
        </div>
      </div>

      <div className={styles.body}>
        <MemoAppRenderer 
          appId={win.appId} 
          isWebApp={win.isWebApp}
          webAppPort={win.webAppPort}
          webAppName={win.webAppName}
        />
      </div>

      {!win.maximized && <>
        <div className={styles.edgeN}  onMouseDown={onResizeStart('n')}  />
        <div className={styles.edgeS}  onMouseDown={onResizeStart('s')}  />
        <div className={styles.edgeW}  onMouseDown={onResizeStart('w')}  />
        <div className={styles.edgeE}  onMouseDown={onResizeStart('e')}  />
        <div className={styles.cornerNW} onMouseDown={onResizeStart('nw')} />
        <div className={styles.cornerNE} onMouseDown={onResizeStart('ne')} />
        <div className={styles.cornerSW} onMouseDown={onResizeStart('sw')} />
        <div className={styles.cornerSE} onMouseDown={onResizeStart('se')} />
      </>}
    </div>
  );
}
