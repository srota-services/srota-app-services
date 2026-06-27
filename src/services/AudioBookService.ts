/**
 * AudioBook Service Layer
 * Handles business logic and database operations following OOP principles
 */
import { PrismaClient, Prisma, UserAudioBookType, SubscriptionGatingMode } from '@prisma/client';
import { SubscriptionClient, subscriptionClient } from '../clients/SubscriptionClient';
import {
  AudioBookDto,
  CreateAudioBookDto,
  UpdateAudioBookDto,
  AudioBookQueryParams,
  toAudioBookDto,
  toPrismaOwnerType,
} from '../models/AudioBookDto';
import { SubscriptionAccessDto } from '../models/SubscriptionAccessDto';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import {
  resolveAudiobookGatingCreate,
  resolveAudiobookGatingUpdate,
  syncChapterTiersForAudiobook,
  AudiobookGatingInput,
} from '../utils/subscriptionGatingValidation';
import { BackgroundJobService } from './BackgroundJobService';
import { fileUrlService } from './FileUrlService';
import { UserAudioBookService } from './UserAudioBookService';
import { ChapterService } from './ChapterService';
import { HttpStatusCode, ErrorType } from '../types/common';
import { AudiobookMediaCleanupService } from './AudiobookMediaCleanupService';
import { AudioBookOwnerService } from './AudioBookOwnerService';
import { ImageAssetService } from './ImageAssetService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { emitSubscriptionGatingInvalidation } from './subscriptionGatingInvalidation';
import { SubscriptionAccessService } from './SubscriptionAccessService';

export class AudioBookService {
  private prisma: PrismaClient;
  private backgroundJobService: BackgroundJobService | undefined;
  private subscriptionAccessService: SubscriptionAccessService;
  private audioBookOwnerService: AudioBookOwnerService;
  private imageAssetService: ImageAssetService;

  constructor(
    prisma: PrismaClient,
    backgroundJobService?: BackgroundJobService,
    subscriptionClientInstance: SubscriptionClient = subscriptionClient,
    subscriptionAccessServiceInstance?: SubscriptionAccessService,
  ) {
    this.prisma = prisma;
    this.backgroundJobService = backgroundJobService;
    this.subscriptionAccessService =
      subscriptionAccessServiceInstance ?? new SubscriptionAccessService(subscriptionClientInstance);
    this.audioBookOwnerService = new AudioBookOwnerService(prisma);
    this.imageAssetService = new ImageAssetService(prisma);
  }

  private async hydrateOwner(
    dto: AudioBookDto,
    accessToken?: string,
  ): Promise<AudioBookDto> {
    return this.audioBookOwnerService.attachOwnerDetail(dto, accessToken);
  }

  private async hydrateOwners(
    dtos: AudioBookDto[],
    accessToken?: string,
  ): Promise<AudioBookDto[]> {
    return this.audioBookOwnerService.attachOwnerDetails(dtos, accessToken);
  }

