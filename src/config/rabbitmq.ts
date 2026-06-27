/**
 * RabbitMQ Configuration
 * Manages RabbitMQ connection and queue setup for audio streaming service
 */
import * as amqp from 'amqplib';
import { config } from './env';
import { rabbitmqLogger } from './logger';

export interface QueueConfig {
   name: string;
   durable: boolean;
   exclusive: boolean;
   autoDelete: boolean;
   arguments?: any;
}

export interface ExchangeConfig {
   name: string;
   type: string;
   durable: boolean;
   autoDelete: boolean;
}

export interface TranscodingJobData {
   chapter: {
      id: string;
      audiobookId: string;
      title: string;
      description?: string;
      chapterNumber: number;
      duration: number;
      filePath: string;
      fileSize: number;
      startPosition: number;
      endPosition: number;
      createdAt: Date;
      updatedAt: Date;
   };
   bitrates: number[];
   priority: 'low' | 'normal' | 'high';
   userId?: string;
   retryCount?: number;
   forceRetranscode?: boolean;
}

export interface TranscodingJobResult {
   chapterId: string;
   bitrate: number;
   status: 'completed' | 'failed';
   playlistUrl?: string;
   segmentsPath?: string;
   errorMessage?: string;
}

export class RabbitMQConnection {
   private static instance: RabbitMQConnection;
   private connection: amqp.Connection | null = null;
   private channel: amqp.Channel | null = null;
   private isConnecting = false;
   private reconnectAttempts = 0;
   private maxReconnectAttempts = 10;
   private reconnectDelay = 5000; // 5 seconds

   private constructor() { }

   /**
    * Get RabbitMQ connection instance
    */
   public static getInstance(): RabbitMQConnection {
      if (!RabbitMQConnection.instance) {
         RabbitMQConnection.instance = new RabbitMQConnection();
      }
      return RabbitMQConnection.instance;
   }

   /**
    * Connect to RabbitMQ
    */
   public async connect(): Promise<void> {
      if (this.connection && this.channel) {
         return;
      }

      if (this.isConnecting) {
         return;
      }

      this.isConnecting = true;

      try {
         rabbitmqLogger.info('Connecting to RabbitMQ...');
         this.connection = await amqp.connect(config.RABBITMQ_URL) as unknown as amqp.Connection;

         this.connection!.on('error', (error: Error) => {
            rabbitmqLogger.error({ err: error }, 'RabbitMQ connection error');
            this.handleConnectionError();
         });

         this.connection!.on('close', () => {
            rabbitmqLogger.warn('RabbitMQ connection closed');
            this.handleConnectionError();
         });

         this.channel = await (this.connection as any).createChannel();

         // Set prefetch to prevent overwhelming workers
         await this.channel!.prefetch(1);

         rabbitmqLogger.info('Connected to RabbitMQ successfully');
         this.reconnectAttempts = 0;
         this.isConnecting = false;

         // Setup exchanges and queues
         await this.setupExchangesAndQueues();

      } catch (error) {
         rabbitmqLogger.error({ err: error }, 'Failed to connect to RabbitMQ');
         this.isConnecting = false;
         await this.handleConnectionError();
         throw error;
      }
   }

   /**
    * Setup exchanges and queues
    */
   private async setupExchangesAndQueues(): Promise<void> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      const queuePrefix = config.RABBITMQ_QUEUE_PREFIX;

      // Delete existing queues to avoid PRECONDITION_FAILED errors
      // This is necessary when queue arguments change (like removing dead letter exchange)
      const existingQueues = ['priority', 'normal', 'low', 'failed'];
      for (const queue of existingQueues) {
         try {
            await this.channel.deleteQueue(`${queuePrefix}.transcode.${queue}`, { ifEmpty: false });
            rabbitmqLogger.info({ queue: `${queuePrefix}.transcode.${queue}` }, 'Deleted existing queue');
         } catch (error: any) {
            // Queue might not exist, which is fine
            rabbitmqLogger.debug({ err: error, queue: `${queuePrefix}.transcode.${queue}` }, 'Error deleting queue (queue may not exist)');
         }
      }

      // Main transcoding exchange
      await this.channel.assertExchange('transcoding.exchange', 'direct', {
         durable: true,
         autoDelete: false
      });

