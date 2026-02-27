import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@context';
import styles from './Settings.module.css';

const SIDEBAR = [
  { id: 'appearance', label: 'Appearance', section: 'INTERFACE' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'widgets', label: 'Widgets' },
  { id: 'hardware', label: 'Hardware', section: 'SYSTEM' },
  { id: 'language', label: 'Language', section: 'PREFERENCES' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'about', label: 'About' },
];

const THEMES = [
  { id: 'dark', label: 'Dark', bg: '#2c2828', sidebar: '#272222', bars: '#3a3232', accent: '#E95420' },
  { id: 'light', label: 'Light', bg: '#f0ece8', sidebar: '#e4ddd7', bars: '#d4ccc5', accent: '#E95420' },
  { id: 'midnight', label: 'Midnight', bg: '#131315', sidebar: '#111113', bars: '#1e1e21', accent: '#E95420' },
];

const ACCENTS = [
  { name: 'orange', color: '#E95420' },
  { name: 'blue', color: '#42A5F5' },
  { name: 'green', color: '#66BB6A' },
  { name: 'purple', color: '#AB47BC' },
  { name: 'red', color: '#EF5350' },
  { name: 'amber', color: '#FFA726' },
  { name: 'cyan', color: '#26C6DA' },
  { name: 'pink', color: '#EC407A' },
];

// Custom color picker component
function CustomAccentPicker({ accents, accentColor, setAccentColor }) {
  const [showPicker, setShowPicker] = useState(false);
  const [customColor, setCustomColor] = useState(() => 
    localStorage.getItem('nimbus-accent-custom') || '#E95420'
  );
  const pickerRef = useRef(null);
  
  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPicker]);

  const handleCustomColorChange = (hex) => {
    setCustomColor(hex);
    setAccentColor('custom', hex);
  };

  return (
    <div className={styles.accentRow}>
      {accents.map(a => (
        <div
          key={a.name}
          className={`${styles.accentSwatch} ${accentColor === a.name ? styles.accentSelected : ''}`}
          onClick={() => setAccentColor(a.name)}
        >
          <div className={styles.swatchInner} style={{ background: a.color }} />
        </div>
      ))}
      
      {/* Custom color button */}
      <div className={styles.customPickerWrap} ref={pickerRef}>
        <div
          className={`${styles.accentSwatch} ${accentColor === 'custom' ? styles.accentSelected : ''}`}
          onClick={() => setShowPicker(!showPicker)}
        >
          <div 
            className={styles.swatchInner} 
            style={{ 
              background: accentColor === 'custom' ? customColor : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)'
            }} 
          />
        </div>
        
        {showPicker && (
          <div className={styles.colorPickerPopup}>
            <div className={styles.colorPickerHeader}>Custom Color</div>
            
            {/* Color spectrum */}
            <div className={styles.colorSpectrum}>
              {['#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', 
                '#039BE5', '#00ACC1', '#00897B', '#43A047', '#7CB342', '#C0CA33',
                '#FDD835', '#FFB300', '#FB8C00', '#F4511E', '#6D4C41', '#757575'].map(c => (
                <div
                  key={c}
                  className={`${styles.spectrumColor} ${customColor === c ? styles.spectrumColorActive : ''}`}
                  style={{ background: c }}
                  onClick={() => handleCustomColorChange(c)}
                />
              ))}
            </div>
            
            {/* Hex input */}
            <div className={styles.hexInputRow}>
              <span>#</span>
              <input
                type="text"
                maxLength={6}
                value={customColor.replace('#', '')}
                onChange={(e) => {
                  const hex = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                  if (hex.length <= 6) {
                    const fullHex = `#${hex}`;
                    setCustomColor(fullHex);
                    if (hex.length === 6) {
                      setAccentColor('custom', fullHex);
                    }
                  }
                }}
                className={styles.hexInput}
              />
              <div 
                className={styles.hexPreview}
                style={{ background: customColor }}
              />
            </div>
            
            <button 
              className={styles.applyColorBtn}
              onClick={() => setShowPicker(false)}
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <div className={`${styles.toggle} ${on ? styles.toggleOn : ''}`} onClick={onChange}>
      <div className={styles.toggleKnob} />
    </div>
  );
}

