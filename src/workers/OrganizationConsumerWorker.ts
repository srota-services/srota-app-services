/**
 * Organization Consumer Worker
 * RabbitMQ consumer for organization creation events from auth-service
 */
import { RabbitMQFactory } from '../config/rabbitmq';
import { OrganizationTierService } from '../services/OrganizationTierService';
import { PrismaClient } from '@prisma/client';
import { OrganizationCreationMessage } from '../types/organization-events';

export class OrganizationConsumerWorker {
   private organizationTierService: OrganizationTierService;
   private isRunning = false;

   constructor(prisma: PrismaClient) {
      this.organizationTierService = new OrganizationTierService(prisma);
   }

   async start(): Promise<void> {
      if (this.isRunning) {
         console.log('Organization consumer worker is already running');
         return;
      }

      try {
         await RabbitMQFactory.initialize();

         const rabbitMQ = RabbitMQFactory.getConnection();
         await rabbitMQ.consumeOrganizationCreationMessages(this.handleOrganizationCreationMessage.bind(this));

         console.log('Organization consumer worker started successfully');
         this.isRunning = true;
      } catch (error: unknown) {
         throw error;
      }
   }

   async stop(): Promise<void> {
      if (!this.isRunning) {
         console.log('Organization consumer worker is not running');
         return;
      }

      try {
         const rabbitMQ = RabbitMQFactory.getConnection();
         await rabbitMQ.stopConsumingOrganizationCreationMessages();

         this.isRunning = false;
         console.log('Organization consumer worker stopped');
      } catch (_error: unknown) {
         // Swallow stop errors
      }
   }

   private async handleOrganizationCreationMessage(message: OrganizationCreationMessage): Promise<void> {
      try {
         console.log(`Processing organization tier bootstrap for organizationId: ${message.organizationId}`);
         await this.organizationTierService.createDefaultForOrganization(message.organizationId);
         console.log(`Successfully processed organization tier for organizationId: ${message.organizationId}`);
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

export class OrganizationConsumerWorkerFactory {
   private static worker: OrganizationConsumerWorker | null = null;

   public static getWorker(prisma: PrismaClient): OrganizationConsumerWorker {
      if (!OrganizationConsumerWorkerFactory.worker) {
         OrganizationConsumerWorkerFactory.worker = new OrganizationConsumerWorker(prisma);
      }
      return OrganizationConsumerWorkerFactory.worker;
   }

   public static async startWorker(prisma: PrismaClient): Promise<void> {
      const worker = OrganizationConsumerWorkerFactory.getWorker(prisma);
      await worker.start();
   }

   public static async stopWorker(): Promise<void> {
      if (OrganizationConsumerWorkerFactory.worker) {
         await OrganizationConsumerWorkerFactory.worker.stop();
         OrganizationConsumerWorkerFactory.worker = null;
      }
   }
}
