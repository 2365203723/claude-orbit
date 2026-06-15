import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, type GlobalSnapshot } from './canvas/Canvas';
import type { DragItem } from './canvas/Canvas';
import { DetailPanel } from './panel/DetailPanel';
import { LibraryRail } from './rail/LibraryRail';
import { ConfirmModal } from './apply/ConfirmModal';
import { EnvEditModal } from './rail/EnvEditModal';
import { AddProjectModal } from './rail/AddProjectModal';
import { BundleEditorModal } from './rail/BundleEditorModal';
import { SkillDoctorModal } from './rail/SkillDoctorModal';
import { TerminalPanel } from './terminal/TerminalPanel';
import { GlassModal } from './theme/GlassModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { STR } from './i18n/strings';
import type { ProjectState } from '../main/types';
import type { StationState, LibraryBundle } from '../main/station/types';
import { formatIpcError } from './ipcError';

function emptyGlobal(): GlobalSnapshot { return { mcp: [], skills: [], plugins: [], bundles: [] }; }

type ThemePref = 'light' | 'dark' | 'auto';
const THEME_KEY = 'orbit-theme';
const SIDEBAR_WIDTH_KEY = 'orbit-sidebar-width';
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const THEME_LABEL: Record<ThemePref, string> = { light: '☀️ 浅色', dark: '🌙 深色', auto: '🌗 跟随系统' };

