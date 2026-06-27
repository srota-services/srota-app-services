import { Response, NextFunction } from 'express';
import { requireRegisteredUser } from '../../middleware/RoleMiddleware';
import { AuthRole } from '../../constants/authRoles';
import { AuthenticatedRequest } from '../../types/auth';

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

function buildMockResponse(): Response {
   const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
   };
   return res as unknown as Response;
}

describe('requireRegisteredUser', () => {
   const next = jest.fn() as NextFunction;

   beforeEach(() => {
      jest.clearAllMocks();
   });

   test('blocks guest users with registered_user_required', () => {
      const req = {
         user: { id: 'guest-1', role: AuthRole.GUEST, email: 'guest@test.internal' },
      } as AuthenticatedRequest;
      const res = buildMockResponse();

      requireRegisteredUser()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
         expect.objectContaining({
            message: 'forbidden.registered_user_required',
         }),
      );
      expect(next).not.toHaveBeenCalled();
   });

   test('allows listener users', () => {
      const req = {
         user: { id: 'user-1', role: AuthRole.LISTENER, email: 'user@example.com' },
      } as AuthenticatedRequest;
      const res = buildMockResponse();

      requireRegisteredUser()(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
   });
});
