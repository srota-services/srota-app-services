import { PrismaClient, ReviewerType } from '@prisma/client';
import { OrganizationReviewService } from '../../services/OrganizationReviewService';
import { authClient } from '../../clients/AuthClient';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const mockScheduleReputationTierRecalculation = jest.fn().mockResolvedValue(undefined);

jest.mock('../../clients/AuthClient', () => ({
  authClient: {
    getOrganizationCatalogById: jest.fn(),
    getMembership: jest.fn(),
  },
}));

jest.mock('../../lib/backgroundJobs', () => ({
  getBackgroundJobService: jest.fn(() => ({
    scheduleReputationTierRecalculation: mockScheduleReputationTierRecalculation,
  })),
}));

describe('OrganizationReviewService', () => {
  let service: OrganizationReviewService;
  let mockPrisma: {
    organizationReview: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };

  const reviewer = { type: ReviewerType.USER, id: 'profile-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = attachPrismaTransaction({
      organizationReview: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    });
    service = new OrganizationReviewService(mockPrisma as unknown as PrismaClient);
  });

  it('creates a review and enqueues tier recalculation', async () => {
    (authClient.getOrganizationCatalogById as jest.Mock).mockResolvedValue({ id: 'org-1' });
    (authClient.getMembership as jest.Mock).mockResolvedValue(null);
    mockPrisma.organizationReview.findUnique.mockResolvedValue(null);
    mockPrisma.organizationReview.create.mockResolvedValue({
      id: 'review-1',
      organizationId: 'org-1',
      reviewerType: ReviewerType.USER,
      reviewerId: 'profile-1',
      rating: 5,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createReview(
      reviewer,
      { organizationId: 'org-1', rating: 5 },
      'token-1',
    );

    expect(result.organizationId).toBe('org-1');
    expect(mockScheduleReputationTierRecalculation).toHaveBeenCalledWith({
      entityType: 'organization',
      entityId: 'org-1',
    });
  });

  it('rejects duplicate reviews', async () => {
    (authClient.getOrganizationCatalogById as jest.Mock).mockResolvedValue({ id: 'org-1' });
    (authClient.getMembership as jest.Mock).mockResolvedValue(null);
    mockPrisma.organizationReview.findUnique.mockResolvedValue({ id: 'existing-review' });

    await expect(
      service.createReview(reviewer, { organizationId: 'org-1', rating: 4 }, 'token-1'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('forbids organization self-reviews', async () => {
    (authClient.getMembership as jest.Mock).mockResolvedValue({ role: 'ADMIN' });

    await expect(
      service.createReview(
        { type: ReviewerType.ORGANIZATION, id: 'org-1' },
        { organizationId: 'org-1', rating: 4 },
        'token-1',
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('forbids organization member reviews', async () => {
    (authClient.getMembership as jest.Mock).mockResolvedValue({ role: 'MEMBER' });

    await expect(
      service.createReview(reviewer, { organizationId: 'org-1', rating: 4 }, 'token-1'),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(authClient.getOrganizationCatalogById).not.toHaveBeenCalled();
  });
});
