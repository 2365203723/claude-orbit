import { describe, it, expect } from 'vitest';
import { clampMenuPosition } from '../../src/renderer/components/ContextMenu';

describe('clampMenuPosition', () => {
  it('keeps in-bounds coordinates unchanged', () => {
    expect(clampMenuPosition(100, 200, 160, 80, 1280, 800)).toEqual({ left: 100, top: 200 });
  });
  it('clamps right/bottom overflow with 8px margin', () => {
    expect(clampMenuPosition(1270, 790, 160, 80, 1280, 800)).toEqual({ left: 1280 - 160 - 8, top: 800 - 80 - 8 });
  });
  it('never goes off the top-left edge', () => {
    expect(clampMenuPosition(-20, -20, 160, 80, 1280, 800)).toEqual({ left: 8, top: 8 });
  });
});
