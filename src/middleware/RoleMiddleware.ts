/**
 * Role-Based Authorization Middleware
 * Provides role-based access control for protected routes
 */
import { Response, NextFunction } from 'express';
import { AuthRole, AuthRoleGroups, isGuestRole, isRegisteredUserRole, normalizeAuthRole } from '../constants/authRoles';
import { AuthenticatedRequest } from '../types/auth';
import { MessageHandler } from '../utils/MessageHandler';

/**
 * Check if user has one of the allowed roles
 * @param allowedRoles Array of allowed role names (case-insensitive)
 */
export function requireRole(allowedRoles: string[]) {
   return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      // Check if user is authenticated
      if (!req.user) {
         res.status(401).json({
            success: false,
            message: 'Authentication required',
            details: 'User must be authenticated to access this resource'
         });
         return;
      }

      // Normalize roles for comparison
      const userRole = normalizeAuthRole(req.user.role);
      const normalizedAllowedRoles = allowedRoles.map(role => normalizeAuthRole(role));

      // Check if user role is in allowed roles
      if (!normalizedAllowedRoles.includes(userRole)) {
         res.status(403).json({
            success: false,
            message: 'Access forbidden',
            details: `${allowedRoles.join(', ')} access only.`
         });
         return;
      }

      next();
   };
}

/**
 * Require GLOBAL_ADMIN role only
 */
export function requireGlobalAdmin() {
   return requireRole([...AuthRoleGroups.GLOBAL_ADMIN_ONLY]);
}

/**
 * Require any authenticated role (guest, listener, staff, or author)
 */
export function requireAuthenticated() {
   return requireRole([...AuthRoleGroups.ALL_AUTHENTICATED]);
}

/**
 * Block guest users from write operations (POST, PUT, PATCH, DELETE).
 * GET/HEAD/OPTIONS requests pass through so guests can browse the catalog.
 */
export function blockGuestMutations() {
   return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
         res.status(401).json({
            success: false,
            message: 'Authentication required',
            details: 'User must be authenticated to access this resource',
         });
         return;
      }

      const method = req.method.toUpperCase();
      if (
         isGuestRole(req.user.role) &&
         (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
      ) {
         res.status(403).json({
            success: false,
            message: MessageHandler.getErrorMessage('forbidden.registered_user_required'),
            details: 'Please sign up or log in to access this feature',
         });
         return;
      }

      next();
   };
}

/**
 * Require a registered user (excludes anonymous guest sessions)
 */
export function requireRegisteredUser() {
   return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
         res.status(401).json({
            success: false,
            message: 'Authentication required',
            details: 'User must be authenticated to access this resource',
         });
         return;
      }

      if (!isRegisteredUserRole(req.user.role)) {
         res.status(403).json({
            success: false,
            message: MessageHandler.getErrorMessage('forbidden.registered_user_required'),
            details: 'Please sign up or log in to access this feature',
         });
         return;
      }

      next();
   };
}

/**
 * Require GLOBAL_ADMIN or AUTHOR role
 */
export function requireGlobalAdminOrAuthor() {
   return requireRole([...AuthRoleGroups.GLOBAL_ADMIN_OR_AUTHOR]);
}

/**
 * Require AUTHOR role only
 */
export function requireAuthor() {
   return requireRole([AuthRole.AUTHOR]);
}

/**
 * Require ORG_ADMIN, ORG_COORDINATOR, or AUTHOR (audiobook/chapter creation)
 */
export function requireContentCreator() {
   return requireRole([...AuthRoleGroups.CONTENT_CREATOR]);
}

/**
 * Require GLOBAL_ADMIN, ORG_ADMIN, ORG_COORDINATOR, or AUTHOR (audiobook/chapter update/delete)
 */
export function requireContentManager() {
   return requireRole([...AuthRoleGroups.CONTENT_MANAGER]);
}

/** @deprecated Use requireGlobalAdmin */
export const requireAdmin = requireGlobalAdmin;

/** @deprecated Use requireAuthenticated */
export const requireUserOrAdmin = requireAuthenticated;

/** @deprecated Use requireContentCreator for create flows */
export const requireAdminOrAuthor = requireContentCreator;
