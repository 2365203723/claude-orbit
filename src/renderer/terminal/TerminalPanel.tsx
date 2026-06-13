import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

let counter = 0;

/** 单个终端会话面板。cwd 锁定为传入的项目路径,在其中跑 claude/codex/git 等。
 *  node-pty 未编译时,available=false,显示安装指引而非崩溃。 */
export function TerminalPanel({ cwd, theme }: { cwd: string; theme: 'light' | 'dark' }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const idRef = useRef<string>(`term-${++counter}-${cwd}`);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'exited'>('loading');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const id = idRef.current;
    const cleanups: (() => void)[] = [];

    (async () => {
      const probe = await window.terminal.available();
      if (disposed) return;
      if (!probe.available) {
        setStatus('unavailable');
        setErrMsg(probe.error ?? null);
        return;
      }

      const term = new Terminal({
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        fontSize: 12,
        cursorBlink: true,
        theme: theme === 'dark'
          ? { background: '#1a1714', foreground: '#e8e2d8', cursor: '#d97757' }
          : { background: '#faf8f3', foreground: '#3a3530', cursor: '#d97757' },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      if (!hostRef.current) return;
      term.open(hostRef.current);
      fit.fit();
      termRef.current = term;
      fitRef.current = fit;

      const res = await window.terminal.create({ id, cwd, cols: term.cols, rows: term.rows });
      if (disposed) { window.terminal.kill(id); return; }
      if (!res.ok) {
        setStatus('unavailable');
        setErrMsg(res.error ?? '创建失败');
        return;
      }
      setStatus('ready');

      cleanups.push(window.terminal.onData(id, data => term.write(data)));
      cleanups.push(window.terminal.onExit(id, () => { setStatus('exited'); }));
      const dataDisp = term.onData(d => window.terminal.input(id, d));
      cleanups.push(() => dataDisp.dispose());

      const ro = new ResizeObserver(() => {
        try {
          fit.fit();
          window.terminal.resize(id, term.cols, term.rows);
        } catch { /* 容器尺寸为 0 时跳过 */ }
      });
      ro.observe(hostRef.current);
      cleanups.push(() => ro.disconnect());
    })();

    return () => {
      disposed = true;
      cleanups.forEach(c => c());
      window.terminal.kill(id);
      termRef.current?.dispose();
      termRef.current = null;
    };
    // cwd 变化时重建会话;theme 在内部读取,不重建避免打断会话
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  // 主题切换:更新已有终端配色,不重建
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme === 'dark'
        ? { background: '#1a1714', foreground: '#e8e2d8', cursor: '#d97757' }
        : { background: '#faf8f3', foreground: '#3a3530', cursor: '#d97757' };
    }
  }, [theme]);

  if (status === 'unavailable') {
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <div style={{ color: 'var(--state-drift)', marginBottom: 8 }}>⚠️ 内置终端不可用</div>
        <div>node-pty 原生模块未编译。请在项目根目录运行:</div>
        <pre style={{ background: 'var(--glass-surface)', padding: 8, borderRadius: 6, marginTop: 6, fontSize: 11, overflowX: 'auto' }}>
          npm install{'\n'}npx electron-rebuild -f -w node-pty
        </pre>
        {errMsg && <div style={{ marginTop: 6, opacity: .6 }}>{errMsg}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {status === 'exited' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px', borderBottom: '1px solid var(--glass-border)' }}>
          会话已结束 — 切换项目或重新打开可新建
        </div>
      )}
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, padding: 6, overflow: 'hidden' }} />
    </div>
  );
}
