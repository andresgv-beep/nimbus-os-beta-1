// ═══════════════════════════════════
// NimbusOS App Registry
// Maps app IDs to their metadata and window defaults
// ═══════════════════════════════════

import dockerIcon from '@icons/apps/docker.png';
import networkIcon from '@icons/apps/network.png';
import terminalIcon from '@icons/apps/terminal.png';
import settingsIcon from '@icons/apps/settings.png';
import controlpanelIcon from '@icons/apps/controlpanel.svg';
import filesIcon from '@icons/apps/files.png';
import storageIcon from '@icons/apps/storage.png';
import monitorIcon from '@icons/apps/monitor.png';
import vmsIcon from '@icons/apps/vms.svg';
import texteditorIcon from '@icons/apps/texteditor.png';
import mediaplayerIcon from '@icons/apps/mediaplayer.png';
import appstoreIcon from '@icons/apps/appstore.svg';

export const APP_REGISTRY = {
  files: {
    id: 'files',
    title: 'File Manager',
    color: '#E95420',
    icon: 'folder',
    appIcon: filesIcon,
    defaultSize: { width: 900, height: 560 },
    category: 'system',
  },
  storage: {
    id: 'storage',
    title: 'Storage Manager',
    color: '#4CAF50',
    icon: 'hardDrive',
    appIcon: storageIcon,
    defaultSize: { width: 850, height: 600 },
    category: 'system',
  },
  monitor: {
    id: 'monitor',
    title: 'System Monitor',
    color: '#42A5F5',
    icon: 'activity',
    appIcon: monitorIcon,
    defaultSize: { width: 760, height: 560 },
    category: 'system',
  },
  containers: {
    id: 'containers',
    title: 'Containers',
    color: '#77216F',
    icon: 'box',
    appIcon: dockerIcon,
    defaultSize: { width: 820, height: 520 },
    category: 'system',
  },
  network: {
    id: 'network',
    title: 'Network',
    color: '#FFA726',
    icon: 'globe',
    appIcon: networkIcon,
    defaultSize: { width: 820, height: 560 },
    category: 'system',
  },
  terminal: {
    id: 'terminal',
    title: 'Terminal',
    color: '#5D5550',
    icon: 'terminal',
    appIcon: terminalIcon,
    defaultSize: { width: 720, height: 460 },
    category: 'system',
  },
  settings: {
    id: 'settings',
    title: 'Settings',
    color: '#78706A',
    icon: 'settings',
    appIcon: settingsIcon,
    defaultSize: { width: 780, height: 560 },
    category: 'system',
  },
  vms: {
    id: 'vms',
    title: 'Virtual Machines',
    color: '#26C6DA',
    icon: 'box',
    appIcon: vmsIcon,
    defaultSize: { width: 900, height: 600 },
    category: 'system',
  },
  texteditor: {
    id: 'texteditor',
    title: 'Text Editor',
    color: '#78706A',
    icon: 'edit',
    appIcon: texteditorIcon,
    defaultSize: { width: 750, height: 520 },
    category: 'system',
  },
  mediaplayer: {
    id: 'mediaplayer',
    title: 'Media Player',
    color: '#E95420',
    icon: 'play',
    appIcon: mediaplayerIcon,
    defaultSize: { width: 880, height: 560 },
    category: 'system',
  },
  controlpanel: {
    id: 'controlpanel',
    title: 'Control Panel',
    color: '#78706A',
    icon: 'shield',
    appIcon: controlpanelIcon,
    defaultSize: { width: 900, height: 600 },
    category: 'system',
  },
  appstore: {
    id: 'appstore',
    title: 'App Store',
    color: '#4CAF50',
    icon: 'package',
    appIcon: appstoreIcon,
    defaultSize: { width: 950, height: 620 },
    category: 'system',
  },
};

// No más apps hardcodeadas - las apps instaladas vienen del backend
export const INSTALLED_APPS = {};

export function getAppMeta(appId) {
  return APP_REGISTRY[appId] || null;
}
