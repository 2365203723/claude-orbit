import { describe, it, expect } from 'vitest';
import { diffServers } from '../../src/main/station/diff';

describe('diffServers', () => {
  it('reports added/removed/changed by id and deep-equality of def', () => {
    const before = { a: { command: 'a' }, b: { command: 'b' }, c: { command: 'c' } };
    const after  = { a: { command: 'a' }, b: { command: 'B2' }, d: { command: 'd' } };
    const r = diffServers(before, after);
    expect(r.added.sort()).toEqual(['d']);
    expect(r.removed.sort()).toEqual(['c']);
    expect(r.changed.sort()).toEqual(['b']);
  });
  it('empty diff when identical', () => {
    const x = { a: { command: 'a', args: ['1'] } };
    const r = diffServers(x, { a: { command: 'a', args: ['1'] } });
    expect(r.added).toEqual([]); expect(r.removed).toEqual([]); expect(r.changed).toEqual([]);
  });
});
