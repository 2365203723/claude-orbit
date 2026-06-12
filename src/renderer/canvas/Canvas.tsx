import React, { useMemo, useEffect, useState, useCallback } from 'react';
import ReactFlow, { Background, BackgroundVariant, Controls, useNodesState } from 'reactflow';
import 'reactflow/dist/style.css';
import { ProjectPlanet } from './ProjectPlanet';
import { AddPlaceholder } from './AddPlaceholder';
import { computeOrbitLayout } from './orbitLayout';
import { ContextMenu } from '../components/ContextMenu';
import { STR } from '../i18n/strings';
import type { ProjectState } from '../../main/types';
import type { LibraryMcp, LibrarySkill, LibraryPlugin, LibrarySnippet, LibraryBundle } from '../../main/station/types';
import type { McpStatus } from './McpSatellite';

const nodeTypes = { planet: ProjectPlanet, placeholder: AddPlaceholder };

export interface DragItem { kind: string; id: string; }

interface AssignmentSnapshot {
  mcp: string[];
  skills: string[];
  plugins: string[];
  snippets: string[];
  bundles: string[];
}

export interface GlobalSnapshot {
  mcp: { id: string; hasSecrets: boolean }[];
  skills: string[];
  plugins: string[];
  bundles: LibraryBundle[];
}

