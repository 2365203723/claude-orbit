import { describe, it, expect } from 'vitest';
import { mergeMcpJson, mergeLocalScope, mergePluginSettings, mergeSnippetClaudeMd, mergeSnippetSettings } from '../../src/main/station/merge';

describe('mergeMcpJson', () => {
  it('removes prev-managed servers, preserves foreign servers and other top-level keys', () => {
    const existing = { mcpServers: { old: { command: 'x' }, manual: { command: 'm' } }, someOtherKey: 42 };
    const next = mergeMcpJson(existing, { exa: { command: 'exa' } }, { old: { command: 'x' } });
    expect(next.mcpServers).toEqual({ manual: { command: 'm' }, exa: { command: 'exa' } });
    expect((next as any).someOtherKey).toBe(42);
  });
  it('preserves manually-added servers when no prevManaged given', () => {
    const next = mergeMcpJson({ mcpServers: { manual: { command: 'm' } } }, { exa: { command: 'exa' } });
    expect(next.mcpServers).toEqual({ manual: { command: 'm' }, exa: { command: 'exa' } });
  });
  it('works from undefined existing', () => {
    expect(mergeMcpJson(undefined, { exa: { command: 'exa' } })).toEqual({ mcpServers: { exa: { command: 'exa' } } });
  });
});

describe('mergeLocalScope', () => {
  it('sets projects[path].mcpServers, preserves top-level mcpServers and lastCost', () => {
    const existing = {
      mcpServers: { globalA: { command: 'g' } },
      projects: { '/p': { lastCost: 9, mcpServers: { stale: { command: 's' } } }, '/other': { x: 1 } },
    };
    const next = mergeLocalScope(existing, '/p', { firecrawl: { command: 'npx' } }, { stale: { command: 's' } });
    expect(next.projects['/p'].mcpServers).toEqual({ firecrawl: { command: 'npx' } });
    expect(next.projects['/p'].lastCost).toBe(9);
    expect(next.projects['/other']).toEqual({ x: 1 });
    expect(next.mcpServers).toEqual({ globalA: { command: 'g' } });
  });
  it('creates projects + project entry when missing', () => {
    const next = mergeLocalScope({}, '/p', { firecrawl: { command: 'npx' } });
    expect(next.projects['/p'].mcpServers).toEqual({ firecrawl: { command: 'npx' } });
  });
  it('does not mutate the input object', () => {
    const existing = { mcpServers: { globalA: { command: 'g' } }, projects: { '/p': { lastCost: 9 } } };
    const snapshot = JSON.stringify(existing);
    mergeLocalScope(existing, '/p', { firecrawl: { command: 'npx' } });
    expect(JSON.stringify(existing)).toBe(snapshot); // unchanged
  });
});

describe('mergePluginSettings', () => {
  it('adds enabledPlugins to existing settings, preserves other keys', () => {
    const next = mergePluginSettings({ someKey: 1 }, { 'p1': true, 'p2': true });
    expect(next.enabledPlugins).toEqual({ p1: true, p2: true });
    expect(next.someKey).toBe(1);
  });
  it('preserves user-enabled plugins not managed by Orbit', () => {
    const next = mergePluginSettings({ enabledPlugins: { old: true } }, { new: true });
    expect(next.enabledPlugins).toEqual({ old: true, new: true });
  });
  it('removes only previously-Orbit-written plugins listed in prevIds', () => {
    const next = mergePluginSettings({ enabledPlugins: { old: true, user: false } }, { new: true }, ['old']);
    expect(next.enabledPlugins).toEqual({ user: false, new: true });
  });
  it('writes false explicitly so Orbit-managed disables take effect', () => {
    const next = mergePluginSettings({ enabledPlugins: { old: true } }, { old: false }, ['old']);
    expect(next.enabledPlugins).toEqual({ old: false });
  });
});

