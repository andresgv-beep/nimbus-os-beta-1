// ═══════════════════════════════════
// NimbusOS Icon System
// Reusable SVG icons as React components
// ═══════════════════════════════════

const defaults = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Ico({ size = 16, children, ...props }) {
  return (
    <svg
      viewBox={defaults.viewBox}
      width={size}
      height={size}
      fill={props.fill || defaults.fill}
      stroke={props.stroke || defaults.stroke}
      strokeWidth={props.strokeWidth || defaults.strokeWidth}
      strokeLinecap={defaults.strokeLinecap}
      strokeLinejoin={defaults.strokeLinejoin}
      style={props.style}
      className={props.className}
    >
      {children}
    </svg>
  );
}

// ─── App Icons ───

import folderPng from './folder.png';

export function FolderIcon({ size = 48, ...props }) {
  return (
    <img src={folderPng} width={size} height={size} alt="folder" draggable={false} style={{ objectFit: 'contain' }} {...props} />
  );
}

export function FolderOutlineIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} stroke="currentColor" {...props}>
      <path d="M4 4h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>
    </Ico>
  );
}

export function HardDriveIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <line x1="22" y1="12" x2="2" y2="12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
      <line x1="6" y1="16" x2="6.01" y2="16"/>
      <line x1="10" y1="16" x2="10.01" y2="16"/>
    </Ico>
  );
}

export function ActivityIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </Ico>
  );
}

export function BoxIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </Ico>
  );
}

export function GlobeIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </Ico>
  );
}

export function TerminalIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </Ico>
  );
}

export function SettingsIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9c.6-.26 1-.85 1-1.51V3a2 2 0 0 1 4 0v.09c0 .66.4 1.25 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.66 0-1.25.4-1.51 1z"/>
    </Ico>
  );
}

// ─── UI Icons ───

export function HomeIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </Ico>
  );
}

export function StarIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </Ico>
  );
}

export function ClockIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </Ico>
  );
}

export function TrashIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </Ico>
  );
}

export function UploadIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </Ico>
  );
}

export function PlusIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </Ico>
  );
}

export function ChevronLeftIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polyline points="15 18 9 12 15 6"/>
    </Ico>
  );
}

export function ChevronRightIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polyline points="9 18 15 12 9 6"/>
    </Ico>
  );
}

export function VolumeIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </Ico>
  );
}

export function WifiIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
      <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </Ico>
  );
}

export function ShieldIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </Ico>
  );
}

export function PlayIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polygon points="5 3 19 12 5 21 5 3"/>
    </Ico>
  );
}

export function CloudIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    </Ico>
  );
}

export function CheckIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polyline points="20 6 9 17 4 12"/>
    </Ico>
  );
}

export function SearchIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </Ico>
  );
}

// ─── File type icons (filled, for file manager) ───

export function FileTextIcon({ size = 48, ...props }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" {...props}>
      <rect x="8" y="4" width="26" height="36" rx="3" fill="#42A5F5" opacity="0.85"/>
      <path d="M26 4v8a2 2 0 0 0 2 2h6" fill="#3590DB" opacity="0.6"/>
      <rect x="13" y="19" width="16" height="2" rx="1" fill="white" opacity="0.5"/>
      <rect x="13" y="24" width="11" height="2" rx="1" fill="white" opacity="0.4"/>
      <rect x="13" y="29" width="14" height="2" rx="1" fill="white" opacity="0.3"/>
    </svg>
  );
}

export function FileImageIcon({ size = 48, ...props }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" {...props}>
      <rect x="6" y="6" width="36" height="36" rx="4" fill="#66BB6A" opacity="0.85"/>
      <circle cx="16" cy="17" r="4" fill="white" opacity="0.45"/>
      <path d="M6 32l9-9 6 6 5-3.5L42 36v2a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-2z" fill="white" opacity="0.25"/>
    </svg>
  );
}

export function FileVideoIcon({ size = 48, ...props }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" {...props}>
      <rect x="5" y="8" width="38" height="32" rx="4" fill="#AB47BC" opacity="0.85"/>
      <path d="M19 17l13 8-13 8z" fill="white" opacity="0.65"/>
    </svg>
  );
}

export function FileArchiveIcon({ size = 48, ...props }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" {...props}>
      <rect x="8" y="4" width="26" height="36" rx="3" fill="#FFA726" opacity="0.85"/>
      <rect x="19" y="7" width="4" height="3" rx="0.75" fill="white" opacity="0.35"/>
      <rect x="19" y="12" width="4" height="3" rx="0.75" fill="white" opacity="0.35"/>
      <rect x="19" y="17" width="4" height="3" rx="0.75" fill="white" opacity="0.35"/>
      <rect x="16" y="24" width="10" height="8" rx="1.5" fill="white" opacity="0.4"/>
      <circle cx="21" cy="27" r="1.5" fill="#FFA726" opacity="0.6"/>
    </svg>
  );
}

export function FileConfigIcon({ size = 48, ...props }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" {...props}>
      <rect x="8" y="4" width="26" height="36" rx="3" fill="#78706A" opacity="0.85"/>
      <path d="M26 4v8a2 2 0 0 0 2 2h6" fill="#6A6260" opacity="0.5"/>
      <rect x="13" y="19" width="6" height="2" rx="1" fill="#E95420" opacity="0.7"/>
      <rect x="20" y="19" width="10" height="2" rx="1" fill="white" opacity="0.35"/>
      <rect x="13" y="24" width="4" height="2" rx="1" fill="#42A5F5" opacity="0.7"/>
      <rect x="18" y="24" width="12" height="2" rx="1" fill="white" opacity="0.35"/>
      <rect x="13" y="29" width="8" height="2" rx="1" fill="#66BB6A" opacity="0.6"/>
      <rect x="22" y="29" width="6" height="2" rx="1" fill="white" opacity="0.3"/>
    </svg>
  );
}

// ─── Icon lookup map ───

const ICON_MAP = {
  folder: FolderIcon,
  folderOutline: FolderOutlineIcon,
  hardDrive: HardDriveIcon,
  activity: ActivityIcon,
  box: BoxIcon,
  globe: GlobeIcon,
  terminal: TerminalIcon,
  settings: SettingsIcon,
  home: HomeIcon,
  star: StarIcon,
  clock: ClockIcon,
  trash: TrashIcon,
  upload: UploadIcon,
  plus: PlusIcon,
  volume: VolumeIcon,
  wifi: WifiIcon,
  shield: ShieldIcon,
  play: PlayIcon,
  cloud: CloudIcon,
  check: CheckIcon,
  search: SearchIcon,
};

export function UserIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </Ico>
  );
}

export function UsersIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </Ico>
  );
}

export function KeyIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </Ico>
  );
}

export function HistoryIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
      <path d="M12 7v5l4 2"/>
    </Ico>
  );
}

export function BellIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </Ico>
  );
}

export function RefreshIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </Ico>
  );
}

export function DownloadIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </Ico>
  );
}

export function CalendarIcon({ size = 16, ...props }) {
  return (
    <Ico size={size} {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </Ico>
  );
}

// ─── Icon map ───
export function Icon({ name, size = 16, ...props }) {
  const Component = ICON_MAP[name];
  if (!Component) return null;
  return <Component size={size} {...props} />;
}

export default Icon;
