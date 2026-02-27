import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import styles from './ContextMenu.module.css';

const ContextMenuContext = createContext(null);

export function ContextMenuProvider({ children }) {
  const [menu, setMenu] = useState(null); // { x, y, items }

  const show = useCallback((x, y, items) => {
    // Clamp position to viewport
    const cx = Math.min(x, window.innerWidth - 220);
    const cy = Math.min(y, window.innerHeight - 300);
    setMenu({ x: cx, y: cy, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  // Close on any click or Escape
  useEffect(() => {
    if (!menu) return;
    const handleClick = () => close();
    const handleKey = (e) => { if (e.key === 'Escape') close(); };
    // Slight delay to not catch the opening right-click
    const id = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
    }, 10);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu, close]);

  return (
    <ContextMenuContext.Provider value={{ show, close }}>
      {children}
      {menu && (
        <div
          className={styles.menu}
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {menu.items.map((item, i) => {
            if (item.divider) return <div key={i} className={styles.divider} />;
            return (
              <div
                key={i}
                className={`${styles.item} ${item.danger ? styles.danger : ''}`}
                onClick={() => { close(); item.action?.(); }}
              >
                {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                <span>{item.label}</span>
                {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
              </div>
            );
          })}
        </div>
      )}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error('useContextMenu must be used within ContextMenuProvider');
  return ctx;
}
