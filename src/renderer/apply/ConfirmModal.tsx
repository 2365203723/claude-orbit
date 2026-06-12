import React from 'react';
import { motion } from 'motion/react';
import { GlassModal } from '../theme/GlassModal';
import { springSnappy } from '../theme/springs';

// iOS 手感的弹窗:外壳统一走 GlassModal(遮罩模糊 + spring 卡片 + a11y)
export function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <GlassModal width={460} onClose={onCancel} ariaLabel={title}>
      <h2 className="serif" style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
      <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{body}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <motion.button
          onClick={onCancel}
          whileTap={{ scale: 0.96 }}
          transition={springSnappy}
          style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer' }}
        >取消</motion.button>
        <motion.button
          onClick={onConfirm}
          whileTap={{ scale: 0.96 }}
          transition={springSnappy}
          style={{ padding: '6px 14px', borderRadius: 10, border: 'none', background: 'var(--state-drift)', color: '#fff', cursor: 'pointer' }}
        >{confirmLabel}</motion.button>
      </div>
    </GlassModal>
  );
}