export function App() {
  const [desired, setDesired] = useState<StationState | null>(null);
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [skillHealth, setSkillHealth] = useState<{ dead: string[]; incomplete: string[] } | null>(null);
  const [selected, setSelected] = useState<ProjectState | null>(null);
  const [globalSelected, setGlobalSelected] = useState(false);
  const [themePref, setThemePref] = useState<ThemePref>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) || '');
    return v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : SIDEBAR_DEFAULT;
  });
  const sidebarResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  // 移除全局 MCP 可能带走 ~/.claude.json 里的密钥配置——经确认弹窗后才执行
  const [retireId, setRetireId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<DragItem | null>(null);
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null);
  const [addingProject, setAddingProject] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  // 删除文件夹的二段确认:首次点击进入 armed,3 秒未再点自动回退
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [globalSnapshot, setGlobalSnapshot] = useState<GlobalSnapshot>(emptyGlobal);
  const [ipcError, setIpcError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  // 内置终端:底部 dock,cwd 锁定选中项目;高度可调并持久化
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('orbit-terminal-height') || '');
    return v >= 120 && v <= 700 ? v : 280;
  });
  const termResizeRef = useRef<number | null>(null);
  // 首次扫描完成前显示骨架屏——扫描慢时(大量项目/网络盘)不能看起来像数据丢失
  const [booted, setBooted] = useState(false);
  // 拖拽即应用进行中的项目路径——对应星球做脉冲指示,不做全屏 spinner
  const [pendingPaths, setPendingPaths] = useState<Set<string>>(new Set());

  const [editingBundle, setEditingBundle] = useState<LibraryBundle | null>(null); // null = 关闭; undefined 作新建
  const [bundleEditorOpen, setBundleEditorOpen] = useState(false);
  const desiredRef = useRef<StationState | null>(null);
  desiredRef.current = desired;
  const projectsRef = useRef<ProjectState[]>([]);
  projectsRef.current = projects;

  const reloadGlobalRef = useRef<() => Promise<void>>(async () => {});
  // 过期响应防护:并发 reload 时只接受最后一次发起的结果
  const reloadSeqRef = useRef(0);
  const reloadGlobalSeqRef = useRef(0);

  // toast 自动消隐
  useEffect(() => {
    if (!ipcError) return;
    const t = setTimeout(() => setIpcError(null), 6000);
    return () => clearTimeout(t);
  }, [ipcError]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  // 安全网:漏网的 unhandled rejection 与同步抛错都走同一 toast。
  // ErrorBoundary 截获 React 渲染期异常;这里补 boundary 之外的(如事件 handler 内)。
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => setIpcError(formatIpcError(e.reason));
    // 仅在有真实 Error 时提示——过滤 img/script 资源加载错误造成的噪音
    const onError = (e: ErrorEvent) => { if (e.error instanceof Error) setIpcError(formatIpcError(e.error)); };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  const reloadGlobal = useCallback(async () => {
    const seq = ++reloadGlobalSeqRef.current;
    try {
      const gs = await window.station.getGlobalSnapshot();
      if (seq !== reloadGlobalSeqRef.current) return; // 已有更新的请求在途,丢弃旧快照

      // Global 右侧是磁盘实时扫描;左侧能力库来自 desired state。
      // 如果外部刚安装了 skill,右侧会先看到,左侧仍旧。此处自动触发一次
      // scan/import,把全局新 skill 复制进 Orbit 库并刷新 desired,保证两侧一致。
      let desiredNow = desiredRef.current;
      const missingGlobalSkill = gs.skills.some(s => !desiredNow?.library.skills?.[s.id]);
      if (missingGlobalSkill) {
        const { state: next } = await window.station.importDiscoveredSkills();
        if (seq !== reloadGlobalSeqRef.current) return;
        setDesired(next);
        desiredNow = next;
      }

      const lib = desiredNow?.library.bundles ?? {};
      setGlobalSnapshot({
        mcp: gs.mcp.map(m => ({ id: m.id, hasSecrets: m.hasSecrets })),
        skills: gs.skills.map(s => s.id),
        plugins: gs.plugins.filter(p => p.enabled).map(p => p.id),
        // 只显示显式分配的 bundle——绝不从「MCP 全在全局」推断,手动添加会误报
        bundles: gs.bundleIds.map(id => lib[id]).filter((b): b is LibraryBundle => !!b),
      });
    } catch (e) {
      // Global 扫描偶发失败(如 settings.json 临时损坏)不应让项目星球或已渲染的
      // global 星球因抛错消失。保留上一帧 globalSnapshot,不写坏值;错误经调用方
      // 的 guard / unhandledrejection 通道提示。
      console.error('[reloadGlobal]', e);
    }
  }, []); // 不依赖 desired —— 用 ref 读取最新值
  reloadGlobalRef.current = reloadGlobal;

  const reload = useCallback(async () => {
    const seq = ++reloadSeqRef.current;
    try {
      // 聚合通道:主进程一次磁盘扫描同时产出 inferred 与 desired
      const { inferred, desired: d } = await window.station.reload();
      if (seq !== reloadSeqRef.current) return; // 过期响应,丢弃
      setProjects(inferred.projects);
      setDesired(d);
      // 选中的项目对象是按引用持有的旧快照——重新指向磁盘扫描后的新对象,
      // 否则右侧详情面板在 apply / 增删项目后仍显示陈旧的 applied/pending 状态
      setSelected(prev => prev ? (inferred.projects.find(p => p.path === prev.path) ?? null) : null);
      // 后台扫描 skill 源健康(不阻塞主界面)
      window.station.scanSkillHealth().then(h => setSkillHealth(h)).catch(() => {});
      await reloadGlobalRef.current();
    } finally {
      setBooted(true); // 首扫结束(无论成败)即退出骨架屏;后续 reload 无感
    }
  }, []); // 用 ref 打破循环依赖

  // 统一错误通道:IPC 失败时提示 + 强制 reload 让 UI 与真实磁盘状态对齐
  const guard = useCallback(async (fn: () => Promise<unknown>, recover?: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setIpcError(formatIpcError(e));
      try { await (recover ?? reload)(); } catch { /* 重扫也失败时不再叠加提示 */ }
    }
  }, [reload]);

  useEffect(() => { guard(reload); }, [reload, guard]);

  // 主题:localStorage 持久化偏好,auto 时跟随系统外观(Chromium 自动映射 macOS)
  useEffect(() => {
    if (themePref !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    setSystemDark(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [themePref]);
  const theme: 'light' | 'dark' = themePref === 'auto' ? (systemDark ? 'dark' : 'light') : themePref;
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const cycleTheme = useCallback(() => {
    setThemePref(prev => {
      const next: ThemePref = prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light';
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  // 终端 dock 拖拽调高
  const termHeightRef = useRef(terminalHeight);
  useEffect(() => { termHeightRef.current = terminalHeight; }, [terminalHeight]);
  const onTermResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    termResizeRef.current = e.clientY;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (termResizeRef.current === null) return;
      const delta = termResizeRef.current - e.clientY;
      termResizeRef.current = e.clientY;
      setTerminalHeight(h => Math.min(700, Math.max(120, h + delta)));
    };
    const onUp = () => {
      if (termResizeRef.current === null) return;
      termResizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('orbit-terminal-height', String(termHeightRef.current));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  // 侧边栏拖拽调宽
  const sidebarFinalRef = useRef(SIDEBAR_DEFAULT);
  useEffect(() => { sidebarFinalRef.current = sidebarWidth; }, [sidebarWidth]);
  const onSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarResizeRef.current = { startX: e.clientX, startW: sidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!sidebarResizeRef.current) return;
      const delta = e.clientX - sidebarResizeRef.current.startX;
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, sidebarResizeRef.current.startW + delta));
      setSidebarWidth(w);
    };
    const onUp = () => {
      if (!sidebarResizeRef.current) return;
      sidebarResizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarFinalRef.current));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

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

  // 拖拽即应用进行中标记:对应星球脉冲,写盘完成后移除
  const markPending = useCallback(async (path: string, fn: () => Promise<void>) => {
    setPendingPaths(prev => new Set(prev).add(path));
    try {
      await fn();
    } finally {
      setPendingPaths(prev => { const next = new Set(prev); next.delete(path); return next; });
    }
  }, []);

  // === Project drag handlers ===
  // 拖拽即应用:主进程在 assign 后立即写盘,这里 reload 重扫真实配置,
  // 让卫星直接显示为"已应用"(绿),无需再点 Apply。
  const onDropItem = useCallback((path: string, kind: string, id: string) => guard(() => markPending(path, async () => {
    if (kind === 'bundle') await window.station.assignBundle(path, id);
    else if (kind === 'mcp') await window.station.assign(path, id);
    else if (kind === 'skill') await window.station.assignSkill(path, id);
    else if (kind === 'plugin') await window.station.assignPlugin(path, id);
    else if (kind === 'snippet') await window.station.assignSnippet(path, id);
    await reload();
  })), [guard, reload, markPending]);
  const onUnassignMcp = useCallback((path: string, mcpId: string) => guard(() => markPending(path, async () => { await window.station.unassign(path, mcpId); await reload(); })), [guard, reload, markPending]);
  const onUnassignBundle = useCallback((path: string, bundleId: string) => guard(() => markPending(path, async () => { await window.station.unassignBundle(path, bundleId); await reload(); })), [guard, reload, markPending]);
  const onUnassignItem = useCallback((kind: string, id: string) => guard(async () => {
    if (!selected) return;
    const path = selected.path;
    await markPending(path, async () => {
      if (kind === 'mcp') await window.station.unassign(path, id);
      else if (kind === 'skill') await window.station.unassignSkill(path, id);
      else if (kind === 'plugin') await window.station.unassignPlugin(path, id);
      else if (kind === 'snippet') await window.station.unassignSnippet(path, id);
      await reload();
    });
  }), [selected, guard, reload, markPending]);

  // === Global drag handlers (direct disk write) ===
  const onDropGlobal = useCallback((kind: string, id: string) => guard(async () => {
    if (kind === 'bundle') {
      await window.station.assignGlobalBundle(id);
    } else if (kind === 'mcp') {
      const entry = desired?.library.mcp[id];
      if (entry) await window.station.addGlobalMcp(id, entry.def);
    } else if (kind === 'skill') {
      const entry = desired?.library.skills[id];
      if (entry) await window.station.addGlobalSkill(id, entry.sourcePath);
    } else if (kind === 'plugin') {
      await window.station.addGlobalPlugin(id);
    }
    await reload(); // bundle 分配会更新 state.json 的 globalBundles,需要新 desired
  }, reloadGlobal), [desired, guard, reload, reloadGlobal]);
  // 移除全局 MCP 可能带走 ~/.claude.json 里的密钥配置——走确认弹窗
  const onUnassignGlobalMcp = useCallback((mcpId: string) => { setRetireId(mcpId); }, []);
  const onUnassignGlobalSkill = useCallback((skillId: string) => guard(async () => { await window.station.removeGlobalSkill(skillId); await reloadGlobal(); }, reloadGlobal), [guard, reloadGlobal]);
  const onUnassignGlobalPlugin = useCallback((pluginId: string) => guard(async () => { await window.station.removeGlobalPlugin(pluginId); await reloadGlobal(); }, reloadGlobal), [guard, reloadGlobal]);
  const onUnassignGlobalBundle = useCallback((bundleId: string) => guard(async () => {
    await window.station.unassignGlobalBundle(bundleId);
    await reload();
  }, reloadGlobal), [guard, reload, reloadGlobal]);

  const confirmRetire = useCallback(async () => {
    if (!retireId) return;
    try {
      await guard(async () => { await window.station.removeGlobalMcp(retireId); await reloadGlobal(); }, reloadGlobal);
    } finally {
      setRetireId(null); // 无论成败都关闭弹窗,错误经 toast 提示
    }
  }, [retireId, guard, reloadGlobal]);
  const confirmDeleteUnmount = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await guard(async () => { await window.station.unmountProject(deleteTarget.path); await reload(); });
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, guard, reload]);
  // armed 状态 3 秒自动回退
  useEffect(() => {
    if (!deleteArmed) return;
    const t = setTimeout(() => setDeleteArmed(false), 3000);
    return () => clearTimeout(t);
  }, [deleteArmed]);
  useEffect(() => { if (!deleteTarget) { setDeleteArmed(false); setDeleteBusy(false); } }, [deleteTarget]);
  const confirmDeleteFolder = useCallback(async () => {
    if (!deleteTarget || deleteBusy) return;
    // 移入废纸篓不可静默:首次点击仅 arm,二次点击才执行
    if (!deleteArmed) { setDeleteArmed(true); return; }
    setDeleteBusy(true);
    try {
      // 主进程走 shell.trashItem(可从废纸篓恢复)+ 路径白名单校验。
      // 失败时弹窗保持打开,错误经 toast 提示
      const res = await window.station.deleteProjectFolder(deleteTarget.path);
      if (!res.ok) {
        setIpcError(`移入废纸篓失败${res.error ? `: ${res.error}` : ''}`);
        return;
      }
      await guard(async () => { await reload(); });
      setDeleteTarget(null);
    } catch (e) {
      setIpcError(formatIpcError(e));
    } finally {
      setDeleteBusy(false);
      setDeleteArmed(false);
    }
  }, [deleteTarget, deleteArmed, deleteBusy, guard, reload]);

  const lib = desired?.library;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', WebkitUserSelect: 'none', WebkitAppRegion: 'drag', position: 'relative' } as React.CSSProperties}>
        <span className="serif" style={{ fontWeight: 600, WebkitAppRegion: 'drag' }}>Claude Orbit</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', position: 'absolute', right: 16, WebkitAppRegion: 'no-drag' }}>
          <motion.button whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.8 }}
            onClick={() => setAddingProject(true)}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, WebkitAppRegion: 'no-drag' }}>
            + 添加项目
          </motion.button>
          <button onClick={() => setTerminalOpen(o => !o)}
            title={selected ? `终端 · ${selected.path.split('/').pop()}` : globalSelected ? '终端 · ~ (全局)' : '选中项目后可打开终端'}
            disabled={!selected && !globalSelected}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', background: terminalOpen ? 'var(--accent)' : 'var(--bg-canvas)', color: terminalOpen ? '#fff' : (selected || globalSelected ? 'var(--text-primary)' : 'var(--text-muted)'), cursor: selected || globalSelected ? 'pointer' : 'not-allowed', fontSize: 12, WebkitAppRegion: 'no-drag' }}>
            ⌨️ 终端
          </button>
          <button onClick={cycleTheme} title="切换主题:浅色 → 深色 → 跟随系统"
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', WebkitAppRegion: 'no-drag' }}>
            {THEME_LABEL[themePref]}
          </button>
        </div>
      </header>
      {/* IPC 错误/成功 toast——写盘失败等必须可见,绝不静默 */}
      <AnimatePresence>
        {(ipcError || notice) && (
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            onClick={() => { setIpcError(null); setNotice(null); }}
            role={ipcError ? 'alert' : 'status'}
            style={{
              position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 90,
              maxWidth: 560, padding: '8px 14px', borderRadius: 12, cursor: 'pointer',
              background: 'var(--glass-surface-strong)', backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: `1px solid ${ipcError ? 'var(--state-drift)' : 'var(--state-applied)'}`,
              color: ipcError ? 'var(--state-drift)' : 'var(--state-applied)',
              boxShadow: 'var(--glass-shadow)', fontSize: 12,
            }}>
            {ipcError ? `⚠️ ${ipcError}` : `✅ ${notice}`}
          </motion.div>
        )}
      </AnimatePresence>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {!booted && desired === null ? (
          /* 首次扫描骨架屏:rail 三段 shimmer + 画布中央呼吸圆,避免被误认为数据丢失 */
          <>
            <aside style={{ width: sidebarWidth, background: 'var(--bg-rail)', borderRight: '1px solid var(--border)', padding: 16 }} aria-busy="true" aria-label="正在扫描配置">
              {[0, 1, 2].map(i => (
                <motion.div key={i}
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.6, delay: i * 0.2 }}
                  style={{ height: 52, borderRadius: 10, background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', marginBottom: 14 }} />
              ))}
            </aside>
            <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <motion.div
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                  style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--planet-bg)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>正在扫描项目配置…</span>
              </div>
            </div>
          </>
        ) : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', width: sidebarWidth, flexShrink: 0 }}>
          <LibraryRail
            mcp={lib ? Object.values(lib.mcp) : []}
            skills={lib ? Object.values(lib.skills) : []}
            plugins={lib ? Object.values(lib.plugins) : []}
            snippets={lib ? Object.values(lib.snippets) : []}
            bundles={lib ? Object.values(lib.bundles ?? {}) : []}
            onDragStartItem={(kind, id) => setDraggingItem({ kind, id })}
            onDragEndItem={() => setDraggingItem(null)}
            onEditMcp={setEditingMcpId}
            onCreateBundle={() => { setEditingBundle(null); setBundleEditorOpen(true); }}
            onImportSkill={() => guard(async () => {
              const dir = await window.station.browseFolder();
              if (dir) { const next = await window.station.importSkill(dir); setDesired(next); }
            })}
            onImportAllSkills={() => guard(async () => {
              const { state: next, imported, skipped } = await window.station.importDiscoveredSkills();
              setDesired(next);
              window.station.scanSkillHealth().then(h => setSkillHealth(h)).catch(() => {});
              setNotice(`已同步 ${imported.length} 个 Skill 到 Orbit 库${skipped ? `,跳过 ${skipped} 个` : ''}`);
            })}
            onEditBundle={(b) => { setEditingBundle(b); setBundleEditorOpen(true); }}
            onDeleteBundle={(bid) => guard(async () => {
              const next = await window.station.deleteBundle(bid);
              setDesired(next);
            })}
            deadSkillIds={skillHealth ? new Set([...skillHealth.dead, ...skillHealth.incomplete]) : undefined}
            onOpenDoctor={() => setDoctorOpen(true)}
          />
        </div>
        {/* 拖拽调宽手柄 */}
        <div
          onMouseDown={onSidebarResizeStart}
          style={{
            width: 4, cursor: 'col-resize', flexShrink: 0,
            background: 'transparent',
            transition: 'background .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        />
        {/* Canvas 是最高频崩溃点(computedNodes / reactflow 渲染期)。单独包错误边界:
            崩溃时 rail/header/DetailPanel 仍可用,「重新加载」重扫磁盘修复半更新 state;
            resetKey 在数据变化后自动复位卡片。 */}
        <ErrorBoundary label="画布" onReset={() => guard(reload)} resetKey={`${projects.length}|${globalSnapshot.plugins.length}|${globalSnapshot.mcp.length}`}>
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
          pendingPaths={pendingPaths}
        />
        </ErrorBoundary>
        <DetailPanel project={selected} assignments={selected ? desired?.assignments[selected.path] : undefined} desiredBundles={desired?.library.bundles ?? {}} desiredMcp={desired?.library.mcp ?? {}} onUnassign={onUnassignItem} onUnassignBundle={(bid) => selected && onUnassignBundle(selected.path, bid)} onDeleteProject={(path, name) => setDeleteTarget({ path, name })}
          isGlobal={globalSelected}
          globalSnapshot={globalSnapshot}
          onUnassignGlobalMcp={onUnassignGlobalMcp}
          onUnassignGlobalSkill={onUnassignGlobalSkill}
          onUnassignGlobalPlugin={onUnassignGlobalPlugin}
          onUnassignGlobalBundle={onUnassignGlobalBundle}
          deadSkillIds={skillHealth ? new Set([...skillHealth.dead, ...skillHealth.incomplete]) : undefined}
        />
        </>
        )}
      </div>
      {/* 内置终端 dock —— 选中项目时 cwd=项目路径;选中 Global 时 cwd=~ */}
      {terminalOpen && (selected || globalSelected) &&
        <div style={{ height: terminalHeight, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div onMouseDown={onTermResizeStart}
            style={{ height: 5, cursor: 'row-resize', background: 'transparent', flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
            <span>⌨️ 终端</span>
            <span style={{ flex: 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.path : '~'}</span>
            <button type="button" className="icon-btn" onClick={() => setTerminalOpen(false)} aria-label="关闭终端" style={{ fontSize: 13 }}>×</button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <TerminalPanel key={selected ? selected.path : '~'} cwd={selected ? selected.path : ''} theme={theme} />
          </div>
        </div>}
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
        {bundleEditorOpen && (
          <BundleEditorModal
            bundle={editingBundle ?? undefined}
            libraryMcp={lib ? Object.values(lib.mcp) : []}
            librarySkills={lib ? Object.values(lib.skills) : []}
            libraryPlugins={lib ? Object.values(lib.plugins) : []}
            onClose={() => { setBundleEditorOpen(false); setEditingBundle(null); }}
            onSave={(b) => guard(async () => {
              if (editingBundle) {
                const next = await window.station.updateBundle(b.id, b);
                setDesired(next);
              } else {
                const next = await window.station.createBundle(b);
                setDesired(next);
              }
              setBundleEditorOpen(false);
              setEditingBundle(null);
            })}
            onDelete={(bid) => guard(async () => {
              const next = await window.station.deleteBundle(bid);
              setDesired(next);
            })}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {doctorOpen && (
          <SkillDoctorModal
            onClose={() => setDoctorOpen(false)}
            onRepaired={(next) => {
              setDesired(next);
              window.station.scanSkillHealth().then(h => setSkillHealth(h)).catch(() => {});
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {addingProject && (
          <AddProjectModal
            defaultDir={projects[0] ? projects[0].path.split('/').slice(0, -1).join('/') : undefined}
            onClose={() => setAddingProject(false)}
            onMounted={async (path) => {
              // addProject 失败时抛给 modal 内联展示;成功后才关闭并刷新
              await window.station.addProject(path);
              setAddingProject(false);
              await guard(reload);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {deleteTarget && (
          <GlassModal width={420} top onClose={() => { if (!deleteBusy) setDeleteTarget(null); }} ariaLabel={`删除项目 ${deleteTarget.name}`}>
            <h2 className="serif" style={{ marginTop: 0, fontSize: 18 }}>删除项目 · {deleteTarget.name}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{deleteTarget.path}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <motion.button whileTap={{ scale: .98 }} onClick={confirmDeleteUnmount} disabled={deleteBusy}
                style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, textAlign: 'left', opacity: deleteBusy ? .5 : 1 }}>
                <div style={{ fontWeight: 600 }}>{STR.deleteModal.unmountTitle}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{STR.deleteModal.unmountDesc}</div>
              </motion.button>
              <motion.button whileTap={{ scale: .98 }} onClick={confirmDeleteFolder} disabled={deleteBusy}
                style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--state-drift)', background: deleteArmed ? 'var(--state-drift)' : 'var(--bg-canvas)', color: deleteArmed ? '#fff' : 'var(--state-drift)', cursor: deleteBusy ? 'default' : 'pointer', fontSize: 13, textAlign: 'left', opacity: deleteBusy ? .6 : 1 }}>
                <div style={{ fontWeight: 600 }}>
                  {deleteBusy ? STR.deleteModal.trashBusy : deleteArmed ? STR.deleteModal.trashConfirm : STR.deleteModal.trashTitle}
                </div>
                <div style={{ fontSize: 11, color: deleteArmed ? 'rgba(255,255,255,.8)' : 'var(--text-muted)', marginTop: 2 }}>{STR.deleteModal.trashDesc}</div>
              </motion.button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <motion.button whileTap={{ scale: .96 }} onClick={() => setDeleteTarget(null)} disabled={deleteBusy} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', opacity: deleteBusy ? .5 : 1 }}>{STR.deleteModal.cancel}</motion.button>
            </div>
          </GlassModal>
        )}
      </AnimatePresence>
    </div>
  );
}
