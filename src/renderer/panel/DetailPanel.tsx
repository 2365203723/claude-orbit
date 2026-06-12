import React from 'react';
import { motion } from 'motion/react';
import type { ProjectState } from '../../main/types';
import type { LibraryBundle, LibraryMcp } from '../../main/station/types';
import type { GlobalSnapshot } from '../canvas/Canvas';
import { springSmooth } from '../theme/springs';
import { RubberScroll } from '../theme/RubberScroll';
import { KIND_COLOR, kindColorOf } from '../theme/kinds';
import { STR } from '../i18n/strings';

interface AssignmentData {
  mcp: string[]; skills: string[]; plugins: string[]; snippets: string[]; bundles: string[];
}

export function DetailPanel({ project, assignments, desiredBundles, desiredMcp, onUnassign, onUnassignBundle, onDeleteProject, isGlobal, globalSnapshot, onUnassignGlobalMcp, onUnassignGlobalSkill, onUnassignGlobalPlugin, onUnassignGlobalBundle, drifted }: {
  project: ProjectState | null;
  assignments?: AssignmentData;
  desiredBundles: Record<string, LibraryBundle>;
  desiredMcp: Record<string, LibraryMcp>;
  onUnassign?: (kind: string, id: string) => void;
  onUnassignBundle?: (bundleId: string) => void;
  onDeleteProject?: (path: string, name: string) => void;
  isGlobal?: boolean;
  globalSnapshot?: GlobalSnapshot;
  onUnassignGlobalMcp?: (mcpId: string) => void;
  onUnassignGlobalSkill?: (skillId: string) => void;
  drifted?: boolean;
  onUnassignGlobalPlugin?: (pluginId: string) => void;
  onUnassignGlobalBundle?: (bundleId: string) => void;
}) {
  // Global panel
  if (isGlobal && globalSnapshot) {
    const gs = globalSnapshot;
    const globalMcp = gs.mcp.map(m => ({ id: m.id, hasSecrets: m.hasSecrets, status: 'applied' as const }));
    const globalSkills = gs.skills.map(s => ({ id: s, status: 'applied' as const }));
    const globalPlugins = gs.plugins.map(p => ({ id: p, status: 'applied' as const }));
    const globalBundles = gs.bundles;

    return (
      <motion.aside
        key="__global__"
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={springSmooth}
        style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}
      >
        <RubberScroll style={{ height: '100%', overflowY: 'auto', padding: 20 }}>
          <h2 className="serif" style={{ fontSize: 18, marginTop: 0 }}>🌐 Global</h2>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>~/.claude.json · ~/.claude/skills/ · settings.json</div>

          {globalBundles.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Bundles ({globalBundles.length})</div>
              {globalBundles.map(b => (
                <div key={b.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: KIND_COLOR.bundle, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{b.icon ?? '📦'} {b.name}</span>
                    {onUnassignGlobalBundle && <button type="button" className="icon-btn" onClick={() => onUnassignGlobalBundle(b.id)} title={STR.panel.removeBundle} aria-label={`移除 Bundle ${b.name}`} style={{ color: 'var(--text-muted)', fontSize: 14, opacity: .5 }}>×</button>}
                  </div>
                  {[...b.mcp.map(id => ({ id, kind: 'MCP', hasSecrets: desiredMcp[id]?.hasSecrets ?? false })), ...b.skills.map(id => ({ id, kind: 'Skill', hasSecrets: false })), ...b.plugins.map(id => ({ id, kind: 'Plugin', hasSecrets: false }))].map(item => (
                    <div key={`${b.id}:${item.id}`} style={{ fontSize: 11, padding: '1px 0 1px 18px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', opacity: .65 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: kindColorOf(item.kind), flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{item.id}{item.hasSecrets ? ' 🔑' : ''}</span>
                      <span style={{ fontSize: 9, opacity: .5 }}>🔒</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <Group title={`MCP (${globalMcp.length})`} items={globalMcp} onRemove={onUnassignGlobalMcp} />
          <Group title={`Skills (${globalSkills.length})`} items={globalSkills} onRemove={onUnassignGlobalSkill} />
          <Group title={`Plugins (${globalPlugins.length})`} items={globalPlugins} onRemove={onUnassignGlobalPlugin} />
        </RubberScroll>
      </motion.aside>
    );
  }

  if (!project) {
    return (
      <aside style={panelStyle}>
        <p style={{ color: 'var(--text-muted)' }}>{STR.panel.emptyHint}</p>
      </aside>
    );
  }

  const a = assignments ?? { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };

  // 收集 bundle 覆盖的个体 ID（隐藏它们，不可单独删除）
  const bundledMcpIds = new Set<string>();
  const bundledSkillIds = new Set<string>();
  const bundledPluginIds = new Set<string>();
  const assignedBundles: LibraryBundle[] = [];
  for (const bid of a.bundles) {
    const b = desiredBundles[bid];
    if (b) {
      assignedBundles.push(b);
      b.mcp.forEach(id => bundledMcpIds.add(id));
      b.skills.forEach(id => bundledSkillIds.add(id));
      b.plugins.forEach(id => bundledPluginIds.add(id));
    }
  }

  // 合并 inferred + pending (排除被 bundle 覆盖的)
  const inferredMcp = new Set(project.mcp.map(m => m.id));
  const allMcp = [...project.mcp.filter(m => !bundledMcpIds.has(m.id)).map(m => ({ id: m.id, hasSecrets: m.hasSecrets, status: 'applied' as const })), ...a.mcp.filter(id => !inferredMcp.has(id) && !bundledMcpIds.has(id)).map(id => ({ id, hasSecrets: false, status: 'pending' as const }))];

  const inferredSkills = new Set(project.skills.map(s => s.id));
  const allSkills = [...project.skills.filter(s => !bundledSkillIds.has(s.id)).map(s => ({ id: s.id, status: 'applied' as const })), ...a.skills.filter(id => !inferredSkills.has(id) && !bundledSkillIds.has(id)).map(id => ({ id, status: 'pending' as const }))];

  const inferredPlugins = new Set(project.plugins.filter(p => p.enabled).map(p => p.id));
  const allPlugins = [...project.plugins.filter(p => p.enabled && !bundledPluginIds.has(p.id)).map(p => ({ id: p.id, status: 'applied' as const })), ...a.plugins.filter(id => !inferredPlugins.has(id) && !bundledPluginIds.has(id)).map(id => ({ id, status: 'pending' as const }))];

  const allSnippets = a.snippets.map(id => ({ id, status: 'pending' as const }));

  return (
    <motion.aside
      key={project.path}
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={springSmooth}
      style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}
    >
      <RubberScroll style={{ height: '100%', overflowY: 'auto', padding: 20 }}>
        <h2 className="serif" style={{ fontSize: 18, marginTop: 0 }}>
          {project.path.split('/').pop()}
        </h2>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 8 }}>{project.path}</div>
        {drifted && (
          <div style={{
            marginBottom: 10, padding: '6px 10px', borderRadius: 8,
            background: 'rgba(209,50,33,.08)', border: '1px solid rgba(209,50,33,.25)',
            fontSize: 11, color: 'var(--state-drift)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>⚠️</span>
            <span>磁盘配置已被外部改动,与 Orbit 记录不一致。下次应用将覆盖这些改动。</span>
          </div>
        )}
        {onDeleteProject && (
          <motion.button whileTap={{ scale: .96 }} transition={{ type: 'spring', stiffness: 500, damping: 30, mass: .8 }}
            onClick={() => onDeleteProject(project.path, project.path.split('/').pop() || project.path)}
            style={{ marginBottom: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--state-drift)', background: 'var(--bg-canvas)', color: 'var(--state-drift)', cursor: 'pointer', fontSize: 11 }}>
            删除项目…
          </motion.button>
        )}

        {assignedBundles.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Bundles ({assignedBundles.length})
            </div>
            {assignedBundles.map(b => (
              <div key={b.id} style={{ marginBottom: 10 }}>
                {/* Bundle header — 可删除 */}
                <div style={{ fontSize: 12, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: KIND_COLOR.bundle, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{b.icon ?? '📦'} {b.name}</span>
                  {onUnassignBundle && (
                    <button type="button" className="icon-btn" onClick={() => onUnassignBundle(b.id)}
                      style={{ color: 'var(--text-muted)', fontSize: 14, opacity: .5, lineHeight: 1 }}
                      title={STR.panel.removeBundle} aria-label={`移除 Bundle ${b.name}`}>×</button>
                  )}
                </div>
                {/* Bundle 内组件 — 灰色，不可删除，MCP 显示 🔑 标记 */}
                {[...b.mcp.map(id => ({ id, kind: 'MCP', hasSecrets: desiredMcp[id]?.hasSecrets ?? false })), ...b.skills.map(id => ({ id, kind: 'Skill', hasSecrets: false })), ...b.plugins.map(id => ({ id, kind: 'Plugin', hasSecrets: false }))].map(item => (
                  <div key={`${b.id}:${item.id}`} style={{ fontSize: 11, padding: '1px 0 1px 18px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', opacity: .65 }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: kindColorOf(item.kind), flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{item.id}{item.hasSecrets ? ' 🔑' : ''}</span>
                    <span style={{ fontSize: 9, opacity: .5 }} title={STR.panel.managedByBundle}>🔒</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <Group title={`MCP (${allMcp.length})`} items={allMcp} onRemove={onUnassign ? (id: string) => onUnassign('mcp', id) : undefined} />
        <Group title={`Skills (${allSkills.length})`} items={allSkills} onRemove={onUnassign ? (id: string) => onUnassign('skill', id) : undefined} />
        <Group title={`Plugins (${allPlugins.length})`} items={allPlugins} onRemove={onUnassign ? (id: string) => onUnassign('plugin', id) : undefined} />
        {allSnippets.length > 0 && (
          <Group title={`${STR.library.sectionSnippets} (${allSnippets.length})`} items={allSnippets} onRemove={onUnassign ? (id: string) => onUnassign('snippet', id) : undefined} />
        )}
      </RubberScroll>
    </motion.aside>
  );
}

// items 携带结构化数据(id 与展示标记分离)——绝不用拼接后的显示字符串回传 id
interface GroupItem { id: string; status: 'applied' | 'pending'; hasSecrets?: boolean; }

function Group({ title, items, onRemove }: {
  title: string; items: GroupItem[];
  onRemove?: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {items.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{STR.panel.empty}</div>
        : items.map(item => (
          <div key={item.id} style={{ fontSize: 12, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.status === 'applied' ? 'var(--state-applied)' : 'var(--state-pending)', flexShrink: 0 }} title={item.status === 'applied' ? STR.panel.statusApplied : STR.panel.statusPending} />
            <span style={{ flex: 1 }}>{item.id}{item.hasSecrets && <span aria-label="has secrets"> 🔑</span>}</span>
            {onRemove && (
              <button type="button" className="icon-btn"
                onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                style={{ color: 'var(--text-muted)', fontSize: 14, opacity: .5, lineHeight: 1 }}
                title={STR.panel.unassign} aria-label={`移除 ${item.id}`}
              >×</button>
            )}
          </div>
        ))}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 300, height: '100%', padding: 20, overflowY: 'auto',
  background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
};
