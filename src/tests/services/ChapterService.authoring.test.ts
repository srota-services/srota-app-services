/**
 * Authoring chapter create — cover image optional.
 */
import { AudiobookType, PrismaClient } from '@prisma/client';
import { ChapterService } from '../../services/ChapterService';

const createdChapter = {
  id: 'chapter-authoring-1',
  audiobookId: 'ab-authoring-1',
  title: 'Chapter 1',
  description: null,
  chapterNumber: 1,
  coverImage: null,
  duration: null,
  filePath: null,
  fileSize: null,
  startPosition: null,
  endPosition: null,
  minSubscriptionTier: null,
  isActive: true,
  transcodingReady: true,
  sourceUploadStatus: 'ready' as const,
  sourceUploadError: null,
  scheduledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  pages: [
    {
      id: 'page-1',
      chapterId: 'chapter-authoring-1',
      pageNumber: 1,
      plainText: 'Hello',
      richText: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

const mockTx = {
  chapter: {
    create: jest.fn().mockResolvedValue(createdChapter),
    update: jest.fn(),
  },
  page: {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
};

const mockPrisma = {
  audioBook: {
    findUnique: jest.fn().mockResolvedValue({ id: 'ab-authoring-1', type: AudiobookType.AUTHORING }),
  },
  chapter: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(createdChapter),
  },
  $transaction: jest.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
} as unknown as PrismaClient;

jest.mock('../../services/FileUrlService', () => ({
  fileUrlService: {
    resolveChapterMedia: jest.fn(async (dto: unknown) => dto),
  },
}));

jest.mock('../../services/ImageAssetService', () => ({
  ImageAssetService: jest.fn().mockImplementation(() => ({
    generateAndStoreVariants: jest.fn(),
  })),
}));

jest.mock('../../utils/prismaTransaction', () => ({
  runInTransaction: (_prisma: unknown, fn: (tx: unknown) => unknown) => fn(mockTx),
  runWrite: (_prisma: unknown, fn: (tx: unknown) => unknown) => fn(mockPrisma),
}));

describe('ChapterService.createChapter authoring', () => {
  let service: ChapterService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChapterService(mockPrisma);
  });

  it('creates authoring chapter without cover image', async () => {
    const result = await service.createChapter(
      {
        audiobookId: 'ab-authoring-1',
        title: 'Chapter 1',
        chapterNumber: 1,
        pages: [{ pageNumber: 1, richText: { blocks: [] } }],
      },
      undefined,
      undefined,
    );

    expect(mockTx.chapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coverImage: null,
        }),
      }),
    );
    expect(mockTx.page.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          pageNumber: 1,
          plainText: '',
        }),
      ],
    });
    expect(result.coverImage).toBeUndefined();
  });
});
