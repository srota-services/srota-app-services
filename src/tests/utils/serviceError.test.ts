import { Prisma } from '@prisma/client';
import { ApiError } from '../../types/ApiError';
import { rethrowServiceError, logServiceError } from '../../utils/serviceError';

jest.mock('../../config/logger', () => ({
   errorLogger: {
      error: jest.fn(),
   },
}));

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

import { errorLogger } from '../../config/logger';

describe('rethrowServiceError', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('rethrows ApiError unchanged', () => {
      const err = ApiError.notFound('missing');
      expect(() => rethrowServiceError(err, { operation: 'test' })).toThrow(err);
      expect(errorLogger.error).not.toHaveBeenCalled();
   });

   it('maps Prisma P2025 to not found and logs prisma metadata', () => {
      const prismaErr = new Prisma.PrismaClientKnownRequestError('Not found', {
         code: 'P2025',
         clientVersion: '5.0.0',
         meta: { cause: 'Record not found' },
      });

      expect(() => rethrowServiceError(prismaErr, { operation: 'updateMood' })).toThrow(ApiError);
      try {
         rethrowServiceError(prismaErr, { operation: 'updateMood' });
      } catch (e) {
         expect((e as ApiError).statusCode).toBe(404);
      }

      expect(errorLogger.error).toHaveBeenCalledWith(
         expect.objectContaining({
            operation: 'updateMood',
            prismaCode: 'P2025',
            err: prismaErr,
         }),
         'Database error',
      );
   });

   it('throws generic internal ApiError for unknown failures', () => {
      const err = new Error('unexpected');
      expect(() => rethrowServiceError(err, { operation: 'createChapter' })).toThrow(ApiError);
      expect(errorLogger.error).toHaveBeenCalledWith(
         expect.objectContaining({ operation: 'createChapter', err }),
         'Unhandled service error',
      );
   });
});

describe('logServiceError', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('writes Prisma known request errors to errorLogger', () => {
      const err = new Prisma.PrismaClientKnownRequestError('db fail', {
         code: 'P2003',
         clientVersion: '5.0.0',
      });
      logServiceError(err, { operation: 'write' });
      expect(errorLogger.error).toHaveBeenCalledWith(
         expect.objectContaining({ prismaCode: 'P2003' }),
         'Database error',
      );
   });
});
