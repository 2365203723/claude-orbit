import { join } from 'node:path';
import { homedir } from 'node:os';

export interface OrbitPaths { orbitDir: string; stateFile: string; backupsDir: string; }

export function orbitPaths(home: string = homedir()): OrbitPaths {
  const orbitDir = join(home, '.claude-orbit');
  return { orbitDir, stateFile: join(orbitDir, 'state.json'), backupsDir: join(orbitDir, 'backups') };
}
