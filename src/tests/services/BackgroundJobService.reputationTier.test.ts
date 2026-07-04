/**
 * BackgroundJobService reputation tier recalculation queue
 */

import Bull from 'bull';
import { BackgroundJobService } from '../../services/BackgroundJobService';

jest.mock('bull');

const mockRecalculateOrganizationTier = jest.fn().mockResolvedValue(undefined);
const mockRecalculateAuthorTier = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/ReputationTierService', () => ({
  ReputationTierService: jest.fn().mockImplementation(() => ({
    recalculateOrganizationTier: mockRecalculateOrganizationTier,
    recalculateAuthorTier: mockRecalculateAuthorTier,
  })),
}));

describe('BackgroundJobService reputation tier recalculation', () => {
  let reputationTierProcessor: (job: Bull.Job) => Promise<void>;
  let mockReputationTierQueueAdd: jest.Mock;
  let service: BackgroundJobService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReputationTierQueueAdd = jest.fn();

    (Bull as unknown as jest.Mock).mockImplementation((name: string) => {
      const queue = {
        process: jest.fn((jobName: string, handler: (job: Bull.Job) => Promise<void>) => {
          if (name === 'reputation-tier-recalculation' && jobName === 'recalculate-tier') {
            reputationTierProcessor = handler;
          }
        }),
        add: name === 'reputation-tier-recalculation' ? mockReputationTierQueueAdd : jest.fn(),
        on: jest.fn(),
        getJobCounts: jest.fn().mockResolvedValue({}),
        close: jest.fn(),
      };
      return queue;
    });

    const prisma = {
      chapter: { findUnique: jest.fn(), update: jest.fn() },
      audioBook: { update: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          chapter: { update: jest.fn() },
          audioBook: { update: jest.fn() },
        }),
      ),
    } as unknown as ConstructorParameters<typeof BackgroundJobService>[0];

    service = new BackgroundJobService(prisma);
  });

  it('schedules reputation tier recalculation jobs', async () => {
    await service.scheduleReputationTierRecalculation({
      entityType: 'organization',
      entityId: 'org-1',
    });

    expect(mockReputationTierQueueAdd).toHaveBeenCalledWith(
      'recalculate-tier',
      { entityType: 'organization', entityId: 'org-1' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('processes organization tier recalculation jobs', async () => {
    await reputationTierProcessor({
      data: { entityType: 'organization', entityId: 'org-1' },
    } as Bull.Job);

    expect(mockRecalculateOrganizationTier).toHaveBeenCalledWith('org-1');
  });

  it('processes author tier recalculation jobs', async () => {
    await reputationTierProcessor({
      data: { entityType: 'author', entityId: 'author-1' },
    } as Bull.Job);

    expect(mockRecalculateAuthorTier).toHaveBeenCalledWith('author-1');
  });
});
