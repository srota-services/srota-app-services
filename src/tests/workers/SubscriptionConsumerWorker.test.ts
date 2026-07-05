jest.mock('../../services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));

import { emitCacheInvalidation } from '../../services/DomainEventPublisher';
import { SubscriptionConsumerWorker } from '../../workers/SubscriptionConsumerWorker';

describe('SubscriptionConsumerWorker', () => {
   let worker: SubscriptionConsumerWorker;

   beforeEach(() => {
      jest.clearAllMocks();
      worker = new SubscriptionConsumerWorker();
   });

   it('emits subscription-catalog cache invalidation on valid message', async () => {
      const message = {
         userId: 'user-1',
         subscriptionId: 'sub-1',
         planId: 'plan-1',
         action: 'updated' as const,
      };

      await (worker as any).handleSubscriptionChangedMessage(message);

      expect(emitCacheInvalidation).toHaveBeenCalledWith(
         'subscription-catalog',
         'updated',
         'sub-1',
         { userId: 'user-1', planId: 'plan-1' },
      );
   });

   it('rejects message without userId', async () => {
      await expect(
         (worker as any).handleSubscriptionChangedMessage({
            subscriptionId: 'sub-1',
            planId: 'plan-1',
            action: 'updated',
         }),
      ).rejects.toThrow('userId is required');
   });

   it('emits subscription-gating cache invalidation on plan gating message', async () => {
      await (worker as any).handleSubscriptionGatingChangedMessage({
         planId: 'plan-1',
         action: 'updated',
      });

      expect(emitCacheInvalidation).toHaveBeenCalledWith(
         'subscription-gating',
         'updated',
         'plan-1',
         { planId: 'plan-1' },
      );
   });
});
