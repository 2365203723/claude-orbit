import { describe, it, expect } from 'vitest';
import { KIND_COLOR, kindColorOf } from '../../src/renderer/theme/kinds';
import { STR, countLabel } from '../../src/renderer/i18n/strings';

describe('kinds 色 token', () => {
  it('全部指向 CSS 变量,不含写死 hex', () => {
    for (const v of Object.values(KIND_COLOR)) {
      expect(v).toMatch(/^var\(--kind-/);
    }
  });
  it('kindColorOf 归一化 DetailPanel 的大写 kind', () => {
    expect(kindColorOf('MCP')).toBe(KIND_COLOR.mcp);
    expect(kindColorOf('Skill')).toBe(KIND_COLOR.skill);
    expect(kindColorOf('Plugin')).toBe(KIND_COLOR.plugin);
  });
  it('未知 kind 回退到 muted 而非 undefined', () => {
    expect(kindColorOf('whatever')).toBe('var(--text-muted)');
  });
});

describe('i18n strings', () => {
  it('计数句式统一为「N 个 X」', () => {
    expect(countLabel(2, 'Skill')).toBe('2 个 Skill');
  });
  it('空态文案统一', () => {
    expect(STR.library.emptySection).toBe(STR.panel.empty);
  });
});
