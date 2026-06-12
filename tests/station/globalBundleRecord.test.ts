import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// globalSettings.ts 在模块加载时绑定 homedir()——必须在 import 前 mock
const { fakeHome } = vi.hoisted(() => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  return { fakeHome: fs.mkdtempSync(path.join(os.tmpdir(), 'cs-gbid-')) };
});
vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>();
  return { ...orig, homedir: () => fakeHome };
});

import { assignGlobalBundle, unassignGlobalBundle, addGlobalMcp } from '../../src/main/station/globalSettings';
import { emptyState } from '../../src/main/station/store';
import type { StationState } from '../../src/main/station/types';

function makeState(): StationState {
  const s = emptyState();
  s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
  s.library.mcp['fc'] = { id: 'fc', def: { command: 'fc' }, hasSecrets: false };
  s.library.bundles['b1'] = { id: 'b1', name: 'B1', version: '1', mcp: ['exa', 'fc'], skills: [], plugins: [] };
  return s;
}

describe('globalBundles explicit assignment record', () => {
  beforeEach(() => {
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    writeFileSync(join(fakeHome, '.claude.json'), JSON.stringify({ mcpServers: {} }));
    writeFileSync(join(fakeHome, '.claude', 'settings.json'), JSON.stringify({}));
  });
  afterAll(() => rmSync(fakeHome, { recursive: true, force: true }));

  it('manually-added MCPs covering a bundle do NOT mark it assigned', () => {
    const state = makeState();
    // 用户手动添加恰好覆盖 b1 的全部 MCP
    addGlobalMcp('exa', { command: 'exa' });
    addGlobalMcp('fc', { command: 'fc' });
    // 没有显式 assign → globalBundles 不含 b1
    expect(state.globalBundles ?? []).not.toContain('b1');
  });

  it('assign records the id, unassign removes it', () => {
    const state = makeState();
    assignGlobalBundle(state, 'b1');
    expect(state.globalBundles).toContain('b1');
    // 重复 assign 不重复记录
    assignGlobalBundle(state, 'b1');
    expect(state.globalBundles?.filter(id => id === 'b1')).toHaveLength(1);
    unassignGlobalBundle(state, 'b1');
    expect(state.globalBundles).not.toContain('b1');
  });

  it('unassign of unknown bundle id still clears it from the record', () => {
    const state = makeState();
    state.globalBundles = ['ghost'];
    unassignGlobalBundle(state, 'ghost');
    expect(state.globalBundles).not.toContain('ghost');
  });
});
