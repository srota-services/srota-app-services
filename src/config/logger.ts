/**
 * Pino Logger Configuration
 * Provides structured logging with file destinations for different components.
 * All error-level logs are mirrored to error.log.
 */
import pino, { Logger, LoggerOptions } from 'pino';
import path from 'path';
import fs from 'fs';
import { config } from './env';

const logDir = path.resolve(process.cwd(), config.LOG_DIR);
if (!fs.existsSync(logDir)) {
   fs.mkdirSync(logDir, { recursive: true });
}

const baseLoggerConfig: pino.LoggerOptions = {
   level: config.LOG_LEVEL,
   formatters: {
      level: (label) => ({ level: label }),
   },
   timestamp: pino.stdTimeFunctions.isoTime,
};

function createFileDestination(filename: string) {
   const fd = fs.openSync(path.join(logDir, filename), 'a');
   return pino.destination({ fd, minLength: 0, sync: false });
}

const errorLogFile = createFileDestination('error.log');

function createMirroredLogger(filename: string, component?: string): Logger {
   const fileDest = createFileDestination(filename);
   const options: LoggerOptions = component
      ? { ...baseLoggerConfig, base: { component } }
      : baseLoggerConfig;

   return pino(
      options,
      pino.multistream([
         { stream: fileDest },
         { level: 'error', stream: errorLogFile },
      ]),
   );
}

const errorLoggerConfig: pino.LoggerOptions = {
   ...baseLoggerConfig,
   level: 'error',
};

export const logger = createMirroredLogger('app.log');
export const errorLogger = pino(errorLoggerConfig, errorLogFile);
export const apiAccessLogger = pino(
   { ...baseLoggerConfig, base: { component: 'api-access' } },
   createFileDestination('api-access.log'),
);
export const rabbitmqLogger = createMirroredLogger('rabbitmq.log', 'rabbitmq');
export const redisLogger = createMirroredLogger('redis.log', 'redis');
export const bullLogger = createMirroredLogger('bull.log', 'bull');
export const sseLogger = createMirroredLogger('sse.log', 'sse');

export default logger;
