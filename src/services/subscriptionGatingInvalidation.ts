import { DomainAction } from '../types/domainCacheEvents';
import { emitCacheInvalidation } from './DomainEventPublisher';

export function emitSubscriptionGatingInvalidation(params: {
   action: DomainAction;
   audiobookId: string;
}): void {
   emitCacheInvalidation('subscription-gating', params.action, params.audiobookId, {
      audiobookId: params.audiobookId,
   });
}
