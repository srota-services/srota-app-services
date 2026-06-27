import { Prisma } from '@prisma/client';
import { errorLogger } from '../config/logger';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from './MessageHandler';

export interface ServiceErrorContext extends Record<string, unknown> {
   operation?: string;
}

function isPrismaKnownError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
   return error instanceof Prisma.PrismaClientKnownRequestError;
}

function isPrismaValidationError(error: unknown): error is Prisma.PrismaClientValidationError {
   return error instanceof Prisma.PrismaClientValidationError;
}

export function logServiceError(error: unknown, context: ServiceErrorContext = {}): void {
   const base = { ...context, err: error };

   if (isPrismaKnownError(error)) {
      errorLogger.error(
         {
            ...base,
            prismaCode: error.code,
            prismaMeta: error.meta,
            clientVersion: error.clientVersion,
         },
         'Database error',
      );
      return;
   }

   if (isPrismaValidationError(error)) {
      errorLogger.error(
         {
            ...base,
            prismaClientVersion: error.clientVersion,
         },
         'Database validation error',
      );
      return;
   }

   errorLogger.error(base, 'Unhandled service error');
}

function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): ApiError {
   switch (error.code) {
      case 'P2002':
         return ApiError.conflict(MessageHandler.getErrorMessage('conflict.resource_exists'));
      case 'P2025':
         return ApiError.notFound(MessageHandler.getErrorMessage('not_found.resource'));
      default:
         return ApiError.internalError(MessageHandler.getErrorMessage('internal.database_operation'));
   }
}

export function rethrowServiceError(
   error: unknown,
   context: ServiceErrorContext = {},
   internalMessage?: string,
): never {
   if (error instanceof ApiError) {
      throw error;
   }

   if (isPrismaKnownError(error)) {
      logServiceError(error, context);
      throw mapPrismaError(error);
   }

   logServiceError(error, context);
   throw ApiError.internalError(
      internalMessage ?? MessageHandler.getErrorMessage('internal.default'),
   );
}
