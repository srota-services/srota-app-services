/**
 * AudioBook Controller
 * Handles HTTP requests and responses following MVC pattern
 */
import { SubscriptionGatingMode, PrismaClient, AudiobookType } from '@prisma/client';
import { Request, Response } from 'express';
import { AudioBookService } from '../services/AudioBookService';
import { BackgroundJobService } from '../services/BackgroundJobService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { AudioBookQueryParams, CreateAudioBookDto } from '../models/AudioBookDto';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { ContentAuthorizationService } from '../services/ContentAuthorizationService';
import { AuthenticatedRequest } from '../types/auth';
import { parseAudioBookOwnerFromBody } from '../utils/parseAudioBookOwner';
import { parseAudiobookType } from '../utils/audiobookTypeValidation';
import { applyGuestCatalogDefaults, isGuestRequest } from '../utils/guestCatalogDefaults';

function getBearerToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

export class AudioBookController {
  private audioBookService: AudioBookService;
  private contentAuthorizationService: ContentAuthorizationService;

  constructor(prisma: PrismaClient, backgroundJobService?: BackgroundJobService) {
    this.audioBookService = new AudioBookService(prisma, backgroundJobService);
    this.contentAuthorizationService = new ContentAuthorizationService(prisma);
  }
  getAllAudioBooks = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Parse genreIds from query (can be string or array)
    let genreIds: string[] | undefined = undefined;
    if (req.query['genreIds']) {
      if (Array.isArray(req.query['genreIds'])) {
        genreIds = req.query['genreIds'] as string[];
      } else if (typeof req.query['genreIds'] === 'string') {
        genreIds = req.query['genreIds'].split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
      }
    } else if (req.query['genreId']) {
      // Support legacy genreId parameter for backward compatibility
      genreIds = [req.query['genreId'] as string];
    }

    let moodIds: string[] | undefined = undefined;
    if (req.query['moodIds']) {
      if (Array.isArray(req.query['moodIds'])) {
        moodIds = req.query['moodIds'] as string[];
      } else if (typeof req.query['moodIds'] === 'string') {
        moodIds = req.query['moodIds'].split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
      }
    } else if (req.query['moodId']) {
      moodIds = [req.query['moodId'] as string];
    }

    let languageIds: string[] | undefined = undefined;
    if (req.query['languageIds']) {
      if (Array.isArray(req.query['languageIds'])) {
        languageIds = req.query['languageIds'] as string[];
      } else if (typeof req.query['languageIds'] === 'string') {
        languageIds = req.query['languageIds'].split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
      }
    } else if (req.query['languageId']) {
      languageIds = [req.query['languageId'] as string];
    }

    const queryParams = applyGuestCatalogDefaults(req, {
      page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
      limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10,
      sortBy: req.query['sortBy'] as string || 'createdAt',
      sortOrder: (req.query['sortOrder'] as 'asc' | 'desc') || 'desc',
      genreIds: genreIds,
      moodIds: moodIds,
      languageIds: languageIds,
      ownerType: req.query['ownerType'] as AudioBookQueryParams['ownerType'],
      ownerId: req.query['ownerId'] as string,
      author: req.query['author'] as string,
      narrator: req.query['narrator'] as string,
      isActive: req.query['isActive'] !== undefined ? req.query['isActive'] === 'true' : undefined,
      isPublic: req.query['isPublic'] !== undefined ? req.query['isPublic'] === 'true' : undefined,
      search: req.query['search'] as string,
      active: req.query['active'] !== undefined ? req.query['active'] === 'true' : undefined,
      scheduled: req.query['scheduled'] !== undefined ? req.query['scheduled'] === 'true' : undefined,
      type: req.query['type'] as AudioBookQueryParams['type'],
    });

    const { audiobooks, totalCount } = await this.audioBookService.getAllAudioBooks(
      queryParams,
      getBearerToken(req),
    );

    const pagination = ResponseHandler.calculatePagination(
      queryParams.page!,
      queryParams.limit!,
      totalCount
    );

