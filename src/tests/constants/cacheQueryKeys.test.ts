import { buildCacheInvalidationEvent } from '../../constants/cacheQueryKeys';

describe('buildCacheInvalidationEvent (app)', () => {
   it('builds audiobook updated keys', () => {
      const event = buildCacheInvalidationEvent('audiobook', 'updated', 'ab-1');

      expect(event.service).toBe('app');
      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['audiobooks'],
            ['audiobooks', 'ab-1'],
         ]),
      );
   });

   it('builds chapter created keys with parent audiobook', () => {
      const event = buildCacheInvalidationEvent('chapter', 'created', 'ch-1', { audiobookId: 'ab-1' });

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['audiobooks', 'ab-1', 'chapters'],
            ['audiobooks', 'ab-1'],
            ['audiobooks'],
         ]),
      );
   });

   it('builds genre updated keys including catalog list', () => {
      const event = buildCacheInvalidationEvent('genre', 'updated', 'genre-1');

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['genres'],
            ['genres', 'genre-1'],
            ['audiobooks'],
         ]),
      );
   });

   it('builds subscription-catalog keys for tier changes', () => {
      const event = buildCacheInvalidationEvent('subscription-catalog', 'updated', 'sub-1', {
         userId: 'user-1',
         planId: 'plan-1',
      });

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['audiobooks'],
            ['user-audiobooks'],
            ['user-audiobooks', 'me'],
         ]),
      );
      expect(event.relatedIds).toEqual({ userId: 'user-1', planId: 'plan-1' });
   });

   it('builds subscription-gating keys scoped to audiobook and chapters', () => {
      const event = buildCacheInvalidationEvent('subscription-gating', 'updated', 'ab-1', {
         audiobookId: 'ab-1',
      });

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['audiobooks'],
            ['audiobooks', 'ab-1'],
            ['audiobooks', 'ab-1', 'chapters'],
         ]),
      );
   });

   it('builds subscription-gating keys scoped to a specific chapter', () => {
      const event = buildCacheInvalidationEvent('subscription-gating', 'updated', 'ch-1', {
         audiobookId: 'ab-1',
         chapterId: 'ch-1',
      });

      expect(event.queryKeys).toEqual(
         expect.arrayContaining([
            ['audiobooks', 'ab-1', 'chapters'],
            ['audiobooks', 'ab-1', 'chapters', 'ch-1'],
         ]),
      );
   });
});
