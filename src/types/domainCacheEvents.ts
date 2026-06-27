export type DomainAction = 'created' | 'updated' | 'deleted';

export type AppDomainResource =
   | 'audiobook'
   | 'chapter'
   | 'comment'
   | 'review'
   | 'user-profile'
   | 'author-profile'
   | 'playlist'
   | 'playlist-item'
   | 'favorite'
   | 'bookmark'
   | 'note'
   | 'tag'
   | 'genre'
   | 'mood'
   | 'user-audiobook'
   | 'subscription-catalog'
   | 'subscription-gating'
   | 'offline-download';

export interface CacheInvalidateEvent {
   version: 1;
   service: 'app';
   resource: AppDomainResource;
   action: DomainAction;
   id: string;
   queryKeys: string[][];
   relatedIds?: Record<string, string>;
   timestamp: string;
}

export const CACHE_INVALIDATE_SSE_EVENT = 'cache-invalidate';

export const APP_SSE_REDIS_CHANNEL = 'sse:app:cache-events';
