import { useEffect } from 'react';

/**
 * useClickOutside — Call handler when clicking outside the ref element
 * @param {React.RefObject} ref
 * @param {Function} handler
 * @param {boolean} active - only listen when true
 */
export function useClickOutside(ref, handler, active = true) {
  useEffect(() => {
    if (!active) return;
    const listener = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        handler(e);
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', listener), 10);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', listener);
    };
  }, [ref, handler, active]);
}
