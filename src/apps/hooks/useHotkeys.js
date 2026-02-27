import { useEffect } from 'react';

/**
 * useHotkeys — Register keyboard shortcuts
 * @param {Object} keyMap - { 'ctrl+w': callback, 'Escape': callback, ... }
 * @param {Array} deps - dependency array
 */
export function useHotkeys(keyMap, deps = []) {
  useEffect(() => {
    const handler = (e) => {
      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('ctrl');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(e.key.toLowerCase());
      const combo = parts.join('+');

      const fn = keyMap[combo] || keyMap[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, deps);
}
