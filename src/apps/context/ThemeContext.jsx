import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { detectGPUSync } from '@/hooks/useGPUDetection';

const ThemeContext = createContext(null);

const THEMES = ['dark', 'light', 'midnight'];

// Performance levels: full (all effects), balanced (reduced blur), performance (flat)
const PERF_LEVELS = ['full', 'balanced', 'performance'];

const ACCENT_COLORS = {
  orange:  '#E95420',
  blue:    '#42A5F5',
  green:   '#66BB6A',
  purple:  '#AB47BC',
  red:     '#EF5350',
  amber:   '#FFA726',
  cyan:    '#26C6DA',
  pink:    '#EC407A',
};

// Default preferences (matches server defaults)
const DEFAULT_PREFS = {
  theme: 'dark',
  accentColor: 'orange',
  glowIntensity: 50,
  taskbarSize: 'medium',
  taskbarPosition: 'bottom',
  autoHideTaskbar: false,
  clock24: true,
  showDesktopIcons: true,
  textScale: 100,
  wallpaper: '',
  showWidgets: true,
  widgetScale: 100,
  visibleWidgets: { system: true, network: true, disk: true, notifications: true },
  pinnedApps: ['files', 'appstore', 'settings'],
};

// Get token from localStorage
function getToken() {
  return localStorage.getItem('nimbusos_token');
}

// Detect GPU and get initial performance level
function getInitialPerfLevel() {
  try {
    // Check if user has manually set a preference
    const saved = localStorage.getItem('nimbus-perf-level');
    const isManual = localStorage.getItem('nimbus-perf-manual') === 'true';
    
    if (saved && isManual && PERF_LEVELS.includes(saved)) {
      return { level: saved, isManual: true, gpuInfo: null };
    }
    
    // Auto-detect GPU
    const { gpuInfo, recommendedLevel } = detectGPUSync();
    const level = saved && PERF_LEVELS.includes(saved) ? saved : recommendedLevel;
    
    return { level, isManual: false, gpuInfo };
  } catch (e) {
    console.warn('[NimbusOS] Performance detection failed, defaulting to balanced:', e);
    return { level: 'balanced', isManual: false, gpuInfo: null };
  }
}

// Apply performance level to DOM
function applyPerfLevelToDOM(level) {
  const root = document.documentElement;
  
  // Remove old attributes
  root.removeAttribute('data-perf');
  root.removeAttribute('data-perf-level');
  
  // Apply new level
  root.setAttribute('data-perf-level', level);
  
  // For backwards compatibility, also set data-perf="low" for performance mode
  if (level === 'performance') {
    root.setAttribute('data-perf', 'low');
  }
}

