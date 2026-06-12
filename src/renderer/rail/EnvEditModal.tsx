import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { GlassModal } from '../theme/GlassModal';
import { springSnappy } from '../theme/springs';

interface EnvEditModalProps {
  mcpId: string;
  onClose: () => void;
  onSaved: (desired: any) => void;
}

// 行的稳定身份——不能用 key 名(改名/重名会让显隐状态错乱)也不能用 index
let nextUid = 0;

export function EnvEditModal({ mcpId, onClose, onSaved }: EnvEditModalProps) {
  const [pairs, setPairs] = useState<{ uid: number; key: string; value: string }[]>([]);
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.station.getMcpEnv(mcpId)
      .then(data => {
        if (data) {
          setPairs(Object.entries(data.env).map(([k, v]) => ({ uid: nextUid++, key: k, value: v })));
        }
      })
      .catch(e => setError(`加载失败: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, [mcpId]);

  const toggleVisible = useCallback((uid: number) => {
    setVisible(prev => { const next = new Set(prev); if (next.has(uid)) next.delete(uid); else next.add(uid); return next; });
  }, []);

  const removeRow = useCallback((uid: number) => {
    setPairs(prev => prev.filter(p => p.uid !== uid));
  }, []);

  const addRow = useCallback(() => {
    setPairs(prev => [...prev, { uid: nextUid++, key: '', value: '' }]);
  }, []);

  const handleKeyChange = useCallback((uid: number, key: string) => {
    setPairs(prev => prev.map(p => p.uid === uid ? { ...p, key } : p));
  }, []);

  const handleValueChange = useCallback((uid: number, value: string) => {
    setPairs(prev => prev.map(p => p.uid === uid ? { ...p, value } : p));
  }, []);

  const handleSave = useCallback(async () => {
    const env: Record<string, string> = {};
    for (const { key, value } of pairs) {
      if (key.trim()) env[key.trim()] = value;
    }
    setSaving(true); setError(null);
    try {
      const next = await window.station.updateMcpEnv(mcpId, env);
      onSaved(next);
      onClose();
    } catch (e) {
      // 失败时弹窗保持打开,密钥编辑不能静默丢失
      setError(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [mcpId, pairs, onSaved, onClose]);

  return (
    <GlassModal width={500} maxHeight="70vh" column top onClose={onClose} ariaLabel={`环境变量 ${mcpId}`}>
        <h2 className="serif" style={{ marginTop: 0, fontSize: 18, marginBottom: 4 }}>
          环境变量 · <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{mcpId}</span>
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 }}>
          这些值会在 apply 时写入项目配置。含有值的变量会自动路由到项目本地作用域,不进入 .mcp.json。
        </p>

        {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中…</p>}

        {error && <p style={{ color: 'var(--state-drift)', fontSize: 12 }}>{error}</p>}

        {!loading && !error && pairs.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无环境变量。点击下方按钮添加。</p>
        )}

        <div style={{ overflowY: 'auto', flex: 1, marginRight: -4, paddingRight: 4 }}>
          {pairs.map(pair => (
            <div key={pair.uid} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              {/* Key name input */}
              <input
                value={pair.key}
                onChange={e => handleKeyChange(pair.uid, e.target.value)}
                placeholder="变量名"
                spellCheck={false}
                autoComplete="off"
                style={{
                  width: 160, padding: '6px 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-canvas)',
                  color: 'var(--text-primary)', fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                }}
              />
              {/* Value input (masked or not) */}
              <input
                value={pair.value}
                onChange={e => handleValueChange(pair.uid, e.target.value)}
                type={visible.has(pair.uid) ? 'text' : 'password'}
                placeholder="值"
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-canvas)',
                  color: 'var(--text-primary)', fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                }}
              />
              {/* Toggle visibility */}
              <button
                type="button"
                className="icon-btn"
                onClick={() => toggleVisible(pair.uid)}
                title={visible.has(pair.uid) ? '隐藏' : '显示'}
                aria-label={visible.has(pair.uid) ? `隐藏 ${pair.key || '该值'}` : `显示 ${pair.key || '该值'}`}
                style={{ fontSize: 14, opacity: 0.6, width: 24, textAlign: 'center' }}
              >{visible.has(pair.uid) ? '🙈' : '👁'}</button>
              {/* Remove row */}
              <button
                type="button"
                className="icon-btn"
                onClick={() => removeRow(pair.uid)}
                title="移除"
                aria-label={`移除 ${pair.key || '空行'}`}
                style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.5, width: 20, textAlign: 'center' }}
              >×</button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <motion.button
            onClick={addRow}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            style={{
              padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--bg-canvas)', color: 'var(--text-primary)',
              cursor: 'pointer', fontSize: 12,
            }}
          >+ 添加</motion.button>
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
              disabled={saving}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              style={{
                padding: '6px 14px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: '#fff',
                cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1,
              }}
            >{saving ? '保存中…' : '保存'}</motion.button>
          </div>
        </div>
    </GlassModal>
  );
}
