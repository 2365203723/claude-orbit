import { ipcMain, app, type WebContents } from 'electron';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';

// node-pty 是原生模块,需对当前 Electron ABI 重新编译。
// 用动态 require + 容错:未安装/未编译时,终端功能优雅降级而非整个 app 崩溃。
type IPty = {
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  pid: number;
};
type PtyModule = {
  spawn(file: string, args: string[], opts: any): IPty;
};

let pty: PtyModule | null = null;
let ptyLoadError: string | null = null;
function loadPty(): PtyModule | null {
  if (pty || ptyLoadError) return pty;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pty = require('node-pty');
  } catch (e: any) {
    ptyLoadError = e?.message ?? String(e);
    console.warn('[terminal] node-pty 不可用:', ptyLoadError);
  }
  return pty;
}

interface Session {
  pty: IPty;
  wc: WebContents;
}

const sessions = new Map<string, Session>();

function defaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: process.env.COMSPEC || 'powershell.exe', args: [] };
  const shell = process.env.SHELL || '/bin/zsh';
  // 登录 + 交互 shell,加载用户 PATH(claude/codex 等 CLI 通常装在用户路径)
  return { file: shell, args: ['-l'] };
}

/** 解析 orbit CLI 与 launcher bin 的位置:
 *  - 开发期:源码在 src/cli/orbit.ts,bin 在 resources/bin
 *  - 打包后:resources 目录由 electron-builder extraResources 提供 */
function orbitEnv(): Record<string, string> {
  const isDev = !app.isPackaged;
  if (isDev) {
    const root = process.cwd();
    return {
      ORBIT_BIN_DIR: join(root, 'resources', 'bin'),
      ORBIT_CLI_SRC: join(root, 'src', 'cli', 'orbit.ts'),
    };
  }
  const res = process.resourcesPath;
  return {
    ORBIT_BIN_DIR: join(res, 'bin'),
    ORBIT_CLI_JS: join(res, 'cli', 'orbit.cjs'),
  };
}

export function registerTerminalIpc(): void {
  // 能力探测:渲染端据此决定显示终端还是"未安装"提示
  ipcMain.handle('terminal:available', () => ({ available: !!loadPty(), error: ptyLoadError }));

  ipcMain.handle('terminal:create', (e, opts: { id: string; cwd?: string; cols?: number; rows?: number }) => {
    const mod = loadPty();
    if (!mod) return { ok: false, error: ptyLoadError ?? 'node-pty 不可用' };

    const cwd = opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir();
    const { file, args } = defaultShell();
    const oe = orbitEnv();
    // 把 orbit launcher 所在目录前置到 PATH,终端里可直接 `orbit ...`
    const pathWithOrbit = `${oe.ORBIT_BIN_DIR}${delimiter}${process.env.PATH ?? ''}`;
    try {
      const p = mod.spawn(file, args, {
        name: 'xterm-256color',
        cols: opts.cols ?? 80,
        rows: opts.rows ?? 24,
        cwd,
        env: {
          ...process.env,
          ...oe,
          PATH: pathWithOrbit,
          ORBIT_PROJECT: cwd,
          TERM: 'xterm-256color',
        },
      });
      const wc = e.sender;
      sessions.set(opts.id, { pty: p, wc });

      p.onData(data => {
        if (!wc.isDestroyed()) wc.send(`terminal:data:${opts.id}`, data);
      });
      p.onExit(({ exitCode }) => {
        if (!wc.isDestroyed()) wc.send(`terminal:exit:${opts.id}`, exitCode);
        sessions.delete(opts.id);
      });
      return { ok: true, pid: p.pid, cwd };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipcMain.on('terminal:input', (_e, id: string, data: string) => {
    sessions.get(id)?.pty.write(data);
  });

  ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) => {
    try { sessions.get(id)?.pty.resize(cols, rows); } catch { /* 进程已退出 */ }
  });

  ipcMain.on('terminal:kill', (_e, id: string) => {
    const s = sessions.get(id);
    if (s) { try { s.pty.kill(); } catch { /* 已退出 */ } sessions.delete(id); }
  });
}

// app 退出时清理所有 pty,避免遗留子进程
export function killAllTerminals(): void {
  for (const [, s] of sessions) { try { s.pty.kill(); } catch { /* ok */ } }
  sessions.clear();
}
