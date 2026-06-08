import React, { useMemo } from 'react';
import ReactFlow, { Background, BackgroundVariant, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { ProjectPlanet } from './ProjectPlanet';
import { computeOrbitLayout } from './orbitLayout';
import type { ProjectState } from '../../main/types';
import type { LibraryMcp } from '../../main/station/types';
import type { McpStatus } from './McpSatellite';

const nodeTypes = { planet: ProjectPlanet };

function statusOf(mcpId: string, project: ProjectState, assignedIds: string[], landedIds: Set<string>): McpStatus {
  if (!assignedIds.includes(mcpId)) return 'global';
  if (landedIds.has(mcpId)) return 'applied';
  return 'pending';
}

export function Canvas({ projects, desiredMcp, lastApplied, onSelect, onDropMcp, onUnassignMcp, draggingMcpId, pendingAssignments }: {
  projects: ProjectState[];
  desiredMcp: Record<string, LibraryMcp>;
  lastApplied: Record<string, { mcpJson: Record<string,any>; localScope: Record<string,any> }>;
  onSelect: (p: ProjectState) => void;
  onDropMcp?: (path: string, mcpId: string) => void;
  onUnassignMcp?: (path: string, mcpId: string) => void;
  draggingMcpId: string | null;
  pendingAssignments?: Record<string, { mcp: string[] }>;
}) {
  const layout = useMemo(() => {
    const assignments = pendingAssignments ?? {};
    const inputs = projects.map(p => {
      const existing = p.mcp.length;
      const pending = (assignments[p.path]?.mcp ?? []).filter(id => !p.mcp.some(m => m.id === id)).length;
      return { path: p.path, mcpCount: existing + pending };
    });
    return computeOrbitLayout(inputs);
  }, [projects, pendingAssignments]);

  const nodes = useMemo(() => {
    const assignments = pendingAssignments ?? {};
    return layout.map(l => {
    const p = projects.find(x => x.path === l.path)!;
    const existing = p.mcp.map(m => m.id);
    const pending = (assignments[l.path]?.mcp ?? []).filter(id => !existing.includes(id));
    const assigned = p.mcp.map(m => m.id);
    const applied = lastApplied[l.path];
    const landedIds = new Set<string>([
      ...Object.keys(applied?.mcpJson ?? {}),
      ...Object.keys(applied?.localScope ?? {}),
    ]);
    return {
      id: l.path,
      type: 'planet',
      draggable: true,
      position: { x: l.x - l.safeRadius, y: l.y - l.safeRadius },
      data: {
        ...l,
        name: l.path.split('/').pop() || l.path,
        mcp: [
          ...p.mcp.map(m => ({ id: m.id, hasSecrets: m.hasSecrets, status: statusOf(m.id, p, assigned, landedIds) })),
          ...pending.map(id => ({ id, hasSecrets: desiredMcp[id]?.hasSecrets ?? false, status: 'pending' as McpStatus })),
        ],
        libraryMcp: desiredMcp,
        draggingMcpId,
        isDragOver: draggingMcpId !== null,
        onDropMcp,
        onUnassignMcp,
        onSelect: () => onSelect(p),
      },
    };
  })}, [layout, projects, lastApplied, desiredMcp, pendingAssignments, draggingMcpId, onDropMcp, onUnassignMcp, onSelect]);

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} fitView nodesDraggable={true} selectNodesOnDrag={false} onNodeClick={(_, n) => n.data?.onSelect?.()}>
        <Background
          variant={BackgroundVariant.Dots} gap={28} size={1.2}
          color="var(--orbit-line)"
          style={{ opacity: .35 }}
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}
