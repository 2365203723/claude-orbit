import { describe, it, expect } from 'vitest';
import { formatIpcError } from '../../src/renderer/ipcError';

describe('formatIpcError', () => {
  it('strips the Electron invoke prefix', () => {
    expect(formatIpcError(new Error("Error invoking remote method 'station:assign': Error: EACCES: permission denied")))
      .toBe('EACCES: permission denied');
  });
  it('strips prefix without the inner Error: marker', () => {
    expect(formatIpcError(new Error("Error invoking remote method 'station:reload': boom")))
      .toBe('boom');
  });
  it('passes plain errors through', () => {
    expect(formatIpcError(new Error('symlink failed'))).toBe('symlink failed');
  });
  it('stringifies non-Error rejections', () => {
    expect(formatIpcError('oops')).toBe('oops');
  });
  it('does not mangle ids that merely contain quotes', () => {
    expect(formatIpcError(new Error('disk full'))).toBe('disk full');
  });
});
