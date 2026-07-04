import { PrismaClient, ReviewerType } from '@prisma/client';
import { AuthorReviewService } from '../../services/AuthorReviewService';
import { authClient } from '../../clients/AuthClient';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const mockScheduleReputationTierRecalculation = jest.fn().mockResolvedValue(undefined);

jest.mock('../../clients/AuthClient', () => ({
  authClient: {
    getAuthorCatalogById: jest.fn(),
    getAuthorByUserId: jest.fn(),
  },
}));

jest.mock('../../lib/backgroundJobs', () => ({
  getBackgroundJobService: jest.fn(() => ({
    scheduleReputationTierRecalculation: mockScheduleReputationTierRecalculation,
  })),
}));

describe('AuthorReviewService', () => {
  let service: AuthorReviewService;
  let mockPrisma: {
    authorReview: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };

  const reviewer = { type: ReviewerType.USER, id: 'profile-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = attachPrismaTransaction({
      authorReview: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    });
    service = new AuthorReviewService(mockPrisma as unknown as PrismaClient);
  });

  it('creates a review and enqueues tier recalculation', async () => {
    (authClient.getAuthorCatalogById as jest.Mock).mockResolvedValue({ id: 'author-1', userId: 'user-2' });
    (authClient.getAuthorByUserId as jest.Mock).mockResolvedValue(null);
    mockPrisma.authorReview.findUnique.mockResolvedValue(null);
    mockPrisma.authorReview.create.mockResolvedValue({
      id: 'review-1',
      authorId: 'author-1',
      reviewerType: ReviewerType.USER,
      reviewerId: 'profile-1',
      rating: 4,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createReview(
      reviewer,
      { authorId: 'author-1', rating: 4 },
      'token-1',
    );

    expect(result.authorId).toBe('author-1');
    expect(mockScheduleReputationTierRecalculation).toHaveBeenCalledWith({
      entityType: 'author',
      entityId: 'author-1',
    });
  });

  it('forbids author self-reviews', async () => {
    (authClient.getAuthorCatalogById as jest.Mock).mockResolvedValue({
      id: 'author-1',
      userId: 'user-1',
    });

    await expect(
      service.createReview(
        { type: ReviewerType.AUTHOR, id: 'author-1' },
        { authorId: 'author-1', rating: 5 },
        'token-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('forbids author self-reviews when reviewer account owns the author profile', async () => {
    (authClient.getAuthorCatalogById as jest.Mock).mockResolvedValue({
      id: 'author-1',
      userId: 'user-1',
    });

    await expect(
      service.createReview(
        reviewer,
        { authorId: 'author-1', rating: 5 },
        'token-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
