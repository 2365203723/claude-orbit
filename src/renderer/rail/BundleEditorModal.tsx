import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import type { LibraryBundle, LibraryMcp, LibrarySkill, LibraryPlugin } from '../../main/station/types';
import { GlassModal } from '../theme/GlassModal';
import { springSnappy } from '../theme/springs';

interface BundleEditorModalProps {
  bundle?: LibraryBundle;           // undefined = 新建
  libraryMcp: LibraryMcp[];
  librarySkills: LibrarySkill[];
  libraryPlugins: LibraryPlugin[];
  onClose: () => void;
  onSave: (bundle: LibraryBundle) => void;
  onDelete?: (bundleId: string) => void;
}

export function BundleEditorModal({ bundle, libraryMcp, librarySkills, libraryPlugins, onClose, onSave, onDelete }: BundleEditorModalProps) {
  const isNew = !bundle;
  const [name, setName] = useState(bundle?.name ?? '');
  const [desc, setDesc] = useState(bundle?.description ?? '');
  const [icon, setIcon] = useState(bundle?.icon ?? '');
  const [version, setVersion] = useState(bundle?.version ?? '1.0.0');
  const [selectedMcp, setSelectedMcp] = useState<Set<string>>(new Set(bundle?.mcp ?? []));
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set(bundle?.skills ?? []));
  const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(new Set(bundle?.plugins ?? []));

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleSave = useCallback(() => {
    const id = bundle?.id ?? name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!id || !name.trim()) return;
    onSave({
      id,
      name: name.trim(),
      description: desc.trim() || undefined,
      icon: icon.trim() || undefined,
      version: version.trim() || '1.0.0',
      mcp: Array.from(selectedMcp),
      skills: Array.from(selectedSkills),
      plugins: Array.from(selectedPlugins),
    } as LibraryBundle);
    onClose();
  }, [bundle?.id, name, desc, icon, version, selectedMcp, selectedSkills, selectedPlugins, onSave, onClose]);

  const toggleMcp = useCallback((id: string) => toggle(setSelectedMcp, id), []);
  const toggleSkill = useCallback((id: string) => toggle(setSelectedSkills, id), []);
  const togglePlugin = useCallback((id: string) => toggle(setSelectedPlugins, id), []);

  const chipStyle = (active: boolean) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--bg-canvas)',
    color: active ? '#fff' : 'var(--text-primary)',
    fontSize: 11, cursor: 'pointer', userSelect: 'none' as const,
    margin: '1px 2px',
  });

  const total = selectedMcp.size + selectedSkills.size + selectedPlugins.size;

  return (
    <GlassModal width={560} maxHeight="80vh" column top onClose={onClose} ariaLabel={isNew ? '新建 Bundle' : `编辑 Bundle ${bundle!.name}`}>
        <h2 className="serif" style={{ marginTop: 0, fontSize: 18, marginBottom: 16 }}>
          {isNew ? '📦 新建 Bundle' : `📦 编辑 Bundle · ${bundle!.name}`}
          {total > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>({total} 个组件)</span>}
        </h2>

        {/* Basic info */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="图标" spellCheck={false}
            style={{ width: 60, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: 16, textAlign: 'center' }} />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Bundle 名称" spellCheck={false}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: 13 }} />
          <input value={version} onChange={e => setVersion(e.target.value)} placeholder="版本"
            style={{ width: 100, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: 13 }} />
        </div>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="描述（可选）" spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: 12, marginBottom: 16 }} />

        {/* Member selection */}
        <div style={{ overflowY: 'auto', flex: 1, marginRight: -4, paddingRight: 4 }}>
          <div style={{ marginBottom: 12 }}>
            <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>MCP 服务器 ({selectedMcp.size})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {libraryMcp.map(m => (
                <span key={m.id} onClick={() => toggleMcp(m.id)} style={chipStyle(selectedMcp.has(m.id))}>
                  {selectedMcp.has(m.id) ? '✓' : ''} {m.id}
                </span>
              ))}
              {libraryMcp.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Skills ({selectedSkills.size})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
              {librarySkills.map(s => (
                <span key={s.id} onClick={() => toggleSkill(s.id)} style={chipStyle(selectedSkills.has(s.id))}>
                  {selectedSkills.has(s.id) ? '✓' : ''} {s.id}
                </span>
              ))}
              {librarySkills.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Plugins ({selectedPlugins.size})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {libraryPlugins.map(p => (
                <span key={p.id} onClick={() => togglePlugin(p.id)} style={chipStyle(selectedPlugins.has(p.id))}>
                  {selectedPlugins.has(p.id) ? '✓' : ''} {p.id}
                </span>
              ))}
              {libraryPlugins.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <div>
            {!isNew && onDelete && (
              <motion.button
                onClick={() => { onDelete(bundle!.id); onClose(); }}
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                style={{
                  padding: '6px 14px', borderRadius: 10, border: '1px solid var(--state-drift)',
                  background: 'var(--bg-canvas)', color: 'var(--state-drift)',
                  cursor: 'pointer', fontSize: 12,
                }}
              >🗑 删除</motion.button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <motion.button
              onClick={onClose}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              style={{
                padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg-canvas)', color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >取消</motion.button>
            <motion.button
              onClick={handleSave}
              disabled={!name.trim()}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              style={{
                padding: '6px 14px', borderRadius: 10, border: 'none',
                background: name.trim() ? 'var(--accent)' : 'var(--border)',
                color: name.trim() ? '#fff' : 'var(--text-muted)',
                cursor: name.trim() ? 'pointer' : 'not-allowed',
              }}
            >保存</motion.button>
          </div>
        </div>
    </GlassModal>
  );
}
