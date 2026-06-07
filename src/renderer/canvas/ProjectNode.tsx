import React from 'react';
import type { NodeProps } from 'reactflow';
import { CapabilityChip } from './CapabilityChip';

export function ProjectNode({ data }: NodeProps<any>) {
  const name = data.path.split('/').pop() || data.path;
  const summary = `${data.mcp.length} MCP · ${data.skills.length} skill · ${data.plugins.filter((p: any) => p.enabled).length} plugin`;
  return (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={e => {
        const id = e.dataTransfer.getData('application/x-mcp-id');
        if (id && data.onDropMcp) data.onDropMcp(data.path, id);
      }}
      style={{
        width: 260, background: 'var(--bg-surface)',
        border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: 'var(--shadow)', padding: 16,
      }}>
      <div className="serif" style={{ fontSize: 16, fontWeight: 600 }}>{name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, marginBottom: 10 }}>{summary}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {data.mcp.map((m: any) => <CapabilityChip key={'m'+m.id} kind="mcp" label={m.id} hasSecrets={m.hasSecrets} />)}
        {data.skills.map((s: any) => <CapabilityChip key={'s'+s.id} kind="skill" label={s.id} />)}
        {data.plugins.filter((p: any) => p.enabled).map((p: any) => <CapabilityChip key={'p'+p.id} kind="plugin" label={p.id.split('@')[0]} />)}
      </div>
    </div>
  );
}