      // Priority queue for high-priority transcoding jobs
      await this.channel.assertQueue(`${queuePrefix}.transcode.priority`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 3600000 // 1 hour TTL
         }
      });

      // Normal queue for regular transcoding jobs
      await this.channel.assertQueue(`${queuePrefix}.transcode.normal`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 3600000 // 1 hour TTL
         }
      });

      // Low priority queue for background transcoding
      await this.channel.assertQueue(`${queuePrefix}.transcode.low`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 7200000 // 2 hours TTL
         }
      });

      // Bind queues to exchange
      await this.channel.bindQueue(`${queuePrefix}.transcode.priority`, 'transcoding.exchange', 'priority');
      await this.channel.bindQueue(`${queuePrefix}.transcode.normal`, 'transcoding.exchange', 'normal');
      await this.channel.bindQueue(`${queuePrefix}.transcode.low`, 'transcoding.exchange', 'low');

      // Setup users exchange and queue for user creation events
      await this.setupUsersExchangeAndQueue(queuePrefix);

      // Setup chapters exchange and queue for chapter deletion events
      await this.setupChaptersExchangeAndQueue(queuePrefix);

      // Setup authors exchange and queue for author creation events
      await this.setupAuthorsExchangeAndQueue(queuePrefix);

      // Setup organizations exchange and queue for organization deletion events
      await this.setupOrganizationsExchangeAndQueue(queuePrefix);

      rabbitmqLogger.info('RabbitMQ exchanges and queues setup completed');
   }

   /**
    * Setup users exchange and queue for user creation events
    */
   private async setupUsersExchangeAndQueue(queuePrefix: string): Promise<void> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      // Users exchange (topic type)
      await this.channel.assertExchange('users', 'topic', {
         durable: true,
         autoDelete: false
      });

      // User creation queue
      await this.channel.assertQueue(`${queuePrefix}.users.created`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 3600000 // 1 hour TTL
         }
      });

      // Bind queue to exchange with routing key
      await this.channel.bindQueue(`${queuePrefix}.users.created`, 'users', 'user.created');

      await this.channel.assertQueue(`${queuePrefix}.users.deleted`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 3600000
         }
      });

      await this.channel.bindQueue(`${queuePrefix}.users.deleted`, 'users', 'user.deleted');

      await this.channel.assertQueue(`${queuePrefix}.users.subscription.changed`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 3600000
         }
      });

      await this.channel.bindQueue(
         `${queuePrefix}.users.subscription.changed`,
         'users',
         'user.subscription.changed',
      );

      rabbitmqLogger.info('Users exchange and queue setup completed');
   }

   /**
    * Setup chapters exchange and queue for chapter deletion events
    */
   private async setupChaptersExchangeAndQueue(queuePrefix: string): Promise<void> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      // Chapters exchange (topic type)
      await this.channel.assertExchange('chapters', 'topic', {
         durable: true,
         autoDelete: false
      });

      // Chapter deletion queue
      await this.channel.assertQueue(`${queuePrefix}.chapters.deleted`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 3600000 // 1 hour TTL
         }
      });

      // Bind queue to exchange with routing key
      await this.channel.bindQueue(`${queuePrefix}.chapters.deleted`, 'chapters', 'chapter.deleted');

      rabbitmqLogger.info('Chapters exchange and queue setup completed');
   }

   /**
    * Setup authors exchange and queue for author creation events
    */
   private async setupAuthorsExchangeAndQueue(queuePrefix: string): Promise<void> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      await this.channel.assertExchange('authors', 'topic', {
         durable: true,
         autoDelete: false
      });

      await this.channel.assertQueue(`${queuePrefix}.authors.created`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 3600000
         }
      });

      await this.channel.bindQueue(`${queuePrefix}.authors.created`, 'authors', 'author.created');

      await this.channel.assertQueue(`${queuePrefix}.authors.deleted`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 3600000
         }
      });

      await this.channel.bindQueue(`${queuePrefix}.authors.deleted`, 'authors', 'author.deleted');

      rabbitmqLogger.info('Authors exchange and queue setup completed');
   }

   /**
    * Setup organizations exchange and queue for organization deletion events
    */
   private async setupOrganizationsExchangeAndQueue(queuePrefix: string): Promise<void> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      await this.channel.assertExchange('organizations', 'topic', {
         durable: true,
         autoDelete: false
      });

      await this.channel.assertQueue(`${queuePrefix}.organizations.deleted`, {
         durable: true,
         exclusive: false,
         autoDelete: false,
         arguments: {
            'x-message-ttl': 3600000
         }
      });

      await this.channel.bindQueue(`${queuePrefix}.organizations.deleted`, 'organizations', 'organization.deleted');

      rabbitmqLogger.info('Organizations exchange and queue setup completed');
   }

   /**
    * Publish transcoding job
    */
   public async publishTranscodingJob(
      jobData: TranscodingJobData,
      priority: 'low' | 'normal' | 'high' = 'normal'
   ): Promise<boolean> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      const routingKey = priority;
      // const queueName = `${config.RABBITMQ_QUEUE_PREFIX}.transcode.${priority}`;

      try {
         const message = Buffer.from(JSON.stringify({
            ...jobData,
            priority,
            timestamp: new Date().toISOString(),
            retryCount: jobData.retryCount || 0
         }));

         const published = this.channel.publish(
            'transcoding.exchange',
            routingKey,
            message,
            {
               persistent: true,
               priority: priority === 'high' ? 10 : priority === 'normal' ? 5 : 1,
               messageId: `${jobData.chapter.id}-${Date.now()}`
            }
         );

         if (published) {
            rabbitmqLogger.info({
               chapterId: jobData.chapter.id,
               priority,
            }, 'Transcoding job published');
            return true;
         } else {
            rabbitmqLogger.error('Failed to publish transcoding job - channel buffer full');
            return false;
         }
      } catch (error) {
         rabbitmqLogger.error({ err: error }, 'Error publishing transcoding job');
         return false;
      }
   }

   /**
    * Publish chapter deletion event
    */
   public async publishChapterDeletion(chapterId: string): Promise<boolean> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      const routingKey = 'chapter.deleted';

      try {
         const message = Buffer.from(JSON.stringify({
            chapterId,
            timestamp: new Date().toISOString()
         }));

         const published = this.channel.publish(
            'chapters',
            routingKey,
            message,
            {
               persistent: true,
               messageId: `chapter-deleted-${chapterId}-${Date.now()}`
            }
         );

         if (published) {
            rabbitmqLogger.info({
               chapterId,
            }, 'Chapter deletion event published');
            return true;
         } else {
            rabbitmqLogger.error('Failed to publish chapter deletion event - channel buffer full');
            return false;
         }
      } catch (error) {
         rabbitmqLogger.error({ err: error, chapterId }, 'Error publishing chapter deletion event');
         return false;
      }
   }

   /**
    * Get queue statistics
    */
   public async getQueueStats(): Promise<{
      [queueName: string]: {
         messageCount: number;
         consumerCount: number;
      };
   }> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      const stats: any = {};
      const queuePrefix = config.RABBITMQ_QUEUE_PREFIX;
      const queues = ['priority', 'normal', 'low'];

      for (const queue of queues) {
         try {
            const queueInfo = await this.channel.checkQueue(`${queuePrefix}.transcode.${queue}`);
            stats[queue] = {
               messageCount: queueInfo.messageCount,
               consumerCount: queueInfo.consumerCount
            };
         } catch (error) {
            rabbitmqLogger.error({ err: error, queue }, 'Error getting stats for queue');
            stats[queue] = {
               messageCount: 0,
               consumerCount: 0
            };
         }
      }

      return stats;
   }

   /**
    * Handle connection errors and implement reconnection logic
    */
   private async handleConnectionError(): Promise<void> {
      this.connection = null;
      this.channel = null;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
         rabbitmqLogger.error({
            attempts: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts,
         }, 'Max reconnection attempts reached. Stopping reconnection attempts.');
         return;
      }

      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

      rabbitmqLogger.warn({
         delay,
         attempt: this.reconnectAttempts,
         maxAttempts: this.maxReconnectAttempts,
      }, 'Attempting to reconnect to RabbitMQ');

      setTimeout(async () => {
         try {
            await this.connect();
         } catch (error) {
            rabbitmqLogger.error({ err: error }, 'Reconnection attempt failed');
         }
      }, delay);
   }

   /**
    * Check if connected
    */
   public isConnected(): boolean {
      return this.connection !== null && this.channel !== null;
   }

   /**
    * Close connection gracefully
    */
   public async close(): Promise<void> {
      try {
         if (this.channel) {
            await this.channel.close();
            this.channel = null;
         }

         if (this.connection) {
            await (this.connection as any).close();
            this.connection = null;
         }

         rabbitmqLogger.info('RabbitMQ connection closed gracefully');
      } catch (error) {
         rabbitmqLogger.error({ err: error }, 'Error closing RabbitMQ connection');
      }
   }

   /**
    * Consume user creation messages
    */
   public async consumeUserCreationMessages(
      onMessage: (message: any) => Promise<void>
   ): Promise<void> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      const queuePrefix = config.RABBITMQ_QUEUE_PREFIX;
      const queueName = `${queuePrefix}.users.created`;

      try {
         await this.channel.consume(queueName, async (msg) => {
            if (!msg) {
               return;
            }

            try {
               // Parse message content
               const messageContent = JSON.parse(msg.content.toString());
               rabbitmqLogger.info({ messageContent }, 'Received user creation message');

               // Process the message
               await onMessage(messageContent);

               // Acknowledge message
               this.channel!.ack(msg);
               rabbitmqLogger.info({ userId: messageContent.userId }, 'Processed user creation message');
            } catch (error: any) {
               rabbitmqLogger.error({ err: error }, 'Error processing user creation message');

               // Log error and acknowledge message (no retry/DLQ as per requirements)
               this.channel!.ack(msg);
            }
         }, {
            noAck: false
         });

         rabbitmqLogger.info({ queueName }, 'Started consuming user creation messages from queue');
      } catch (error: any) {
         rabbitmqLogger.error({ err: error }, 'Error setting up user creation message consumer');
         throw error;
      }
   }

   /**
    * Stop consuming user creation messages
    */
   public async stopConsumingUserCreationMessages(): Promise<void> {
      if (!this.channel) {
         return;
      }

      const queuePrefix = config.RABBITMQ_QUEUE_PREFIX;
      const queueName = `${queuePrefix}.users.created`;

      try {
         await this.channel.cancel(queueName);
         rabbitmqLogger.info({ queueName }, 'Stopped consuming user creation messages from queue');
      } catch (error: any) {
         rabbitmqLogger.error({ err: error }, 'Error stopping user creation message consumer');
      }
   }

   /**
    * Consume subscription changed messages
    */
   public async consumeSubscriptionChangedMessages(
      onMessage: (message: any) => Promise<void>
   ): Promise<void> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      const queuePrefix = config.RABBITMQ_QUEUE_PREFIX;
      const queueName = `${queuePrefix}.users.subscription.changed`;

      try {
         await this.channel.consume(queueName, async (msg) => {
            if (!msg) {
               return;
            }

            try {
               const messageContent = JSON.parse(msg.content.toString());
               rabbitmqLogger.info({ messageContent }, 'Received subscription changed message');

               await onMessage(messageContent);

               this.channel!.ack(msg);
               rabbitmqLogger.info(
                  { userId: messageContent.userId, subscriptionId: messageContent.subscriptionId },
                  'Processed subscription changed message',
               );
            } catch (error: any) {
               rabbitmqLogger.error({ err: error }, 'Error processing subscription changed message');
               this.channel!.ack(msg);
            }
         }, {
            noAck: false
         });

         rabbitmqLogger.info({ queueName }, 'Started consuming subscription changed messages from queue');
      } catch (error: any) {
         rabbitmqLogger.error({ err: error }, 'Error setting up subscription changed message consumer');
         throw error;
      }
   }

   /**
    * Stop consuming subscription changed messages
    */
   public async stopConsumingSubscriptionChangedMessages(): Promise<void> {
      if (!this.channel) {
         return;
      }

      const queuePrefix = config.RABBITMQ_QUEUE_PREFIX;
      const queueName = `${queuePrefix}.users.subscription.changed`;

      try {
         await this.channel.cancel(queueName);
         rabbitmqLogger.info({ queueName }, 'Stopped consuming subscription changed messages from queue');
      } catch (error: any) {
         rabbitmqLogger.error({ err: error }, 'Error stopping subscription changed message consumer');
      }
   }

   /**
    * Consume author creation messages
    */
   public async consumeAuthorCreationMessages(
      onMessage: (message: any) => Promise<void>
   ): Promise<void> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      const queuePrefix = config.RABBITMQ_QUEUE_PREFIX;
      const queueName = `${queuePrefix}.authors.created`;

      try {
         await this.channel.consume(queueName, async (msg) => {
            if (!msg) {
               return;
            }

            try {
               const messageContent = JSON.parse(msg.content.toString());
               rabbitmqLogger.info({ messageContent }, 'Received author creation message');

               await onMessage(messageContent);

               this.channel!.ack(msg);
               rabbitmqLogger.info({ userId: messageContent.userId }, 'Processed author creation message');
            } catch (error: any) {
               rabbitmqLogger.error({ err: error }, 'Error processing author creation message');
               this.channel!.ack(msg);
            }
         }, {
            noAck: false
         });

         rabbitmqLogger.info({ queueName }, 'Started consuming author creation messages from queue');
      } catch (error: any) {
         rabbitmqLogger.error({ err: error }, 'Error setting up author creation message consumer');
         throw error;
      }
   }

   /**
    * Stop consuming author creation messages
    */
   public async stopConsumingAuthorCreationMessages(): Promise<void> {
      if (!this.channel) {
         return;
      }

      const queuePrefix = config.RABBITMQ_QUEUE_PREFIX;
      const queueName = `${queuePrefix}.authors.created`;

      try {
         await this.channel.cancel(queueName);
         rabbitmqLogger.info({ queueName }, 'Stopped consuming author creation messages from queue');
      } catch (error: any) {
         rabbitmqLogger.error({ err: error }, 'Error stopping author creation message consumer');
      }
   }

   public async consumeUserDeletionMessages(
      onMessage: (message: unknown) => Promise<void>
   ): Promise<void> {
      await this.consumeDeletionMessages(`${config.RABBITMQ_QUEUE_PREFIX}.users.deleted`, 'user deletion', onMessage);
   }

   public async stopConsumingUserDeletionMessages(): Promise<void> {
      await this.stopConsumingDeletionMessages(`${config.RABBITMQ_QUEUE_PREFIX}.users.deleted`, 'user deletion');
   }

   public async consumeAuthorDeletionMessages(
      onMessage: (message: unknown) => Promise<void>
   ): Promise<void> {
      await this.consumeDeletionMessages(`${config.RABBITMQ_QUEUE_PREFIX}.authors.deleted`, 'author deletion', onMessage);
   }

   public async stopConsumingAuthorDeletionMessages(): Promise<void> {
      await this.stopConsumingDeletionMessages(`${config.RABBITMQ_QUEUE_PREFIX}.authors.deleted`, 'author deletion');
   }

   public async consumeOrganizationDeletionMessages(
      onMessage: (message: unknown) => Promise<void>
   ): Promise<void> {
      await this.consumeDeletionMessages(`${config.RABBITMQ_QUEUE_PREFIX}.organizations.deleted`, 'organization deletion', onMessage);
   }

   public async stopConsumingOrganizationDeletionMessages(): Promise<void> {
      await this.stopConsumingDeletionMessages(`${config.RABBITMQ_QUEUE_PREFIX}.organizations.deleted`, 'organization deletion');
   }

   private async consumeDeletionMessages(
      queueName: string,
      label: string,
      onMessage: (message: unknown) => Promise<void>
   ): Promise<void> {
      if (!this.channel) {
         throw new Error('Channel not available');
      }

      await this.channel.consume(queueName, async (msg) => {
         if (!msg) {
            return;
         }

         try {
            const messageContent = JSON.parse(msg.content.toString());
            rabbitmqLogger.info({ messageContent }, `Received ${label} message`);
            await onMessage(messageContent);
            this.channel!.ack(msg);
         } catch (error: unknown) {
            rabbitmqLogger.error({ err: error }, `Error processing ${label} message`);
            this.channel!.ack(msg);
         }
      }, { noAck: false });

      rabbitmqLogger.info({ queueName }, `Started consuming ${label} messages from queue`);
   }

   private async stopConsumingDeletionMessages(queueName: string, label: string): Promise<void> {
      if (!this.channel) {
         return;
      }

      try {
         await this.channel.cancel(queueName);
         rabbitmqLogger.info({ queueName }, `Stopped consuming ${label} messages from queue`);
      } catch (error: unknown) {
         rabbitmqLogger.error({ err: error }, `Error stopping ${label} message consumer`);
      }
   }
}

/**
 * RabbitMQ factory for easy access
 */
export class RabbitMQFactory {
   private static connection = RabbitMQConnection.getInstance();

   /**
    * Get RabbitMQ connection instance
    */
   public static getConnection(): RabbitMQConnection {
      return this.connection;
   }

   /**
    * Initialize RabbitMQ connection
    */
   public static async initialize(): Promise<void> {
      await this.connection.connect();
   }

   /**
    * Close RabbitMQ connection
    */
   public static async shutdown(): Promise<void> {
      await this.connection.close();
   }
}
