import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { resolveStreamingServiceStoragePath as resolveStreamingStoragePath } from '../utils/streamingStoragePath';

const LOCALHOST_PATTERN = /localhost|127\.0\.0\.1/i;

const ENV_FILE_BY_NODE_ENV: Record<string, string | null> = {
   development: '.env.development',
   test: null,
   testing: '.env.testing',
   staging: '.env.staging',
   production: '.env.production',
};

function getEnvFileForBootstrap(): string | null {
   const bootstrapEnv = process.env['NODE_ENV'] ?? 'development';
   return ENV_FILE_BY_NODE_ENV[bootstrapEnv] ?? `.env.${bootstrapEnv}`;
}

function loadEnvFile(filename: string, override = false): void {
   const filePath = path.resolve(process.cwd(), filename);
   if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override });
   }
}

function loadEnvFiles(): void {
   loadEnvFile('.env');
   const envFile = getEnvFileForBootstrap();
   if (envFile) {
      loadEnvFile(envFile, true);
   }
   loadEnvFile('.env.local', true);
}

function requireEnv(key: string): string {
   const value = process.env[key];
   if (value === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
   }
   return value;
}

function requireIntEnv(key: string): number {
   const raw = requireEnv(key);
   const parsed = parseInt(raw, 10);
   if (Number.isNaN(parsed)) {
      throw new Error(`Environment variable ${key} must be a valid integer`);
   }
   return parsed;
}

function parseTranscodingBitrates(raw: string): number[] {
   const envValue = raw.trim();

   if (envValue.startsWith('[') && envValue.endsWith(']')) {
      try {
         const parsed = JSON.parse(envValue);
         if (Array.isArray(parsed)) {
            const bitrates = parsed
               .map(b => (typeof b === 'number' ? b : parseInt(String(b), 10)))
               .filter(b => !Number.isNaN(b) && b > 0);
            if (bitrates.length > 0) {
               return bitrates;
            }
         }
      } catch {
         // Fall through to comma-separated parsing
      }
   }

   const bitrates = envValue
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0)
      .map(b => parseInt(b, 10))
      .filter(b => !Number.isNaN(b) && b > 0);

   if (bitrates.length === 0) {
      throw new Error('TRANSCODING_BITRATES must contain at least one valid positive integer');
   }

   return bitrates;
}

function assertNoLocalhost(envVar: string, value: string, nodeEnv: string): void {
   if (LOCALHOST_PATTERN.test(value)) {
      throw new Error(`${envVar} must not reference localhost in ${nodeEnv}`);
   }
}

const HEALTH_SUPPORT_EMAIL_DOMAIN = '@srota-support.com';

function validateHealthSupportEmail(email: string): void {
   if (!email.toLowerCase().endsWith(HEALTH_SUPPORT_EMAIL_DOMAIN)) {
      throw new Error(`HEALTH_SUPPORT_EMAIL must end with ${HEALTH_SUPPORT_EMAIL_DOMAIN}`);
   }
}

function validateNoLocalhostInStagingOrProduction(
   nodeEnv: string,
   values: {
      DATABASE_URL: string;
      REDIS_URL: string;
      RABBITMQ_URL: string;
      STREAMING_SERVICE_URL: string;
      AUTH_SERVICE_URL: string;
      JWKS_ENDPOINT: string;
   }
): void {
   if (nodeEnv !== 'staging' && nodeEnv !== 'production') {
      return;
   }

   assertNoLocalhost('DATABASE_URL', values.DATABASE_URL, nodeEnv);
   assertNoLocalhost('REDIS_URL', values.REDIS_URL, nodeEnv);
   assertNoLocalhost('RABBITMQ_URL', values.RABBITMQ_URL, nodeEnv);
   assertNoLocalhost('STREAMING_SERVICE_URL', values.STREAMING_SERVICE_URL, nodeEnv);
   assertNoLocalhost('AUTH_SERVICE_URL', values.AUTH_SERVICE_URL, nodeEnv);
   assertNoLocalhost('JWKS_ENDPOINT', values.JWKS_ENDPOINT, nodeEnv);
}

function resolveStreamingServiceStoragePath(currentNodeEnv: string): string {
   const raw = process.env['STREAMING_SERVICE_STORAGE_PATH'];
   const resolved = resolveStreamingStoragePath(process.cwd(), currentNodeEnv, raw);

   if (currentNodeEnv === 'development' && raw) {
      const explicit = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
      const legacySibling = path.resolve(process.cwd(), '../streaming-service/storage');
      if (explicit === legacySibling && resolved !== explicit) {
         console.warn(
            `[config] STREAMING_SERVICE_STORAGE_PATH points to legacy ${explicit}; using ${resolved}`,
         );
      } else if (explicit !== resolved && !fs.existsSync(explicit)) {
         console.warn(
            `[config] STREAMING_SERVICE_STORAGE_PATH not found at ${explicit}; using ${resolved}`,
         );
      }
   }

   return resolved;
}

