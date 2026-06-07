import React, { useMemo } from 'react';
import ReactFlow, { Background, BackgroundVariant, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { ProjectNode } from './ProjectNode';
import type { ProjectState } from '../../main/types';

const nodeTypes = { project: ProjectNode };

export function Canvas({ projects, onSelect, onDropMcp }: {
  projects: ProjectState[];
  onSelect: (p: ProjectState) => void;
  onDropMcp?: (path: string, mcpId: string) => void;
}) {
  const nodes = useMemo(() => projects.map((p, i) => ({
    id: p.path,
    type: 'project',
    position: { x: (i % 3) * 300 + 40, y: Math.floor(i / 3) * 240 + 40 },
    data: { ...p, onDropMcp },
  })), [projects, onDropMcp]);

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => onSelect(n.data as ProjectState)}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
