import { Request } from 'express';
import { isGuestRole } from '../constants/authRoles';
import { AudioBookQueryParams } from '../models/AudioBookDto';
import { AuthenticatedRequest } from '../types/auth';

export function isGuestRequest(req: Request): boolean {
   const authReq = req as AuthenticatedRequest;
   return isGuestRole(authReq.user?.role);
}

export function applyGuestCatalogDefaults(
   req: Request,
   queryParams: AudioBookQueryParams,
): AudioBookQueryParams {
   if (!isGuestRequest(req)) {
      return queryParams;
   }

   return {
      ...queryParams,
      isActive: true,
   };
}

export function guestCatalogOnly(req: Request): boolean {
   return isGuestRequest(req);
}
