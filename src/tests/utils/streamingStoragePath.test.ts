import path from 'path';
import { resolveStreamingServiceStoragePath } from '../../utils/streamingStoragePath';

describe('resolveStreamingServiceStoragePath', () => {
   const cwd = '/workspace/srota-app-services';
   const preferred = path.resolve(cwd, '../srota-streaming-services/storage');
   const legacy = path.resolve(cwd, '../streaming-service/storage');

   test('defaults to srota-streaming-services storage in development when unset', () => {
      expect(resolveStreamingServiceStoragePath(cwd, 'development', undefined, () => false)).toBe(
         preferred,
      );
   });

   test('redirects legacy ../streaming-service/storage to srota-streaming-services when it exists', () => {
      const exists = (target: string) =>
         target === preferred || target === legacy;

      expect(
         resolveStreamingServiceStoragePath(
            cwd,
            'development',
            '../streaming-service/storage',
            exists,
         ),
      ).toBe(preferred);
   });

   test('uses explicit development path when it exists', () => {
      const custom = '/data/shared-storage';
      expect(
         resolveStreamingServiceStoragePath(cwd, 'development', custom, (p) => p === custom),
      ).toBe(custom);
   });

   test('requires STREAMING_SERVICE_STORAGE_PATH outside development', () => {
      expect(() => resolveStreamingServiceStoragePath(cwd, 'production', undefined)).toThrow(
         'Missing required environment variable: STREAMING_SERVICE_STORAGE_PATH',
      );
   });
});
