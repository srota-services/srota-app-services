import { Response } from 'express';
import { SubscriptionGatingMode, SubscriptionTierLevel } from '@prisma/client';
import { requireChapterStreamAccess } from '../../middleware/StreamAccessMiddleware';
import { AuthRole } from '../../constants/authRoles';
import { AuthenticatedRequest } from '../../types/auth';

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

jest.mock('../../utils/ResponseHandler', () => ({
   ResponseHandler: {
      notFound: jest.fn(),
      forbidden: jest.fn(),
      internalError: jest.fn(),
   },
}));

import { ResponseHandler } from '../../utils/ResponseHandler';

function buildMockResponse(): Response {
   return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
   } as unknown as Response;
}

describe('requireChapterStreamAccess', () => {
   const next = jest.fn();

   beforeEach(() => {
      jest.clearAllMocks();
   });

   test('blocks all guest streaming regardless of gating', async () => {
      const prisma = {
         chapter: {
            findUnique: jest.fn().mockResolvedValue({
               id: 'chapter-1',
               minSubscriptionTier: null,
               isActive: true,
               audiobook: {
                  subscriptionGatingMode: SubscriptionGatingMode.NONE,
                  minSubscriptionTier: null,
                  isPublic: true,
                  isActive: true,
               },
            }),
         },
      } as any;

      const req = {
         params: { chapterId: 'chapter-1' },
         headers: { authorization: 'Bearer guest-token' },
         user: { id: 'guest-1', role: AuthRole.GUEST, email: 'guest@test.internal' },
      } as unknown as AuthenticatedRequest;
      const res = buildMockResponse();

      await requireChapterStreamAccess(prisma)(req, res, next);

      expect(ResponseHandler.forbidden).toHaveBeenCalledWith(
         res,
         'forbidden.guest_streaming_not_allowed',
      );
      expect(next).not.toHaveBeenCalled();
   });

   test('blocks guest streaming for subscription-gated chapter', async () => {
      const prisma = {
         chapter: {
            findUnique: jest.fn().mockResolvedValue({
               id: 'chapter-1',
               minSubscriptionTier: null,
               isActive: true,
               audiobook: {
                  subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
                  minSubscriptionTier: SubscriptionTierLevel.STANDARD,
                  isPublic: true,
                  isActive: true,
               },
            }),
         },
      } as any;

      const req = {
         params: { chapterId: 'chapter-1' },
         headers: { authorization: 'Bearer guest-token' },
         user: { id: 'guest-1', role: AuthRole.GUEST, email: 'guest@test.internal' },
      } as unknown as AuthenticatedRequest;
      const res = buildMockResponse();

      await requireChapterStreamAccess(prisma)(req, res, next);

      expect(ResponseHandler.forbidden).toHaveBeenCalledWith(
         res,
         'forbidden.guest_streaming_not_allowed',
      );
      expect(next).not.toHaveBeenCalled();
   });

   test('allows author to stream subscription-gated chapter without tier lookup', async () => {
      const prisma = {
         chapter: {
            findUnique: jest.fn().mockResolvedValue({
               id: 'chapter-1',
               minSubscriptionTier: null,
               isActive: true,
               audiobook: {
                  subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
                  minSubscriptionTier: SubscriptionTierLevel.STANDARD,
                  isPublic: true,
                  isActive: true,
               },
            }),
         },
      } as any;

      const req = {
         params: { chapterId: 'chapter-1' },
         headers: { authorization: 'Bearer author-token' },
         user: { id: 'author-1', role: AuthRole.AUTHOR, email: 'author@example.com' },
      } as unknown as AuthenticatedRequest;
      const res = buildMockResponse();

      await requireChapterStreamAccess(prisma)(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(ResponseHandler.forbidden).not.toHaveBeenCalled();
   });
});
