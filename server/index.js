// ═══════════════════════════════════
// NimbusOS Service Icons
// 
// To customize: replace the .svg files in this folder
// with your own designs. Keep the same filenames.
// Supports .svg and .png files.
// ═══════════════════════════════════

import smbIcon from './smb.svg';
import ftpIcon from './ftp.svg';
import sshIcon from './ssh.svg';
import nfsIcon from './nfs.svg';
import webdavIcon from './webdav.svg';
import dnsIcon from './dns.svg';
import ddnsIcon from './ddns.svg';
import certsIcon from './certs.svg';
import proxyIcon from './proxy.svg';
import firewallIcon from './firewall.svg';
import fail2banIcon from './fail2ban.svg';
import interfacesIcon from './interfaces.svg';
import portsIcon from './ports.svg';

// Map of service id → icon asset
export const serviceIcons = {
  smb: smbIcon,
  ftp: ftpIcon,
  ssh: sshIcon,
  nfs: nfsIcon,
  webdav: webdavIcon,
  dns: dnsIcon,
  ddns: ddnsIcon,
  certs: certsIcon,
  proxy: proxyIcon,
  firewall: firewallIcon,
  fail2ban: fail2banIcon,
  ifaces: interfacesIcon,
  ports: portsIcon,
};

// React component that renders a service icon
export function ServiceIcon({ id, size = 20, className, style }) {
  const src = serviceIcons[id];
  if (!src) return null;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={id}
      draggable={false}
      className={className}
      style={{ objectFit: 'contain', ...style }}
    />
  );
}

// Individual named exports for direct import
export {
  smbIcon, ftpIcon, sshIcon, nfsIcon, webdavIcon,
  dnsIcon, ddnsIcon, certsIcon, proxyIcon,
  firewallIcon, fail2banIcon, interfacesIcon, portsIcon,
};
