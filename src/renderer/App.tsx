import React, { useEffect, useState, useCallback } from 'react';
import { Canvas } from './canvas/Canvas';
import type { DragItem } from './canvas/Canvas';
import { DetailPanel } from './panel/DetailPanel';
import { LibraryRail } from './rail/LibraryRail';
import { ApplyBar } from './apply/ApplyBar';
import { DiffModal } from './apply/DiffModal';
import { GlobalCleanupSection } from './rail/GlobalCleanupSection';
import { ConfirmModal } from './apply/ConfirmModal';
import type { ProjectState } from '../main/types';
import type { StationState, ApplyPlan } from '../main/station/types';

export function App() {
  const [desired, setDesired] = useState<StationState | null>(null);
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [selected, setSelected] = useState<ProjectState | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [plan, setPlan] = useState<ApplyPlan | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [globalStatus, setGlobalStatus] = useState<{ eligible: string[]; blocked: string[] } | null>(null);
  const [retireId, setRetireId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<DragItem | null>(null);

  const reload = useCallback(async () => {
    const [inferred, d, gs] = await Promise.all([
      window.station.getState(), window.station.loadDesired(), window.station.globalStatus(),
    ]);
    setProjects(inferred.projects);
    setDesired(d);
    setGlobalStatus(gs);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  // 全局 dragover: 让画布任何位置都允许接收 LibraryRail 的能力拖放
  useEffect(() => {
    const handler = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('application/x-station-item') ||
          e.dataTransfer?.types.includes('application/x-mcp-id')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    document.addEventListener('dragover', handler);
    return () => document.removeEventListener('dragover', handler);
  }, []);

  const allProjectPaths = projects.map(p => p.path);

  useEffect(() => {
    if (!desired) return;
    window.station.plan(allProjectPaths).then(p => setPendingCount(p.changes.length));
  }, [desired]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDropItem = useCallback(async (path: string, kind: string, id: string) => {
    if (kind === 'mcp') {
      setDesired(await window.station.assign(path, id));
    } else if (kind === 'skill') {
      setDesired(await window.station.assignSkill(path, id));
    } else if (kind === 'plugin') {
      setDesired(await window.station.assignPlugin(path, id));
    } else if (kind === 'snippet') {
      setDesired(await window.station.assignSnippet(path, id));
    }
  }, []);

  const onUnassignMcp = useCallback(async (path: string, mcpId: string) => {
    setDesired(await window.station.unassign(path, mcpId));
  }, []);

  const onUnassignItem = useCallback(async (kind: string, id: string) => {
    if (!selected) return;
    const path = selected.path;
    if (kind === 'mcp') setDesired(await window.station.unassign(path, id));
    else if (kind === 'skill') setDesired(await window.station.unassignSkill(path, id));
    else if (kind === 'plugin') setDesired(await window.station.unassignPlugin(path, id));
    else if (kind === 'snippet') setDesired(await window.station.unassignSnippet(path, id));
  }, [selected]);

  const openDiff = async () => setPlan(await window.station.plan(allProjectPaths));
  const confirmApply = async () => { await window.station.apply(allProjectPaths); setPlan(null); await reload(); };
  const confirmRetire = async () => {
    if (retireId) await window.station.cleanupGlobal([retireId]);
    setRetireId(null);
    await reload();
  };

  const lib = desired?.library;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', WebkitUserSelect: 'none' }}>
        <span className="serif" style={{ fontWeight: 600 }}>Claude Station</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ApplyBar pendingCount={pendingCount} onApply={openDiff} />
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
            onDragStartItem={(kind, id) => setDraggingItem({ kind, id })}
            onDragEndItem={() => setDraggingItem(null)}
          />
          <div style={{ padding: '0 16px' }}>
            <GlobalCleanupSection status={globalStatus} onRetire={setRetireId} />
          </div>
        </div>
        <Canvas
          projects={projects}
          desiredMcp={desired?.library.mcp ?? {}}
          desiredSkills={desired?.library.skills ?? {}}
          desiredPlugins={desired?.library.plugins ?? {}}
          desiredSnippets={desired?.library.snippets ?? {}}
          lastApplied={desired?.lastApplied ?? {}}
          onSelect={setSelected}
          onDropItem={onDropItem}
          onUnassignMcp={onUnassignMcp}
          draggingItem={draggingItem}
          pendingAssignments={desired?.assignments}
        />
        <DetailPanel project={selected} assignments={selected ? desired?.assignments[selected.path] : undefined} onUnassign={onUnassignItem} />
      </div>
      <DiffModal plan={plan} onConfirm={confirmApply} onCancel={() => setPlan(null)} />
      {retireId && (
        <ConfirmModal
          title={`退役全局 MCP:${retireId}`}
          body={`将从 ~/.claude.json 顶层移除 ${retireId}。删除后,未显式装配此 MCP 的项目将不再自动获得它(它仍保留在库中,可随时装配给项目)。已自动备份,可回滚。`}
          confirmLabel="确认退役"
          onConfirm={confirmRetire}
          onCancel={() => setRetireId(null)}
        />
      )}
    </div>
  );
}