export function ThemeProvider({ children }) {
  // Track if preferences have been loaded from server
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const saveTimeoutRef = useRef(null);
  
  // Initialize with localStorage (fast) then sync with server
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('nimbus-theme') || DEFAULT_PREFS.theme;
    document.documentElement.setAttribute('data-theme', saved);
    return saved;
  });
  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem('nimbus-accent') || DEFAULT_PREFS.accentColor;
  });
  const [customAccentColor, setCustomAccentColor] = useState(() => {
    return localStorage.getItem('nimbus-accent-custom') || '#E95420';
  });
  const [textScale, setTextScale] = useState(() => {
    return parseInt(localStorage.getItem('nimbus-text-scale')) || DEFAULT_PREFS.textScale;
  });
  const [taskbarSize, setTaskbarSize] = useState(() => {
    return localStorage.getItem('nimbus-taskbar-size') || DEFAULT_PREFS.taskbarSize;
  });
  const [taskbarPosition, setTaskbarPosition] = useState(() => {
    return localStorage.getItem('nimbus-taskbar-position') || DEFAULT_PREFS.taskbarPosition;
  });
  const [showWidgets, setShowWidgets] = useState(DEFAULT_PREFS.showWidgets);
  const [showDesktopIcons, setShowDesktopIcons] = useState(DEFAULT_PREFS.showDesktopIcons);
  const [autoHideTaskbar, setAutoHideTaskbar] = useState(DEFAULT_PREFS.autoHideTaskbar);
  const [clock24, setClock24] = useState(DEFAULT_PREFS.clock24);
  const [widgetScale, setWidgetScale] = useState(DEFAULT_PREFS.widgetScale);
  const [glowIntensity, setGlowIntensity] = useState(DEFAULT_PREFS.glowIntensity);
  
  // New: Performance level system (replaces boolean performanceMode)
  const [perfState, setPerfState] = useState(() => {
    const initial = getInitialPerfLevel();
    applyPerfLevelToDOM(initial.level);
    return initial;
  });
  
  // Legacy compatibility getter
  const performanceMode = perfState.level === 'performance';
  
  const [wallpaper, setWallpaperState] = useState(() => {
    try { return localStorage.getItem('nimbus-wallpaper') || ''; } catch { return ''; }
  });
  const [pinnedApps, setPinnedApps] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nimbus-pinned') || '[]'); } catch { return []; }
  });
  const [visibleWidgets, setVisibleWidgets] = useState(DEFAULT_PREFS.visibleWidgets);
  
  // Re-detect GPU on mount (for async info display)
  const [gpuInfo, setGpuInfo] = useState(perfState.gpuInfo);
  
  useEffect(() => {
    // Async re-detection for complete info
    const timer = setTimeout(() => {
      try {
        const { gpuInfo: info } = detectGPUSync();
        setGpuInfo(info);
      } catch (e) { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, []);
  
  // ═══════════════════════════════════════════════════════════
  // Load preferences from server on mount
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const loadPreferences = async () => {
      const token = getToken();
      if (!token) {
        console.log('[Prefs] No token, using local preferences');
        setPrefsLoaded(true);
        return;
      }
      
      try {
        const res = await fetch('/api/user/preferences', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.preferences) {
          console.log('[Prefs] Loaded preferences from server');
          const p = data.preferences;
          
          // Apply all preferences from server
          if (p.theme && THEMES.includes(p.theme)) {
            setThemeState(p.theme);
            document.documentElement.setAttribute('data-theme', p.theme);
          }
          if (p.accentColor) setAccentColor(p.accentColor);
          if (p.customAccentColor) setCustomAccentColor(p.customAccentColor);
          if (p.glowIntensity !== undefined) setGlowIntensity(p.glowIntensity);
          if (p.taskbarSize) setTaskbarSize(p.taskbarSize);
          if (p.taskbarPosition) setTaskbarPosition(p.taskbarPosition);
          if (p.autoHideTaskbar !== undefined) setAutoHideTaskbar(p.autoHideTaskbar);
          if (p.clock24 !== undefined) setClock24(p.clock24);
          if (p.showDesktopIcons !== undefined) setShowDesktopIcons(p.showDesktopIcons);
          if (p.textScale) setTextScale(p.textScale);
          if (p.wallpaper !== undefined) setWallpaperState(p.wallpaper);
          if (p.showWidgets !== undefined) setShowWidgets(p.showWidgets);
          if (p.widgetScale) setWidgetScale(p.widgetScale);
          if (p.visibleWidgets) setVisibleWidgets(p.visibleWidgets);
          if (p.pinnedApps && Array.isArray(p.pinnedApps)) setPinnedApps(p.pinnedApps);
          
          // Also update localStorage as cache
          localStorage.setItem('nimbus-theme', p.theme || 'dark');
          localStorage.setItem('nimbus-accent', p.accentColor || 'orange');
          if (p.customAccentColor) localStorage.setItem('nimbus-accent-custom', p.customAccentColor);
          localStorage.setItem('nimbus-taskbar-size', p.taskbarSize || 'medium');
          localStorage.setItem('nimbus-taskbar-position', p.taskbarPosition || 'bottom');
          localStorage.setItem('nimbus-text-scale', String(p.textScale || 100));
          localStorage.setItem('nimbus-wallpaper', p.wallpaper || '');
          if (p.pinnedApps) localStorage.setItem('nimbus-pinned', JSON.stringify(p.pinnedApps));
        } else if (data.error) {
          console.log('[Prefs] Server error, using local preferences:', data.error);
          // If server has no prefs, migrate localStorage to server
          await migrateLocalToServer();
        }
      } catch (err) {
        console.error('[Prefs] Failed to load from server:', err.message);
      }
      
      setPrefsLoaded(true);
    };
    
    loadPreferences();
  }, []);
  
  // Migrate localStorage preferences to server (one-time)
  const migrateLocalToServer = async () => {
    const token = getToken();
    if (!token) return;
    
    const localPrefs = {
      theme: localStorage.getItem('nimbus-theme') || DEFAULT_PREFS.theme,
      accentColor: localStorage.getItem('nimbus-accent') || DEFAULT_PREFS.accentColor,
      customAccentColor: localStorage.getItem('nimbus-accent-custom') || '',
      taskbarSize: localStorage.getItem('nimbus-taskbar-size') || DEFAULT_PREFS.taskbarSize,
      taskbarPosition: localStorage.getItem('nimbus-taskbar-position') || DEFAULT_PREFS.taskbarPosition,
      textScale: parseInt(localStorage.getItem('nimbus-text-scale')) || DEFAULT_PREFS.textScale,
      wallpaper: localStorage.getItem('nimbus-wallpaper') || '',
      pinnedApps: JSON.parse(localStorage.getItem('nimbus-pinned') || '[]'),
      glowIntensity,
      autoHideTaskbar,
      clock24,
      showDesktopIcons,
      showWidgets,
      widgetScale,
      visibleWidgets
    };
    
    try {
      await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(localPrefs)
      });
      console.log('[Prefs] Migrated local preferences to server');
    } catch (err) {
      console.error('[Prefs] Migration failed:', err.message);
    }
  };
  
  // ═══════════════════════════════════════════════════════════
  // Save preferences to server (debounced)
  // ═══════════════════════════════════════════════════════════
  const savePrefsToServer = useCallback((prefs) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce save by 1 second
    saveTimeoutRef.current = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      
      try {
        await fetch('/api/user/preferences', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(prefs)
        });
        console.log('[Prefs] Saved to server:', Object.keys(prefs).join(', '));
      } catch (err) {
        console.error('[Prefs] Save failed:', err.message);
      }
    }, 1000);
  }, []);

  // Apply all saved settings on mount
  useEffect(() => {
    // Apply taskbar size
    const heights = { small: 54, medium: 64, large: 74 };
    const h = heights[taskbarSize] || 64;
    document.documentElement.style.setProperty('--taskbar-height', h + 'px');
    
    // Apply taskbar position
    document.documentElement.setAttribute('data-taskbar-pos', taskbarPosition);
    const root = document.documentElement.style;
    const pad = (h + 16) + 'px';
    const def = '20px';
    root.setProperty('--desktop-pad-top', taskbarPosition === 'top' ? pad : def);
    root.setProperty('--desktop-pad-left', taskbarPosition === 'left' ? pad : def);
    root.setProperty('--desktop-pad-bottom', taskbarPosition === 'bottom' ? pad : def);
    
    // Apply accent color
    let color;
    if (accentColor === 'custom') {
      color = localStorage.getItem('nimbus-accent-custom') || ACCENT_COLORS.orange;
    } else {
      color = ACCENT_COLORS[accentColor];
    }
    if (color) {
      root.setProperty('--accent', color);
      root.setProperty('--accent-hover', color);
      root.setProperty('--accent-active', color);
      root.setProperty('--border-focus', color);
    }
    
    // Apply text scale
    if (textScale !== 100) {
      const factor = textScale / 100;
      root.setProperty('--text-xs', `${13 * factor}px`);
      root.setProperty('--text-sm', `${14 * factor}px`);
      root.setProperty('--text-base', `${15.5 * factor}px`);
      root.setProperty('--text-md', `${17 * factor}px`);
      root.setProperty('--text-lg', `${18 * factor}px`);
      root.setProperty('--text-xl', `${21.5 * factor}px`);
      root.setProperty('--text-2xl', `${26 * factor}px`);
      root.setProperty('--text-3xl', `${33.5 * factor}px`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pinApp = useCallback((appId) => {
    setPinnedApps(prev => {
      if (prev.includes(appId)) return prev;
      const next = [...prev, appId];
      localStorage.setItem('nimbus-pinned', JSON.stringify(next));
      savePrefsToServer({ pinnedApps: next });
      return next;
    });
  }, [savePrefsToServer]);

  const unpinApp = useCallback((appId) => {
    setPinnedApps(prev => {
      const next = prev.filter(id => id !== appId);
      localStorage.setItem('nimbus-pinned', JSON.stringify(next));
      savePrefsToServer({ pinnedApps: next });
      return next;
    });
  }, [savePrefsToServer]);

  const togglePin = useCallback((appId) => {
    setPinnedApps(prev => {
      const next = prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId];
      localStorage.setItem('nimbus-pinned', JSON.stringify(next));
      savePrefsToServer({ pinnedApps: next });
      return next;
    });
  }, [savePrefsToServer]);

  // New: Set performance level (full/balanced/performance)
  const setPerfLevel = useCallback((level, manual = true) => {
    if (!PERF_LEVELS.includes(level)) return;
    
    setPerfState(prev => ({
      ...prev,
      level,
      isManual: manual,
    }));
    
    applyPerfLevelToDOM(level);
    
    // Persist
    localStorage.setItem('nimbus-perf-level', level);
    localStorage.setItem('nimbus-perf-manual', manual ? 'true' : 'false');
  }, []);
  
  // Reset to auto-detected level
  const resetPerfLevel = useCallback(() => {
    const { recommendedLevel } = detectGPUSync();
    setPerfState(prev => ({
      ...prev,
      level: recommendedLevel,
      isManual: false,
    }));
    applyPerfLevelToDOM(recommendedLevel);
    localStorage.setItem('nimbus-perf-level', recommendedLevel);
    localStorage.setItem('nimbus-perf-manual', 'false');
  }, []);
  
  // Legacy: boolean setter for backwards compatibility
  const applyPerformanceMode = useCallback((enabled) => {
    setPerfLevel(enabled ? 'performance' : 'full', true);
  }, [setPerfLevel]);

  const applyTheme = useCallback((newTheme) => {
    if (THEMES.includes(newTheme)) {
      setThemeState(newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('nimbus-theme', newTheme);
      savePrefsToServer({ theme: newTheme });
    }
  }, [savePrefsToServer]);

  const applyAccent = useCallback((colorName, customColor) => {
    // If custom color is provided (hex), use it directly
    const color = colorName === 'custom' ? customColor : ACCENT_COLORS[colorName];
    if (color) {
      setAccentColor(colorName);
      localStorage.setItem('nimbus-accent', colorName);
      if (colorName === 'custom') {
        setCustomAccentColor(color);
        localStorage.setItem('nimbus-accent-custom', color);
        savePrefsToServer({ accentColor: colorName, customAccentColor: color });
      } else {
        savePrefsToServer({ accentColor: colorName });
      }
      const root = document.documentElement.style;
      root.setProperty('--accent', color);
      root.setProperty('--accent-hover', color);
      root.setProperty('--accent-active', color);
      root.setProperty('--border-focus', color);
      // Apply glow with intensity
      const opacity = Math.round((glowIntensity / 100) * 0.6 * 255).toString(16).padStart(2, '0');
      root.setProperty('--accent-glow', `${color}${opacity}`);
      const spread = Math.round(10 + (glowIntensity / 100) * 50);
      root.setProperty('--glow-spread', `${spread}px`);
    }
  }, [glowIntensity, savePrefsToServer]);

  const applyGlowIntensity = useCallback((intensity) => {
    setGlowIntensity(intensity);
    savePrefsToServer({ glowIntensity: intensity });
    // Get current accent color (could be custom)
    const color = accentColor === 'custom' 
      ? localStorage.getItem('nimbus-accent-custom') 
      : ACCENT_COLORS[accentColor];
    if (!color) return;
    const root = document.documentElement.style;
    const opacity = Math.round((intensity / 100) * 0.6 * 255).toString(16).padStart(2, '0');
    root.setProperty('--accent-glow', `${color}${opacity}`);
    const spread = Math.round(10 + (intensity / 100) * 50);
    root.setProperty('--glow-spread', `${spread}px`);
  }, [accentColor, savePrefsToServer]);

  const applyTextScale = useCallback((scale) => {
    setTextScale(scale);
    localStorage.setItem('nimbus-text-scale', scale.toString());
    savePrefsToServer({ textScale: scale });
    const factor = scale / 100;
    const root = document.documentElement.style;
    root.setProperty('--text-xs', `${13 * factor}px`);
    root.setProperty('--text-sm', `${14 * factor}px`);
    root.setProperty('--text-base', `${15.5 * factor}px`);
    root.setProperty('--text-md', `${17 * factor}px`);
    root.setProperty('--text-lg', `${18 * factor}px`);
    root.setProperty('--text-xl', `${21.5 * factor}px`);
    root.setProperty('--text-2xl', `${26 * factor}px`);
    root.setProperty('--text-3xl', `${33.5 * factor}px`);
  }, [savePrefsToServer]);

  const applyTaskbarSize = useCallback((size) => {
    setTaskbarSize(size);
    const heights = { small: 54, medium: 64, large: 74 };
    const h = heights[size] || 64;
    document.documentElement.style.setProperty('--taskbar-height', h + 'px');
    localStorage.setItem('nimbus-taskbar-size', size);
    savePrefsToServer({ taskbarSize: size });
    // Recalculate desktop padding if taskbar is on left or top
    const pos = document.documentElement.getAttribute('data-taskbar-pos') || 'bottom';
    const root = document.documentElement.style;
    const pad = (h + 16) + 'px';
    const def = '20px';
    root.setProperty('--desktop-pad-top', pos === 'top' ? pad : def);
    root.setProperty('--desktop-pad-left', pos === 'left' ? pad : def);
  }, [savePrefsToServer]);

  const applyTaskbarPosition = useCallback((pos) => {
    setTaskbarPosition(pos);
    localStorage.setItem('nimbus-taskbar-position', pos);
    savePrefsToServer({ taskbarPosition: pos });
    document.documentElement.setAttribute('data-taskbar-pos', pos);
    const root = document.documentElement.style;
    const tbH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 64;
    const pad = (tbH + 16) + 'px';
    const def = '20px';
    root.setProperty('--desktop-pad-top', pos === 'top' ? pad : def);
    root.setProperty('--desktop-pad-left', pos === 'left' ? pad : def);
    root.setProperty('--desktop-pad-bottom', pos === 'bottom' ? pad : def);
  }, [savePrefsToServer]);

  const applyWidgetScale = useCallback((scale) => {
    setWidgetScale(scale);
    document.documentElement.style.setProperty('--widget-panel-width', `${340 * scale / 100}px`);
    savePrefsToServer({ widgetScale: scale });
  }, [savePrefsToServer]);

  const toggleWidget = useCallback((key) => {
    setVisibleWidgets(prev => {
      const next = { ...prev, [key]: !prev[key] };
      savePrefsToServer({ visibleWidgets: next });
      return next;
    });
  }, [savePrefsToServer]);

  const applyWallpaper = useCallback((url) => {
    setWallpaperState(url);
    try { if (url) localStorage.setItem('nimbus-wallpaper', url); else localStorage.removeItem('nimbus-wallpaper'); } catch {}
    savePrefsToServer({ wallpaper: url || '' });
  }, [savePrefsToServer]);
  
  // Setters that also save to server
  const setShowWidgetsAndSave = useCallback((v) => {
    setShowWidgets(v);
    savePrefsToServer({ showWidgets: v });
  }, [savePrefsToServer]);
  
  const setShowDesktopIconsAndSave = useCallback((v) => {
    setShowDesktopIcons(v);
    savePrefsToServer({ showDesktopIcons: v });
  }, [savePrefsToServer]);
  
  const setAutoHideTaskbarAndSave = useCallback((v) => {
    setAutoHideTaskbar(v);
    savePrefsToServer({ autoHideTaskbar: v });
  }, [savePrefsToServer]);
  
  const setClock24AndSave = useCallback((v) => {
    setClock24(v);
    savePrefsToServer({ clock24: v });
  }, [savePrefsToServer]);

  const value = {
    theme,
    accentColor,
    textScale,
    taskbarSize,
    taskbarPosition,
    showWidgets,
    showDesktopIcons,
    autoHideTaskbar,
    clock24,
    glowIntensity,
    // New performance system
    perfLevel: perfState.level,
    perfIsManual: perfState.isManual,
    gpuInfo,
    setPerfLevel,
    resetPerfLevel,
    // Legacy compatibility
    performanceMode,
    setPerformanceMode: applyPerformanceMode,
    wallpaper,
    pinnedApps,
    pinApp,
    unpinApp,
    togglePin,
    themes: THEMES,
    perfLevels: PERF_LEVELS,
    accentColors: ACCENT_COLORS,
    setTheme: applyTheme,
    setAccentColor: applyAccent,
    setTextScale: applyTextScale,
    setTaskbarSize: applyTaskbarSize,
    setTaskbarPosition: applyTaskbarPosition,
    setShowWidgets: setShowWidgetsAndSave,
    setShowDesktopIcons: setShowDesktopIconsAndSave,
    setAutoHideTaskbar: setAutoHideTaskbarAndSave,
    setClock24: setClock24AndSave,
    widgetScale,
    visibleWidgets,
    setWidgetScale: applyWidgetScale,
    setGlowIntensity: applyGlowIntensity,
    setWallpaper: applyWallpaper,
    toggleWidget,
    // Sync status
    prefsLoaded,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
