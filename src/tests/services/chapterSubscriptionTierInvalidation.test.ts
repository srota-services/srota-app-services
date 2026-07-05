jest.mock('../../services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

jest.mock('../../config/rabbitmq', () => ({
   RabbitMQFactory: {
      initialize: jest.fn().mockResolvedValue(undefined),
      getConnection: jest.fn().mockReturnValue({
         publishChapterGatingChanged: jest.fn().mockResolvedValue(true),
      }),
   },
}));

import { emitCacheInvalidation } from '../../services/DomainEventPublisher';
import { RabbitMQFactory } from '../../config/rabbitmq';
import { emitChapterSubscriptionTierInvalidation } from '../../services/chapterSubscriptionTierInvalidation';

describe('emitChapterSubscriptionTierInvalidation (app)', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('emits subscription-gating cache invalidation scoped to chapter and audiobook', () => {
      emitChapterSubscriptionTierInvalidation({
         action: 'updated',
         chapterId: 'ch-1',
         audiobookId: 'ab-1',
      });

      expect(emitCacheInvalidation).toHaveBeenCalledWith(
         'subscription-gating',
         'updated',
         'ch-1',
         { audiobookId: 'ab-1', chapterId: 'ch-1' },
      );
   });

   it('publishes chapter gating changed RabbitMQ message', async () => {
      emitChapterSubscriptionTierInvalidation({
         action: 'updated',
         chapterId: 'ch-1',
         audiobookId: 'ab-1',
      });

      await Promise.resolve();

      expect(RabbitMQFactory.initialize).toHaveBeenCalled();
      expect(RabbitMQFactory.getConnection().publishChapterGatingChanged).toHaveBeenCalledWith({
         action: 'updated',
         chapterId: 'ch-1',
         audiobookId: 'ab-1',
      });
   });
});
