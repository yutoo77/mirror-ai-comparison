// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadJson, downloadText } from './download';

describe('local backup downloads', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['raw', 'json'] as const)(
    'downloads %s content without retaining an object URL',
    async (mode) => {
      vi.useFakeTimers();
      const create = vi.fn<(blob: unknown) => string>(
        () => 'blob:local-backup',
      );
      const revoke = vi.fn();
      vi.stubGlobal('Blob', NodeBlob);
      vi.stubGlobal(
        'URL',
        class extends URL {
          static override createObjectURL = create;
          static override revokeObjectURL = revoke;
        },
      );
      let filename = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        function (this: HTMLAnchorElement) {
          filename = this.download;
        },
      );
      const raw = '{ broken 保存データ\n';
      if (mode === 'raw') downloadText('mirror-recovery.json', raw);
      else downloadJson('mirror-backup.json', { value: '回答' });
      expect(create).toHaveBeenCalledOnce();
      const blob = create.mock.calls[0]?.[0] as unknown as NodeBlob;
      expect(await blob.text()).toBe(
        mode === 'raw' ? raw : JSON.stringify({ value: '回答' }, null, 2),
      );
      expect(filename).toBe(
        mode === 'raw' ? 'mirror-recovery.json' : 'mirror-backup.json',
      );
      expect(document.querySelector('a[download]')).toBeNull();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith('blob:local-backup');
    },
  );
});
