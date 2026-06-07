import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import type { StationState } from './types';
import { stationPaths } from './paths';

export function emptyState(): StationState {
  return { version: 1, library: { mcp: {} }, assignments: {}, lastApplied: {} };
}

export function loadState(home: string = homedir()): StationState {
  const { stateFile } = stationPaths(home);
  if (!existsSync(stateFile)) return emptyState();
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return emptyState(); }
}

export function saveState(state: StationState, home: string = homedir()): void {
  const { stateFile } = stationPaths(home);
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}
