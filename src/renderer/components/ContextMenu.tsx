import React, { useLayoutEffect, useEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

// 视口边缘 clamp:菜单完整可见,距边缘至少 8px(导出供测试)
export function clampMenuPosition(x: number, y: number, menuW: number, menuH: number, viewW: number, viewH: number): { left: number; top: number } {
  return {
    left: Math.max(8, Math.min(x, viewW - menuW - 8)),
    top: Math.max(8, Math.min(y, viewH - menuH - 8)),
  };
}

// 公共右键菜单:position fixed + 视口边缘 clamp(首帧 hidden 防闪跳),
// Escape / 点击外部关闭,role=menu/menuitem。
export function ContextMenu({ x, y, items, header, onClose }: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  header?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(clampMenuPosition(x, y, rect.width, rect.height, window.innerWidth, window.innerHeight));
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: pos?.left ?? x, top: pos?.top ?? y,
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 100,
        background: 'var(--glass-surface-strong)', backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)', border: '1px solid var(--glass-border)',
        borderRadius: 14, padding: 6, boxShadow: 'var(--glass-shadow)',
        minWidth: 160, fontSize: 12,
      }}
    >
      {header && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 10px', marginBottom: 4 }}>{header}</div>}
      {items.map(item => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => { item.onClick(); onClose(); }}
          style={{
            display: 'block', width: '100%', padding: '6px 10px', border: 'none',
            borderRadius: 8, background: 'transparent', cursor: 'pointer', font: 'inherit',
            color: item.danger ? 'var(--state-drift)' : 'var(--text-primary)',
            textAlign: 'left',
          }}
        >{item.label}</button>
      ))}
    </div>
  );
}
