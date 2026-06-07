import { describe, it, expect } from 'vitest';
import { compileProjectTargets } from '../../src/main/station/compile';
import { emptyState } from '../../src/main/station/store';

function lib() {
  const s = emptyState();
  s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
  s.library.mcp['firecrawl'] = { id: 'firecrawl', def: { command: 'npx', env: { K: 'v' } }, hasSecrets: true };
  s.assignments['/p'] = { mcp: ['exa', 'firecrawl'] };
  return s;
}

describe('compileProjectTargets', () => {
  it('routes non-secret to mcpJson, secret to localScope', () => {
    const t = compileProjectTargets(lib(), '/p');
    expect(Object.keys(t.mcpJson)).toEqual(['exa']);
    expect(t.mcpJson['exa']).toEqual({ command: 'exa' });
    expect(Object.keys(t.localScope)).toEqual(['firecrawl']);
    expect(t.localScope['firecrawl']).toEqual({ command: 'npx', env: { K: 'v' } });
  });
  it('empty when no assignment', () => {
    const t = compileProjectTargets(emptyState(), '/none');
    expect(t).toEqual({ mcpJson: {}, localScope: {} });
  });
});
