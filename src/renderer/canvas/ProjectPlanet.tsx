import React from 'react';
import { motion } from 'motion/react';
import type { NodeProps } from 'reactflow';
import { McpSatellite, type McpStatus } from './McpSatellite';
import type { LibraryMcp, LibrarySkill, LibraryPlugin, LibrarySnippet, LibraryBundle } from '../../main/station/types';
import type { PlanetPosition } from './orbitLayout';
import type { DragItem } from './Canvas';
import { springBouncy } from '../theme/springs';
import { KIND_COLOR } from '../theme/kinds';

interface ProjectPlanetData extends PlanetPosition {
  name: string;
  mcp: { id: string; hasSecrets: boolean; status: McpStatus }[];
  skills: string[];
  plugins: string[];
  snippets: string[];
  bundles: LibraryBundle[];
  libraryMcp: Record<string, LibraryMcp>;
  librarySkills: Record<string, LibrarySkill>;
  libraryPlugins: Record<string, LibraryPlugin>;
  librarySnippets: Record<string, LibrarySnippet>;
  draggingItem: DragItem | null;
  isDragOver: boolean;
  isPending?: boolean; // 拖拽即应用写盘中——星球脉冲指示
  onDropItem?: (path: string, kind: string, id: string) => void;
  onUnassignMcp?: (path: string, mcpId: string) => void;
  onUnassignBundle?: (path: string, bundleId: string) => void;
  onUnassignSkill?: (path: string, skillId: string) => void;
  onUnassignPlugin?: (path: string, pluginId: string) => void;
  onSelect?: () => void;
  isGlobal?: boolean;
}

