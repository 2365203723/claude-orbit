import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, type GlobalSnapshot } from './canvas/Canvas';
import type { DragItem } from './canvas/Canvas';
import { DetailPanel } from './panel/DetailPanel';
import { LibraryRail } from './rail/LibraryRail';
import { ConfirmModal } from './apply/ConfirmModal';
import { EnvEditModal } from './rail/EnvEditModal';
import { AddProjectModal } from './rail/AddProjectModal';
import type { ProjectState } from '../main/types';
import type { StationState } from '../main/station/types';

function emptyGlobal(): GlobalSnapshot { return { mcp: [], skills: [], plugins: [], bundles: [] }; }

export function App() {
  const [desired, setDesired] = useState<StationState | null>(null);
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [selected, setSelected] = useState<ProjectState | null>(null);
  const [globalSelected, setGlobalSelected] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [retireId, setRetireId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<DragItem | null>(null);
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null);
  const [addingProject, setAddingProject] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [globalSnapshot, setGlobalSnapshot] = useState<GlobalSnapshot>(emptyGlobal);

  const [globalBundleIds, setGlobalBundleIds] = useState<string[]>([]);
  const desiredRef = useRef<StationState | null>(null);
  desiredRef.current = desired;
  const projectsRef = useRef<ProjectState[]>([]);
  projectsRef.current = projects;

  const reloadGlobalRef = useRef<() => Promise<void>>(async () => {});

  const reloadGlobal = useCallback(async () => {
    const gs = await window.station.getGlobalSnapshot();
    const desiredNow = desiredRef.current;
    const lib = desiredNow?.library.bundles ?? {};
    setGlobalBundleIds(prev => {
      const keep = prev.filter(bid => {
        const b = lib[bid];
        return b && b.mcp.every(mid => gs.mcp.some(m => m.id === mid));
      });
      return keep.length === prev.length && keep.every((v, i) => v === prev[i]) ? prev : keep;
    });
    setGlobalSnapshot({
      mcp: gs.mcp.map(m => ({ id: m.id, hasSecrets: m.hasSecrets })),
      skills: gs.skills.map(s => s.id),
      plugins: gs.plugins.filter(p => p.enabled).map(p => p.id),
      bundles: Object.values(desiredNow?.library.bundles ?? {}).filter((b: any) =>
        b.mcp.length > 0 && b.mcp.every((mid: string) => gs.mcp.some(m => m.id === mid))
      ) as any[],
    });
  }, []); // 不依赖 desired —— 用 ref 读取最新值
  reloadGlobalRef.current = reloadGlobal;

  const reload = useCallback(async () => {
    const [inferred, d] = await Promise.all([window.station.getState(), window.station.loadDesired()]);
    setProjects(inferred.projects);
    setDesired(d);
    // 选中的项目对象是按引用持有的旧快照——重新指向磁盘扫描后的新对象,
    // 否则右侧详情面板在 apply / 增删项目后仍显示陈旧的 applied/pending 状态
    setSelected(prev => prev ? (inferred.projects.find(p => p.path === prev.path) ?? null) : null);
    await reloadGlobalRef.current();
  }, []); // 用 ref 打破循环依赖
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  // Global dragover handler
  useEffect(() => {
    const handler = (e: DragEvent) => {
      const types = e.dataTransfer?.types;
      if (!types) return;
      const arr = Array.from(types);
      if (arr.includes('application/x-station-item') ||
          arr.includes('application/x-mcp-id') ||
          arr.includes('application/x-station-bundle')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    document.addEventListener('dragover', handler);
    return () => document.removeEventListener('dragover', handler);
  }, []);

  // === Project drag handlers ===
  // 拖拽即应用:主进程在 assign 后立即写盘,这里 reload 重扫真实配置,
  // 让卫星直接显示为"已应用"(绿),无需再点 Apply。
  const onDropItem = useCallback(async (path: string, kind: string, id: string) => {
    if (kind === 'bundle') await window.station.assignBundle(path, id);
    else if (kind === 'mcp') await window.station.assign(path, id);
    else if (kind === 'skill') await window.station.assignSkill(path, id);
    else if (kind === 'plugin') await window.station.assignPlugin(path, id);
    else if (kind === 'snippet') await window.station.assignSnippet(path, id);
    await reload();
  }, [reload]);
  const onUnassignMcp = useCallback(async (path: string, mcpId: string) => { await window.station.unassign(path, mcpId); await reload(); }, [reload]);
  const onUnassignBundle = useCallback(async (path: string, bundleId: string) => { await window.station.unassignBundle(path, bundleId); await reload(); }, [reload]);
  const onUnassignItem = useCallback(async (kind: string, id: string) => {
    if (!selected) return;
    const path = selected.path;
    if (kind === 'mcp') await window.station.unassign(path, id);
    else if (kind === 'skill') await window.station.unassignSkill(path, id);
    else if (kind === 'plugin') await window.station.unassignPlugin(path, id);
    else if (kind === 'snippet') await window.station.unassignSnippet(path, id);
    await reload();
  }, [selected, reload]);

  // === Global drag handlers (direct disk write) ===
  const onDropGlobal = useCallback(async (kind: string, id: string) => {
    if (kind === 'bundle') {
      await window.station.assignGlobalBundle(id);
      setGlobalBundleIds(prev => prev.includes(id) ? prev : [...prev, id]);
    } else if (kind === 'mcp') {
      const entry = desired?.library.mcp[id];
      if (entry) await window.station.addGlobalMcp(id, entry.def);
    } else if (kind === 'skill') {
      const entry = desired?.library.skills[id];
      if (entry) await window.station.addGlobalSkill(id, entry.sourcePath);
    } else if (kind === 'plugin') {
      await window.station.addGlobalPlugin(id);
    }
    await reloadGlobal();
  }, [desired, reloadGlobal]);
  const onUnassignGlobalMcp = useCallback(async (mcpId: string) => { await window.station.removeGlobalMcp(mcpId); await reloadGlobal(); }, [reloadGlobal]);
  const onUnassignGlobalSkill = useCallback(async (skillId: string) => { await window.station.removeGlobalSkill(skillId); await reloadGlobal(); }, [reloadGlobal]);
  const onUnassignGlobalPlugin = useCallback(async (pluginId: string) => { await window.station.removeGlobalPlugin(pluginId); await reloadGlobal(); }, [reloadGlobal]);
  const onUnassignGlobalBundle = useCallback(async (bundleId: string) => {
    await window.station.unassignGlobalBundle(bundleId);
    setGlobalBundleIds(prev => prev.filter(id => id !== bundleId));
    await reloadGlobal();
  }, [reloadGlobal]);

  const confirmRetire = async () => {
    if (retireId) { await window.station.removeGlobalMcp(retireId); setRetireId(null); await reloadGlobal(); }
  };
  const confirmDeleteUnmount = async () => {
    if (!deleteTarget) return;
    await window.station.unmountProject(deleteTarget.path);
    setDeleteTarget(null);
    await reload();
  };
  const confirmDeleteFolder = async () => {
    if (!deleteTarget) return;
    await window.station.unmountProject(deleteTarget.path);
    await window.station.deleteProjectFolder(deleteTarget.path);
    setDeleteTarget(null);
    await reload();
  };

  const lib = desired?.library;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', WebkitUserSelect: 'none' }}>
        <span className="serif" style={{ fontWeight: 600 }}>Claude Orbit</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <motion.button whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.8 }}
            onClick={() => setAddingProject(true)}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
            + 添加项目
          </motion.button>
          <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer' }}>
            {theme === 'light' ? '🌙 深色' : '☀️ 浅色'}
          </button>
        </div>
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 200 }}>
          <LibraryRail
            mcp={lib ? Object.values(lib.mcp) : []}
            skills={lib ? Object.values(lib.skills) : []}
            plugins={lib ? Object.values(lib.plugins) : []}
            snippets={lib ? Object.values(lib.snippets) : []}
            bundles={lib ? Object.values(lib.bundles ?? {}) : []}
            onDragStartItem={(kind, id) => setDraggingItem({ kind, id })}
            onDragEndItem={() => setDraggingItem(null)}
            onEditMcp={setEditingMcpId}
          />
        </div>
        <Canvas
          projects={projects}
          desiredMcp={desired?.library.mcp ?? {}}
          desiredSkills={desired?.library.skills ?? {}}
          desiredPlugins={desired?.library.plugins ?? {}}
          desiredSnippets={desired?.library.snippets ?? {}}
          desiredBundles={desired?.library.bundles ?? {}}
          lastApplied={desired?.lastApplied ?? {}}
          onSelect={(p: ProjectState | null) => { setSelected(p); setGlobalSelected(p === null); }}
          onDropItem={onDropItem}
          onUnassignMcp={onUnassignMcp}
          onUnassignBundle={onUnassignBundle}
          draggingItem={draggingItem}
          pendingAssignments={desired?.assignments}
          globalSnapshot={globalSnapshot}
          onDropGlobal={onDropGlobal}
          onUnassignGlobalMcp={onUnassignGlobalMcp}
          onUnassignGlobalSkill={onUnassignGlobalSkill}
          onUnassignGlobalPlugin={onUnassignGlobalPlugin}
          onUnassignGlobalBundle={onUnassignGlobalBundle}
          onAddProject={() => setAddingProject(true)}
          onDeleteProject={(path, name) => setDeleteTarget({ path, name })}
        />
        <DetailPanel project={selected} assignments={selected ? desired?.assignments[selected.path] : undefined} desiredBundles={desired?.library.bundles ?? {}} desiredMcp={desired?.library.mcp ?? {}} onUnassign={onUnassignItem} onUnassignBundle={(bid) => selected && onUnassignBundle(selected.path, bid)} onDeleteProject={(path, name) => setDeleteTarget({ path, name })}
          isGlobal={globalSelected}
          globalSnapshot={globalSnapshot}
          onUnassignGlobalMcp={onUnassignGlobalMcp}
          onUnassignGlobalSkill={onUnassignGlobalSkill}
          onUnassignGlobalPlugin={onUnassignGlobalPlugin}
          onUnassignGlobalBundle={onUnassignGlobalBundle}
        />
      </div>
      <AnimatePresence>
        {retireId && (
          <ConfirmModal
            title={`退役全局 MCP:${retireId}`}
            body="将从 ~/.claude.json 的全局 mcpServers 中移除。"
            confirmLabel="确认退役"
            onConfirm={confirmRetire}
            onCancel={() => setRetireId(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editingMcpId && <EnvEditModal mcpId={editingMcpId} onClose={() => setEditingMcpId(null)} onSaved={(next) => setDesired(next)} />}
      </AnimatePresence>
      <AnimatePresence>
        {addingProject && (
          <AddProjectModal
            defaultDir={projects[0] ? projects[0].path.split('/').slice(0, -1).join('/') : undefined}
            onClose={() => setAddingProject(false)}
            onMounted={async (path) => { await window.station.addProject(path); setAddingProject(false); await reload(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {deleteTarget && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(40,36,33,.28)', display: 'grid', placeItems: 'center', zIndex: 70 }}>
            <div style={{ width: 420, background: 'var(--glass-surface-strong)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', border: '1px solid var(--glass-border)', borderRadius: 18, padding: 20, boxShadow: 'var(--glass-shadow)' }}>
              <h2 className="serif" style={{ marginTop: 0, fontSize: 18 }}>删除项目 · {deleteTarget.name}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{deleteTarget.path}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                <motion.button whileTap={{ scale: .98 }} onClick={confirmDeleteUnmount}
                  style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>🔌 取消挂载</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>移除所有分配，星球不显示。文件保留在磁盘上。</div>
                </motion.button>
                <motion.button whileTap={{ scale: .98 }} onClick={confirmDeleteFolder}
                  style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--state-drift)', background: 'var(--bg-canvas)', color: 'var(--state-drift)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>🗑 删除本地文件夹</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>同时删除磁盘上的整个项目目录。不可恢复。</div>
                </motion.button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <motion.button whileTap={{ scale: .96 }} onClick={() => setDeleteTarget(null)} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer' }}>取消</motion.button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
