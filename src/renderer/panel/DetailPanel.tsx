import React from 'react';
import type { ProjectState } from '../../main/types';

interface AssignmentData {
  mcp: string[]; skills: string[]; plugins: string[]; snippets: string[];
}

export function DetailPanel({ project, assignments, onUnassign }: {
  project: ProjectState | null;
  assignments?: AssignmentData;
  onUnassign?: (kind: string, id: string) => void;
}) {
  if (!project) {
    return (
      <aside style={panelStyle}>
        <p style={{ color: 'var(--text-muted)' }}>点击一个项目查看它挂了哪些能力</p>
      </aside>
    );
  }

  const a = assignments ?? { mcp: [], skills: [], plugins: [], snippets: [] };

  // 合并 inferred + pending
  const inferredMcp = new Set(project.mcp.map(m => m.id));
  const allMcp = [...project.mcp.map(m => ({ id: m.id, hasSecrets: m.hasSecrets, status: 'applied' as const })), ...a.mcp.filter(id => !inferredMcp.has(id)).map(id => ({ id, hasSecrets: false, status: 'pending' as const }))];

  const inferredSkills = new Set(project.skills.map(s => s.id));
  const allSkills = [...project.skills.map(s => ({ id: s.id, status: 'applied' as const })), ...a.skills.filter(id => !inferredSkills.has(id)).map(id => ({ id, status: 'pending' as const }))];

  const inferredPlugins = new Set(project.plugins.filter(p => p.enabled).map(p => p.id));
  const allPlugins = [...project.plugins.filter(p => p.enabled).map(p => ({ id: p.id, status: 'applied' as const })), ...a.plugins.filter(id => !inferredPlugins.has(id)).map(id => ({ id, status: 'pending' as const }))];

  const allSnippets = a.snippets.map(id => ({ id, status: 'pending' as const }));

  return (
    <aside style={panelStyle}>
      <h2 className="serif" style={{ fontSize: 18, marginTop: 0 }}>
        {project.path.split('/').pop()}
      </h2>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 8 }}>{project.path}</div>
      <Group title={`MCP (${allMcp.length})`} items={allMcp.map(m => m.id + (m.hasSecrets ? ' 🔑' : ''))} statuses={allMcp.map(m => m.status)} onRemove={onUnassign ? (id: string) => onUnassign('mcp', id) : undefined} />
      <Group title={`Skills (${allSkills.length})`} items={allSkills.map(s => s.id)} statuses={allSkills.map(s => s.status)} onRemove={onUnassign ? (id: string) => onUnassign('skill', id) : undefined} />
      <Group title={`Plugins (${allPlugins.length})`} items={allPlugins.map(p => p.id)} statuses={allPlugins.map(p => p.status)} onRemove={onUnassign ? (id: string) => onUnassign('plugin', id) : undefined} />
      {allSnippets.length > 0 && (
        <Group title={`配置片段 (${allSnippets.length})`} items={allSnippets.map(s => s.id)} statuses={allSnippets.map(s => s.status)} onRemove={onUnassign ? (id: string) => onUnassign('snippet', id) : undefined} />
      )}
    </aside>
  );
}

function Group({ title, items, statuses, onRemove }: {
  title: string; items: string[]; statuses: string[];
  onRemove?: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {items.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>
        : items.map((label, i) => {
          const status = statuses[i] ?? 'pending';
          return (
            <div key={label} style={{ fontSize: 12, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: status === 'applied' ? 'var(--state-applied)' : 'var(--state-pending)', flexShrink: 0 }} title={status === 'applied' ? '已应用' : '待应用'} />
              <span style={{ flex: 1 }}>{label}</span>
              {onRemove && (
                <span onClick={(e) => { e.stopPropagation(); onRemove(cleanId(label)); }}
                  style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, opacity: .5, lineHeight: 1 }}
                  title="撤销装配"
                >×</span>
              )}
            </div>
          );
        })}
    </div>
  );
}

// 从显示标签中移除 🔑 emoji 得到真实 id
function cleanId(label: string): string {
  return label.replace(/ 🔑$/, '');
}

const panelStyle: React.CSSProperties = {
  width: 300, height: '100%', padding: 20, overflowY: 'auto',
  background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
};