export function ProjectPlanet({ data }: NodeProps<ProjectPlanetData>) {
  const { name, mcp = [], skills = [], plugins = [], snippets = [], bundles = [], planetRadius, orbitRadius, draggingItem, isDragOver, isPending } = data;
  const libraryMcp = data.libraryMcp ?? {};
  const librarySkills = data.librarySkills ?? {};
  const libraryPlugins = data.libraryPlugins ?? {};
  const librarySnippets = data.librarySnippets ?? {};
  const satAngle = (idx: number, total: number) => (idx / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  // 轨道上所有卫星: Bundle + MCP
  interface SatEntry { kind: 'bundle' | 'mcp'; id: string; label: string; hasSecrets: boolean; status?: McpStatus; }
  const satellites: SatEntry[] = [
    ...bundles.map(b => ({ kind: 'bundle' as const, id: b.id, label: `${b.icon ?? '📦'} ${b.name}`, hasSecrets: false })),
    ...mcp.map(m => ({ kind: 'mcp' as const, id: m.id, label: m.id, hasSecrets: m.hasSecrets, status: m.status })),
  ];

  const isGlobal = (data as any).isGlobal as boolean | undefined;

  // 摘要行 —— 「N 个 X」句式,专有名词保留英文,避免英文单复数
  const parts: { label: string; kind: string }[] = [];
  if (bundles.length > 0) parts.push({ label: `${bundles.length} 个 Bundle`, kind: 'bundle' });
  if (mcp.length > 0) parts.push({ label: `${mcp.length} 个 MCP`, kind: 'mcp' });
  if (skills.length > 0) parts.push({ label: `${skills.length} 个 Skill`, kind: 'skill' });
  if (plugins.length > 0) parts.push({ label: `${plugins.length} 个 Plugin`, kind: 'plugin' });
  if (snippets.length > 0) parts.push({ label: `${snippets.length} 个 Snippet`, kind: 'snippet' });

  // 拖拽预览
  const draggedItemLabel = draggingItem ? (() => {
    if (draggingItem.kind === 'bundle') {
      const b = bundles.find(x => x.id === draggingItem.id);
      if (b) return `${b.icon ?? '📦'} ${b.name}`;
      return draggingItem.id;
    }
    if (draggingItem.kind === 'mcp') return libraryMcp[draggingItem.id]?.id;
    if (draggingItem.kind === 'skill') return librarySkills[draggingItem.id]?.id;
    if (draggingItem.kind === 'plugin') return libraryPlugins[draggingItem.id]?.id;
    if (draggingItem.kind === 'snippet') return librarySnippets[draggingItem.id]?.id;
    return null;
  })() : null;

  return (
    <div
      onDrop={e => {
        e.preventDefault();
        const bundleRaw = e.dataTransfer.getData('application/x-station-bundle');
        if (bundleRaw) {
          try { const item = JSON.parse(bundleRaw); if (item.kind && item.id && data.onDropItem) data.onDropItem(data.path, item.kind, item.id); return; } catch {}
        }
        const raw = e.dataTransfer.getData('application/x-station-item');
        if (raw) {
          try { const item = JSON.parse(raw); if (item.kind && item.id && data.onDropItem) data.onDropItem(data.path, item.kind, item.id); return; } catch {}
        }
        const id = e.dataTransfer.getData('application/x-mcp-id');
        if (id && data.onDropItem) data.onDropItem(data.path, 'mcp', id);
      }}
      style={{ position: 'relative', width: planetRadius * 2 + orbitRadius * 2 + 20, height: planetRadius * 2 + orbitRadius * 2 + 20 }}
    >
      {/* Gravity glow */}
      {isDragOver && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(circle, var(--gravity-glow), transparent 70%)',
          opacity: .7, zIndex: 0, pointerEvents: 'none',
          transition: 'opacity 0.2s ease',
        }} />
      )}

      {/* Orbit ring */}
      {satellites.length > 0 && (
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: orbitRadius * 2 + planetRadius * 2,
          height: orbitRadius * 2 + planetRadius * 2,
          transform: 'translate(-50%,-50%)',
          borderRadius: '50%',
          border: `1px solid ${isDragOver ? 'var(--orbit-line-active)' : 'var(--orbit-line)'}`,
          zIndex: 0, pointerEvents: 'none',
          transition: 'border-color 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        }} />
      )}

      {/* Planet body */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2 }}>
      <motion.div
        className="serif"
        onClick={() => data.onSelect?.()}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.94 }}
        animate={{
          boxShadow: `${isDragOver ? '0 0 28px var(--accent),' : ''} var(--glass-shadow), inset 0 2px 14px var(--glass-highlight)`,
          // 写盘进行中:透明度脉冲指示,不阻塞交互
          ...(isPending ? { opacity: [1, 0.55, 1] } : { opacity: 1 }),
        }}
        transition={isPending ? { opacity: { repeat: Infinity, duration: 1.2, ease: 'easeInOut' }, boxShadow: springBouncy } : springBouncy}
        style={{
          width: planetRadius * 2, height: planetRadius * 2,
          background: 'var(--planet-bg)', backdropFilter: 'blur(18px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.3)', borderRadius: '50%',
          border: '1px solid var(--glass-border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 3, cursor: 'pointer', userSelect: 'none',
          fontSize: Math.max(11, Math.round(planetRadius / 3.5)),
          fontWeight: 600, color: 'var(--text-primary)',
        }}>
        <span>{name}</span>
        {parts.length > 0 ? (
          <span style={{ fontSize: Math.max(8, Math.round(planetRadius / 5.5)),
            color: 'var(--text-muted)', fontWeight: 400, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', padding: '0 4px' }}>
            {parts.map((p, i) => (
              <span key={p.kind} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                {i > 0 && <span style={{ opacity: .5 }}>·</span>}
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: KIND_COLOR[p.kind as keyof typeof KIND_COLOR] ?? '#999', flexShrink: 0 }} />
                {p.label}
              </span>
            ))}
          </span>
        ) : (
          <span style={{ fontSize: Math.max(9, Math.round(planetRadius / 5)), color: 'var(--text-muted)', fontWeight: 400 }}>空</span>
        )}
        {mcp.filter(m => m.hasSecrets).length > 0 && (
          <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{mcp.filter(m => m.hasSecrets).length} 🔑</span>
        )}
      </motion.div>
      </div>

      {/* Satellites — Bundles + MCP */}
      {satellites.map((s, i) => {
        const a = satAngle(i, satellites.length);
        const halfW = planetRadius + orbitRadius + 10;
        const orbitDist = planetRadius + orbitRadius;
        const sx = halfW + Math.cos(a) * orbitDist;
        const sy = halfW + Math.sin(a) * orbitDist;
        return (
          <div key={`${s.kind}:${s.id}`} style={{
            position: 'absolute', left: sx, top: sy,
            transform: 'translate(-50%,-50%)', zIndex: 3,
          }}>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={springBouncy}
              style={{ position: 'relative', display: 'inline-block', cursor: 'default' }}>
              <button type="button" onClick={(e) => {
                e.stopPropagation();
                if (s.kind === 'bundle') data.onUnassignBundle?.(data.path, s.id);
                else data.onUnassignMcp?.(data.path, s.id);
              }}
                aria-label={`移除 ${s.label}`}
                title={`移除 ${s.label}`}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer', padding: 0,
                  opacity: 0, transition: 'opacity 0.2s ease', zIndex: 5,
                }}
                className="satellite-x"
              >×</button>
              {s.kind === 'bundle' ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 14, fontSize: 11,
                  background: 'var(--glass-surface)',
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid var(--bundle-accent)',
                  boxShadow: 'var(--glass-shadow)', color: 'var(--text-primary)',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: KIND_COLOR.bundle, flexShrink: 0 }} />
                  {s.label}
                </div>
              ) : (
                <McpSatellite label={s.id} hasSecrets={s.hasSecrets} status={s.status ?? 'pending'} />
              )}
            </motion.div>
          </div>
        );
      })}

      {/* Snap preview */}
      {isDragOver && draggedItemLabel && (
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%,-50%) translateY(-${planetRadius + orbitRadius - 6}px)`,
          zIndex: 4, pointerEvents: 'none', opacity: .85, display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6,
            background: 'var(--glass-surface-strong)', border: '1px solid var(--glass-border)',
            color: 'var(--text-primary)' }}>
            {draggedItemLabel}
          </span>
          <span style={{ fontSize: 10, color: 'var(--state-pending)' }}>+</span>
        </div>
      )}
    </div>
  );
}
