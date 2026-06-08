import React from 'react';
import type { LibraryMcp } from '../../main/station/types';

export function LibraryRail({ mcp, onDragStartMcp, onDragEndMcp }: {
  mcp: LibraryMcp[];
  onDragStartMcp?: (id: string) => void;
  onDragEndMcp?: () => void;
}) {
  return (
    <aside style={{ width: 200, background: 'var(--bg-rail)', borderRight: '1px solid var(--border)', padding: 16, overflowY: 'auto' }}>
      <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>MCP 库</div>
      {mcp.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>}
      {mcp.map(m => (
        <div key={m.id}
          draggable
          onDragStart={e => { e.dataTransfer.setData('application/x-mcp-id', m.id); e.dataTransfer.effectAllowed = 'copy'; onDragStartMcp?.(m.id); }}
          onDragEnd={() => onDragEndMcp?.()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'grab',
            padding: '6px 10px', marginBottom: 6, borderRadius: 8,
            background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', fontSize: 12,
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          }}>
          <span style={{ width: 3, height: 14, borderRadius: 2, background: '#D97757' }} />
          {m.id}
          {m.hasSecrets && <span title="含密钥" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>🔑</span>}
        </div>
      ))}
    </aside>
  );
}
