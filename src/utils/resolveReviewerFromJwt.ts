import { ReviewerType } from '@prisma/client';
import { Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { authClient } from '../clients/AuthClient';
import { ApiError } from '../types/ApiError';
import { AuthenticatedRequest } from '../types/auth';
import {
  AuthRole,
  isGuestRole,
  isOrgAdminRole,
  isOrgCoordinatorRole,
  normalizeAuthRole,
} from '../constants/authRoles';
import { MessageHandler } from './MessageHandler';
import { resolveUserProfileId } from './resolveUserProfileId';
import { ResolvedReviewer } from '../types/reviewer';

function getBearerToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

export async function resolveReviewerFromJwt(
  prisma: PrismaClient,
  req: Request,
): Promise<ResolvedReviewer> {
  const authReq = req as AuthenticatedRequest;
  const role = authReq.user?.role;

  if (isGuestRole(role)) {
    throw ApiError.forbidden(MessageHandler.getErrorMessage('reviews.guest_forbidden'));
  }

  const normalizedRole = normalizeAuthRole(role);

  if (
    normalizedRole === normalizeAuthRole(AuthRole.LISTENER) ||
    normalizedRole === normalizeAuthRole(AuthRole.GLOBAL_ADMIN)
  ) {
    const userProfileId = await resolveUserProfileId(prisma, req);
    return { type: ReviewerType.USER, id: userProfileId };
  }

  if (normalizedRole === normalizeAuthRole(AuthRole.AUTHOR)) {
    const accessToken = getBearerToken(req);
    const externalUserId = authReq.user?.id;
    if (!accessToken || !externalUserId) {
      throw ApiError.unauthorized(MessageHandler.getErrorMessage('unauthorized.not_authenticated'));
    }

    const author = await authClient.getAuthorByUserId(externalUserId, accessToken);
    if (!author?.id) {
      throw ApiError.forbidden(MessageHandler.getErrorMessage('reviews.reviewer_author_required'));
    }

    return { type: ReviewerType.AUTHOR, id: author.id };
  }

  if (isOrgAdminRole(role) || isOrgCoordinatorRole(role)) {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      throw ApiError.unauthorized(MessageHandler.getErrorMessage('unauthorized.not_authenticated'));
    }

    const memberships = await authClient.getOrganizationMembershipsForUser(accessToken);
    const staffMembership = memberships.find(
      (membership) => membership.role === 'OWNER' || membership.role === 'ADMIN',
    );

    if (!staffMembership) {
      throw ApiError.forbidden(MessageHandler.getErrorMessage('reviews.reviewer_organization_required'));
    }

    return { type: ReviewerType.ORGANIZATION, id: staffMembership.organizationId };
  }

  throw ApiError.forbidden(MessageHandler.getErrorMessage('reviews.reviewer_not_allowed'));
}
