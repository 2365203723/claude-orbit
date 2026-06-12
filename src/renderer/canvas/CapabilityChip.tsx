import React from 'react';
import { motion } from 'motion/react';
import { springSnappy } from '../theme/springs';
import { KIND_COLOR } from '../theme/kinds';

export function CapabilityChip(props: {
  kind: 'mcp' | 'skill' | 'plugin';
  label: string;
  hasSecrets?: boolean;
}) {
  return (
    <motion.span
      whileHover={{ y: -2, boxShadow: '0 6px 16px rgba(90,70,45,.16)' }}
      whileTap={{ scale: 0.94 }}
      transition={springSnappy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px 4px 8px', margin: 3, borderRadius: 8,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer',
      }}
    >
      <span style={{ width: 3, height: 14, borderRadius: 2, background: KIND_COLOR[props.kind] }} />
      {props.label}
      {props.hasSecrets && <span title="含密钥" style={{ color: 'var(--text-muted)' }}>🔑</span>}
    </motion.span>
  );
}