    ResponseHandler.paginated(res, audiobooks, pagination, MessageHandler.getSuccessMessage('audiobooks.retrieved'));
  });
  getAudioBookById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const authReq = req as AuthenticatedRequest;
    const externalUserId = authReq.user?.id ?? null;
    const accessToken = getBearerToken(req) ?? null;

    const audiobook = await this.audioBookService.getAudioBookById(
      id as string,
      accessToken ?? undefined,
    );

    if (isGuestRequest(req) && !audiobook.isActive) {
      ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.audiobook'));
      return;
    }

    const subscriptionAccess =
      audiobook.type === 'PUBLICATION'
        ? await this.audioBookService.getSubscriptionAccessForAudiobook(
          audiobook.id,
          {
            subscriptionGatingMode: audiobook.subscriptionGatingMode as SubscriptionGatingMode,
            minSubscriptionTier: audiobook.minSubscriptionTier ?? null,
          },
          externalUserId,
          accessToken,
          authReq.user?.role ?? null,
        )
        : undefined;

    const rating = await this.audioBookService.getUserReviewRatingForAudiobook(
      audiobook.id,
      externalUserId
    );

    ResponseHandler.success(
      res,
      { ...audiobook, subscriptionAccess, rating },
      MessageHandler.getSuccessMessage('audiobooks.retrieved_by_id')
    );
  });
  createAudioBook = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Get cover image from upload middleware (audio file not required for audiobook creation)
    const uploadedCoverImage = (req as any).coverImageFile as Express.Multer.File | undefined;

    const audiobookType = parseAudiobookType(req.body.type);
    if (audiobookType !== AudiobookType.AUTHORING && !uploadedCoverImage) {
      ResponseHandler.validationError(
        res,
        MessageHandler.getErrorMessage('validation.publication_cover_required'),
      );
      return;
    }

    const owner = parseAudioBookOwnerFromBody(req.body as Record<string, unknown>);
    if (!owner) {
      ResponseHandler.validationError(res, 'owner is required with type and id');
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const externalUserId = authReq.user?.id;
    const accessToken = getBearerToken(req);
    const creatorUserId = externalUserId ?? undefined;

    const allowed = await this.contentAuthorizationService.canCreateAudiobook(
      externalUserId,
      owner,
      authReq.user?.role,
      accessToken,
    );
    if (!allowed) {
      ResponseHandler.forbidden(
        res,
        MessageHandler.getErrorMessage('organizations.admin_required')
      );
      return;
    }

    // Parse tagIds from form-data (can be string, array, or JSON string)
    let tagIds: string[] | undefined = undefined;
    if (req.body.tagIds) {
      if (Array.isArray(req.body.tagIds)) {
        tagIds = req.body.tagIds;
      } else if (typeof req.body.tagIds === 'string') {
        // Try to parse as JSON first (handles JSON string arrays like "[\"id1\",\"id2\"]")
        try {
          const parsed = JSON.parse(req.body.tagIds);
          if (Array.isArray(parsed)) {
            tagIds = parsed;
          } else {
            // If not JSON array, treat as comma-separated string
            tagIds = req.body.tagIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
          }
        } catch {
          // If JSON parse fails, treat as comma-separated string
          tagIds = req.body.tagIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
        }
      }
    }

    // Parse genreIds from form-data (can be string, array, or JSON string)
    let genreIds: string[] | undefined = undefined;
    if (req.body.genreIds) {
      if (Array.isArray(req.body.genreIds)) {
        genreIds = req.body.genreIds;
      } else if (typeof req.body.genreIds === 'string') {
        // Try to parse as JSON first (handles JSON string arrays like "[\"id1\",\"id2\"]")
        try {
          const parsed = JSON.parse(req.body.genreIds);
          if (Array.isArray(parsed)) {
            genreIds = parsed;
          } else {
            // If not JSON array, treat as comma-separated string
            genreIds = req.body.genreIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
          }
        } catch {
          // If JSON parse fails, treat as comma-separated string
          genreIds = req.body.genreIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
        }
      }
    }

    const coverImageSourcePath = uploadedCoverImage?.path;

    const audiobookData: Record<string, unknown> = {
      ...req.body,
      owner,
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : undefined,
      tagIds,
      genreIds,
    };

    const audiobook = await this.audioBookService.createAudioBook(
      audiobookData as unknown as CreateAudioBookDto & { tagIds?: string[]; genreIds?: string[] },
      creatorUserId,
      accessToken,
      coverImageSourcePath,
    );

    ResponseHandler.success(res, audiobook, MessageHandler.getSuccessMessage('audiobooks.created'), 201);
  });
  updateAudioBook = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const authReq = req as AuthenticatedRequest;
    const externalUserId = authReq.user?.id;
    const accessToken = getBearerToken(req);

    const { audiobookExists, allowed } = await this.contentAuthorizationService.canManageAudiobook(
      externalUserId,
      id as string,
      authReq.user?.role,
      accessToken,
    );

    if (!audiobookExists) {
      ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.audiobook'));
      return;
    }

    if (!allowed) {
      ResponseHandler.forbidden(
        res,
        MessageHandler.getErrorMessage('organizations.admin_required'),
      );
      return;
    }

    // Extract tagIds before creating updateData
    // Handle both array and string formats (form-data might send as string)
    let tagIds: string[] | undefined = undefined;
    if (req.body.tagIds) {
      if (Array.isArray(req.body.tagIds)) {
        tagIds = req.body.tagIds;
      } else if (typeof req.body.tagIds === 'string') {
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(req.body.tagIds);
          if (Array.isArray(parsed)) {
            tagIds = parsed;
          } else {
            // If not JSON array, treat as comma-separated string
            tagIds = req.body.tagIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
          }
        } catch {
          // If JSON parse fails, treat as comma-separated string
          tagIds = req.body.tagIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
        }
      } else {
        tagIds = [req.body.tagIds];
      }
    }

    // Extract genreIds before creating updateData
    // Handle both array and string formats (form-data might send as string)
    let genreIds: string[] | undefined = undefined;
    if (req.body.genreIds) {
      if (Array.isArray(req.body.genreIds)) {
        genreIds = req.body.genreIds;
      } else if (typeof req.body.genreIds === 'string') {
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(req.body.genreIds);
          if (Array.isArray(parsed)) {
            genreIds = parsed;
          } else {
            // If not JSON array, treat as comma-separated string
            genreIds = req.body.genreIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
          }
        } catch {
          // If JSON parse fails, treat as comma-separated string
          genreIds = req.body.genreIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
        }
      } else {
        genreIds = [req.body.genreIds];
      }
    }

    const updateData = {
      ...req.body,
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : undefined
    };

    if (req.body.owner !== undefined) {
      const ownerUpdate = parseAudioBookOwnerFromBody(req.body as Record<string, unknown>);
      if (!ownerUpdate) {
        ResponseHandler.validationError(res, 'owner must include type and id when provided');
        return;
      }
      updateData.owner = ownerUpdate;
    }

    // Remove tagIds and genreIds from updateData as they will be handled separately
    delete updateData.tagIds;
    delete updateData.genreIds;
    delete updateData.audiobookId;

    const uploadedCoverImage = (req as any).coverImageFile as Express.Multer.File | undefined;
    const coverImageSourcePath = uploadedCoverImage?.path;

    const audiobook = await this.audioBookService.updateAudioBook(
      id as string,
      updateData,
      tagIds,
      genreIds,
      accessToken,
      coverImageSourcePath,
    );

    ResponseHandler.success(res, audiobook, MessageHandler.getSuccessMessage('audiobooks.updated'));
  });
  deleteAudioBook = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const authReq = req as AuthenticatedRequest;
    const externalUserId = authReq.user?.id;
    const accessToken = getBearerToken(req);

    const { audiobookExists, allowed } = await this.contentAuthorizationService.canManageAudiobook(
      externalUserId,
      id as string,
      authReq.user?.role,
      accessToken,
    );

    if (!audiobookExists) {
      ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.audiobook'));
      return;
    }

    if (!allowed) {
      ResponseHandler.forbidden(
        res,
        MessageHandler.getErrorMessage('organizations.admin_required'),
      );
      return;
    }

    await this.audioBookService.deleteAudioBook(id as string);

    ResponseHandler.noContent(res);
  });
  getAudioBookStats = ErrorHandler.asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const stats = await this.audioBookService.getAudioBookStats();

    ResponseHandler.success(res, stats, MessageHandler.getSuccessMessage('audiobooks.stats_retrieved'));
  });
  searchAudioBooks = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q || (q as string).trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.search_required'));
      return;
    }

    const queryParams = applyGuestCatalogDefaults(req, {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      search: q as string,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    const { audiobooks, totalCount } = await this.audioBookService.getAllAudioBooks(
      queryParams,
      getBearerToken(req),
    );

    const pagination = ResponseHandler.calculatePagination(
      queryParams.page!,
      queryParams.limit!,
      totalCount
    );

    ResponseHandler.paginated(res, audiobooks, pagination, MessageHandler.getSuccessMessage('audiobooks.search_results'));
  });
  getAudioBooksByGenre = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { genre } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const queryParams = applyGuestCatalogDefaults(req, {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      genreIds: genre ? [genre as string] : undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    const { audiobooks, totalCount } = await this.audioBookService.getAllAudioBooks(
      queryParams,
      getBearerToken(req),
    );

    const pagination = ResponseHandler.calculatePagination(
      queryParams.page!,
      queryParams.limit!,
      totalCount
    );

    ResponseHandler.paginated(res, audiobooks, pagination, MessageHandler.getSuccessMessage('audiobooks.by_genre', { genre: genre as string }));
  });
  getAudioBooksByAuthor = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { author } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const queryParams = applyGuestCatalogDefaults(req, {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      author: decodeURIComponent(author as string),
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    const { audiobooks, totalCount } = await this.audioBookService.getAllAudioBooks(
      queryParams,
      getBearerToken(req),
    );

    const pagination = ResponseHandler.calculatePagination(
      queryParams.page!,
      queryParams.limit!,
      totalCount
    );

    ResponseHandler.paginated(res, audiobooks, pagination, MessageHandler.getSuccessMessage('audiobooks.by_author', { author: decodeURIComponent(author as string) }));
  });
  getAudioBooksByTags = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Get parsed tags from validation middleware
    const tagList = (req as any).parsedTags;

    // Parse genreIds from query (can be string or array)
    let genreIds: string[] | undefined = undefined;
    if (req.query['genreIds']) {
      if (Array.isArray(req.query['genreIds'])) {
        genreIds = req.query['genreIds'] as string[];
      } else if (typeof req.query['genreIds'] === 'string') {
        genreIds = req.query['genreIds'].split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
      }
    } else if (req.query['genreId']) {
      // Support legacy genreId parameter for backward compatibility
      genreIds = [req.query['genreId'] as string];
    }

    let languageIds: string[] | undefined = undefined;
    if (req.query['languageIds']) {
      if (Array.isArray(req.query['languageIds'])) {
        languageIds = req.query['languageIds'] as string[];
      } else if (typeof req.query['languageIds'] === 'string') {
        languageIds = req.query['languageIds'].split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
      }
    } else if (req.query['languageId']) {
      languageIds = [req.query['languageId'] as string];
    }

    const queryParams = applyGuestCatalogDefaults(req, {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
      genreIds: genreIds,
      languageIds: languageIds,
      author: req.query['author'] as string,
      narrator: req.query['narrator'] as string,
      isActive: req.query['isActive'] !== undefined ? req.query['isActive'] === 'true' : undefined,
      isPublic: req.query['isPublic'] !== undefined ? req.query['isPublic'] === 'true' : undefined,
      search: req.query['search'] as string,
    });

    const { audiobooks, totalCount } = await this.audioBookService.getAudioBooksByTags(
      tagList,
      queryParams,
      getBearerToken(req),
    );

    const pagination = ResponseHandler.calculatePagination(
      queryParams.page!,
      queryParams.limit!,
      totalCount
    );

    ResponseHandler.paginated(res, audiobooks, pagination, MessageHandler.getSuccessMessage('audiobooks.by_tags', { tags: tagList.join(', ') }));
  });

  listOrganizationAudioBooks = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = req.params as { organizationId: string };

    const queryParams: AudioBookQueryParams = {
      page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
      limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10,
      sortBy: (req.query['sortBy'] as string) || 'createdAt',
      sortOrder: (req.query['sortOrder'] as 'asc' | 'desc') || 'desc',
      search: req.query['search'] as string,
      ownerType: 'ORGANIZATION',
      ownerId: organizationId,
    };

    const { audiobooks, totalCount } = await this.audioBookService.getAllAudioBooks(
      queryParams,
      getBearerToken(req),
    );

    const pagination = ResponseHandler.calculatePagination(
      queryParams.page!,
      queryParams.limit!,
      totalCount,
    );

    ResponseHandler.paginated(
      res,
      audiobooks,
      pagination,
      MessageHandler.getSuccessMessage('organizations.audiobooks_retrieved'),
    );
  });
}
