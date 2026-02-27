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

export default function AppRenderer({ appId, isWebApp, webAppPort, webAppName }) {
  // If it's a WebApp (Docker app), render iframe
  if (isWebApp && webAppPort) {
    return <WebApp appId={appId} port={webAppPort} name={webAppName} />;
  }
  
  // Otherwise render native component
  const Component = APP_COMPONENTS[appId];
  if (Component) return <Component />;
  return <AppPlaceholder appId={appId} />;
}
