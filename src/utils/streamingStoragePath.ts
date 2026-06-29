import fs from 'fs';
import path from 'path';

export function resolveStreamingServiceStoragePath(
   cwd: string,
   currentNodeEnv: string,
   rawPath: string | undefined,
   pathExists: (targetPath: string) => boolean = fs.existsSync,
): string {
   const preferredSibling = path.resolve(cwd, '../srota-streaming-services/storage');
   const legacySibling = path.resolve(cwd, '../streaming-service/storage');

   if (currentNodeEnv === 'development') {
      if (!rawPath) {
         return preferredSibling;
      }

      const resolved = path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath);

      if (resolved === legacySibling && pathExists(preferredSibling)) {
         return preferredSibling;
      }

      if (!pathExists(resolved) && pathExists(preferredSibling)) {
         return preferredSibling;
      }

      return resolved;
   }

   if (!rawPath) {
      throw new Error('Missing required environment variable: STREAMING_SERVICE_STORAGE_PATH');
   }

   return path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath);
}
