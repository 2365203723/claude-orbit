import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { springSmooth } from './springs';

// 统一的液态玻璃模态外壳:遮罩模糊入退场 + 卡片 spring 弹出 + a11y
// (role=dialog/aria-modal、挂载聚焦、Escape 关闭、Tab 焦点圈定)。
// 各弹窗只负责自己的内容与 footer 按钮。
export function GlassModal({ width = 460, zIndex, top = false, maxHeight, column = false, onClose, children, ariaLabel }: {
  width?: number;
  zIndex?: number;
  top?: boolean;          // true 时使用 --z-modal-top(叠加在其他模态之上)
  maxHeight?: string | number;
  column?: boolean;       // 卡片内部需要 flex column(滚动区)时
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape 关闭 + 简单焦点圈定:焦点跑出卡片时拉回
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onFocusIn = (e: FocusEvent) => {
      const card = cardRef.current;
      if (card && e.target instanceof Node && !card.contains(e.target)) card.focus();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    cardRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [onClose]);

  return (
    <motion.div
      onClick={onClose}
      initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
      exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'grid', placeItems: 'center', zIndex: zIndex ?? (`var(${top ? '--z-modal-top' : '--z-modal'})` as unknown as number) }}
    >
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        initial={{ scale: 0.92, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 4 }}
        transition={springSmooth}
        style={{
          width, maxHeight, outline: 'none',
          ...(column ? { display: 'flex', flexDirection: 'column' as const } : {}),
          background: 'var(--glass-surface-strong)', backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)', border: '1px solid var(--glass-border)',
          borderRadius: 18, padding: 20, boxShadow: 'var(--glass-shadow)',
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
