import { describe, it, expect } from 'vitest';
import { assignMcp, unassignMcp } from '../../src/main/station/assign';
import { emptyState } from '../../src/main/station/store';

function base() {
  const s = emptyState();
  s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
  return s;
}

describe('assignMcp / unassignMcp', () => {
  it('assigns a library mcp to a project (immutably)', () => {
    const s = base();
    const next = assignMcp(s, '/p', 'exa');
    expect(next.assignments['/p'].mcp).toEqual(['exa']);
    expect(s.assignments['/p']).toBeUndefined(); // original untouched
  });
  it('is idempotent on duplicate assign', () => {
    let s = base();
    s = assignMcp(s, '/p', 'exa');
    s = assignMcp(s, '/p', 'exa');
    expect(s.assignments['/p'].mcp).toEqual(['exa']);
  });
  it('ignores assigning an id not in library', () => {
    const s = base();
    const next = assignMcp(s, '/p', 'ghost');
    expect(next).toEqual(s);
  });
  it('unassign removes the id', () => {
    let s = base();
    s = assignMcp(s, '/p', 'exa');
    s = unassignMcp(s, '/p', 'exa');
    expect(s.assignments['/p'].mcp).toEqual([]);
  });
});
