/**
 * Subscription Consumer Worker
 * RabbitMQ consumer for subscription tier/access change events from auth-service
 */
import { RabbitMQFactory } from '../config/rabbitmq';
import { emitCacheInvalidation } from '../services/DomainEventPublisher';
import { SubscriptionChangedMessage } from '../types/subscription-events';

export class SubscriptionConsumerWorker {
   private isRunning = false;

   /**
    * Start the subscription consumer worker
    */
   async start(): Promise<void> {
      if (this.isRunning) {
         console.log('Subscription consumer worker is already running');
         return;
      }

      await RabbitMQFactory.initialize();

      const rabbitMQ = RabbitMQFactory.getConnection();
      await rabbitMQ.consumeSubscriptionChangedMessages(this.handleSubscriptionChangedMessage.bind(this));

      console.log('Subscription consumer worker started successfully');
      this.isRunning = true;
   }

   /**
    * Stop the subscription consumer worker
    */
   async stop(): Promise<void> {
      if (!this.isRunning) {
         console.log('Subscription consumer worker is not running');
         return;
      }

      try {
         const rabbitMQ = RabbitMQFactory.getConnection();
         await rabbitMQ.stopConsumingSubscriptionChangedMessages();
         this.isRunning = false;
         console.log('Subscription consumer worker stopped');
      } catch (_error: unknown) {
         // Swallow stop errors
      }
   }

   /**
    * Handle subscription changed message — emit app SSE cache invalidation only
    */
   private async handleSubscriptionChangedMessage(message: SubscriptionChangedMessage): Promise<void> {
      if (!message.userId || typeof message.userId !== 'string') {
         throw new Error('Invalid message: userId is required and must be a string');
      }
      if (!message.subscriptionId || typeof message.subscriptionId !== 'string') {
         throw new Error('Invalid message: subscriptionId is required and must be a string');
      }
      if (!message.planId || typeof message.planId !== 'string') {
         throw new Error('Invalid message: planId is required and must be a string');
      }
      if (!message.action || !['created', 'updated', 'deleted'].includes(message.action)) {
         throw new Error('Invalid message: action must be created, updated, or deleted');
      }

      emitCacheInvalidation('subscription-catalog', message.action, message.subscriptionId, {
         userId: message.userId,
         planId: message.planId,
      });
   }
}

/**
 * Subscription consumer worker factory for easy access
 */
export class SubscriptionConsumerWorkerFactory {
   private static worker: SubscriptionConsumerWorker | null = null;

   public static getWorker(): SubscriptionConsumerWorker {
      if (!SubscriptionConsumerWorkerFactory.worker) {
         SubscriptionConsumerWorkerFactory.worker = new SubscriptionConsumerWorker();
      }
      return SubscriptionConsumerWorkerFactory.worker;
   }

   public static async startWorker(): Promise<void> {
      const worker = SubscriptionConsumerWorkerFactory.getWorker();
      await worker.start();
   }

   public static async stopWorker(): Promise<void> {
      if (SubscriptionConsumerWorkerFactory.worker) {
         await SubscriptionConsumerWorkerFactory.worker.stop();
         SubscriptionConsumerWorkerFactory.worker = null;
      }
   }
}