describe('mergeSnippetClaudeMd', () => {
  it('injects snippet blocks with markers', () => {
    const md = mergeSnippetClaudeMd('# My Doc\n\nSome text', [{ id: 's1', content: 'injected line' }]).content;
    expect(md).toContain('<!-- CLAUDE_STATION:SNIPPET:s1:START -->');
    expect(md).toContain('injected line');
    expect(md).toContain('<!-- CLAUDE_STATION:SNIPPET:s1:END -->');
    expect(md).toContain('# My Doc');
  });
  it('flags shouldDelete for empty existing + empty blocks', () => {
    const r = mergeSnippetClaudeMd(undefined, []);
    expect(r.shouldDelete).toBe(true);
    expect(r.content).toBe('');
  });
  it('flags shouldDelete when file contains only marker blocks and all snippets removed', () => {
    const r = mergeSnippetClaudeMd('<!-- CLAUDE_STATION:SNIPPET:s1:START -->\nx\n<!-- CLAUDE_STATION:SNIPPET:s1:END -->\n', []);
    expect(r.shouldDelete).toBe(true);
    expect(r.content).toBe('');
  });
  it('updates existing snippet blocks when id matches', () => {
    const first = mergeSnippetClaudeMd('# Doc', [{ id: 's1', content: 'v1' }]).content;
    const second = mergeSnippetClaudeMd(first, [{ id: 's1', content: 'v2' }]).content;
    expect(second).toContain('v2');
    expect(second).not.toContain('v1');
    // only one set of markers
    const starts = (second.match(/CLAUDE_STATION:SNIPPET:s1:START/g) || []).length;
    expect(starts).toBe(1);
  });
  it('cleans up trailing blank lines after removal', () => {
    const r = mergeSnippetClaudeMd('# Doc\n\n<!-- CLAUDE_STATION:SNIPPET:s1:START -->\nold\n<!-- CLAUDE_STATION:SNIPPET:s1:END -->\n\n', []);
    expect(r.content).toBe('# Doc');
    expect(r.shouldDelete).toBe(false);
  });
});

describe('mergeSnippetClaudeMd orphan markers', () => {
  it('strips only the orphan START line when END is missing, preserves following content, no duplicate markers', () => {
    const md = 'user text\n<!-- CLAUDE_STATION:SNIPPET:s1:START -->\ntruncated';
    const r = mergeSnippetClaudeMd(md, [{ id: 's1', content: 'new' }]);
    // 孤儿 START 只删自身那一行,后面的用户内容必须保留
    expect(r.content.match(/CLAUDE_STATION:SNIPPET:s1:START/g)?.length).toBe(1);
    expect(r.content).toContain('user text');
    expect(r.content).toContain('truncated');
    // 重新追加的块标记完整成对
    expect(r.content.match(/CLAUDE_STATION:SNIPPET:s1:END/g)?.length).toBe(1);
  });

  it('orphan START does not pair with a later block END on a follow-up merge', () => {
    // 第一次:含孤儿 START + 用户内容,追加 s1 块
    const md = 'user A\n<!-- CLAUDE_STATION:SNIPPET:ghost:START -->\nuser B';
    const r1 = mergeSnippetClaudeMd(md, [{ id: 's1', content: 'body1' }]);
    expect(r1.content).toContain('user A');
    expect(r1.content).toContain('user B');
    // 第二次 merge:孤儿已被清掉,用户内容仍在,不会吞掉 user B
    const r2 = mergeSnippetClaudeMd(r1.content, [{ id: 's1', content: 'body2' }]);
    expect(r2.content).toContain('user A');
    expect(r2.content).toContain('user B');
    expect(r2.content).toContain('body2');
    expect(r2.content).not.toContain('body1');
    expect(r2.content.match(/CLAUDE_STATION:SNIPPET:s1:START/g)?.length).toBe(1);
  });

  it('scrubs a stale id present in the file but not in blocks', () => {
    const md = `<!-- CLAUDE_STATION:SNIPPET:stale:START -->\nold\n<!-- CLAUDE_STATION:SNIPPET:stale:END -->`;
    const r = mergeSnippetClaudeMd(md, [{ id: 's1', content: 'new' }]);
    expect(r.content).not.toContain('stale');
    expect(r.content).not.toContain('old');
    expect(r.content).toContain('new');
  });

  it('removes duplicate blocks for the same id, re-appends exactly one', () => {
    const blk = (b: string) => `<!-- CLAUDE_STATION:SNIPPET:s1:START -->\n${b}\n<!-- CLAUDE_STATION:SNIPPET:s1:END -->`;
    const md = `${blk('one')}\n\n${blk('two')}`;
    const r = mergeSnippetClaudeMd(md, [{ id: 's1', content: 'final' }]);
    expect(r.content.match(/CLAUDE_STATION:SNIPPET:s1:START/g)?.length).toBe(1);
    expect(r.content).not.toContain('one');
    expect(r.content).not.toContain('two');
    expect(r.content).toContain('final');
  });

  it('preserves user content surrounding blocks verbatim', () => {
    const md = `head text\n\n<!-- CLAUDE_STATION:SNIPPET:s1:START -->\nbody\n<!-- CLAUDE_STATION:SNIPPET:s1:END -->\n\ntail text`;
    const r = mergeSnippetClaudeMd(md, [{ id: 's1', content: 'body' }]);
    expect(r.content).toContain('head text');
    expect(r.content).toContain('tail text');
  });
});
