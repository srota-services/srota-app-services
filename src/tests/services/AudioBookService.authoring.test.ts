/**
 * AuthoringAudiobook create — metadata must not be persisted.
 */
import { AudiobookType, PrismaClient, SubscriptionGatingMode } from '@prisma/client';
import { AudioBookService } from '../../services/AudioBookService';
import { ApiError } from '../../types/ApiError';

const createdRow = {
  id: 'ab-authoring-1',
  title: 'Draft Book',
  author: 'Author',
  type: AudiobookType.AUTHORING,
  ownerType: 'AUTHOR' as const,
  ownerId: 'author-1',
  languageId: 'lang-1',
  isPublic: true,
  isActive: true,
  subscriptionGatingMode: SubscriptionGatingMode.NONE,
  minSubscriptionTier: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTx = {
  audioBook: {
    create: jest.fn().mockResolvedValue(createdRow),
  },
  audioBookGenre: { createMany: jest.fn() },
  audioBookTag: { createMany: jest.fn() },
};

const mockPrisma = {
  audioBook: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  genre: { findMany: jest.fn() },
  tag: { findMany: jest.fn() },
  language: { findUnique: jest.fn().mockResolvedValue({ id: 'lang-1' }) },
  $transaction: jest.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
} as unknown as PrismaClient;

jest.mock('../../services/FileUrlService', () => ({
  fileUrlService: {
    resolveAudioBookMedia: jest.fn(async (dto: unknown) => dto),
  },
}));

jest.mock('../../services/AudioBookOwnerService', () => ({
  AudioBookOwnerService: jest.fn().mockImplementation(() => ({
    attachOwnerDetail: jest.fn(async (item: unknown) => item),
    attachOwnerDetails: jest.fn(async (items: unknown[]) => items),
  })),
}));

jest.mock('../../services/ImageAssetService', () => ({
  ImageAssetService: jest.fn().mockImplementation(() => ({
    validateUploadSource: jest.fn(),
    generateAndStoreVariants: jest.fn(),
  })),
}));

jest.mock('../../utils/prismaTransaction', () => ({
  runInTransaction: (_prisma: unknown, fn: (tx: unknown) => unknown) => fn(mockTx),
  runWrite: (_prisma: unknown, fn: (tx: unknown) => unknown) => fn(mockPrisma),
}));

describe('AudioBookService.createAudioBook authoring', () => {
  let service: AudioBookService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AudioBookService(mockPrisma);
    (mockPrisma.audioBook.findUnique as jest.Mock).mockResolvedValue({
      ...createdRow,
      language: { id: 'lang-1', name: 'English', code: 'en', createdAt: new Date(), updatedAt: new Date() },
      audiobookTags: [],
      audioBookGenres: [],
    });
  });

  it('creates authoring audiobook without genres or subscription metadata', async () => {
    const result = await service.createAudioBook({
      title: 'Draft Book',
      author: 'Author',
      owner: { type: 'AUTHOR', id: 'author-1' },
      type: 'AUTHORING',
    });

    expect(result.type).toBe('AUTHORING');
    expect(mockTx.audioBookGenre.createMany).not.toHaveBeenCalled();
    expect(mockTx.audioBookTag.createMany).not.toHaveBeenCalled();
    expect(mockTx.audioBook.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AudiobookType.AUTHORING,
          subscriptionGatingMode: SubscriptionGatingMode.NONE,
          minSubscriptionTier: null,
        }),
      }),
    );
  });

  it('rejects genreIds on authoring create', async () => {
    await expect(
      service.createAudioBook({
        title: 'Draft Book',
        author: 'Author',
        owner: { type: 'AUTHOR', id: 'author-1' },
        type: 'AUTHORING',
        genreIds: ['genre-1'],
      }),
    ).rejects.toThrow(ApiError);
  });

  it('requires cover image for publication audiobooks', async () => {
    (mockPrisma.genre.findMany as jest.Mock).mockResolvedValue([{ id: 'genre-1' }]);

    await expect(
      service.createAudioBook({
        title: 'Published Book',
        author: 'Author',
        owner: { type: 'AUTHOR', id: 'author-1' },
        type: 'PUBLICATION',
        genreIds: ['genre-1'],
      }),
    ).rejects.toThrow(ApiError);
  });
});
