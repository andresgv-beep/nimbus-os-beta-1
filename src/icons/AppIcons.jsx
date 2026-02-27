/* App icons as React components using CSS variables for theme adaptation */

export function FilesIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 14V38C6 40.2 7.8 42 10 42H38C40.2 42 42 40.2 42 38V18C42 15.8 40.2 14 38 14H24L20 8H10C7.8 8 6 9.8 6 12Z" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <path d="M6 18H42" stroke="var(--text-muted)" strokeWidth="1"/>
      <rect x="15" y="24" width="18" height="2" rx="1" fill="var(--text-muted)"/>
      <rect x="15" y="30" width="13" height="2" rx="1" fill="var(--text-muted)" opacity="0.6"/>
      <path d="M20 8L24 14" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function StorageIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="36" height="12" rx="3" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <rect x="6" y="22" width="36" height="12" rx="3" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <circle cx="35" cy="12" r="2" fill="#4CAF50"/>
      <circle cx="29" cy="12" r="2" fill="var(--text-muted)"/>
      <circle cx="35" cy="28" r="2" fill="var(--accent)"/>
      <circle cx="29" cy="28" r="2" fill="var(--text-muted)"/>
      <rect x="11" y="10" width="12" height="4" rx="1" fill="var(--text-muted)" opacity="0.3"/>
      <rect x="11" y="26" width="12" height="4" rx="1" fill="var(--text-muted)" opacity="0.3"/>
      <rect x="6" y="38" width="36" height="4" rx="2" fill="var(--bg-window)" stroke="var(--text-muted)" strokeWidth="1"/>
      <rect x="14" y="39.5" width="20" height="1.5" rx="0.75" fill="#4CAF50" opacity="0.7"/>
    </svg>
  );
}

export function MonitorIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="6" width="40" height="32" rx="3" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <rect x="16" y="40" width="16" height="4" rx="2" fill="var(--text-muted)"/>
      <rect x="12" y="42" width="24" height="2" rx="1" fill="var(--text-muted)"/>
      <polyline points="10,30 16,26 20,32 26,18 30,24 34,14 38,20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="10,30 16,28 20,30 26,26 30,28 34,24 38,26" fill="none" stroke="#42A5F5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
      <line x1="10" y1="34" x2="38" y2="34" stroke="var(--text-muted)" strokeWidth="0.75" opacity="0.4"/>
    </svg>
  );
}

export function ContainersIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="40" height="32" rx="4" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <rect x="10" y="14" width="8" height="6" rx="1.5" fill="none" stroke="#42A5F5" strokeWidth="1.5"/>
      <rect x="20" y="14" width="8" height="6" rx="1.5" fill="none" stroke="#42A5F5" strokeWidth="1.5"/>
      <rect x="30" y="14" width="8" height="6" rx="1.5" fill="none" stroke="#42A5F5" strokeWidth="1.5"/>
      <rect x="10" y="22" width="8" height="6" rx="1.5" fill="#42A5F5" opacity="0.25"/>
      <rect x="20" y="22" width="8" height="6" rx="1.5" fill="var(--accent)" opacity="0.35"/>
      <rect x="30" y="22" width="8" height="6" rx="1.5" fill="#4CAF50" opacity="0.25"/>
      <rect x="10" y="30" width="28" height="6" rx="1.5" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 2"/>
    </svg>
  );
}

export function NetworkIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="40" height="40" rx="4" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <line x1="24" y1="16" x2="14" y2="28" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <line x1="24" y1="16" x2="34" y2="28" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <line x1="14" y1="28" x2="24" y2="36" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <line x1="34" y1="28" x2="24" y2="36" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <circle cx="24" cy="14" r="4" fill="var(--accent)"/>
      <circle cx="13" cy="28" r="3.5" fill="var(--bg-window)" stroke="#FFA726" strokeWidth="1.5"/>
      <circle cx="35" cy="28" r="3.5" fill="var(--bg-window)" stroke="#FFA726" strokeWidth="1.5"/>
      <circle cx="24" cy="37" r="3.5" fill="var(--bg-window)" stroke="#42A5F5" strokeWidth="1.5"/>
    </svg>
  );
}