  /**
   * Get all audiobooks with pagination and filtering
   */
  async getAllAudioBooks(params: AudioBookQueryParams, accessToken?: string): Promise<{
    audiobooks: AudioBookDto[];
    totalCount: number;
  }> {
    try {
      const where = this.buildWhereClause(params);

      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = params;

      // Build orderBy clause
      const orderBy: Prisma.AudioBookOrderByWithRelationInput = {
        [sortBy]: sortOrder
      };

      const skip = (page - 1) * limit;

      const [audiobooks, totalCount] = await Promise.all([
        this.prisma.audioBook.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            _count: {
              select: {
                chapters: true,
              },
            },
            audiobookTags: {
              include: {
                tag: true
              }
            },
            audioBookGenres: {
              include: {
                genre: true,
              }
            }
          }
        }),
        this.prisma.audioBook.count({ where })
      ]);

      const resolved = await Promise.all(
        audiobooks.map(async (audiobook) => ({
          ...(await fileUrlService.resolveAudioBookMedia(toAudioBookDto(audiobook))),
          chapterCount: audiobook._count.chapters,
        }))
      );

      return {
        audiobooks: await this.hydrateOwners(resolved, accessToken),
        totalCount
      };
    } catch (_error) {
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.fetch_audiobooks'));
    }
  }

  /**
   * Get all audiobooks assigned to a mood (used by GET /moods/:id).
   */
  async getAudioBooksByMoodId(
    moodId: string,
    accessToken?: string,
    guestCatalogOnly = false,
  ): Promise<AudioBookDto[]> {
    try {
      const audiobooks = await this.prisma.audioBook.findMany({
        where: {
          moodId,
          ...(guestCatalogOnly ? { isPublic: true, isActive: true } : {}),
        },
        orderBy: { title: 'asc' },
        include: {
          _count: {
            select: {
              chapters: true,
            },
          },
          audiobookTags: {
            include: {
              tag: true,
            },
          },
          audioBookGenres: {
            include: {
              genre: true,
            },
          },
        },
      });

      const resolved = await Promise.all(
        audiobooks.map(async (audiobook) => ({
          ...(await fileUrlService.resolveAudioBookMedia(toAudioBookDto(audiobook))),
          chapterCount: audiobook._count.chapters,
        })),
      );

      return this.hydrateOwners(resolved, accessToken);
    } catch (_error) {
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.fetch_audiobooks'));
    }
  }

  /**
   * Build the Prisma where clause for audiobook list queries. Centralised
   * so list/list-with-counts/tags/etc. all stay in sync.
   *
   * `ownerIds` optionally restricts results to those owner IDs (same ownerType);
   * `ownerId` (singular) filters to a single owner and takes precedence when both
   * are provided with ownerType. Listing is not gated on caller membership.
   */
  private buildWhereClause(params: AudioBookQueryParams): Prisma.AudioBookWhereInput {
    const {
      genreIds,
      moodIds,
      ownerType,
      ownerId,
      ownerIds,
      language,
      author,
      narrator,
      isActive,
      isPublic,
      search,
      active,
      scheduled,
    } = params;

    const ownerFilter: Prisma.AudioBookWhereInput = ownerType && ownerId
      ? { ownerType: toPrismaOwnerType(ownerType), ownerId }
      : ownerType && ownerIds && ownerIds.length > 0
        ? { ownerType: toPrismaOwnerType(ownerType), ownerId: { in: ownerIds } }
        : ownerId
          ? { ownerId }
          : ownerIds && ownerIds.length > 0
            ? { ownerId: { in: ownerIds } }
            : {};

    const where: Prisma.AudioBookWhereInput = {
      ...ownerFilter,
      ...(isActive !== undefined && { isActive }),
      ...(isPublic !== undefined && { isPublic }),
      ...(genreIds && genreIds.length > 0 && {
        audioBookGenres: {
          some: { genreId: { in: genreIds } },
        },
      }),
      ...(moodIds && moodIds.length > 0 && {
        moodId: { in: moodIds },
      }),
      ...(language && { language: { contains: language, mode: 'insensitive' } }),
      ...(author && { author: { contains: author, mode: 'insensitive' } }),
      ...(narrator && { narrator: { contains: narrator, mode: 'insensitive' } }),
      ...(active === true && { isActive: true }),
      ...(scheduled === true && { isActive: false }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { author: { contains: search, mode: 'insensitive' } },
          { narrator: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    return where;
  }

  /**
   * Get audiobook by ID
   */
  async getAudioBookById(id: string, accessToken?: string): Promise<AudioBookDto> {
    try {
      const audiobook = await this.prisma.audioBook.findUnique({
        where: { id },
        include: {
          audiobookTags: {
            include: {
              tag: true
            }
          },
          audioBookGenres: {
            include: {
              genre: true,
            }
          }
        }
      });

      if (!audiobook) {
        throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
      }

      const dto = await fileUrlService.resolveAudioBookMedia(toAudioBookDto(audiobook));
      return this.hydrateOwner(dto, accessToken);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.fetch_audiobook'));
    }
  }

  /**
   * Get audiobook by ID with chapters
   */
  async getAudioBookByIdWithChapters(id: string, accessToken?: string): Promise<AudioBookDto & { chapters: any[] }> {
    try {
      const audiobook = await this.prisma.audioBook.findUnique({
        where: { id },
        include: {
          chapters: {
            orderBy: { chapterNumber: 'asc' }
          },
          audiobookTags: {
            include: {
              tag: true
            }
          },
          audioBookGenres: {
            include: {
              genre: true,
            }
          }
        }
      });

      if (!audiobook) {
        throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
      }

      const dto = await this.hydrateOwner(
        await fileUrlService.resolveAudioBookMedia(toAudioBookDto(audiobook)),
        accessToken,
      );
      const { chapters: rawChapters } = audiobook;
      const chapters = await fileUrlService.resolveChapterMediaList(
        rawChapters.map(ch => ({
          id: ch.id,
          audiobookId: ch.audiobookId,
          title: ch.title,
          ...(ch.description ? { description: ch.description } : {}),
          chapterNumber: ch.chapterNumber,
          duration: ch.duration,
          filePath: ch.filePath,
          fileSize: Number(ch.fileSize),
          coverImage: ch.coverImage,
          startPosition: ch.startPosition,
          endPosition: ch.endPosition,
          isActive: ch.isActive,
          sourceUploadStatus: ch.sourceUploadStatus ?? 'ready',
          ...(ch.sourceUploadError ? { sourceUploadError: ch.sourceUploadError } : {}),
          scheduledAt: ch.scheduledAt ?? null,
          createdAt: ch.createdAt,
          updatedAt: ch.updatedAt,
        }))
      );
      return {
        ...dto,
        chapters,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.fetch_audiobook'));
    }
  }

  /**
   * Create a new audiobook
   */
  async createAudioBook(
    data: CreateAudioBookDto & { tagIds?: string[]; genreIds?: string[] },
    ownerUserProfileId?: string,
    accessToken?: string,
    coverImageSourcePath?: string,
  ): Promise<AudioBookDto> {
    try {
      // Extract tagIds and genreIds from data before validation
      const { tagIds, genreIds, ...audiobookData } = data;

      // Validate required fields
      this.validateCreateData(audiobookData, genreIds, tagIds);

      if (coverImageSourcePath) {
        await this.imageAssetService.validateUploadSource('audiobook', coverImageSourcePath);
      }

      const moodIdForCreate =
        audiobookData.moodId !== undefined
          ? (audiobookData.moodId === '' ? null : audiobookData.moodId)
          : undefined;

      await this.validateReferencedIds(genreIds!, tagIds, moodIdForCreate);

      // Construct data object, only including defined values for optional fields
      const createData: Prisma.AudioBookUncheckedCreateInput = {
        title: audiobookData.title,
        author: audiobookData.author,
        ownerType: toPrismaOwnerType(audiobookData.owner.type),
        ownerId: audiobookData.owner.id,
        language: audiobookData.language || 'bn',
        isPublic: this.parseBooleanFlag(audiobookData.isPublic, true),
      };

      // Handle scheduledAt: if provided, set isActive=false and schedule activation job
      if (audiobookData.scheduledAt !== undefined) {
        createData.scheduledAt = audiobookData.scheduledAt;
        createData.isActive = false;
      } else {
        createData.isActive = audiobookData.isActive ?? true;
      }

      // Add optional fields only if they are defined
      const narrator = this.resolveNarratorField(audiobookData);
      if (narrator !== undefined) createData.narrator = narrator;
      if (audiobookData.description !== undefined) createData.description = audiobookData.description;
      if (audiobookData.duration !== undefined) createData.duration = audiobookData.duration;
      if (audiobookData.fileSize !== undefined) createData.fileSize = BigInt(audiobookData.fileSize);
      if (audiobookData.coverImage !== undefined && !coverImageSourcePath) {
        createData.coverImage = audiobookData.coverImage;
      }
      if (audiobookData.publisher !== undefined) createData.publisher = audiobookData.publisher;
      if (audiobookData.publishDate !== undefined) createData.publishDate = audiobookData.publishDate;
      if (audiobookData.isbn !== undefined) createData.isbn = audiobookData.isbn;

      const gatingInput: AudiobookGatingInput = {};
      if (audiobookData.subscriptionGatingMode !== undefined) {
        gatingInput.subscriptionGatingMode = audiobookData.subscriptionGatingMode;
      }
      if (audiobookData.minSubscriptionTier !== undefined) {
        gatingInput.minSubscriptionTier = audiobookData.minSubscriptionTier;
      }
      const gating = resolveAudiobookGatingCreate(gatingInput);
      createData.subscriptionGatingMode = gating.subscriptionGatingMode;
      createData.minSubscriptionTier = gating.minSubscriptionTier;

      if (audiobookData.moodId !== undefined) {
        createData.moodId = moodIdForCreate ?? null;
      }

      let audiobook = await this.prisma.$transaction(async (tx) => {
        const created = await tx.audioBook.create({
          data: createData,
        });

        const uniqueGenreIds = [...new Set(genreIds!.map((genreId) => genreId.trim()))];
        await tx.audioBookGenre.createMany({
          data: uniqueGenreIds.map((genreId) => ({
            audiobookId: created.id,
            genreId,
          })),
        });

        if (tagIds && tagIds.length > 0) {
          const uniqueTagIds = [...new Set(tagIds.map((tagId) => tagId.trim()))];
          await tx.audioBookTag.createMany({
            data: uniqueTagIds.map((tagId) => ({
              audiobookId: created.id,
              tagId,
            })),
          });
        }

        return created;
      });

      if (coverImageSourcePath) {
        try {
          const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
            'audiobook',
            audiobook.id,
            coverImageSourcePath,
          );
          audiobook = await this.prisma.audioBook.update({
            where: { id: audiobook.id },
            data: { coverImage: primaryStorageKey },
          });
        } catch (variantError: unknown) {
          await this.rollbackAudiobookCreate(audiobook.id);
          if (variantError instanceof ApiError) {
            throw variantError;
          }
          const message = variantError instanceof Error ? variantError.message : 'Invalid audiobook cover image';
          throw ApiError.validationError(message);
        }
      }

      // Fetch the audiobook with all relations included
      const audiobookWithRelations = await this.prisma.audioBook.findUnique({
        where: { id: audiobook.id },
        include: {
          audiobookTags: {
            include: {
              tag: true
            }
          },
          audioBookGenres: {
            include: {
              genre: true,
            }
          }
        }
      });

      if (!audiobookWithRelations) {
        throw ApiError.internalError(MessageHandler.getErrorMessage('internal.create_audiobook'));
      }

      // Schedule activation job if scheduledAt was provided
      if (audiobookData.scheduledAt !== undefined && this.backgroundJobService) {
        try {
          await this.backgroundJobService.scheduleActivationJob('audiobook', audiobook.id, audiobookData.scheduledAt);
        } catch (_error) {
          // Log error but don't fail audiobook creation
          console.error(`Error scheduling activation job for audiobook ${audiobook.id}:`, _error);
        }
      }

      // Creator owns the audiobook when they have a user profile (skipped for admins without a profile)
      if (ownerUserProfileId) {
        const userAudioBookService = new UserAudioBookService(this.prisma);
        await userAudioBookService.createOwnedUserAudioBook(ownerUserProfileId, audiobook.id);
      }

      emitCacheInvalidation('audiobook', 'created', audiobook.id);
      if (gating.subscriptionGatingMode !== SubscriptionGatingMode.NONE) {
         emitSubscriptionGatingInvalidation({ action: 'created', audiobookId: audiobook.id });
      }
      return this.hydrateOwner(
        await fileUrlService.resolveAudioBookMedia(toAudioBookDto(audiobookWithRelations)),
        accessToken,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw ApiError.conflict(MessageHandler.getErrorMessage('conflict.audiobook_exists'));
        }
      }
      if (error instanceof ApiError) {
        throw error;
      }
      console.log('error', error);
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.create_audiobook'));
    }
  }

  /**
   * Update an existing audiobook
   */
  async updateAudioBook(
    id: string,
    data: UpdateAudioBookDto & { narrators?: unknown },
    tagIds?: string[],
    genreIds?: string[],
    accessToken?: string,
    coverImageSourcePath?: string,
  ): Promise<AudioBookDto> {
    try {
      // Check if audiobook exists
      const existingAudioBook = await this.prisma.audioBook.findUnique({
        where: { id }
      });

      if (!existingAudioBook) {
        throw ApiError.notFound('AudioBook');
      }

      // Validate: Cannot schedule an active audiobook
      if (data.scheduledAt !== undefined && existingAudioBook.isActive) {
        throw ApiError.validationError('Active audiobook cannot be scheduled');
      }

      const updateData = this.buildAudiobookUpdateInput(
        data,
        coverImageSourcePath ? { coverImageSourcePath } : undefined,
      );

      const gatingInputProvided =
        data.subscriptionGatingMode !== undefined || data.minSubscriptionTier !== undefined;

      if (coverImageSourcePath) {
        await this.imageAssetService.validateUploadSource('audiobook', coverImageSourcePath);
      }

      if (gatingInputProvided) {
        const gatingInput: AudiobookGatingInput = {};
        if (data.subscriptionGatingMode !== undefined) {
          gatingInput.subscriptionGatingMode = data.subscriptionGatingMode;
        }
        if (data.minSubscriptionTier !== undefined) {
          gatingInput.minSubscriptionTier = data.minSubscriptionTier;
        }
        const gating = await resolveAudiobookGatingUpdate(
          this.prisma,
          id,
          {
            subscriptionGatingMode: existingAudioBook.subscriptionGatingMode,
            minSubscriptionTier: existingAudioBook.minSubscriptionTier,
          },
          gatingInput,
        );
        updateData.subscriptionGatingMode = gating.subscriptionGatingMode;
        updateData.minSubscriptionTier = gating.minSubscriptionTier;

        await this.prisma.$transaction(async (tx) => {
          await tx.audioBook.update({ where: { id }, data: updateData });
          await syncChapterTiersForAudiobook(tx, id, gating);
        });
      } else {
        await this.prisma.audioBook.update({
          where: { id },
          data: updateData,
        });
      }

      if (coverImageSourcePath) {
        const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
          'audiobook',
          id,
          coverImageSourcePath,
        );
        await this.prisma.audioBook.update({
          where: { id },
          data: { coverImage: primaryStorageKey },
        });
      }

      // Update AudioBookGenre records if genreIds are provided
      if (genreIds !== undefined) {
        // Delete existing genres
        await this.prisma.audioBookGenre.deleteMany({
          where: { audiobookId: id }
        });

        // Create new genres if genreIds array is not empty
        if (genreIds.length > 0) {
          await Promise.all(
            genreIds.map(genreId =>
              this.prisma.audioBookGenre.create({
                data: {
                  audiobookId: id,
                  genreId: genreId
                }
              })
            )
          );
        }
      }

      // Update AudioBookTag records if tagIds are provided
      if (tagIds !== undefined) {
        // Delete existing tags
        await this.prisma.audioBookTag.deleteMany({
          where: { audiobookId: id }
        });

        // Create new tags if tagIds array is not empty
        if (tagIds.length > 0) {
          await Promise.all(
            tagIds.map(tagId =>
              this.prisma.audioBookTag.create({
                data: {
                  audiobookId: id,
                  tagId: tagId
                }
              })
            )
          );
        }
      }

      // Schedule activation job if scheduledAt was provided
      if (data.scheduledAt !== undefined && this.backgroundJobService) {
        try {
          await this.backgroundJobService.scheduleActivationJob('audiobook', id, data.scheduledAt);
        } catch (_error) {
          // Log error but don't fail audiobook update
          console.error(`Error scheduling activation job for audiobook ${id}:`, _error);
        }
      }

      // Fetch the audiobook with all relations included
      const audiobookWithRelations = await this.prisma.audioBook.findUnique({
        where: { id },
        include: {
          audiobookTags: {
            include: {
              tag: true
            }
          },
          audioBookGenres: {
            include: {
              genre: true,
            }
          }
        }
      });

      if (!audiobookWithRelations) {
        throw ApiError.internalError(MessageHandler.getErrorMessage('internal.update_audiobook'));
      }

      emitCacheInvalidation('audiobook', 'updated', id);
      if (gatingInputProvided) {
         emitSubscriptionGatingInvalidation({ action: 'updated', audiobookId: id });
      }
      return this.hydrateOwner(
        await fileUrlService.resolveAudioBookMedia(toAudioBookDto(audiobookWithRelations)),
        accessToken,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw ApiError.conflict(MessageHandler.getErrorMessage('conflict.audiobook_exists'));
        }
      }
      console.log('error', error);
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.update_audiobook'));
    }
  }

  /**
   * Delete an audiobook
   */
  async deleteAudioBook(id: string): Promise<void> {
    try {
      const cleanupService = new AudiobookMediaCleanupService(this.prisma);
      await cleanupService.deleteAudiobookWithChapters(id);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.delete_audiobook'));
    }
  }

  /**
   * Recalculate and store user-audiobook progress (total seconds listened across chapters).
   */
  async updateAudiobookProgress(id: string, userProfileId: string): Promise<AudioBookDto> {
    try {
      // Verify audiobook exists
      const audiobook = await this.prisma.audioBook.findUnique({
        where: { id }
      });

      if (!audiobook) {
        throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
      }

      const chapterService = new ChapterService(this.prisma);
      const progressSeconds = await chapterService.calculateAudiobookProgress(userProfileId, id);

      const existingUserAudioBook = await this.prisma.userAudioBook.findUnique({
        where: {
          userProfileId_audiobookId: { userProfileId, audiobookId: id },
        },
        select: { progress: true },
      });
      const storedProgress = existingUserAudioBook
        ? Math.max(existingUserAudioBook.progress, progressSeconds)
        : progressSeconds;

      // Update user-audiobook progress (never decrease)
      await this.prisma.userAudioBook.upsert({
        where: {
          userProfileId_audiobookId: {
            userProfileId,
            audiobookId: id
          }
        },
        update: {
          progress: storedProgress
        },
        create: {
          userProfileId,
          audiobookId: id,
          type: UserAudioBookType.PURCHASED,
          progress: storedProgress
        }
      });

      return fileUrlService.resolveAudioBookMedia(toAudioBookDto(audiobook));
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
        }
      }
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.update_audiobook'));
    }
  }

  /**
   * Update audiobook offline availability
   */
  async updateOfflineAvailability(id: string, isAvailable: boolean): Promise<AudioBookDto> {
    try {
      const audiobook = await this.prisma.audioBook.update({
        where: { id },
        data: { isOfflineAvailable: isAvailable }
      });

      return fileUrlService.resolveAudioBookMedia(toAudioBookDto(audiobook));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
        }
      }
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.update_audiobook'));
    }
  }

  /**
   * Get audiobooks by tags
   */
  async getAudioBooksByTags(tags: string[], params: AudioBookQueryParams, accessToken?: string): Promise<{
    audiobooks: AudioBookDto[];
    totalCount: number;
  }> {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = params;

      const where: Prisma.AudioBookWhereInput = {
        ...this.buildWhereClause(params),
        audiobookTags: {
          some: {
            tag: {
              name: { in: tags }
            }
          }
        }
      };

      // Build orderBy clause
      const orderBy: Prisma.AudioBookOrderByWithRelationInput = {
        [sortBy]: sortOrder
      };

      const skip = (page - 1) * limit;

      const [audiobooks, totalCount] = await Promise.all([
        this.prisma.audioBook.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            audiobookTags: {
              include: {
                tag: true
              }
            },
            audioBookGenres: {
              include: {
                genre: true,
              }
            }
          }
        }),
        this.prisma.audioBook.count({ where })
      ]);

      const resolved = await fileUrlService.resolveAudioBookMediaList(
        audiobooks.map(toAudioBookDto)
      );

      return {
        audiobooks: await this.hydrateOwners(resolved, accessToken),
        totalCount
      };
    } catch (_error) {
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.fetch_audiobooks'));
    }
  }

  /**
   * Get audiobook statistics
   */
  async getAudioBookStats(): Promise<{
    totalAudioBooks: number;
    activeAudioBooks: number;
    publicAudioBooks: number;
    totalDuration: number;
    averageDuration: number;
  }> {
    try {
      const [
        totalAudioBooks,
        activeAudioBooks,
        publicAudioBooks,
        durationStats
      ] = await Promise.all([
        this.prisma.audioBook.count(),
        this.prisma.audioBook.count({ where: { isActive: true } }),
        this.prisma.audioBook.count({ where: { isPublic: true } }),
        this.prisma.audioBook.aggregate({
          _sum: { duration: true },
          _avg: { duration: true }
        })
      ]);

      return {
        totalAudioBooks,
        activeAudioBooks,
        publicAudioBooks,
        totalDuration: durationStats._sum.duration ?? 0,
        averageDuration: Math.round(durationStats._avg.duration ?? 0)
      };
    } catch (_error) {
      throw ApiError.internalError(MessageHandler.getErrorMessage('internal.fetch_stats'));
    }
  }

  /**
   * Validate create audiobook data
   */
  private validateCreateData(
    data: Omit<CreateAudioBookDto, 'genreIds'>,
    genreIds?: string[],
    tagIds?: string[],
  ): void {
    if (!data.title || data.title.trim().length === 0) {
      throw ApiError.validationError(MessageHandler.getErrorMessage('validation.title_required'));
    }

    if (!data.author || data.author.trim().length === 0) {
      throw ApiError.validationError(MessageHandler.getErrorMessage('validation.author_required'));
    }

    if (!data.owner?.type || !data.owner?.id?.trim()) {
      throw ApiError.validationError('owner is required with type and id');
    }

    if (data.owner.type !== 'AUTHOR' && data.owner.type !== 'ORGANIZATION') {
      throw ApiError.validationError('owner.type must be AUTHOR or ORGANIZATION');
    }

    // At least one genre is mandatory
    if (!genreIds || !Array.isArray(genreIds) || genreIds.length === 0) {
      throw ApiError.validationError(MessageHandler.getErrorMessage('validation.genre_required') || 'At least one genre is required');
    }

    // Validate that all genreIds are non-empty strings
    const invalidGenreIds = genreIds.filter(id => !id || typeof id !== 'string' || id.trim().length === 0);
    if (invalidGenreIds.length > 0) {
      throw ApiError.validationError(MessageHandler.getErrorMessage('validation.genre_required') || 'All genre IDs must be valid');
    }

    // Validate ISBN format if provided
    if (data.isbn && !this.isValidISBN(data.isbn)) {
      throw ApiError.validationError(MessageHandler.getErrorMessage('validation.isbn_format'));
    }

    if (tagIds !== undefined && tagIds.length > 0) {
      const invalidTagIds = tagIds.filter((id) => !id || typeof id !== 'string' || id.trim().length === 0);
      if (invalidTagIds.length > 0) {
        throw ApiError.validationError('All tag IDs must be valid');
      }
    }
  }

  private async validateReferencedIds(
    genreIds: string[],
    tagIds?: string[],
    moodId?: string | null,
  ): Promise<void> {
    const uniqueGenreIds = [...new Set(genreIds.map((id) => id.trim()))];
    const genres = await this.prisma.genre.findMany({
      where: { id: { in: uniqueGenreIds } },
      select: { id: true },
    });

    if (genres.length !== uniqueGenreIds.length) {
      throw ApiError.validationError('One or more genre IDs are invalid');
    }

    if (tagIds && tagIds.length > 0) {
      const uniqueTagIds = [...new Set(tagIds.map((id) => id.trim()))];
      const tags = await this.prisma.tag.findMany({
        where: { id: { in: uniqueTagIds } },
        select: { id: true },
      });

      if (tags.length !== uniqueTagIds.length) {
        throw ApiError.validationError('One or more tag IDs are invalid');
      }
    }

    if (moodId) {
      const mood = await this.prisma.mood.findUnique({
        where: { id: moodId },
        select: { id: true },
      });

      if (!mood) {
        throw ApiError.validationError('Invalid mood ID');
      }
    }
  }

  private async rollbackAudiobookCreate(audiobookId: string): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.audioBookGenre.deleteMany({ where: { audiobookId } }),
        this.prisma.audioBookTag.deleteMany({ where: { audiobookId } }),
        this.prisma.audioBook.delete({ where: { id: audiobookId } }),
      ]);
    } catch {
      // Best-effort cleanup after a post-create failure (e.g. image processing).
    }
  }

  /**
   * Validate ISBN format
   */
  private isValidISBN(isbn: string): boolean {
    // Remove hyphens and spaces
    const cleanISBN = isbn.replace(/[-\s]/g, '');

    // Check if it's 10 or 13 digits
    if (cleanISBN.length === 10) {
      return /^\d{9}[\dX]$/.test(cleanISBN);
    } else if (cleanISBN.length === 13) {
      return /^\d{13}$/.test(cleanISBN);
    }

    return false;
  }

  private parseBooleanFlag(value: boolean | string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    return value === 'true' || value === true;
  }

  /**
   * Accept `narrator` (string) or `narrators` (array / JSON string from form-data).
   */
  private resolveNarratorField(data: {
    narrator?: string | null;
    narrators?: unknown;
  }): string | null | undefined {
    if (data.narrator !== undefined) {
      return data.narrator === '' ? null : data.narrator;
    }
    if (data.narrators === undefined || data.narrators === null || data.narrators === '') {
      return undefined;
    }
    const values = this.parseStringArrayField(data.narrators);
    return values.length > 0 ? values.join(', ') : null;
  }

  /** Parse form-data arrays sent as JSON strings, comma-separated strings, or arrays. */
  private parseStringArrayField(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String).map((item) => item.trim()).filter((item) => item.length > 0);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(String).map((item) => item.trim()).filter((item) => item.length > 0);
        }
      } catch {
        // fall through to comma-separated parsing
      }
      return trimmed.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
    }
    return [];
  }

  private buildAudiobookUpdateInput(
    data: UpdateAudioBookDto & { narrators?: unknown },
    options?: { coverImageSourcePath?: string },
  ): Prisma.AudioBookUncheckedUpdateInput {
    const updateData: Prisma.AudioBookUncheckedUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.author !== undefined) updateData.author = data.author;

    const narrator = this.resolveNarratorField(data);
    if (narrator !== undefined) updateData.narrator = narrator;

    if (data.description !== undefined) updateData.description = data.description;
    if (data.duration !== undefined) updateData.duration = Number(data.duration);
    if (data.fileSize !== undefined) updateData.fileSize = BigInt(data.fileSize);
    if (data.coverImage !== undefined && !options?.coverImageSourcePath) {
      updateData.coverImage = data.coverImage;
    }
    if (data.language !== undefined) updateData.language = data.language;
    if (data.publisher !== undefined) updateData.publisher = data.publisher;
    if (data.publishDate !== undefined) {
      updateData.publishDate = data.publishDate instanceof Date
        ? data.publishDate
        : new Date(data.publishDate);
    }
    if (data.isbn !== undefined) updateData.isbn = data.isbn;
    if (data.isActive !== undefined && data.scheduledAt === undefined) {
      updateData.isActive = this.parseBooleanFlag(data.isActive, true);
    }
    if (data.isPublic !== undefined) {
      updateData.isPublic = this.parseBooleanFlag(data.isPublic, true);
    }
    if (data.moodId !== undefined) {
      updateData.moodId = data.moodId === '' ? null : data.moodId;
    }
    if (data.scheduledAt !== undefined) {
      updateData.scheduledAt = data.scheduledAt;
      updateData.isActive = false;
    }
    if (data.owner !== undefined) {
      updateData.ownerType = toPrismaOwnerType(data.owner.type);
      updateData.ownerId = data.owner.id;
    }

    return updateData;
  }

  /**
   * Evaluate subscription-tier access for an audiobook without failing the request.
   */
  async getSubscriptionAccessForAudiobook(
    _audiobookId: string,
    audiobook: {
      subscriptionGatingMode: SubscriptionGatingMode;
      minSubscriptionTier: number | null;
    },
    userId: string | null,
    accessToken: string | null
  ): Promise<SubscriptionAccessDto> {
    if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.CHAPTER) {
      return this.subscriptionAccessService.openAccess();
    }

    const requiredTier = this.subscriptionAccessService.resolveAudiobookRequiredTier(audiobook);
    return this.subscriptionAccessService.evaluateAccess(requiredTier, userId, accessToken);
  }

  /**
   * @deprecated Use {@link getSubscriptionAccessForAudiobook} for API responses.
   */
  async assertUserCanAccessBySubscription(
    audiobookId: string,
    userId: string | null,
    accessToken: string | null
  ): Promise<void> {
    const audiobook = await this.prisma.audioBook.findUnique({
      where: { id: audiobookId },
      select: { id: true, subscriptionGatingMode: true, minSubscriptionTier: true },
    });
    if (!audiobook) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
    }

    const access = await this.getSubscriptionAccessForAudiobook(
      audiobookId,
      audiobook,
      userId,
      accessToken,
    );
    if (!access.canAccess) {
      throw new ApiError(
        access.message ?? MessageHandler.getErrorMessage('forbidden.subscription_required'),
        HttpStatusCode.FORBIDDEN,
        ErrorType.FORBIDDEN
      );
    }
  }

  async getUserReviewRatingForAudiobook(
    audiobookId: string,
    externalUserId: string | null
  ): Promise<number | null> {
    if (!externalUserId) {
      return null;
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: externalUserId },
      select: { id: true },
    });
    if (!profile) {
      return null;
    }

    const review = await this.prisma.review.findUnique({
      where: {
        userProfileId_audiobookId: {
          userProfileId: profile.id,
          audiobookId,
        },
      },
      select: { rating: true },
    });

    return review?.rating ?? null;
  }
}
