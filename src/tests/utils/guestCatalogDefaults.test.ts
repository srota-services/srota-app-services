import { Request } from 'express';
import { applyGuestCatalogDefaults, isGuestRequest } from '../../utils/guestCatalogDefaults';
import { AuthRole } from '../../constants/authRoles';
import { AuthenticatedRequest } from '../../types/auth';

function buildRequest(role?: string): Request {
   const req = { user: role ? { id: 'user-1', role, email: 'test@example.com' } : undefined } as AuthenticatedRequest;
   return req;
}

describe('guestCatalogDefaults', () => {
   test('isGuestRequest returns true for GUEST role', () => {
      expect(isGuestRequest(buildRequest(AuthRole.GUEST))).toBe(true);
      expect(isGuestRequest(buildRequest(AuthRole.LISTENER))).toBe(false);
   });

   test('applyGuestCatalogDefaults forces active filter for guests', () => {
      const params = applyGuestCatalogDefaults(buildRequest(AuthRole.GUEST), {
         page: 1,
         limit: 10,
         isPublic: false,
         isActive: false,
      });

      expect(params.isPublic).toBe(false);
      expect(params.isActive).toBe(true);
   });

   test('applyGuestCatalogDefaults leaves params unchanged for registered users', () => {
      const input = {
         page: 1,
         limit: 10,
         isPublic: false,
         isActive: false,
      };

      expect(applyGuestCatalogDefaults(buildRequest(AuthRole.LISTENER), input)).toEqual(input);
   });
});
