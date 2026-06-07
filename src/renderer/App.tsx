import React, { useEffect, useState, useCallback } from 'react';
import { Canvas } from './canvas/Canvas';
import { DetailPanel } from './panel/DetailPanel';
import { LibraryRail } from './rail/LibraryRail';
import { ApplyBar } from './apply/ApplyBar';
import { DiffModal } from './apply/DiffModal';
import type { ProjectState } from '../main/types';
import type { StationState, ApplyPlan } from '../main/station/types';

export function App() {
  const [desired, setDesired] = useState<StationState | null>(null);
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [selected, setSelected] = useState<ProjectState | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [plan, setPlan] = useState<ApplyPlan | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const reload = useCallback(async () => {
    const [inferred, d] = await Promise.all([window.station.getState(), window.station.loadDesired()]);
    setProjects(inferred.projects);
    setDesired(d);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const allProjectPaths = projects.map(p => p.path);

  useEffect(() => {
    if (!desired) return;
    window.station.plan(allProjectPaths).then(p => setPendingCount(p.changes.length));
  }, [desired]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDropMcp = useCallback(async (path: string, mcpId: string) => {
    setDesired(await window.station.assign(path, mcpId));
  }, []);

  const openDiff = async () => setPlan(await window.station.plan(allProjectPaths));
  const confirmApply = async () => { await window.station.apply(allProjectPaths); setPlan(null); await reload(); };

  const libMcp = desired ? Object.values(desired.library.mcp) : [];

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
        <LibraryRail mcp={libMcp} />
        <Canvas projects={projects} onSelect={setSelected} onDropMcp={onDropMcp} />
        <DetailPanel project={selected} />
      </div>
      <DiffModal plan={plan} onConfirm={confirmApply} onCancel={() => setPlan(null)} />
    </div>
  );
}
