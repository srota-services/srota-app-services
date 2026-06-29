import { DomainAction } from '../types/domainCacheEvents';
import { RabbitMQFactory } from '../config/rabbitmq';
import { emitCacheInvalidation } from './DomainEventPublisher';

export function emitChapterSubscriptionTierInvalidation(params: {
   action: DomainAction;
   chapterId: string;
   audiobookId: string;
}): void {
   console.log('[app-service] SSE chapter subscription tier cache-invalidate emitted', {
      resource: 'subscription-gating',
      action: params.action,
      chapterId: params.chapterId,
      audiobookId: params.audiobookId,
   });

   emitCacheInvalidation('subscription-gating', params.action, params.chapterId, {
      audiobookId: params.audiobookId,
      chapterId: params.chapterId,
   });

   void publishChapterGatingChanged(params).catch(() => {});
}

async function publishChapterGatingChanged(params: {
   action: DomainAction;
   chapterId: string;
   audiobookId: string;
}): Promise<void> {
   await RabbitMQFactory.initialize();
   await RabbitMQFactory.getConnection().publishChapterGatingChanged({
      action: params.action,
      chapterId: params.chapterId,
      audiobookId: params.audiobookId,
   });
}
