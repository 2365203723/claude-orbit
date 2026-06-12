import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeSnippetSettings, snippetSettingKeys } from '../../src/main/station/merge';
import { readJsonStrict, writeJsonAtomic } from '../../src/main/station/safeJson';

describe('mergeSnippetSettings cleanup', () => {
  it('removes previously written hook/env keys when blocks are gone (legacy SnippetSettingKeys)', () => {
    const existing = { hooks: { PreToolUse: [{ x: 1 }], UserHook: [{ y: 2 }] }, env: { ORBIT_K: 'v', USER_K: 'u' } };
    const prevKeys = { hooks: ['PreToolUse'], env: ['ORBIT_K'] };
    const next = mergeSnippetSettings(existing, [], prevKeys).settings;
    expect(next.hooks).toEqual({ UserHook: [{ y: 2 }] });
    expect(next.env).toEqual({ USER_K: 'u' });
  });
  it('keeps keys still covered by current blocks', () => {
    const existing = { hooks: { PreToolUse: [{ old: true }] } };
    const blocks = [{ id: 's1', kind: 'hooks', content: JSON.stringify({ PreToolUse: [{ new: true }] }) }];
    const next = mergeSnippetSettings(existing, blocks, { hooks: ['PreToolUse'], env: [] }).settings;
    expect(next.hooks.PreToolUse).toEqual([{ new: true, _orbitSnippet: 's1' }]);
  });
  it('preserves user hooks under the same event key across assign/unassign', () => {
    const userHook = { matcher: 'user', hooks: [{ type: 'command', command: 'echo' }] };
    const existing = { hooks: { PostToolUse: [userHook] } };
    const blocks = [{ id: 's1', kind: 'hooks', content: JSON.stringify({ PostToolUse: [{ matcher: 'orbit' }] }) }];
    const assigned = mergeSnippetSettings(existing, blocks, { hooks: [], env: {} });
    expect(assigned.settings.hooks.PostToolUse).toHaveLength(2);
    expect(assigned.settings.hooks.PostToolUse[0]).toEqual(userHook);
    // unassign: only the Orbit-tagged entry is removed
    const unassigned = mergeSnippetSettings(assigned.settings, [], assigned.meta).settings;
    expect(unassigned.hooks.PostToolUse).toEqual([userHook]);
  });
  it('deletes event key when only Orbit entries remain after unassign', () => {
    const blocks = [{ id: 's1', kind: 'hooks', content: JSON.stringify({ PostToolUse: [{ matcher: 'orbit' }] }) }];
    const assigned = mergeSnippetSettings({}, blocks, { hooks: [], env: {} });
    const unassigned = mergeSnippetSettings(assigned.settings, [], assigned.meta).settings;
    expect(unassigned.hooks ?? {}).toEqual({});
  });
  it('restores prior env value on unassign and keeps user-edited values', () => {
    const existing = { env: { K: 'original', OTHER: 'o' } };
    const blocks = [{ id: 's1', kind: 'env', content: 'K=orbit\nNEW=n' }];
    const assigned = mergeSnippetSettings(existing, blocks, { hooks: [], env: {} });
    expect(assigned.settings.env).toEqual({ K: 'orbit', NEW: 'n', OTHER: 'o' });
    // unassign: K restored to original, NEW removed
    const unassigned = mergeSnippetSettings(assigned.settings, [], assigned.meta).settings;
    expect(unassigned.env).toEqual({ K: 'original', OTHER: 'o' });
    // user edits the value Orbit wrote -> unassign keeps the edit
    const edited = { ...assigned.settings, env: { ...assigned.settings.env, K: 'user-edited' } };
    const unassigned2 = mergeSnippetSettings(edited, [], assigned.meta).settings;
    expect(unassigned2.env.K).toBe('user-edited');
  });
  it('snippetSettingKeys extracts hook and env keys', () => {
    const keys = snippetSettingKeys([
      { kind: 'hooks', content: JSON.stringify({ PreToolUse: [] }) },
      { kind: 'env', content: 'A=1\nB=2' },
    ]);
    expect(keys.hooks).toEqual(['PreToolUse']);
    expect(keys.env.sort()).toEqual(['A', 'B']);
  });
});

describe('safeJson', () => {
  it('readJsonStrict throws on corrupt file instead of returning undefined', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sj-'));
    const f = join(dir, 'x.json');
    writeFileSync(f, '{ not json');
    expect(() => readJsonStrict(f)).toThrow();
    rmSync(dir, { recursive: true, force: true });
  });
  it('readJsonStrict returns undefined for missing file', () => {
    expect(readJsonStrict('/nonexistent/x.json')).toBeUndefined();
  });
  it('writeJsonAtomic writes valid JSON and leaves no tmp file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sj2-'));
    const f = join(dir, 'out.json');
    writeJsonAtomic(f, { a: 1 });
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 1 });
    expect(existsSync(`${f}.orbit-tmp`)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
