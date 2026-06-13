import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { registerIpc } from './ipc';
import { registerTerminalIpc, killAllTerminals } from './terminal';
import { sweepStaleTempFiles } from './station/safeJson';
import { orbitPaths } from './station/paths';

/** 启动时清理上次崩溃写入遗留的 *.orbit-tmp,避免半成品文件干扰目录扫描 */
function sweepTempFiles(): void {
  const home = homedir();
  sweepStaleTempFiles(home);                          // ~/.claude.json.orbit-tmp
  sweepStaleTempFiles(join(home, '.claude'));         // settings.json / skills 等
  sweepStaleTempFiles(orbitPaths(home).orbitDir);     // state.json
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#F5F4EE',
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  sweepTempFiles();
  registerIpc();
  registerTerminalIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => killAllTerminals());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
