import React from 'react';
import type { ApplyPlan } from '../../main/station/types';

export function DiffModal({ plan, onConfirm, onCancel }: {
  plan: ApplyPlan | null; onConfirm: () => void; onCancel: () => void;
}) {
  if (!plan) return null;
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 640, maxHeight: '80vh', overflowY: 'auto', background: 'var(--bg-surface)',
        border: '1px solid var(--border)', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow)',
      }}>
        <h2 className="serif" style={{ marginTop: 0, fontSize: 18 }}>待写入更改</h2>
        {plan.changes.length === 0 && <p style={{ color: 'var(--text-muted)' }}>无更改</p>}
        {plan.changes.map((c, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              {c.kind === 'localscope' ? '本地作用域' : '.mcp.json'} · {c.file}
            </div>
            {c.added.map(id => <div key={'a'+id} style={{ fontSize: 12, color: 'var(--state-applied)' }}>+ {id}</div>)}
            {c.changed.map(id => <div key={'c'+id} style={{ fontSize: 12, color: 'var(--state-pending)' }}>~ {id}</div>)}
            {c.removed.map(id => <div key={'r'+id} style={{ fontSize: 12, color: 'var(--state-drift)' }}>- {id}</div>)}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer' }}>取消</button>
          <button onClick={onConfirm} disabled={plan.changes.length === 0}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}>确认写入</button>
        </div>
      </div>
    </div>
  );
}