function AppearancePage() {
  const { theme, accentColor,
          glowIntensity,
          perfLevel, perfIsManual, gpuInfo, setPerfLevel, resetPerfLevel,
          setTheme, setAccentColor,
          setGlowIntensity } = useTheme();

  const TEXT_SIZES = [
    { value: 75, label: 'XS' },
    { value: 85, label: 'S' },
    { value: 100, label: 'M' },
    { value: 110, label: 'L' },
    { value: 120, label: 'XL' },
  ];

  const PERF_OPTIONS = [
    { id: 'full', label: 'Full', desc: 'All effects enabled', icon: '/src/icons/perf/full.png' },
    { id: 'balanced', label: 'Balanced', desc: 'Reduced blur', icon: '/src/icons/perf/balanced.png' },
    { id: 'performance', label: 'Performance', desc: 'Flat, no effects', icon: '/src/icons/perf/performance.png' },
  ];

  // GPU tier display
  const gpuTierLabel = gpuInfo ? {
    'dedicated': { text: 'Dedicated GPU', color: 'var(--accent-green)' },
    'apple-silicon': { text: 'Apple Silicon', color: 'var(--accent-green)' },
    'integrated': { text: 'Integrated GPU', color: 'var(--accent-amber)' },
    'software': { text: 'Software Rendering', color: 'var(--accent-red)' },
    'none': { text: 'No GPU detected', color: 'var(--accent-red)' },
  }[gpuInfo.tier] || { text: 'Unknown', color: 'var(--text-muted)' } : null;

  return (
    <>
      <h3 className={styles.pageTitle}>Appearance</h3>

      {/* Performance / GPU Section - Moved to top for visibility */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>
          Performance
          {gpuInfo && (
            <span className={styles.gpuBadge} style={{ color: gpuTierLabel.color }}>
              {gpuTierLabel.text}
            </span>
          )}
        </div>
        
        {/* GPU Info */}
        {gpuInfo && (
          <div className={styles.gpuInfo}>
            <span className={styles.gpuRenderer}>{gpuInfo.renderer}</span>
            {!perfIsManual && <span className={styles.gpuAuto}>Auto-configured</span>}
          </div>
        )}

        {/* Performance Level Selector */}
        <div className={styles.perfSelector}>
          {PERF_OPTIONS.map(opt => (
            <div
              key={opt.id}
              className={`${styles.perfOption} ${perfLevel === opt.id ? styles.perfOptionActive : ''}`}
              onClick={() => setPerfLevel(opt.id, true)}
            >
              <img src={opt.icon} alt={opt.label} className={styles.perfIcon} />
              <div className={styles.perfText}>
                <span className={styles.perfLabel}>{opt.label}</span>
                <span className={styles.perfDesc}>{opt.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Reset to auto button */}
        {perfIsManual && (
          <button className={styles.resetAutoBtn} onClick={resetPerfLevel}>
            ↺ Reset to auto-detected
          </button>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Theme</div>
        <div className={styles.themeRow}>
          {THEMES.map(t => (
            <div
              key={t.id}
              className={`${styles.themePreview} ${theme === t.id ? styles.themeSelected : ''}`}
              onClick={() => setTheme(t.id)}
            >
              <div className={styles.themeBox} style={{ background: t.bg, borderColor: theme === t.id ? t.accent : 'var(--border)' }}>
                <div className={styles.themeSidebar} style={{ background: t.sidebar }} />
                <div className={styles.themeContent}>
                  <div className={styles.themeBar} style={{ background: t.bars, width: '60%' }} />
                  <div className={styles.themeBar} style={{ background: t.bars, width: '80%' }} />
                  <div style={{ flex: 1 }} />
                  <div className={styles.themeBar} style={{ background: t.accent, width: '40%' }} />
                </div>
              </div>
              <span className={styles.themeLabel} style={theme === t.id ? { color: t.accent, fontWeight: 500 } : {}}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Accent Color</div>
        <CustomAccentPicker 
          accents={ACCENTS} 
          accentColor={accentColor} 
          setAccentColor={setAccentColor} 
        />
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Window Glow</div>
        <div className={styles.glowSection}>
          <div className={styles.glowSliderRow}>
            <span className={styles.glowLabel}>Subtle</span>
            <input
              type="range"
              min="0"
              max="100"
              value={glowIntensity}
              onChange={(e) => setGlowIntensity(Number(e.target.value))}
              className={styles.glowSlider}
              disabled={perfLevel === 'performance'}
            />
            <span className={styles.glowLabel}>Intense</span>
          </div>
          <div className={styles.sliderHint}>
            {perfLevel === 'performance' ? 'Disabled in Performance mode' : `${glowIntensity}%`}
          </div>
        </div>
      </div>
    </>
  );
}

function DesktopPage() {
  const { showDesktopIcons, autoHideTaskbar, clock24, taskbarPosition,
          wallpaper, textScale, taskbarSize,
          setShowDesktopIcons, setAutoHideTaskbar, setClock24, setTaskbarPosition,
          setWallpaper, setTextScale, setTaskbarSize } = useTheme();

  const TEXT_SIZES = [
    { value: 80, label: 'XS' },
    { value: 90, label: 'S' },
    { value: 100, label: 'M' },
    { value: 110, label: 'L' },
    { value: 120, label: 'XL' },
  ];

  return (
    <>
      <h3 className={styles.pageTitle}>Desktop</h3>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Icons</div>
        <div className={styles.toggleGrid}>
          <div className={styles.toggleRow}>
            <span>Show desktop icons</span>
            <Toggle on={showDesktopIcons} onChange={() => setShowDesktopIcons(!showDesktopIcons)} />
          </div>
        </div>
      </div>
      
      <div className={styles.card}>
        <div className={styles.cardLabel}>Dock</div>
        <div className={styles.toggleGrid}>
          <div className={styles.toggleRow}>
            <span>Auto-hide dock</span>
            <Toggle on={autoHideTaskbar} onChange={() => setAutoHideTaskbar(!autoHideTaskbar)} />
          </div>
          <div className={styles.toggleRow}>
            <span>24-hour clock</span>
            <Toggle on={clock24} onChange={() => setClock24(!clock24)} />
          </div>
          <div className={styles.toggleRow}>
            <span>Position</span>
            <div className={styles.segmentedControlSmall}>
              <div
                className={`${styles.segmentSmall} ${taskbarPosition === 'bottom' ? styles.segmentSmallActive : ''}`}
                onClick={() => setTaskbarPosition('bottom')}
              >
                Bottom
              </div>
              <div
                className={`${styles.segmentSmall} ${taskbarPosition === 'left' ? styles.segmentSmallActive : ''}`}
                onClick={() => setTaskbarPosition('left')}
              >
                Left
              </div>
            </div>
          </div>
          <div className={styles.toggleRow}>
            <span>Size</span>
            <div className={styles.segmentedControlSmall}>
              <div
                className={`${styles.segmentSmall} ${taskbarSize === 'small' ? styles.segmentSmallActive : ''}`}
                onClick={() => setTaskbarSize('small')}
              >
                S
              </div>
              <div
                className={`${styles.segmentSmall} ${taskbarSize === 'medium' ? styles.segmentSmallActive : ''}`}
                onClick={() => setTaskbarSize('medium')}
              >
                M
              </div>
              <div
                className={`${styles.segmentSmall} ${taskbarSize === 'large' ? styles.segmentSmallActive : ''}`}
                onClick={() => setTaskbarSize('large')}
              >
                L
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Wallpaper</div>
        <div className={styles.wallpaperRow}>
          <div className={styles.wallpaperControls}>
            <div
              className={`${styles.wallpaperItem} ${!wallpaper ? styles.wallpaperSelected : ''}`}
              onClick={() => setWallpaper('')}
            >
              <div className={styles.wallpaperNone}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
              <span>None</span>
            </div>
            <label className={styles.wallpaperUpload}>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setWallpaper(ev.target.result);
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Upload
            </label>
          </div>
          {wallpaper && (
            <div className={styles.wallpaperPreviewLarge}>
              <img src={wallpaper} alt="Current wallpaper" />
            </div>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Text Size</div>
        <div className={styles.sliderSection}>
          <div className={styles.sliderLabel}>
            <span style={{ fontSize: 11 }}>A</span>
            <span style={{ fontSize: 18, fontWeight: 500 }}>A</span>
          </div>
          <div className={styles.sizeSteps}>
            {TEXT_SIZES.map(s => (
              <div
                key={s.value}
                className={`${styles.sizeStep} ${textScale === s.value ? styles.sizeStepActive : ''}`}
                onClick={() => setTextScale(s.value)}
              >
                <div className={styles.sizeStepDot} />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.sliderHint}>{textScale}% — {textScale === 100 ? 'Default' : textScale < 100 ? 'Compact' : 'Large'}</div>
        </div>
      </div>
    </>
  );
}

function WidgetsPage() {
  const { showWidgets, widgetScale, visibleWidgets,
          setShowWidgets, setWidgetScale, toggleWidget } = useTheme();

  return (
    <>
      <h3 className={styles.pageTitle}>Widgets</h3>
      <div className={styles.card}>
        <div className={styles.cardLabel}>General</div>
        <div className={styles.toggleGrid}>
          <div className={styles.toggleRow}>
            <span>Show widgets panel</span>
            <Toggle on={showWidgets} onChange={() => setShowWidgets(!showWidgets)} />
          </div>
        </div>
      </div>
      
      <div className={styles.card}>
        <div className={styles.cardLabel}>Size</div>
        <div className={styles.segmentedControl}>
          {[
            { value: 80, label: 'Small' },
            { value: 100, label: 'Medium' },
            { value: 120, label: 'Large' },
          ].map(s => (
            <div
              key={s.value}
              className={`${styles.segment} ${widgetScale === s.value ? styles.segmentActive : ''}`}
              onClick={() => setWidgetScale(s.value)}
            >
              {s.label}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Active Widgets</div>
        <div className={styles.widgetToggles}>
          {[
            { key: 'system', label: 'System', desc: 'CPU, Memory, GPU, Temp' },
            { key: 'network', label: 'Network', desc: 'Download, Upload, IP' },
            { key: 'disk', label: 'Disk Health', desc: 'RAID, Storage usage' },
            { key: 'notifications', label: 'Notifications', desc: 'System alerts' },
          ].map(w => (
            <div key={w.key} className={styles.widgetToggleRow}>
              <div>
                <div className={styles.widgetToggleName}>{w.label}</div>
                <div className={styles.widgetToggleDesc}>{w.desc}</div>
              </div>
              <Toggle on={visibleWidgets[w.key]} onChange={() => toggleWidget(w.key)} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function LanguagePage() {
  return (
    <>
      <h3 className={styles.pageTitle}>Language & Region</h3>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Display Language</div>
        <select className={styles.select} defaultValue="es">
          <option value="es">Español</option>
          <option value="en">English</option>
          <option value="ca">Català</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Time Zone</div>
        <select className={styles.select} defaultValue="Europe/Madrid">
          <option value="Europe/Madrid">Europe/Madrid (CET)</option>
          <option value="Europe/London">Europe/London (GMT)</option>
          <option value="America/New_York">America/New_York (EST)</option>
          <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
        </select>
      </div>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Date Format</div>
        <select className={styles.select} defaultValue="dd/mm/yyyy">
          <option value="dd/mm/yyyy">DD/MM/YYYY</option>
          <option value="mm/dd/yyyy">MM/DD/YYYY</option>
          <option value="yyyy-mm-dd">YYYY-MM-DD</option>
        </select>
      </div>
    </>
  );
}

function NotificationsPage() {
  return (
    <>
      <h3 className={styles.pageTitle}>Notifications</h3>
      <div className={styles.card}>
        <div className={styles.cardLabel}>System Notifications</div>
        <div className={styles.toggleGrid}>
          <div className={styles.toggleRow}>
            <span>Show notifications</span>
            <Toggle on={true} onChange={() => {}} />
          </div>
          <div className={styles.toggleRow}>
            <span>Sound alerts</span>
            <Toggle on={false} onChange={() => {}} />
          </div>
          <div className={styles.toggleRow}>
            <span>Desktop banners</span>
            <Toggle on={true} onChange={() => {}} />
          </div>
        </div>
      </div>
    </>
  );
}

function AboutPage() {
  return (
    <>
      <h3 className={styles.pageTitle}>About NimbusOS</h3>
      <div className={styles.card} style={{ textAlign: 'center', padding: '32px' }}>
        <svg viewBox="0 0 200 200" width="56" height="56" fill="var(--accent)" stroke="none" style={{ marginBottom: 12 }}>
          <path d="M 50 155 L 50 95 Q 50 40, 100 25 Q 150 40, 150 95 L 150 155 L 125 155 L 125 130 Q 125 115, 115 108 L 108 102 L 108 155 L 92 155 L 92 102 L 85 108 Q 75 115, 75 130 L 75 155 Z" />
        </svg>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-medium)', marginBottom: 4 }}>NimbusOS</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 16 }}>Version 0.1.0 (Build 2026.02)</div>
        <div className={styles.aboutGrid}>
          {[
            ['Platform', 'Ubuntu Server 24.04 LTS'],
            ['Kernel', '6.8.0-1012-raspi'],
            ['Architecture', 'aarch64 (ARM)'],
            ['Hardware', 'Raspberry Pi 5 · 8 GB'],
            ['License', 'Apache 2.0'],
            ['Author', 'NimbusOS Project'],
          ].map(([k, v], i) => (
            <div key={i}><span style={{ color: 'var(--text-muted)' }}>{k}:</span> {v}</div>
          ))}
        </div>
      </div>
    </>
  );
}

function HardwarePage() {
  const [gpuInfo, setGpuInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(null); // package name being installed
  const [installLog, setInstallLog] = useState('');

  const fetchGpuInfo = () => {
    setLoading(true);
    fetch('/api/hardware/gpu-info')
      .then(r => r.json())
      .then(data => { setGpuInfo(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchGpuInfo(); }, []);

  const handleDriverAction = (pkg, action) => {
    if (installing) return;
    if (!confirm(`${action === 'install' ? 'Install' : 'Remove'} ${pkg}? This may take several minutes and require a reboot.`)) return;
    
    setInstalling(pkg);
    setInstallLog(`Starting ${action} of ${pkg}...\n`);

    fetch('/api/hardware/install-driver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg, action }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setInstallLog(prev => prev + `Error: ${data.error}\n`);
          setInstalling(null);
          return;
        }
        // Poll the log file
        const logName = data.logFile.split('/').pop();
        const poll = setInterval(() => {
          fetch(`/api/hardware/driver-log/${logName}`)
            .then(r => r.json())
            .then(log => {
              setInstallLog(log.content);
              if (log.done) {
                clearInterval(poll);
                setInstalling(null);
                fetchGpuInfo(); // refresh
              }
            })
            .catch(() => {});
        }, 2000);
      })
      .catch(err => {
        setInstallLog(prev => prev + `Error: ${err.message}\n`);
        setInstalling(null);
      });
  };

  const vendorColors = {
    nvidia: '#76b900',
    amd: '#ed1c24',
    intel: '#0071c5',
    unknown: 'var(--text-muted)',
  };

  const vendorLabels = {
    nvidia: 'NVIDIA',
    amd: 'AMD',
    intel: 'Intel',
    nouveau: 'Nouveau (open-source)',
    amdgpu: 'AMDGPU',
    i915: 'Intel i915',
  };

  if (loading) {
    return (
      <>
        <h3 className={styles.pageTitle}>Hardware</h3>
        <div className={styles.card} style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ color: 'var(--text-muted)' }}>Detecting hardware...</div>
        </div>
      </>
    );
  }

  const hasGpu = gpuInfo?.gpus?.length > 0;
  const primaryVendor = gpuInfo?.gpus?.[0]?.vendor || 'unknown';

  return (
    <>
      <h3 className={styles.pageTitle}>Hardware</h3>

      {/* GPU Detection */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Graphics
            {hasGpu && (
              <span style={{ 
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                background: vendorColors[primaryVendor] + '22',
                color: vendorColors[primaryVendor],
              }}>
                {primaryVendor.toUpperCase()}
              </span>
            )}
          </span>
        </div>

        {!hasGpu ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No GPU detected via lspci. If running in a VM, GPU passthrough may be needed.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {gpuInfo.gpus.map((gpu, i) => (
              <div key={i} style={{ 
                padding: '10px 14px', borderRadius: 'var(--radius)', 
                background: 'var(--bg-input)', fontSize: 'var(--text-sm)',
              }}>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {gpu.description}
                </div>
                {gpu.pciId && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>PCI ID: {gpu.pciId}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current Driver */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>Active Driver</div>
        {gpuInfo?.currentDriver ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: vendorColors[gpuInfo.gpus?.[0]?.vendor || 'unknown'] + '18',
              color: vendorColors[gpuInfo.gpus?.[0]?.vendor || 'unknown'],
              fontSize: 18, fontWeight: 700,
            }}>
              {gpuInfo.currentDriver === 'nvidia' ? '⬢' : gpuInfo.currentDriver === 'amdgpu' ? '◆' : '●'}
            </div>
            <div>
              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {vendorLabels[gpuInfo.currentDriver] || gpuInfo.currentDriver}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {gpuInfo.driverVersion ? `Version ${gpuInfo.driverVersion}` : 'Version unknown'}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No proprietary driver loaded. Using default kernel driver.
          </div>
        )}

        {/* Kernel modules */}
        {gpuInfo?.kernelModules?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Loaded kernel modules</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {gpuInfo.kernelModules.map((m, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 4,
                  background: 'var(--bg-active)', color: 'var(--text-secondary)',
                  fontFamily: 'monospace',
                }}>
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Available Drivers */}
      {gpuInfo?.availableDrivers?.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardLabel}>Available Drivers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gpuInfo.availableDrivers.map((drv, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 'var(--radius)',
                background: drv.installed ? 'var(--bg-active)' : 'var(--bg-input)',
                border: drv.recommended ? '1px solid var(--accent)' : '1px solid transparent',
              }}>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {drv.package}
                    {drv.recommended && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--accent)', color: 'white' }}>
                        Recommended
                      </span>
                    )}
                    {drv.installed && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                        Installed
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDriverAction(drv.package, drv.installed ? 'remove' : 'install')}
                  disabled={!!installing}
                  style={{
                    padding: '5px 14px', borderRadius: 'var(--radius)', border: 'none',
                    fontSize: 12, cursor: installing ? 'wait' : 'pointer',
                    background: drv.installed ? 'var(--bg-hover)' : 'var(--accent)',
                    color: drv.installed ? 'var(--text-secondary)' : 'white',
                    opacity: installing ? 0.5 : 1,
                  }}
                >
                  {installing === drv.package ? '...' : drv.installed ? 'Remove' : 'Install'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Install Log */}
      {installLog && (
        <div className={styles.card}>
          <div className={styles.cardLabel}>
            {installing ? '⏳ Installing...' : '📋 Install Log'}
          </div>
          <pre style={{
            fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)',
            background: 'var(--bg-input)', borderRadius: 'var(--radius)',
            padding: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap',
            margin: 0,
          }}>
            {installLog}
          </pre>
        </div>
      )}

      {/* Info notice */}
      <div className={styles.card}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          ⚠️ Driver changes may require a system reboot to take effect. 
          NVIDIA proprietary drivers replace the open-source Nouveau driver.
          For AMD GPUs, the default amdgpu kernel driver is recommended.
          Intel GPUs typically work with the built-in i915 driver.
        </div>
      </div>
    </>
  );
}

export default function Settings() {
  const [page, setPage] = useState('appearance');

  const pages = {
    appearance: AppearancePage,
    desktop: DesktopPage,
    widgets: WidgetsPage,
    hardware: HardwarePage,
    language: LanguagePage,
    notifications: NotificationsPage,
    about: AboutPage,
  };

  const PageComponent = pages[page];

  return (
    <div className={styles.layout}>
      <div className={styles.sidebar}>
        {SIDEBAR.map(item => (
          <div key={item.id}>
            {item.section && <div className={styles.sectionLabel}>{item.section}</div>}
            <div
              className={`${styles.sidebarItem} ${page === item.id ? styles.active : ''}`}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.main}>
        {PageComponent ? <PageComponent /> : (
          <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>
            {SIDEBAR.find(s => s.id === page)?.label || page} — coming soon
          </div>
        )}
      </div>
    </div>
  );
}
