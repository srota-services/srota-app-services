import './config/env';
import './types/session'; // Load session type extensions
import cors from 'cors';
import session from 'express-session';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { config } from './config/env';
import { logger, errorLogger } from './config/logger';
import { apiLoggerMiddleware } from './middleware/ApiLoggerMiddleware';
import { apiErrorLogMiddleware } from './middleware/ApiErrorLogMiddleware';
import { ApiRouter } from './routes/ApiRouter';
import { ErrorHandler } from './middleware/ErrorHandler';
import { MessageHandler } from './utils/MessageHandler';
import { setupSwagger } from './config/swagger';
import { BullBoardConfig, BullBoardAPI } from './config/bullBoard';
import { authenticateJWT } from './middleware/AuthMiddleware';
import { requireGlobalAdmin } from './middleware/RoleMiddleware';
import { QueueFactory } from './config/queue';
import { RabbitMQFactory } from './config/rabbitmq';
import { TranscodingWorkerFactory } from './workers/TranscodingWorker';
import { UserConsumerWorkerFactory } from './workers/UserConsumerWorker';
import { SubscriptionConsumerWorkerFactory } from './workers/SubscriptionConsumerWorker';
import { AuthorConsumerWorkerFactory } from './workers/AuthorConsumerWorker';
import { EntityDeletionConsumerWorkerFactory } from './workers/EntityDeletionConsumerWorker';
import { prisma } from './lib/prisma';

process.on('uncaughtException', (err) => {
   errorLogger.error({ category: 'system', type: 'uncaughtException', err }, 'Uncaught exception');
   process.exit(1);
});

process.on('unhandledRejection', (reason) => {
   errorLogger.error({ category: 'system', type: 'unhandledRejection', err: reason }, 'Unhandled rejection');
});

const app = express();

// Middleware
app.use(helmet());

// CORS configuration — allow any origin (reflects request origin for credentials)
app.use(cors({
   origin: true,
   credentials: true,
   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
   allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API access logging middleware
// This middleware ONLY logs API access requests in format: host:api:statusCode:date_time_IST
app.use(apiLoggerMiddleware);

// Log API error responses (4xx/5xx) to error.log
app.use(apiErrorLogMiddleware);

// Session configuration
app.use(session({
   secret: config.SESSION_SECRET,
   resave: false,
   saveUninitialized: false,
   cookie: {
      secure: config.USE_SECURE_COOKIES,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
   }
}));

// Session validation middleware

// Initialize queues
const queueManager = QueueFactory.getQueueManager();
queueManager.createProgressQueue();
queueManager.createDownloadQueue();
queueManager.createCleanupQueue();

// Initialize RabbitMQ, transcoding worker, and user consumer worker
(async (): Promise<void> => {
   try {
      await RabbitMQFactory.initialize();
      logger.info('RabbitMQ initialized successfully');

      // Start transcoding worker
      await TranscodingWorkerFactory.startWorker(prisma);

      // Start user consumer worker
      await UserConsumerWorkerFactory.startWorker(prisma);

      // Start subscription consumer worker
      await SubscriptionConsumerWorkerFactory.startWorker();

      // Start author consumer worker
      await AuthorConsumerWorkerFactory.startWorker(prisma);

      // Start entity deletion consumer worker
      await EntityDeletionConsumerWorkerFactory.startWorker(prisma);
   } catch (error) {
      logger.error({ err: error }, 'Failed to initialize RabbitMQ, transcoding worker, or consumer workers');
   }
})();

// Initialize Bull Board
const bullBoardConfig = BullBoardConfig.getInstance();

// Bull Board UI and control endpoints (GLOBAL_ADMIN only)
app.use('/admin/queues', authenticateJWT, requireGlobalAdmin(), bullBoardConfig.getRouter());

app.get('/admin/queues/stats', authenticateJWT, requireGlobalAdmin(), BullBoardAPI.getQueueStats);
app.post('/admin/queues/:queueName/pause', authenticateJWT, requireGlobalAdmin(), BullBoardAPI.pauseQueue);
app.post('/admin/queues/:queueName/resume', authenticateJWT, requireGlobalAdmin(), BullBoardAPI.resumeQueue);
app.post('/admin/queues/:queueName/clean', authenticateJWT, requireGlobalAdmin(), BullBoardAPI.cleanQueue);
app.post('/admin/queues/:queueName/empty', authenticateJWT, requireGlobalAdmin(), BullBoardAPI.emptyQueue);

// Static file serving for uploads (development only)
if (config.NODE_ENV === 'development') {
   app.use('/uploads', express.static(path.join(process.cwd(), 'src', 'uploads')));
}

// API Routes
const apiRouter = ApiRouter.getInstance();
app.use('/api', apiRouter.getRouter());

// Swagger Documentation
setupSwagger(app);

// Root endpoint
app.get('/', (_req, res) => {
   res.json({
      message: MessageHandler.getApiInfo('info.title'),
      version: MessageHandler.getApiInfo('info.version'),
      status: MessageHandler.getApiInfo('info.status_running'),
      timestamp: new Date().toISOString(),
      endpoints: MessageHandler.getApiInfo('info.endpoints'),
      admin: {
         bullBoard: '/admin/queues',
         queueStats: '/admin/queues/stats'
      }
   });
});

// 404 handler for undefined routes
app.use((req, res) => ErrorHandler.handleNotFound(req, res));

// Global error handler
app.use(ErrorHandler.handleError);

app.listen(config.PORT, () => {
   logger.info({
      port: config.PORT,
      environment: config.NODE_ENV,
      apiBaseUrl: `http://localhost:${config.PORT}/api`,
      swaggerUI: `http://localhost:${config.PORT}/api-docs`,
      openAPISpec: `http://localhost:${config.PORT}/api-docs.json`,
      bullBoardUI: `http://localhost:${config.PORT}/admin/queues`,
      queueStatsAPI: `http://localhost:${config.PORT}/admin/queues/stats`,
   }, 'Server started successfully');
});