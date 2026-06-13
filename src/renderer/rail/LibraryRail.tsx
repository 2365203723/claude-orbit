import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { LibraryMcp, LibrarySkill, LibraryPlugin, LibrarySnippet, LibraryBundle } from '../../main/station/types';
import { RubberScroll } from '../theme/RubberScroll';
import { springSnappy, springSmooth } from '../theme/springs';
import { KIND_COLOR, kindColorOf } from '../theme/kinds';
import { ContextMenu } from '../components/ContextMenu';
import { STR } from '../i18n/strings';

function BundleChip({ bundle, onDragStart, onDragEnd, onEditMcp, expanded, onToggle, onEdit, onDelete }: {
  bundle: LibraryBundle;
  onDragStart?: (kind: string, id: string) => void;
  onDragEnd?: () => void;
  onEditMcp?: (id: string) => void;
  expanded?: boolean;
  onToggle?: () => void;
  onEdit?: (bundle: LibraryBundle) => void;
  onDelete?: (bundleId: string) => void;
}) {
  const count = bundle.mcp.length + bundle.skills.length + bundle.plugins.length;
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div style={{ marginBottom: 6 }} onContextMenu={handleContext}>
      <div
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('application/x-station-bundle', JSON.stringify({ kind: 'bundle', id: bundle.id }));
          e.dataTransfer.effectAllowed = 'copy';
          onDragStart?.('bundle', bundle.id);
        }}
        onDragEnd={() => onDragEnd?.()}
      >
        <motion.div
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.96 }}
          transition={springSnappy}
          onClick={e => { e.stopPropagation(); onToggle?.(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8,
            background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', fontSize: 12,
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          }}>
          <span style={{ width: 3, height: 14, borderRadius: 2, background: KIND_COLOR.bundle }} />
          <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={springSnappy} style={{ fontSize: 10, display: 'inline-block' }}>▶</motion.span>
          <span>{bundle.icon ?? '📦'}</span>
          <span style={{ flex: 1 }}>{bundle.name}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{count}</span>
        </motion.div>
      </div>
      {/* 右键菜单 —— 公共 ContextMenu:fixed 定位 + 视口 clamp + Escape/外点关闭 */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            { label: STR.library.menuEdit, onClick: () => onEdit?.(bundle) },
            { label: STR.library.menuDelete, danger: true, onClick: () => onDelete?.(bundle.id) },
          ]}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {/* 展开内部组件 */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSmooth}
            style={{ overflow: 'hidden', paddingLeft: 14 }}>
            {bundle.mcp.map(mcpId => (
              <div key={`mcp:${mcpId}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px 3px 0', fontSize: 11 }}>
                <span style={{ width: 3, height: 10, borderRadius: 2, background: KIND_COLOR.mcp, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{mcpId}</span>
                <button type="button" className="icon-btn"
                  onClick={e => { e.stopPropagation(); e.preventDefault(); onEditMcp?.(mcpId); }}
                  title={STR.library.editEnv}
                  aria-label={`编辑 ${mcpId} 环境变量`}
                  style={{ opacity: .5, fontSize: 12 }}>🔑</button>
              </div>
            ))}
            {bundle.skills.map(skillId => (
              <div key={`skill:${skillId}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px 3px 0', fontSize: 11 }}>
                <span style={{ width: 3, height: 10, borderRadius: 2, background: KIND_COLOR.skill, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--text-muted)' }}>{skillId}</span>
              </div>
            ))}
            {bundle.plugins.map(pluginId => (
              <div key={`plugin:${pluginId}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px 3px 0', fontSize: 11 }}>
                <span style={{ width: 3, height: 10, borderRadius: 2, background: KIND_COLOR.plugin, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--text-muted)' }}>{pluginId}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Chip({ id, kind, hasSecret, deadSource, onDragStart, onDragEnd, onEditMcp }: {
  id: string; kind: string; hasSecret?: boolean; deadSource?: boolean;
  onDragStart?: (kind: string, id: string) => void;
  onDragEnd?: () => void;
  onEditMcp?: (id: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/x-station-item', JSON.stringify({ kind, id }));
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart?.(kind, id);
      }}
      onDragEnd={() => onDragEnd?.()}
      style={{ marginBottom: 6 }}
    >
      <motion.div
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.96 }}
        transition={springSnappy}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'grab',
          padding: '6px 10px', borderRadius: 8,
          background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', fontSize: 12,
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        }}>
        <span style={{ width: 3, height: 14, borderRadius: 2, background: kindColorOf(kind) }} />
        {deadSource && <span title="Skill 源文件缺失,无法使用" aria-label="源文件缺失" style={{ fontSize: 11, flexShrink: 0 }}>⚠️</span>}
        <span style={{ color: deadSource ? 'var(--state-drift)' : undefined }}>{id}</span>
        {kind === 'mcp' && (
          <button type="button" className="icon-btn"
            onClick={e => { e.stopPropagation(); e.preventDefault(); onEditMcp?.(id); }}
            title={hasSecret ? STR.library.editSecret : STR.library.editEnv}
            aria-label={`编辑 ${id} 环境变量`}
            style={{ marginLeft: 'auto', opacity: hasSecret ? 1 : 0.35, fontSize: 13 }}
          >🔑</button>
        )}
      </motion.div>
    </div>
  );
}

function Section({ title, empty, children, defaultOpen }: { title: string; empty: boolean; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        className="serif"
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: 13, fontWeight: 600, marginBottom: open ? 8 : 2, cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={springSnappy} style={{ fontSize: 10, display: 'inline-block' }}>▶</motion.span>
        {title}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSmooth}
            style={{ overflow: 'hidden' }}>
            {empty ? <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 14 }}>{STR.library.emptySection}</div> : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LibraryRail({ mcp, skills, plugins, snippets, bundles, onDragStartItem, onDragEndItem, onEditMcp, onCreateBundle, onEditBundle, onDeleteBundle, onImportSkill, onImportAllSkills, onOpenDoctor, deadSkillIds }: {
  mcp: LibraryMcp[];
  skills: LibrarySkill[];
  plugins: LibraryPlugin[];
  snippets: LibrarySnippet[];
  bundles: LibraryBundle[];
  onDragStartItem?: (kind: string, id: string) => void;
  onDragEndItem?: () => void;
  deadSkillIds?: Set<string>;
  onEditMcp?: (id: string) => void;
  onCreateBundle?: () => void;
  onEditBundle?: (bundle: LibraryBundle) => void;
  onImportSkill?: () => void;
  onImportAllSkills?: () => void;
  onOpenDoctor?: () => void;
  onDeleteBundle?: (bundleId: string) => void;
}) {
  const total = mcp.length + skills.length + plugins.length + snippets.length;
  // useMemo: filter memo 依赖它,每次 render 新建 Set 会让下游 memo 失效
  const bundleIds = useMemo(() => new Set(bundles.flatMap(b => [...b.mcp, ...b.skills, ...b.plugins])), [bundles]);
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // 快捷键: Cmd/Ctrl+F 聚焦搜索, Escape 清空
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const q = query.trim().toLowerCase();
  const filterText = (text: string) => !q || text.toLowerCase().includes(q);
  const filteredBundles = useMemo(
    () => q ? bundles.filter(b => filterText(b.name) || b.mcp.some(filterText) || b.skills.some(filterText) || b.plugins.some(filterText)) : bundles,
    [bundles, q],
  );
  // bundled 项无条件排除,计数/空判定/渲染共用同一来源,标题数字与可见 chip 永远一致
  const filteredMcp = useMemo(() => mcp.filter(m => !bundleIds.has(m.id) && filterText(m.id)), [mcp, q, bundleIds]);
  const filteredSkills = useMemo(() => skills.filter(s => !bundleIds.has(s.id) && filterText(s.id)), [skills, q, bundleIds]);
  const filteredPlugins = useMemo(() => plugins.filter(p => !bundleIds.has(p.id) && filterText(p.id)), [plugins, q, bundleIds]);
  // snippet 不会被收进 bundle(bundle 只含 mcp/skills/plugins),始终显示
  const filteredSnippets = useMemo(() => snippets.filter(s => filterText(s.name ?? s.id)), [snippets, q]);

  const anyVisible = filteredBundles.length + filteredMcp.length + filteredSkills.length + filteredPlugins.length + filteredSnippets.length > 0;

  return (
    <aside style={{ width: 200, background: 'var(--bg-rail)', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
      <RubberScroll className="rail-scroll" style={{ height: '100%', overflowY: 'auto', padding: 16 }}>
        <div className="serif" style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          {STR.library.title} {total > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({total})</span>}
        </div>

        {/* 搜索框 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            ref={searchRef}
            type="text"
            placeholder={STR.library.searchPlaceholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              flex: 1, boxSizing: 'border-box',
              padding: '5px 8px', borderRadius: 6,
              border: '1px solid var(--glass-border)',
              background: 'var(--glass-surface)',
              color: 'var(--text-primary)', fontSize: 11,
              outline: 'none',
            }}
          />
          {onImportAllSkills && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onImportAllSkills}
              title="同步已安装 Skills 到 Orbit 库 (~/.claude-orbit/library/skills)"
              style={{
                flexShrink: 0, height: 28, borderRadius: 6, padding: '0 8px',
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-surface)',
                color: 'var(--text-primary)', fontSize: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >🔄 同步</motion.button>
          )}
          {onImportSkill && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onImportSkill}
              title="从目录导入一个 Skill"
              style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: 6,
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-surface)',
                color: 'var(--text-primary)', fontSize: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >📥</motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onCreateBundle}
            title={STR.library.newBundle}
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: 6,
              border: '1px solid var(--glass-border)',
              background: 'var(--glass-surface)',
              color: 'var(--text-primary)', fontSize: 14,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: '28px',
            }}
          >+</motion.button>
        </div>

        {deadSkillIds && deadSkillIds.size > 0 && (
          <div
            onClick={onOpenDoctor}
            title="点击打开 Skill Doctor 修复"
            style={{
              marginBottom: 8, padding: '6px 8px', borderRadius: 6,
              background: 'rgba(209,50,33,.08)', border: '1px solid rgba(209,50,33,.25)',
              fontSize: 11, color: 'var(--state-drift)', display: 'flex', alignItems: 'center', gap: 6,
              cursor: onOpenDoctor ? 'pointer' : 'default',
            }}>
            <span>🩺</span>
            <span style={{ flex: 1 }}>{deadSkillIds.size} 个 Skill 源文件丢失(死链),点击修复</span>
          </div>
        )}

        {!anyVisible && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>{STR.library.emptySearch}</div>
        )}

        {filteredBundles.length > 0 && (
          <Section title={`${STR.library.sectionBundles} (${filteredBundles.length})`} empty={false}>
            {filteredBundles.map(b => {
              const isExpanded = expandedBundles.has(b.id);
              return <BundleChip key={b.id} bundle={b} onDragStart={onDragStartItem} onDragEnd={onDragEndItem} onEditMcp={onEditMcp}
                expanded={isExpanded} onEdit={onEditBundle} onDelete={onDeleteBundle}
                onToggle={() => {
                  setExpandedBundles(prev => {
                    const next = new Set(prev);
                    if (next.has(b.id)) next.delete(b.id); else next.add(b.id);
                    return next;
                  });
                }}
              />;
            })}
          </Section>
        )}

        <Section title={`${STR.library.sectionMcp} (${filteredMcp.length})`} empty={filteredMcp.length === 0}>
          {filteredMcp.map(m => <Chip key={m.id} id={m.id} kind="mcp" hasSecret={m.hasSecrets} onDragStart={onDragStartItem} onDragEnd={onDragEndItem} onEditMcp={onEditMcp} />)}
        </Section>

        <Section title={`${STR.library.sectionSkills} (${filteredSkills.length})`} empty={filteredSkills.length === 0} defaultOpen={filteredSkills.length > 0}>
          {filteredSkills.map(s => <Chip key={s.id} id={s.id} kind="skill" deadSource={deadSkillIds?.has(s.id)} onDragStart={onDragStartItem} onDragEnd={onDragEndItem} />)}
        </Section>

        <Section title={`${STR.library.sectionPlugins} (${filteredPlugins.length})`} empty={filteredPlugins.length === 0} defaultOpen={filteredPlugins.length > 0}>
          {filteredPlugins.map(p => <Chip key={p.id} id={p.id} kind="plugin" onDragStart={onDragStartItem} onDragEnd={onDragEndItem} />)}
        </Section>

        <Section title={`${STR.library.sectionSnippets} (${filteredSnippets.length})`} empty={filteredSnippets.length === 0} defaultOpen={filteredSnippets.length > 0}>
          {filteredSnippets.map(s => <Chip key={s.id} id={s.id} kind="snippet" onDragStart={onDragStartItem} onDragEnd={onDragEndItem} />)}
        </Section>
      </RubberScroll>
    </aside>
  );
}
