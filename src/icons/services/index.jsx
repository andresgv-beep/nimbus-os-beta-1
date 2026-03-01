// ═══════════════════════════════════
// NimbusOS Service Icons
// 
// All icons are inline React components.
// To customize: replace the SVG paths below with your own designs.
// All icons use stroke="currentColor" so they inherit the text color.
// ═══════════════════════════════════

const I = ({ size = 20, children, style, className }) => (
  <svg
    viewBox="0 0 24 24" width={size} height={size}
    fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round"
    style={style} className={className}
  >{children}</svg>
);

export function SmbIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <path d="M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.9l-.82-1.2A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z"/>
      <path d="M12 10v6"/><path d="M9 13h6"/>
    </I>
  );
}

export function FtpIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <path d="M12 5v14"/><path d="M18 11l-6-6-6 6"/><path d="M4 21h16"/>
    </I>
  );
}

export function SshIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1"/>
    </I>
  );
}

export function NfsIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
      <circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/>
    </I>
  );
}

export function WebdavIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/>
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </I>
  );
}

export function DnsIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      <path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/>
      <path d="M12 3a11.5 11.5 0 013 9 11.5 11.5 0 01-3 9 11.5 11.5 0 01-3-9 11.5 11.5 0 013-9z"/>
    </I>
  );
}

export function DdnsIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M12 8v4l3 3"/>
    </I>
  );
}

export function CertsIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>
    </I>
  );
}

export function ProxyIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <path d="M18 8h1a4 4 0 010 8h-1"/><path d="M6 8H5a4 4 0 000 8h1"/><path d="M8 12h8"/>
    </I>
  );
}

export function FirewallIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </I>
  );
}

export function Fail2banIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/><line x1="12" y1="15" x2="12" y2="19"/>
    </I>
  );
}

export function InterfacesIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/>
      <path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/>
    </I>
  );
}

export function PortsIcon({ size, style, className }) {
  return (
    <I size={size} style={style} className={className}>
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10"/>
      <path d="M12 2a15.3 15.3 0 00-4 10 15.3 15.3 0 004 10"/>
    </I>
  );
}

// ─── Icon Map ───

const iconMap = {
  smb: SmbIcon,
  ftp: FtpIcon,
  ssh: SshIcon,
  nfs: NfsIcon,
  webdav: WebdavIcon,
  dns: DnsIcon,
  ddns: DdnsIcon,
  certs: CertsIcon,
  proxy: ProxyIcon,
  firewall: FirewallIcon,
  fail2ban: Fail2banIcon,
  ifaces: InterfacesIcon,
  ports: PortsIcon,
};

// ─── Generic ServiceIcon ───

export function ServiceIcon({ id, size = 20, style, className }) {
  const IconComponent = iconMap[id];
  if (!IconComponent) return null;
  return <IconComponent size={size} style={style} className={className} />;
}

export default ServiceIcon;
