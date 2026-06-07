import React from 'react';

export function ApplyBar({ pendingCount, onApply }: { pendingCount: number; onApply: () => void }) {
  return (
    <button onClick={onApply} disabled={pendingCount === 0}
      style={{
        border: 'none', borderRadius: 8, padding: '6px 14px', cursor: pendingCount ? 'pointer' : 'default',
        background: pendingCount ? 'var(--accent)' : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 500,
      }}>
      Apply{pendingCount ? ` (${pendingCount})` : ''}
    </button>
  );
}
