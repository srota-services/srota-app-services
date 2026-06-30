import {
   AppDomainResource,
   CacheInvalidateEvent,
   DomainAction,
} from '../types/domainCacheEvents';

export type AppRelatedIds = Record<string, string>;

function uniqueKeys(keys: string[][]): string[][] {
   const seen = new Set<string>();
   return keys.filter((key) => {
      const serialized = JSON.stringify(key);
      if (seen.has(serialized)) {
         return false;
      }
      seen.add(serialized);
      return true;
   });
}

function keysForResource(
   resource: AppDomainResource,
   id: string,
   relatedIds: AppRelatedIds,
): string[][] {
   switch (resource) {
      case 'audiobook':
         return [['audiobooks'], ['audiobooks', id]];
      case 'chapter': {
         const audiobookId = relatedIds['audiobookId'] ?? id;
         return [
            ['audiobooks', audiobookId, 'chapters'],
            ['audiobooks', audiobookId],
            ['audiobooks'],
         ];
      }
      case 'comment': {
         const audiobookId = relatedIds['audiobookId'];
         const keys: string[][] = [['comments'], ['comments', id]];
         if (audiobookId) {
            keys.push(['audiobooks', audiobookId, 'comments'], ['audiobooks', audiobookId]);
         }
         return keys;
      }
      case 'review': {
         const audiobookId = relatedIds['audiobookId'];
         const keys: string[][] = [['reviews'], ['reviews', id]];
         if (audiobookId) {
            keys.push(['audiobooks', audiobookId, 'reviews'], ['audiobooks', audiobookId]);
         }
         return keys;
      }
      case 'user-profile':
         return [['user-profiles'], ['user-profiles', id], ['user-profiles', 'me']];
      case 'author-profile':
         return [['author-profiles'], ['author-profiles', id], ['author-profiles', 'me']];
      case 'playlist': {
         const userId = relatedIds['userId'];
         const keys: string[][] = [['playlists'], ['playlists', id], ['playlists', 'me']];
         if (userId) {
            keys.push(['users', userId, 'playlists']);
         }
         return keys;
      }
      case 'playlist-item': {
         const playlistId = relatedIds['playlistId'] ?? id;
         return [
            ['playlists', playlistId, 'items'],
            ['playlists', playlistId],
            ['playlists'],
         ];
      }
      case 'favorite':
         return [['favorites'], ['favorites', 'me']];
      case 'bookmark': {
         const userId = relatedIds['userId'];
         const audiobookId = relatedIds['audiobookId'];
         const keys: string[][] = [['bookmarks'], ['bookmarks', id], ['bookmarks', 'me']];
         if (userId) {
            keys.push(['users', userId, 'bookmarks']);
         }
         if (audiobookId) {
            keys.push(['audiobooks', audiobookId, 'bookmarks']);
         }
         return keys;
      }
      case 'note': {
         const userId = relatedIds['userId'];
         const audiobookId = relatedIds['audiobookId'];
         const keys: string[][] = [['notes'], ['notes', id], ['notes', 'me']];
         if (userId) {
            keys.push(['users', userId, 'notes']);
         }
         if (audiobookId) {
            keys.push(['audiobooks', audiobookId, 'notes']);
         }
         return keys;
      }
      case 'tag':
         return [['tags'], ['tags', id], ['audiobooks']];
      case 'genre':
         return [['genres'], ['genres', id], ['audiobooks']];
      case 'language':
         return [['languages'], ['languages', id], ['audiobooks']];
      case 'mood':
         return [['moods'], ['moods', id], ['audiobooks']];
      case 'user-audiobook':
         return [['user-audiobooks'], ['user-audiobooks', 'me']];
      case 'subscription-catalog':
         return [['audiobooks'], ['user-audiobooks'], ['user-audiobooks', 'me']];
      case 'subscription-gating': {
         const audiobookId = relatedIds['audiobookId'];
         const chapterId = relatedIds['chapterId'];
         const keys: string[][] = [['audiobooks']];
         if (audiobookId) {
            keys.push(['audiobooks', audiobookId], ['audiobooks', audiobookId, 'chapters']);
            if (chapterId) {
               keys.push(['audiobooks', audiobookId, 'chapters', chapterId]);
            }
         }
         return keys;
      }
      case 'offline-download':
         return [['offline-downloads'], ['offline-downloads', id], ['offline-downloads', 'me']];
      default:
         return [[resource], [resource, id]];
   }
}

export function buildCacheInvalidationEvent(
   resource: AppDomainResource,
   action: DomainAction,
   id: string,
   relatedIds?: AppRelatedIds,
): CacheInvalidateEvent {
   const resolvedRelatedIds = relatedIds ?? {};
   return {
      version: 1,
      service: 'app',
      resource,
      action,
      id,
      queryKeys: uniqueKeys(keysForResource(resource, id, resolvedRelatedIds)),
      ...(Object.keys(resolvedRelatedIds).length > 0 ? { relatedIds: resolvedRelatedIds } : {}),
      timestamp: new Date().toISOString(),
   };
}
