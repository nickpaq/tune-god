import { beforeEach, afterEach, expect, it, vi } from 'vitest';
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
it('keeps a bounded log and can clear it', async () => {
  const debug = await import('./diagnostics');
  for (let i = 0; i < 100; i++) debug.recordDebug('Operation', `Error ${i}`);
  expect(debug.debugSnapshot()).toHaveLength(80);
  expect(debug.debugSnapshot()[0].message).toBe('Error 20');
  debug.clearDebug(); expect(debug.debugSnapshot()).toHaveLength(0);
});
it('redacts URL secrets and limits large messages', async () => {
  const { debugText } = await import('./diagnostics');
  expect(debugText('Failed https://example.com/audio?token=private#secret Authorization: abc')).toBe('Failed https://example.com/audio Authorization: [redacted]');
  expect(debugText('x'.repeat(10000))).toHaveLength(2000);
});
it('continues collecting when storage is unavailable', async () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } });
  const debug = await import('./diagnostics');
  expect(() => debug.recordDebug('Storage', new Error('failure'))).not.toThrow();
  expect(debug.debugSnapshot()[0].message).toContain('failure');
});
it('restores prior errors and ignores malformed saved rows', async () => {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify([{ time: 'previous session', level: 'error', source: 'Import', message: 'Failed' }, null, { message: 'invalid' }]), setItem: vi.fn() });
  const debug = await import('./diagnostics');
  expect(debug.debugSnapshot()).toEqual([{ time: 'previous session', level: 'error', source: 'Import', message: 'Failed' }]);
});
