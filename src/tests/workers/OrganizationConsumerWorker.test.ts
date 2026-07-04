import { PrismaClient } from '@prisma/client';
import { OrganizationConsumerWorker } from '../../workers/OrganizationConsumerWorker';

const mockCreateDefaultForOrganization = jest.fn().mockResolvedValue(undefined);

jest.mock('../../config/rabbitmq', () => ({
  RabbitMQFactory: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getConnection: jest.fn(() => ({
      consumeOrganizationCreationMessages: jest.fn(async (handler: (msg: { organizationId: string }) => Promise<void>) => {
        await handler({ organizationId: 'org-1' });
      }),
      stopConsumingOrganizationCreationMessages: jest.fn(),
    })),
  },
}));

jest.mock('../../services/OrganizationTierService', () => ({
  OrganizationTierService: jest.fn().mockImplementation(() => ({
    createDefaultForOrganization: mockCreateDefaultForOrganization,
  })),
}));

describe('OrganizationConsumerWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bootstraps default organization tier on organization.created event', async () => {
    const worker = new OrganizationConsumerWorker({} as PrismaClient);
    await worker.start();

    expect(mockCreateDefaultForOrganization).toHaveBeenCalledWith('org-1');
  });
});
