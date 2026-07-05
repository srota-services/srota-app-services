/**
 * Resolve auth user ID from the authenticated JWT.
 */
import { Request } from 'express';
import { ApiError } from '../types/ApiError';
import { AuthenticatedRequest } from '../types/auth';
import { MessageHandler } from './MessageHandler';

export function resolveUserId(req: Request): string {
   const authReq = req as AuthenticatedRequest;
   const userId = authReq.user?.id;
   if (!userId) {
      throw ApiError.unauthorized(
         MessageHandler.getErrorMessage('unauthorized.not_authenticated')
      );
   }
   return userId;
}
