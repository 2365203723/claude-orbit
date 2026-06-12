// Electron 会在 invoke 错误前加 "Error invoking remote method 'station:x': Error: " 前缀——展示时剥掉
// ORBIT_ERR 错误码转用户可读消息(中英双语),避免主进程硬编码文案
export function formatIpcError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const stripped = msg.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '').trim();

  const m = stripped.match(/^ORBIT_ERR::([A-Z_]+)::(.+)$/);
  if (m) return translateOrbitError(m[1], m[2]);
  return stripped;
}

const ERROR_MSGS: Record<string, (detail: string) => string> = {
  CORRUPT_JSON: (file) =>
    `配置文件损坏: ${file} 无法解析。\n为避免覆盖损坏前的内容,本次写入已中止。请手工修复该文件或从备份恢复。\nConfig file corrupt: ${file} could not be parsed. Write aborted to prevent data loss. Please repair or restore from backup.`,
};

function translateOrbitError(code: string, detail: string): string {
  return ERROR_MSGS[code]?.(detail) ?? `ORBIT_ERR::${code}::${detail}`;
}
