import React from 'react';
import { motion } from 'motion/react';
import type { NodeProps } from 'reactflow';

// 零项目空态占位节点:虚线玻璃圆引导新用户添加第一个项目。
// 不参与 drop 逻辑;projects 非空后由 Canvas 的 useMemo 自然移除。
export function AddPlaceholder({ data }: NodeProps<{ onAddProject?: () => void }>) {
  return (
    <motion.button
      type="button"
      onClick={() => data.onAddProject?.()}
      aria-label="添加第一个项目"
      animate={{ scale: [1, 1.04, 1] }}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
      whileTap={{ scale: 0.96 }}
      style={{
        width: 120, height: 120, borderRadius: '50%',
        border: '1.5px dashed rgba(255,255,255,.35)',
        background: 'var(--glass-surface)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: 12, font: 'inherit',
      }}
    >+ 添加第一个项目</motion.button>
  );
}
