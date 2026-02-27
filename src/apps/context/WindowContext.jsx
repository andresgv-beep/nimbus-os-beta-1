import { createContext, useContext, useState, useCallback, useRef } from 'react';

const WindowContext = createContext(null);

export function WindowProvider({ children }) {
  // Cold state — triggers re-renders (window list, metadata, minimize/maximize)
  const [windows, setWindows] = useState({});

  // Hot state — refs for position/size during drag (NO re-renders)
  const posRefs = useRef({}); // { [id]: { x, y, width, height } }
  const nextZRef = useRef(100);
  const counterRef = useRef(0);

  const openWindow = useCallback((appId, options = {}, webAppData = null) => {
    const id = `w${++counterRef.current}`;
    const { width: reqW = 800, height: reqH = 520 } = options;

    const tbPos = document.documentElement.getAttribute('data-taskbar-pos') || 'bottom';
    const tbH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 48;
    const offsetLeft = tbPos === 'left' ? tbH : 0;
    const offsetTop = tbPos === 'top' ? tbH : 0;

    // Clamp to available viewport
    const availW = window.innerWidth - offsetLeft;
    const availH = window.innerHeight - (tbPos !== 'left' ? tbH : 0);
    const width = Math.min(reqW, availW - 40);
    const height = Math.min(reqH, availH - 40);

    const offset = (counterRef.current % 6) * 30;
    const x = Math.max(offsetLeft + 20, Math.min((window.innerWidth - width) / 2 + offset, window.innerWidth - width - 10));
    const y = Math.max(offsetTop + 20, Math.min((window.innerHeight - height) / 2 - 40 + offset, window.innerHeight - height - tbH - 10));
    const zIndex = nextZRef.current++;

    // Store hot position in ref
    posRefs.current[id] = { x, y, width, height };

    setWindows(prev => ({
      ...prev,
      [id]: { 
        id, 
        appId, 
        zIndex, 
        minimized: false, 
        maximized: false, 
        prevRect: null,
        // WebApp data for Docker apps
        isWebApp: webAppData?.isWebApp || false,
        webAppPort: webAppData?.port || null,
        webAppName: webAppData?.appName || null,
      },
    }));

    return id;
  }, []);

  const closeWindow = useCallback((id) => {
    delete posRefs.current[id];
    setWindows(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const focusWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], zIndex: nextZRef.current++, minimized: false, _rev: ((prev[id]?._rev) || 0) + 1 },
    }));
  }, []);

  const minimizeWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], minimized: true },
    }));
  }, []);

  const maximizeWindow = useCallback((id) => {
    setWindows(prev => {
      const win = prev[id];
      const pos = posRefs.current[id];
      if (!pos) return prev;

      if (win.maximized && win.prevRect) {
        // Restore: use prevRect
        const rect = win.prevRect;
        posRefs.current[id] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        return {
          ...prev,
          [id]: { ...win, maximized: false, prevRect: null, _rev: (win._rev || 0) + 1 },
        };
      }

      if (win.maximized) {
        // Maximized but no prevRect — restore to centered default
        const defaultW = 800, defaultH = 520;
        const cx = Math.round((window.innerWidth - defaultW) / 2);
        const cy = Math.round((window.innerHeight - defaultH) / 2);
        posRefs.current[id] = { x: cx, y: cy, width: defaultW, height: defaultH };
        return {
          ...prev,
          [id]: { ...win, maximized: false, prevRect: null, _rev: (win._rev || 0) + 1 },
        };
      }

      // Maximize: save current as prevRect
      const tbH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 48;
      const tbPos = document.documentElement.getAttribute('data-taskbar-pos') || 'bottom';
      let mx = 0, my = 0, mw = window.innerWidth, mh = window.innerHeight;
      if (tbPos === 'bottom') { mh -= tbH; }
      else if (tbPos === 'top') { my = tbH; mh -= tbH; }
      else if (tbPos === 'left') { mx = tbH; mw -= tbH; }

      const prevRect = { x: pos.x, y: pos.y, width: pos.width, height: pos.height };
      posRefs.current[id] = { x: mx, y: my, width: mw, height: mh };

      return {
        ...prev,
        [id]: { ...win, maximized: true, prevRect, _rev: (win._rev || 0) + 1 },
      };
    });
  }, []);

  const restoreWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], minimized: false, zIndex: nextZRef.current++, _rev: ((prev[id]?._rev) || 0) + 1 },
    }));
  }, []);

  // Hot update — directly mutate ref + DOM, NO re-render
  const updateWindowPos = useCallback((id, updates) => {
    const pos = posRefs.current[id];
    if (pos) Object.assign(pos, updates);
  }, []);

  // Get current position from ref
  const getWindowPos = useCallback((id) => {
    return posRefs.current[id] || { x: 0, y: 0, width: 800, height: 520 };
  }, []);

  const value = {
    windows,
    openWindow,
    closeWindow,
    focusWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    updateWindowPos,
    getWindowPos,
  };

  return (
    <WindowContext.Provider value={value}>
      {children}
    </WindowContext.Provider>
  );
}

export function useWindows() {
  const context = useContext(WindowContext);
  if (!context) throw new Error('useWindows must be used within WindowProvider');
  return context;
}