export function Canvas({ projects, desiredMcp, desiredSkills, desiredPlugins, desiredSnippets, desiredBundles, lastApplied, onSelect, onDropItem, onUnassignMcp, onUnassignBundle, draggingItem, pendingAssignments, globalSnapshot, onDropGlobal, onUnassignGlobalMcp, onUnassignGlobalSkill, onUnassignGlobalPlugin, onUnassignGlobalBundle, onAddProject, onDeleteProject, pendingPaths }: {
  projects: ProjectState[];
  desiredMcp: Record<string, LibraryMcp>;
  desiredSkills: Record<string, LibrarySkill>;
  desiredPlugins: Record<string, LibraryPlugin>;
  desiredSnippets: Record<string, LibrarySnippet>;
  desiredBundles: Record<string, LibraryBundle>;
  lastApplied: Record<string, { mcpJson: Record<string,any>; localScope: Record<string,any> }>;
  onSelect: (p: ProjectState | null) => void;
  onDropItem?: (path: string, kind: string, id: string) => void;
  onUnassignMcp?: (path: string, mcpId: string) => void;
  onUnassignBundle?: (path: string, bundleId: string) => void;
  draggingItem: DragItem | null;
  pendingAssignments?: Record<string, AssignmentSnapshot>;
  globalSnapshot: GlobalSnapshot;
  onDropGlobal?: (kind: string, id: string) => Promise<void>;
  onUnassignGlobalMcp?: (mcpId: string) => void;
  onUnassignGlobalSkill?: (skillId: string) => void;
  onUnassignGlobalPlugin?: (pluginId: string) => void;
  onUnassignGlobalBundle?: (bundleId: string) => void;
  onAddProject?: () => void;
  onDeleteProject?: (path: string, name: string) => void;
  // 拖拽即应用进行中的项目路径——对应星球脉冲指示
  pendingPaths?: Set<string>;
}) {
  // Layout: projects + synthetic Global node
  const layout = useMemo(() => {
    const assignments = pendingAssignments ?? {};
    const inputs = projects.map(p => {
      const existing = p.mcp.length;
      const pending = (assignments[p.path]?.mcp ?? []).filter(id => !p.mcp.some(m => m.id === id)).length;
      const bundleCount = (assignments[p.path]?.bundles ?? []).length;
      return { path: p.path, mcpCount: existing + pending + bundleCount };
    });
    // Global planet always last
    const globalCount = globalSnapshot.mcp.length + globalSnapshot.bundles.length;
    inputs.push({ path: '__global__', mcpCount: globalCount });
    const positions = computeOrbitLayout(inputs);
    return positions;
  }, [projects, pendingAssignments, globalSnapshot]);

  const computedNodes = useMemo(() => {
    const assignments = pendingAssignments ?? {};
    const nodes: any[] = layout.map(l => {
    if (l.path === '__global__') {
      // Synthetic global planet
      return {
        id: '__global__',
        type: 'planet' as const,
        position: { x: l.x - l.safeRadius, y: l.y - l.safeRadius },
        data: {
          ...l,
          name: '🌐 Global',
          path: '__global__',
          isGlobal: true,
          mcp: globalSnapshot.mcp.map(m => ({ id: m.id, hasSecrets: m.hasSecrets, status: 'applied' as McpStatus })),
          skills: globalSnapshot.skills,
          plugins: globalSnapshot.plugins,
          snippets: [],
          bundles: globalSnapshot.bundles,
          libraryMcp: desiredMcp,
          librarySkills: desiredSkills,
          libraryPlugins: desiredPlugins,
          librarySnippets: desiredSnippets,
          draggingItem,
          isDragOver: draggingItem !== null,
          onDropItem: (path: string, kind: string, id: string) => onDropGlobal?.(kind, id),
          onUnassignMcp: (_path: string, mcpId: string) => onUnassignGlobalMcp?.(mcpId),
          onUnassignSkill: (_path: string, skillId: string) => onUnassignGlobalSkill?.(skillId),
          onUnassignPlugin: (_path: string, pluginId: string) => onUnassignGlobalPlugin?.(pluginId),
          onUnassignBundle: (_path: string, bundleId: string) => onUnassignGlobalBundle?.(bundleId),
          onSelect: () => onSelect(null), // selecting global clears project panel
        },
      };
    }

    const p = projects.find(x => x.path === l.path)!;
    const a = assignments[l.path] ?? { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };

    const inferredMcp = p.mcp.map(m => m.id);
    const pendingMcp = a.mcp.filter(id => !inferredMcp.includes(id));
    // status 统一在下方 mcpWithStatus 计算(依赖 landedIds),此处只收集 id/hasSecrets
    const allMCP = [...p.mcp.map(m => ({ id: m.id, hasSecrets: m.hasSecrets })), ...pendingMcp.map(id => ({ id, hasSecrets: desiredMcp[id]?.hasSecrets ?? false }))];

    const applied = lastApplied[l.path];
    const landedIds = new Set<string>([...Object.keys(applied?.mcpJson ?? {}), ...Object.keys(applied?.localScope ?? {})]);

    const bundledMcpIds = new Set<string>();
    const bundledSkillIds = new Set<string>();
    const bundledPluginIds = new Set<string>();
    for (const bid of a.bundles) {
      const b = desiredBundles[bid];
      if (b) { b.mcp.forEach(id => bundledMcpIds.add(id)); b.skills.forEach(id => bundledSkillIds.add(id)); b.plugins.forEach(id => bundledPluginIds.add(id)); }
    }

    const mcpWithStatus = allMCP.filter(m => !bundledMcpIds.has(m.id)).map(m => ({
      ...m, status: !a.mcp.includes(m.id) ? 'global' as McpStatus : landedIds.has(m.id) ? 'applied' as McpStatus : 'pending' as McpStatus,
    }));

    const inferredSkills = p.skills.filter(s => !bundledSkillIds.has(s.id)).map(s => s.id);
    const pendingSkills = a.skills.filter(id => !inferredSkills.includes(id) && !bundledSkillIds.has(id));
    const allSkills = [...inferredSkills, ...pendingSkills];

    const inferredPlugins = p.plugins.filter(pl => pl.enabled && !bundledPluginIds.has(pl.id)).map(pl => pl.id);
    const pendingPlugins = a.plugins.filter(id => !inferredPlugins.includes(id) && !bundledPluginIds.has(id));
    const allPlugins = [...inferredPlugins, ...pendingPlugins];

    const allSnippets = a.snippets;
    const assignedBundles = (a.bundles ?? []).map(bid => desiredBundles[bid]).filter(Boolean) as LibraryBundle[];

    return { id: l.path, type: 'planet' as const, position: { x: l.x - l.safeRadius, y: l.y - l.safeRadius },
      data: { ...l, name: l.path.split('/').pop() || l.path, mcp: mcpWithStatus, skills: allSkills, plugins: allPlugins, snippets: allSnippets, bundles: assignedBundles,
        libraryMcp: desiredMcp, librarySkills: desiredSkills, libraryPlugins: desiredPlugins, librarySnippets: desiredSnippets,
        draggingItem, isDragOver: draggingItem !== null, isPending: pendingPaths?.has(l.path) ?? false, onDropItem, onUnassignMcp, onUnassignBundle, onSelect: () => onSelect(p) },
    };
  });
    // 零项目空态:在 Global 旁放一个「添加第一个项目」占位节点引导新用户
    if (projects.length === 0) {
      const g = layout.find(l => l.path === '__global__');
      if (g) {
        nodes.push({
          id: '__add_placeholder__',
          type: 'placeholder' as const,
          position: { x: g.x + g.safeRadius * 2.5, y: g.y - 60 },
          selectable: false,
          data: { onAddProject },
        });
      }
    }
    return nodes;
  }, [layout, projects, lastApplied, desiredMcp, desiredSkills, desiredPlugins, desiredSnippets, desiredBundles, pendingAssignments, globalSnapshot, draggingItem, pendingPaths, onDropItem, onUnassignMcp, onUnassignBundle, onSelect, onDropGlobal, onUnassignGlobalMcp, onUnassignGlobalSkill, onUnassignGlobalPlugin, onUnassignGlobalBundle, onAddProject]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; planetPath?: string; planetName?: string; isGlobal?: boolean } | null>(null);

  const onPaneCtx = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY });
  }, []);

  const onNodeCtx = useCallback((_e: any, node: any) => {
    const e = _e as React.MouseEvent; e.preventDefault();
    const name = node.data?.name ?? '';
    const isGlobal = node.data?.isGlobal ?? false;
    setCtxMenu({ x: e.clientX, y: e.clientY, planetPath: node.data?.path, planetName: name, isGlobal });
  }, []);

  // 关闭逻辑(Escape / 点击外部)由 ContextMenu 组件自理

  useEffect(() => { setNodes(current => { const prevById = new Map(current.map(n => [n.id, n])); return computedNodes.map(c => { const prev = prevById.get(c.id); return prev ? { ...c, position: prev.position } : c; }); }); }, [computedNodes, setNodes]);

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
        onNodeClick={(_, n) => n.data?.onSelect?.()} onNodeContextMenu={onNodeCtx} onPaneContextMenu={onPaneCtx}
        nodesDraggable fitView>
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="var(--orbit-line)" style={{ opacity: .35 }} />
        <Controls />
      </ReactFlow>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          header={ctxMenu.planetPath && !ctxMenu.isGlobal ? ctxMenu.planetName : undefined}
          items={ctxMenu.planetPath && !ctxMenu.isGlobal
            ? [{ label: STR.canvas.menuDeleteProject, danger: true, onClick: () => onDeleteProject?.(ctxMenu.planetPath!, ctxMenu.planetName!) }]
            : [{ label: STR.canvas.menuAddProject, onClick: () => onAddProject?.() }]}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
