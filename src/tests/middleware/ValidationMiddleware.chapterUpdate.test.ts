import { Request, Response, NextFunction } from 'express';
import { ValidationMiddleware } from '../../middleware/ValidationMiddleware';
import { ResponseHandler } from '../../utils/ResponseHandler';

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

jest.mock('../../utils/ResponseHandler', () => ({
   ResponseHandler: {
      validationError: jest.fn(),
   },
}));

function buildMockResponse(): Response {
   return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
   } as unknown as Response;
}

describe('ValidationMiddleware.validateChapterUpdate', () => {
   const next = jest.fn() as NextFunction;

   beforeEach(() => {
      jest.clearAllMocks();
   });

   test('passes when optional fields are valid', () => {
      const req = {
         body: {
            title: 'Updated title',
            description: 'Updated description',
            minSubscriptionTier: '2',
         },
      } as Request;
      const res = buildMockResponse();

      ValidationMiddleware.validateChapterUpdate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.minSubscriptionTier).toBe(2);
      expect(ResponseHandler.validationError).not.toHaveBeenCalled();
   });

   test('rejects empty title', () => {
      const req = { body: { title: '   ' } } as Request;
      const res = buildMockResponse();

      ValidationMiddleware.validateChapterUpdate(req, res, next);

      expect(ResponseHandler.validationError).toHaveBeenCalledWith(
         res,
         'validation.title_required',
      );
      expect(next).not.toHaveBeenCalled();
   });

   test('rejects description that is too long', () => {
      const req = { body: { description: 'x'.repeat(1001) } } as Request;
      const res = buildMockResponse();

      ValidationMiddleware.validateChapterUpdate(req, res, next);

      expect(ResponseHandler.validationError).toHaveBeenCalledWith(
         res,
         'validation.description_length',
      );
      expect(next).not.toHaveBeenCalled();
   });

   test('normalizes empty minSubscriptionTier to null', () => {
      const req = { body: { minSubscriptionTier: '' } } as Request;
      const res = buildMockResponse();

      ValidationMiddleware.validateChapterUpdate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.minSubscriptionTier).toBeNull();
   });
});
