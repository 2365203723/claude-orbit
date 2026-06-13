import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { GlassModal } from '../theme/GlassModal';

interface DeadSkill {
  id: string;
  sourcePath: string;
  sourceUrl?: string;
  globalCopy?: string;
  fixable: 'global-copy' | 'git-clone' | 'manual';
}

const FIX_LABEL: Record<DeadSkill['fixable'], { text: string; color: string }> = {
  'global-copy': { text: '可从全局复制', color: 'var(--state-applied)' },
  'git-clone': { text: '可从 Git 重拉', color: 'var(--state-pending)' },
  'manual': { text: '需手动处理', color: 'var(--state-drift)' },
};

export function SkillDoctorModal({ onClose, onRepaired }: {
  onClose: () => void;
  onRepaired: (next: any) => void;
}) {
  const [dead, setDead] = useState<DeadSkill[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ repaired: string[]; failed: { id: string; reason: string }[]; manual: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = async () => {
    setError(null);
    try { setDead(await window.station.diagnoseDeadSkills()); }
    catch (e: any) { setError(e?.message ?? String(e)); setDead([]); }
  };
  useEffect(() => { scan(); }, []);

  const repairable = (dead ?? []).filter(d => d.fixable !== 'manual').map(d => d.id);

  const repair = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true); setError(null);
    try {
      const { state, report } = await window.station.repairDeadSkills(ids);
      setReport(report);
      onRepaired(state);
      await scan();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassModal onClose={onClose} ariaLabel="Skill Doctor" width={560} maxHeight={620} column>
      <h2 id="doctor-title" className="serif" style={{ marginTop: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        🩺 Skill Doctor
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.6 }}>
        检测 sourcePath 失效(死链)的 Skill,并按来源自动修复:<br />
        <span style={{ color: 'var(--state-applied)' }}>● 全局还有副本</span> → 直接复制；
        <span style={{ color: 'var(--state-pending)' }}>● 有 Git 来源</span> → 自动 clone 重拉。
      </p>

      {error && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(209,50,33,.08)', border: '1px solid var(--state-drift)', color: 'var(--state-drift)', fontSize: 12, marginBottom: 10 }}>
          ⚠️ {error}
        </div>
      )}

      {dead === null && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>正在扫描…</div>}

      {dead !== null && dead.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--state-applied)', padding: '12px 0' }}>✅ 没有发现死链 Skill,一切正常。</div>
      )}

      {dead !== null && dead.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            发现 {dead.length} 个死链,其中 {repairable.length} 个可自动修复:
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 10, padding: 6 }}>
            {dead.map(d => {
              const meta = FIX_LABEL[d.fixable];
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', fontSize: 12, borderBottom: '1px solid var(--glass-border)' }}>
                  <span style={{ flex: 1, fontWeight: 500 }}>{d.id}</span>
                  <span style={{ fontSize: 10, color: meta.color, whiteSpace: 'nowrap' }}>● {meta.text}</span>
                  {d.fixable !== 'manual' && (
                    <button type="button" className="icon-btn" disabled={busy}
                      onClick={() => repair([d.id])}
                      style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--glass-border)', borderRadius: 6, cursor: busy ? 'default' : 'pointer' }}>
                      修复
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {report && (
        <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.7 }}>
          {report.repaired.length > 0 && <div style={{ color: 'var(--state-applied)' }}>✅ 已修复 {report.repaired.length} 个</div>}
          {report.failed.length > 0 && <div style={{ color: 'var(--state-drift)' }}>✗ 失败 {report.failed.length} 个:{report.failed.map(f => `${f.id}(${f.reason})`).join('、')}</div>}
          {report.manual.length > 0 && <div style={{ color: 'var(--text-muted)' }}>需手动:{report.manual.join('、')}</div>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
        <button type="button" onClick={scan} disabled={busy}
          style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
          重新扫描
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {repairable.length > 0 && (
            <motion.button whileTap={{ scale: .97 }} type="button" disabled={busy}
              onClick={() => repair(repairable)}
              style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--state-applied)', background: 'var(--bg-canvas)', color: 'var(--state-applied)', cursor: busy ? 'default' : 'pointer', fontSize: 12, fontWeight: 600 }}>
              {busy ? '修复中…' : `一键修复全部 (${repairable.length})`}
            </motion.button>
          )}
          <button type="button" onClick={onClose}
            style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
            关闭
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
