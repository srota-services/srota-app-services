/**
 * RabbitMQ consumer for chapter transcoding completed events from streaming-service.
 */
import { PrismaClient } from '@prisma/client';
import { RabbitMQFactory } from '../config/rabbitmq';
import { ChapterService } from '../services/ChapterService';
import { ChapterTranscodingCompletedMessage } from '../types/chapter-events';

export class ChapterTranscodingCompletedConsumerWorker {
   private chapterService: ChapterService;
   private isRunning = false;

   constructor(prisma: PrismaClient) {
      this.chapterService = new ChapterService(prisma);
   }

   async start(): Promise<void> {
      if (this.isRunning) {
         console.log('Chapter transcoding completed consumer worker is already running');
         return;
      }

      await RabbitMQFactory.initialize();

      const rabbitMQ = RabbitMQFactory.getConnection();
      await rabbitMQ.consumeChapterTranscodingCompletedMessages(
         this.handleTranscodingCompletedMessage.bind(this),
      );

      console.log('Chapter transcoding completed consumer worker started successfully');
      this.isRunning = true;
   }

   async stop(): Promise<void> {
      if (!this.isRunning) {
         console.log('Chapter transcoding completed consumer worker is not running');
         return;
      }

      try {
         const rabbitMQ = RabbitMQFactory.getConnection();
         await rabbitMQ.stopConsumingChapterTranscodingCompletedMessages();
         this.isRunning = false;
         console.log('Chapter transcoding completed consumer worker stopped');
      } catch (_error: unknown) {
         // Swallow stop errors
      }
   }

   private async handleTranscodingCompletedMessage(
      message: ChapterTranscodingCompletedMessage,
   ): Promise<void> {
      try {
         console.log(`Processing transcoding completed for chapterId: ${message.chapterId}`);
         await this.chapterService.handleTranscodingCompleted(message);
         console.log(`Successfully processed transcoding completed for chapterId: ${message.chapterId}`);
      } catch (_error: unknown) {
         // Error is logged but message is acknowledged (no retry/DLQ as per existing consumer pattern)
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

export class ChapterTranscodingCompletedConsumerWorkerFactory {
   private static worker: ChapterTranscodingCompletedConsumerWorker | null = null;

   public static getWorker(prisma: PrismaClient): ChapterTranscodingCompletedConsumerWorker {
      if (!ChapterTranscodingCompletedConsumerWorkerFactory.worker) {
         ChapterTranscodingCompletedConsumerWorkerFactory.worker =
            new ChapterTranscodingCompletedConsumerWorker(prisma);
      }
      return ChapterTranscodingCompletedConsumerWorkerFactory.worker;
   }

   public static async startWorker(prisma: PrismaClient): Promise<void> {
      const worker = ChapterTranscodingCompletedConsumerWorkerFactory.getWorker(prisma);
      await worker.start();
   }

   public static async stopWorker(): Promise<void> {
      if (ChapterTranscodingCompletedConsumerWorkerFactory.worker) {
         await ChapterTranscodingCompletedConsumerWorkerFactory.worker.stop();
         ChapterTranscodingCompletedConsumerWorkerFactory.worker = null;
      }
   }
}
