import React from 'react';
import type { NodeProps } from 'reactflow';
import { McpSatellite, type McpStatus } from './McpSatellite';
import type { LibraryMcp } from '../../main/station/types';
import type { PlanetPosition } from './orbitLayout';

interface ProjectPlanetData extends PlanetPosition {
  name: string;
  mcp: { id: string; hasSecrets: boolean; status: McpStatus }[];
  libraryMcp: Record<string, LibraryMcp>;
  draggingMcpId: string | null;
  isDragOver: boolean;
  onDropMcp?: (path: string, mcpId: string) => void;
  onUnassignMcp?: (path: string, mcpId: string) => void;
  onSelect?: () => void;
}

export function ProjectPlanet({ data }: NodeProps<ProjectPlanetData>) {
  const { name, mcp = [], planetRadius, orbitRadius, draggingMcpId, isDragOver } = data;
  const library = data.libraryMcp ?? {};
  const satAngle = (idx: number) => (idx / Math.max(mcp.length, 1)) * 2 * Math.PI - Math.PI / 2;

  return (
    <div style={{
      width: planetRadius * 2 + orbitRadius * 2 + 20,
      height: planetRadius * 2 + orbitRadius * 2 + 20,
      position: 'relative',
    }}>
      {/* Gravity glow */}
      {isDragOver && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(circle, var(--gravity-glow), transparent 70%)',
          opacity: .7, zIndex: 0, pointerEvents: 'none',
        }} />
      )}

      {/* Orbit ring */}
      {mcp.length > 0 && (
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

      {/* Planet body — click here to select, drag to move */}
      <div
        className="serif"
        onClick={() => data.onSelect?.()}
        style={{
          position: 'absolute', left: '50%', top: '50%',
          width: planetRadius * 2, height: planetRadius * 2,
          transform: 'translate(-50%,-50%)',
          background: 'var(--planet-bg)',
          backdropFilter: 'blur(18px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
          borderRadius: '50%',
          border: '1px solid var(--glass-border)',
          boxShadow: `${isDragOver ? '0 0 28px var(--accent),' : ''} var(--glass-shadow), inset 0 2px 14px var(--glass-highlight)`,
          zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center',
          transition: 'box-shadow 0.3s cubic-bezier(0.34,1.56,0.64,1), transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          fontSize: Math.max(11, Math.round(planetRadius / 3.5)),
          fontWeight: 600, color: 'var(--text-primary)',
          cursor: 'pointer',
          userSelect: 'none',
        }}>
        <span>{name}</span>
        <span style={{ fontSize: Math.max(9, Math.round(planetRadius / 5)),
          color: 'var(--text-muted)', fontWeight: 400 }}>
          {mcp.length} MCP
        </span>
        {mcp.filter(m => m.hasSecrets).length > 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {mcp.filter(m => m.hasSecrets).length} 🔑
          </span>
        )}
      </div>

      {/* Satellites */}
      {mcp.map((m, i) => {
        const a = satAngle(i);
        const halfW = planetRadius + orbitRadius + 10;
        const orbitDist = planetRadius + orbitRadius;
        const sx = halfW + Math.cos(a) * orbitDist;
        const sy = halfW + Math.sin(a) * orbitDist;
        return (
          <div key={m.id} style={{
            position: 'absolute', left: sx, top: sy,
            transform: 'translate(-50%,-50%) scale(1)',
            zIndex: 3,
            animation: `satelliteLand 0.4s cubic-bezier(0.34,1.56,0.64,1) both`,
          }}>
            {/* 可点击卫星：hover 显示 ×，点击撤销 */}
            <div style={{ position: 'relative', display: 'inline-block', cursor:'default' }}>
              <div onClick={(e) => { e.stopPropagation(); data.onUnassignMcp?.(data.path, m.id); }}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer',
                  opacity: 0, transition: 'opacity 0.2s ease',
                  zIndex: 5,
                }}
                className="satellite-x"
              >×</div>
              <McpSatellite label={m.id} hasSecrets={m.hasSecrets} status={m.status} />
            </div>
          </div>
        );
      })}

      {/* Snap preview */}
      {isDragOver && draggingMcpId && library[draggingMcpId] && (
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%,-50%) translateY(-${planetRadius + orbitRadius - 6}px)`,
          zIndex: 4, pointerEvents: 'none', opacity: .85,
        }}>
          <McpSatellite label={draggingMcpId} hasSecrets={library[draggingMcpId].hasSecrets} status="pending" />
          <span style={{ fontSize: 10, color: 'var(--state-pending)', marginLeft: 4 }}>+</span>
        </div>
      )}

      {/* HTML5 DnD overlay — 拦截来自 LibraryRail 的拖拽，不干扰 React Flow */}
      <div
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={e => {
          e.preventDefault();
          const id = e.dataTransfer.getData('application/x-mcp-id');
          if (id && data.onDropMcp) data.onDropMcp(data.path, id);
        }}
        style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}
      />
    </div>
  );
}
