/**
 * PageService tests — last-page delete guard and publication rejection.
 */
import { AudiobookType, PrismaClient } from '@prisma/client';
import { PageService } from '../../services/PageService';
import { ApiError } from '../../types/ApiError';

const mockPrisma = {
  chapter: {
    findUnique: jest.fn(),
  },
  page: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
} as unknown as PrismaClient;

jest.mock('../../utils/prismaTransaction', () => ({
  runWrite: (_prisma: unknown, fn: (tx: unknown) => unknown) => fn(mockPrisma),
  runInTransaction: (_prisma: unknown, fn: (tx: unknown) => unknown) => fn(mockPrisma),
}));

describe('PageService.deletePage', () => {
  let service: PageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PageService(mockPrisma);
  });

  it('rejects deleting the last page of an authoring chapter', async () => {
    (mockPrisma.chapter.findUnique as jest.Mock).mockResolvedValue({
      id: 'ch1',
      audiobook: { type: AudiobookType.AUTHORING },
    });
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValue({
      id: 'p1',
      chapterId: 'ch1',
    });
    (mockPrisma.page.count as jest.Mock).mockResolvedValue(1);

    await expect(service.deletePage('p1')).rejects.toThrow(ApiError);
    expect(mockPrisma.page.delete).not.toHaveBeenCalled();
  });

  it('rejects page operations on publication audiobooks', async () => {
    (mockPrisma.chapter.findUnique as jest.Mock).mockResolvedValue({
      id: 'ch1',
      audiobook: { type: AudiobookType.PUBLICATION },
    });

    await expect(service.getPagesByChapterId('ch1')).rejects.toThrow(ApiError);
  });
});
