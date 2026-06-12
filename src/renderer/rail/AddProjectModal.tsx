import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { GlassModal } from '../theme/GlassModal';
import { springSnappy } from '../theme/springs';

interface AddProjectModalProps {
  onClose: () => void;
  onMounted: (path: string) => Promise<void>;
  // 用户最近用的父目录,默认用 homedir
  defaultDir?: string;
}

export function AddProjectModal({ onClose, onMounted, defaultDir }: AddProjectModalProps) {
  const [mode, setMode] = useState<'new' | 'existing' | null>(null);
  const [name, setName] = useState('');
  const [dir, setDir] = useState(defaultDir ?? '');
  const [existingPath, setExistingPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 成功路径直接 return:onMounted 内部会卸载本组件,之后不能再 setState
  const handleCreate = useCallback(async () => {
    if (!dir || !name) return;
    setBusy(true); setError(null);
    try {
      const abs = await window.station.createProjectFolder(dir, name);
      await onMounted(abs);
      return;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
    }
  }, [dir, name, onMounted]);

  const handleMount = useCallback(async () => {
    if (!existingPath) return;
    setBusy(true); setError(null);
    try {
      await onMounted(existingPath);
      return;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
    }
  }, [existingPath, onMounted]);

  return (
    // 挂载中禁止误触关闭
    <GlassModal width={460} top onClose={busy ? () => {} : onClose} ariaLabel="添加项目">
        <h2 className="serif" style={{ marginTop: 0, fontSize: 18, marginBottom: 16 }}>添加项目</h2>

        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <motion.button whileTap={{ scale: .98 }} transition={springSnappy}
              onClick={() => setMode('new')}
              style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
              <div style={{ fontWeight: 600 }}>🆕 新建项目文件夹</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>创建新目录，后续可添加 CLAUDE.md 和 .mcp.json</div>
            </motion.button>
            <motion.button whileTap={{ scale: .98 }} transition={springSnappy}
              onClick={() => setMode('existing')}
              style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
              <div style={{ fontWeight: 600 }}>📁 挂载已有项目</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>已有 .mcp.json 或 CLAUDE.md 的项目目录</div>
            </motion.button>
          </div>
        )}

        {mode === 'new' && (
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>父目录</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={dir} onChange={e => setDir(e.target.value)}
                placeholder={defaultDir ?? '/Users/me/projects'}
                style={{ ...inputStyle, flex: 1 }} />
              <motion.button whileTap={{ scale: .96 }} transition={springSnappy}
                onClick={async () => { const d = await window.station.browseFolder(); if (d) setDir(d); }}
                style={{ ...btnSecStyle, fontSize: 18, padding: '4px 10px' }}>📁</motion.button>
            </div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, display: 'block' }}>项目名</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="my-claude-project" autoFocus
              style={inputStyle} />
          </div>
        )}

        {mode === 'existing' && (
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>项目绝对路径</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={existingPath} onChange={e => setExistingPath(e.target.value)}
                placeholder="/Users/me/projects/my-project" autoFocus
                style={{ ...inputStyle, flex: 1 }} />
              <motion.button whileTap={{ scale: .96 }} transition={springSnappy}
                onClick={async () => { const d = await window.station.browseFolder(); if (d) setExistingPath(d); }}
                style={{ ...btnSecStyle, fontSize: 18, padding: '4px 10px' }}>📁</motion.button>
            </div>
          </div>
        )}

        {error && <p style={{ color: 'var(--state-drift)', fontSize: 12, marginTop: 8 }}>{error}</p>}

        {mode && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <motion.button whileTap={{ scale: .96 }} transition={springSnappy}
              onClick={() => { setMode(null); setError(null); }}
              disabled={busy}
              style={{ ...btnSecStyle, opacity: busy ? .5 : 1 }}>← 返回</motion.button>
            <motion.button whileTap={{ scale: .96 }} transition={springSnappy}
              onClick={mode === 'new' ? handleCreate : handleMount}
              disabled={busy}
              style={{ ...btnPriStyle, opacity: busy ? .5 : 1 }}>
              {busy ? '挂载中…' : mode === 'new' ? '创建并挂载' : '挂载'}
            </motion.button>
          </div>
        )}
    </GlassModal>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg-canvas)',
  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)',
  marginTop: 4,
};
const btnSecStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer',
};
const btnPriStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 10, border: 'none',
  background: 'var(--accent)', color: '#fff', cursor: 'pointer',
};
