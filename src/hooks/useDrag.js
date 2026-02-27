import { useCallback, useRef } from 'react';

/**
 * Hook for dragging elements (windows)
 * Returns onMouseDown handler to attach to the drag handle
 */
export function useDrag(onDrag) {
  const startPos = useRef(null);

  const onMouseDown = useCallback((e) => {
    // Only left click
    if (e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    startPos.current = { x: startX, y: startY };

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      onDrag(dx, dy, 'move');
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      onDrag(0, 0, 'end');
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [onDrag]);

  return onMouseDown;
}

/**
 * Hook for resizing elements (windows)
 * Returns onMouseDown handler to attach to the resize handle
 */
export function useResize(onResize) {
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;

    const onMouseMove = (moveEvent) => {
      const dw = moveEvent.clientX - startX;
      const dh = moveEvent.clientY - startY;
      onResize(dw, dh, 'resize');
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      onResize(0, 0, 'end');
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [onResize]);

  return onMouseDown;
}