export function TerminalIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="6" width="40" height="36" rx="4" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <rect x="4" y="6" width="40" height="8" rx="4" fill="var(--bg-window)"/>
      <rect x="4" y="10" width="40" height="4" fill="var(--bg-window)"/>
      <circle cx="10" cy="10" r="1.5" fill="#EF5350"/>
      <circle cx="16" cy="10" r="1.5" fill="#FFA726"/>
      <circle cx="22" cy="10" r="1.5" fill="#4CAF50"/>
      <polyline points="12,22 18,26 12,30" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="22" y1="30" x2="34" y2="30" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"/>
      <rect x="36" y="28" width="2" height="6" rx="0.5" fill="var(--text-secondary)" opacity="0.7"/>
    </svg>
  );
}

export function TextEditorIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="4" width="32" height="40" rx="3" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <line x1="14" y1="14" x2="34" y2="14" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="14" y1="20" x2="30" y2="20" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="14" y1="26" x2="32" y2="26" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="14" y1="32" x2="24" y2="32" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M30 30L36 36L38 34L32 28Z" fill="var(--accent)"/>
      <line x1="36" y1="36" x2="38" y2="38" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function MediaPlayerIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="6" width="40" height="36" rx="4" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <rect x="4" y="6" width="40" height="26" rx="4" fill="var(--bg-window)"/>
      <polygon points="20,14 20,26 30,20" fill="var(--accent)"/>
      <rect x="8" y="36" width="8" height="3" rx="1" fill="var(--accent)" opacity="0.8"/>
      <rect x="18" y="36" width="5" height="3" rx="1" fill="var(--accent)" opacity="0.5"/>
      <rect x="25" y="36" width="6" height="3" rx="1" fill="var(--accent)" opacity="0.3"/>
      <circle cx="38" cy="37.5" r="2.5" fill="none" stroke="var(--text-muted)" strokeWidth="1"/>
    </svg>
  );
}

export function SettingsIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="40" height="40" rx="4" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <circle cx="24" cy="24" r="10" fill="none" stroke="var(--text-muted)" strokeWidth="2"/>
      <circle cx="24" cy="24" r="4" fill="var(--accent)"/>
      <line x1="24" y1="10" x2="24" y2="14" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="24" y1="34" x2="24" y2="38" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="10" y1="24" x2="14" y2="24" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="34" y1="24" x2="38" y2="24" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="14.1" y1="14.1" x2="16.9" y2="16.9" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="31.1" y1="31.1" x2="33.9" y2="33.9" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="33.9" y1="14.1" x2="31.1" y2="16.9" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="16.9" y1="31.1" x2="14.1" y2="33.9" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

export function VMsIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="10" width="32" height="22" rx="3" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <rect x="12" y="14" width="24" height="14" rx="1.5" fill="var(--bg-window)"/>
      <polyline points="16,24 20,20 24,23 28,18 32,22" fill="none" stroke="#26C6DA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="20" y="32" width="8" height="3" rx="1" fill="var(--text-muted)"/>
      <rect x="14" y="35" width="20" height="2.5" rx="1.25" fill="var(--text-muted)"/>
      <rect x="4" y="6" width="12" height="8" rx="2" fill="var(--bg-window)" stroke="var(--accent)" strokeWidth="1" opacity="0.8"/>
      <rect x="6" y="8" width="8" height="4" rx="1" fill="var(--accent)" opacity="0.3"/>
    </svg>
  );
}

export function ControlPanelIcon({ size = 53 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 4L8 12V22C8 33.1 14.9 41.6 24 44C33.1 41.6 40 33.1 40 22V12L24 4Z" fill="var(--bg-sidebar)" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="24" cy="19" r="5" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"/>
      <path d="M16 33C16 28.6 19.6 26 24 26C28.4 26 32 28.6 32 33" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="34" cy="14" r="4" fill="var(--accent)"/>
      <path d="M32.5 14L33.5 15L35.5 13" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const APP_ICONS = {
  files: FilesIcon,
  storage: StorageIcon,
  monitor: MonitorIcon,
  containers: ContainersIcon,
  network: NetworkIcon,
  terminal: TerminalIcon,
  texteditor: TextEditorIcon,
  mediaplayer: MediaPlayerIcon,
  settings: SettingsIcon,
  vms: VMsIcon,
  controlpanel: ControlPanelIcon,
};

export default function AppIcon({ appId, size = 53 }) {
  const IconComponent = APP_ICONS[appId];
  if (IconComponent) return <IconComponent size={size} />;
  return null;
}
