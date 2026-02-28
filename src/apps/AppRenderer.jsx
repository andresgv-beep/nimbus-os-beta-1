import { useState, useEffect } from 'react';
import FileManager from './files/FileManager';
import StorageManager from './storage/StorageManager';
import SystemMonitor from './monitor/SystemMonitor';
import Containers from './containers/Containers';
import Network from './network/Network';
import Terminal from './terminal/Terminal';
import Settings from './settings/Settings';
import VirtualMachines from './vms/VirtualMachines';
import ControlPanel from './controlpanel/ControlPanel';
import TextEditor from './texteditor/TextEditor';
import MediaPlayer from './mediaplayer/MediaPlayer';
import AppStore from './appstore/AppStore';
import AppPlaceholder from './AppPlaceholder';
import WebApp from './webapp/WebApp';
import { useAuth } from '@context';
import { HardDriveIcon } from '@icons';

const APP_COMPONENTS = {
  files: FileManager,
  storage: StorageManager,
  monitor: SystemMonitor,
  containers: Containers,
  network: Network,
  terminal: Terminal,
  settings: Settings,
  vms: VirtualMachines,
  controlpanel: ControlPanel,
  texteditor: TextEditor,
  mediaplayer: MediaPlayer,
  appstore: AppStore,
};

// Apps that require a storage pool to function
const POOL_REQUIRED_APPS = ['files', 'appstore', 'containers', 'mediaplayer'];

function StorageRequired() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
      <HardDriveIcon size={64} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
      <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Storage Required</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 400, marginBottom: 24 }}>
        This feature needs a storage pool. Open <strong>Storage Manager</strong> to create one and unlock all NimbusOS features.
      </p>
    </div>
  );
}

export default function AppRenderer({ appId, isWebApp, webAppPort, webAppName }) {
  const { token } = useAuth();
  const [hasPool, setHasPool] = useState(null);

  useEffect(() => {
    if (!POOL_REQUIRED_APPS.includes(appId) && !isWebApp) {
      setHasPool(true);
      return;
    }
    fetch('/api/storage/status', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setHasPool(d.hasPool === true))
      .catch(() => setHasPool(true)); // On error, don't block
  }, [appId, token, isWebApp]);

  // Still checking
  if (hasPool === null) return null;

  // Blocked: needs pool but none exists
  if (!hasPool && (POOL_REQUIRED_APPS.includes(appId) || isWebApp)) {
    return <StorageRequired />;
  }

  // If it's a WebApp (Docker app), render iframe
  if (isWebApp && webAppPort) {
    return <WebApp appId={appId} port={webAppPort} name={webAppName} />;
  }
  
  // Otherwise render native component
  const Component = APP_COMPONENTS[appId];
  if (Component) return <Component />;
  return <AppPlaceholder appId={appId} />;
}
