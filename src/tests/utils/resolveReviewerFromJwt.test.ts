import { ReviewerType } from '@prisma/client';
import { Request } from 'express';
import { AuthRole } from '../../constants/authRoles';
import { authClient } from '../../clients/AuthClient';
import { resolveReviewerFromJwt } from '../../utils/resolveReviewerFromJwt';

jest.mock('../../clients/AuthClient', () => ({
  authClient: {
    getAuthorByUserId: jest.fn(),
    getOrganizationMembershipsForUser: jest.fn(),
  },
}));

describe('resolveReviewerFromJwt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects guest users', async () => {
    const req = {
      user: { role: AuthRole.GUEST, id: 'guest-1' },
      headers: {},
    } as unknown as Request;

    await expect(resolveReviewerFromJwt(req)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('resolves listener as USER reviewer using auth user id', async () => {
    const req = {
      user: { role: AuthRole.LISTENER, id: 'user-1' },
      headers: {},
    } as unknown as Request;

    const reviewer = await resolveReviewerFromJwt(req);

    expect(reviewer).toEqual({ type: ReviewerType.USER, id: 'user-1' });
  });

  it('resolves author as AUTHOR reviewer', async () => {
    (authClient.getAuthorByUserId as jest.Mock).mockResolvedValue({ id: 'author-1', userId: 'user-1' });
    const req = {
      user: { role: AuthRole.AUTHOR, id: 'user-1' },
      headers: { authorization: 'Bearer token-1' },
    } as unknown as Request;

    const reviewer = await resolveReviewerFromJwt(req);

    expect(reviewer).toEqual({ type: ReviewerType.AUTHOR, id: 'author-1' });
  });

  it('resolves org admin as ORGANIZATION reviewer using primary staff membership', async () => {
    (authClient.getOrganizationMembershipsForUser as jest.Mock).mockResolvedValue([
      { organizationId: 'org-1', role: 'MEMBER' },
      { organizationId: 'org-2', role: 'ADMIN' },
    ]);
    const req = {
      user: { role: AuthRole.ORG_ADMIN, id: 'user-1' },
      headers: { authorization: 'Bearer token-1' },
    } as unknown as Request;

    const reviewer = await resolveReviewerFromJwt(req);

    expect(reviewer).toEqual({ type: ReviewerType.ORGANIZATION, id: 'org-2' });
  });
});
