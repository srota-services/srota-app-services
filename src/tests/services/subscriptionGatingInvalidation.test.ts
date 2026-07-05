jest.mock('../../services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

import { emitCacheInvalidation } from '../../services/DomainEventPublisher';
import { emitSubscriptionGatingInvalidation } from '../../services/subscriptionGatingInvalidation';

describe('emitSubscriptionGatingInvalidation (app)', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('emits subscription-gating cache invalidation with audiobook scope', () => {
      emitSubscriptionGatingInvalidation({ action: 'updated', audiobookId: 'ab-1' });

      expect(emitCacheInvalidation).toHaveBeenCalledWith(
         'subscription-gating',
         'updated',
         'ab-1',
         { audiobookId: 'ab-1' },
      );
   });
});
