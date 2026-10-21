import { useEffect, useRef, useState, type PointerEvent } from 'react';

export interface SettingsOffset {
  x: number;
  y: number;
}

function defaultOffset(): SettingsOffset {
  return {
    x: Math.max(0, (window.innerWidth - 620) / 2 - 24),
    y: 0,
  };
}

export function useSettingsDrag(isOpen: boolean) {
  const [offset, setOffset] = useState<SettingsOffset>(defaultOffset);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) setOffset(defaultOffset());
  }, [isOpen]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, select, textarea, a')) {
      return;
    }
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const maxX = Math.max(0, (window.innerWidth - 620) / 2 - 12);
    const maxDown = Math.max(0, window.innerHeight - 520 - 24);
    setOffset({
      x: Math.min(maxX, Math.max(-maxX, drag.baseX + event.clientX - drag.startX)),
      y: Math.min(maxDown, Math.max(0, drag.baseY + event.clientY - drag.startY)),
    });
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    offset,
    dragHandleProps: {
      onPointerDown: startDrag,
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      style: { touchAction: 'none' as const },
    },
  };
}
