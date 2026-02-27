import { useWindows, useTheme } from '@context';
import { useContextMenu } from './ContextMenu';
import Taskbar from '@components/window/Taskbar';
import WindowFrame from '@components/window/WindowFrame';
import DesktopIcons from './DesktopIcons';
import WidgetPanel from './WidgetPanel';
import Icon from '@icons';
import styles from './Desktop.module.css';

export default function Desktop() {
  const { windows, openWindow } = useWindows();
  const { showDesktopIcons, wallpaper } = useTheme();
  const { show } = useContextMenu();

  const handleContextMenu = (e) => {
    // Only trigger on the desktop surface itself, not on windows/taskbar
    if (e.target.closest('[data-no-ctx]')) return;
    e.preventDefault();
    show(e.clientX, e.clientY, [
      { label: 'File Manager', icon: <Icon name="folder" size={16} />, action: () => openWindow('files', { width: 800, height: 520 }) },
      { label: 'Terminal', icon: <Icon name="terminal" size={16} />, action: () => openWindow('terminal', { width: 700, height: 450 }) },
      { label: 'System Monitor', icon: <Icon name="activity" size={16} />, action: () => openWindow('monitor', { width: 820, height: 520 }) },
      { divider: true },
      { label: 'Settings', icon: <Icon name="settings" size={16} />, action: () => openWindow('settings', { width: 750, height: 520 }), shortcut: '' },
      { label: 'Change Wallpaper', icon: <Icon name="star" size={16} /> },
      { divider: true },
      { label: 'About NimbusOS v0.1.0', icon: <Icon name="check" size={16} /> },
    ]);
  };

  return (
    <div className={`${styles.desktop} ${styles.padTop}`} onContextMenu={handleContextMenu}>
      <div
        className={styles.surface}
        style={wallpaper ? {
          backgroundImage: `url(${wallpaper})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      />

      {showDesktopIcons && <DesktopIcons />}

      <WidgetPanel />

      {Object.values(windows).map(win => (
        <WindowFrame key={win.id} window={win} />
      ))}

      <Taskbar />
    </div>
  );
}
