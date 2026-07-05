/**
 * Author Consumer Worker
 * RabbitMQ consumer for author creation events from auth-service
 */
import { RabbitMQFactory } from '../config/rabbitmq';
import { AuthorTierService } from '../services/AuthorTierService';
import { PrismaClient } from '@prisma/client';
import { AuthorCreationMessage } from '../types/author-events';

export class AuthorConsumerWorker {
   private authorTierService: AuthorTierService;
   private isRunning = false;

   constructor(prisma: PrismaClient) {
      this.authorTierService = new AuthorTierService(prisma);
   }

   async start(): Promise<void> {
      if (this.isRunning) {
         console.log('Author consumer worker is already running');
         return;
      }

      try {
         await RabbitMQFactory.initialize();

         const rabbitMQ = RabbitMQFactory.getConnection();
         await rabbitMQ.consumeAuthorCreationMessages(this.handleAuthorCreationMessage.bind(this));

         console.log('Author consumer worker started successfully');
         this.isRunning = true;
      } catch (error: unknown) {
         throw error;
      }
   }

   async stop(): Promise<void> {
      if (!this.isRunning) {
         console.log('Author consumer worker is not running');
         return;
      }

      try {
         const rabbitMQ = RabbitMQFactory.getConnection();
         await rabbitMQ.stopConsumingAuthorCreationMessages();

         this.isRunning = false;
         console.log('Author consumer worker stopped');
      } catch (_error: unknown) {
         // Swallow stop errors
      }
   }

   private async handleAuthorCreationMessage(message: AuthorCreationMessage): Promise<void> {
      try {
         console.log(`Processing author tier creation for authorId: ${message.authorId}`);
         await this.authorTierService.createDefaultForAuthor(message.authorId);
         console.log(`Successfully processed author tier for authorId: ${message.authorId}`);
      } catch (_error: unknown) {
         // Error is logged but message is acknowledged (no retry/DLQ as per requirements)
      }
   }

   async getWorkerStats(): Promise<{
      isRunning: boolean;
      rabbitMQConnected: boolean;
   }> {
      try {
         const rabbitMQ = RabbitMQFactory.getConnection();
         const rabbitMQConnected = (rabbitMQ as { isConnected?: () => boolean }).isConnected?.() ?? false;

         return {
            isRunning: this.isRunning,
            rabbitMQConnected,
         };
      } catch (_error: unknown) {
         return {
            isRunning: this.isRunning,
            rabbitMQConnected: false,
         };
      }
   }
}

export class AuthorConsumerWorkerFactory {
   private static worker: AuthorConsumerWorker | null = null;

   public static getWorker(prisma: PrismaClient): AuthorConsumerWorker {
      if (!AuthorConsumerWorkerFactory.worker) {
         AuthorConsumerWorkerFactory.worker = new AuthorConsumerWorker(prisma);
      }
      return AuthorConsumerWorkerFactory.worker;
   }

   public static async startWorker(prisma: PrismaClient): Promise<void> {
      const worker = AuthorConsumerWorkerFactory.getWorker(prisma);
      await worker.start();
   }

   public static async stopWorker(): Promise<void> {
      if (AuthorConsumerWorkerFactory.worker) {
         await AuthorConsumerWorkerFactory.worker.stop();
         AuthorConsumerWorkerFactory.worker = null;
      }
   }
}
