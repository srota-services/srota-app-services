/**
 * Middleware for handling errors consistently across the API
 * Provides centralized error handling following OOP principles
 */
import { Request, Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { logger } from '../config/logger';

export class ErrorHandler {
  /**
   * Global error handling middleware
   */
  static handleError(
    error: Error | ApiError,
    req: Request,
    res: Response,
    _next: NextFunction
  ): void {
    // Log error with context
    const errorContext = {
      err: error,
      method: req.method,
      url: req.originalUrl,
      statusCode: error instanceof ApiError ? error.statusCode : 500,
    };

    (res.locals as { apiError?: Error | ApiError }).apiError = error;

    // Log to main logger with appropriate level (error.log via apiErrorLogMiddleware + multistream)
    if (error instanceof ApiError && error.statusCode < 500) {
      logger.warn(errorContext, 'Client error');
    } else {
      logger.error(errorContext, 'Server error');
    }

    // If it's already an ApiError, use it directly
    if (error instanceof ApiError) {
      ResponseHandler.error(res, error);
      return;
    }

    // Handle Prisma errors
    if (error.name === 'PrismaClientKnownRequestError') {
      const prismaError = error as any;
      switch (prismaError.code) {
        case 'P2002':
          ResponseHandler.conflict(res, MessageHandler.getErrorMessage('conflict.resource_exists'));
          return;
        case 'P2025':
          ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.resource'));
          return;
        default:
          ResponseHandler.internalError(res, MessageHandler.getErrorMessage('internal.database_operation'));
          return;
      }
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      ResponseHandler.validationError(res, error.message);
      return;
    }

    // Handle syntax errors
    if (error instanceof SyntaxError) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.invalid_json'));
      return;
    }

    // Handle default errors
    ResponseHandler.internalError(res, error.message);
  }

  /**
   * Handle 404 errors for undefined routes
   */
  static handleNotFound(req: Request, res: Response): void {
    ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.route', { route: req.originalUrl }), req.originalUrl);
  }

  /**
   * Async error wrapper for route handlers
   */
  static asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}