loadEnvFiles();

const nodeEnv = requireEnv('NODE_ENV');

const DATABASE_URL = requireEnv('DATABASE_URL');
const REDIS_URL = requireEnv('REDIS_URL');
const RABBITMQ_URL = requireEnv('RABBITMQ_URL');
const STREAMING_SERVICE_URL = requireEnv('STREAMING_SERVICE_URL');
const AUTH_SERVICE_URL = requireEnv('AUTH_SERVICE_URL');
const JWKS_ENDPOINT = requireEnv('JWKS_ENDPOINT');

validateNoLocalhostInStagingOrProduction(nodeEnv, {
   DATABASE_URL,
   REDIS_URL,
   RABBITMQ_URL,
   STREAMING_SERVICE_URL,
   AUTH_SERVICE_URL,
   JWKS_ENDPOINT,
});

const USE_SECURE_COOKIES = nodeEnv === 'production' || nodeEnv === 'staging' || nodeEnv === 'testing';

const HEALTH_SUPPORT_EMAIL = requireEnv('HEALTH_SUPPORT_EMAIL');
const HEALTH_SUPPORT_PASSWORD = requireEnv('HEALTH_SUPPORT_PASSWORD');
validateHealthSupportEmail(HEALTH_SUPPORT_EMAIL);

export const config = {
   NODE_ENV: nodeEnv,
   PORT: requireIntEnv('PORT'),
   USE_SECURE_COOKIES,

   DATABASE_URL,
   SESSION_SECRET: requireEnv('SESSION_SECRET'),

   REDIS_URL,
   RABBITMQ_URL,
   RABBITMQ_QUEUE_PREFIX: requireEnv('RABBITMQ_QUEUE_PREFIX'),

   MAX_FILE_SIZE: requireIntEnv('MAX_FILE_SIZE'),
   UPLOAD_DIR: requireEnv('UPLOAD_DIR'),

   DEV_UPLOAD_DIR: nodeEnv === 'development' ? './src/uploads' : './uploads',
   DEV_AUDIOBOOK_IMAGE_DIR: nodeEnv === 'development' ? './src/uploads/images/audiobooks' : './uploads/images/audiobooks',
   DEV_CHAPTER_IMAGE_DIR: nodeEnv === 'development' ? './src/uploads/images/chapters' : './uploads/images/chapters',
   DEV_AUTHOR_IMAGE_DIR: nodeEnv === 'development' ? './src/uploads/images/authors' : './uploads/images/authors',
   DEV_USER_AVATAR_DIR: nodeEnv === 'development' ? './src/uploads/images/users' : './uploads/images/users',
   DEV_ORGANIZATION_IMAGE_DIR: nodeEnv === 'development' ? './src/uploads/images/organizations' : './uploads/images/organizations',
   DEV_AUDIO_DIR: nodeEnv === 'development' ? './src/uploads/audio' : './uploads/audio',

   TRANSCODING_BITRATES: parseTranscodingBitrates(requireEnv('TRANSCODING_BITRATES')),
   STREAMING_CACHE_TTL: requireIntEnv('STREAMING_CACHE_TTL'),
   STREAMING_SERVICE_STORAGE_PATH: resolveStreamingServiceStoragePath(nodeEnv),

   AWS_S3_BUCKET: requireEnv('AWS_S3_BUCKET'),
   AWS_S3_REGION: requireEnv('AWS_S3_REGION'),
   AWS_S3_ENDPOINT: requireEnv('AWS_S3_ENDPOINT'),
   AWS_SIGNED_URL_EXPIRES_IN: requireIntEnv('AWS_SIGNED_URL_EXPIRES_IN'),

   STORAGE_PROVIDER: requireEnv('STORAGE_PROVIDER'),

   STREAMING_SERVICE_URL,
   AUTH_SERVICE_URL,
   JWKS_ENDPOINT,

   LOG_LEVEL: requireEnv('LOG_LEVEL'),
   LOG_DIR: requireEnv('LOG_DIR'),

   NOMINATIM_BASE_URL: requireEnv('NOMINATIM_BASE_URL'),
   NOMINATIM_USER_AGENT: requireEnv('NOMINATIM_USER_AGENT'),

   HEALTH_SUPPORT_EMAIL,
   HEALTH_SUPPORT_PASSWORD,

   FFMPEG_PATH: process.env['FFMPEG_PATH'] ?? 'ffmpeg',
};
