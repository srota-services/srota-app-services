/**
 * Validation middleware for request parameters
 * Provides type-safe validation following OOP principles
 */
import { Request, Response, NextFunction } from 'express';
import { parseAudioBookOwnerFromBody } from '../utils/parseAudioBookOwner';
import { parseOptionalMinSubscriptionTierFromForm } from '../utils/subscriptionGatingValidation';
import { ApiError } from '../types/ApiError';
import { ResponseHandler } from '../utils/ResponseHandler';
import { MessageHandler } from '../utils/MessageHandler';

export class ValidationMiddleware {
  /**
   * Validate pagination parameters
   */
  static validatePagination(req: Request, res: Response, next: NextFunction): void {
    const { page, limit, sortBy, sortOrder } = req.query;

    // Validate page parameter
    if (page !== undefined) {
      const pageNum = parseInt(page as string, 10);
      if (isNaN(pageNum) || pageNum < 1) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.page_positive'));
        return;
      }
    }

    // Validate limit parameter
    if (limit !== undefined) {
      const limitNum = parseInt(limit as string, 10);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.limit_range'));
        return;
      }
    }

    // Validate sortBy parameter
    if (sortBy !== undefined) {
      const allowedSortFields = MessageHandler.getValidationRule('sort_fields.allowed');
      if (!allowedSortFields.includes(sortBy as string)) {
        ResponseHandler.validationError(
          res,
          MessageHandler.getErrorMessage('validation.sort_field', { fields: allowedSortFields.join(', ') })
        );
        return;
      }
    }

    // Validate sortOrder parameter
    if (sortOrder !== undefined) {
      if (!['asc', 'desc'].includes(sortOrder as string)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.sort_order'));
        return;
      }
    }

    next();
  }

  /**
   * Validate audiobook filter parameters
   */
  static validateAudioBookFilters(req: Request, res: Response, next: NextFunction): void {
    const { genre, author, narrator, isActive, isPublic, search, moodId, moodIds, languageId, languageIds, ownerType, ownerId, ownerIds } = req.query;

    const cuidRegex = /^c[a-z0-9]{24}$/;

    if (ownerType !== undefined) {
      if (ownerType !== 'AUTHOR' && ownerType !== 'ORGANIZATION') {
        ResponseHandler.validationError(res, 'ownerType must be AUTHOR or ORGANIZATION');
        return;
      }
    }

    if (ownerId !== undefined) {
      if (typeof ownerId !== 'string' || !cuidRegex.test(ownerId)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.id_format'));
        return;
      }
    }

    if (ownerIds !== undefined) {
      const rawOwnerIds = Array.isArray(ownerIds)
        ? ownerIds
        : typeof ownerIds === 'string'
          ? ownerIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0)
          : [];

      for (const id of rawOwnerIds) {
        if (typeof id !== 'string' || !cuidRegex.test(id)) {
          ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.id_format'));
          return;
        }
      }
    }

    const moodIdValues: string[] = [];

    if (moodId !== undefined) {
      if (typeof moodId !== 'string' || !cuidRegex.test(moodId)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.id_format'));
        return;
      }
      moodIdValues.push(moodId);
    }

    if (moodIds !== undefined) {
      const rawMoodIds = Array.isArray(moodIds)
        ? moodIds
        : typeof moodIds === 'string'
          ? moodIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0)
          : [];

      for (const id of rawMoodIds) {
        if (typeof id !== 'string' || !cuidRegex.test(id)) {
          ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.id_format'));
          return;
        }
        moodIdValues.push(id);
      }
    }

    if (moodIdValues.length > 0) {
      req.query['moodIds'] = moodIdValues.join(',');
      delete req.query['moodId'];
    }

    const languageIdValues: string[] = [];

    if (languageId !== undefined) {
      if (typeof languageId !== 'string' || !cuidRegex.test(languageId)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.language_id_invalid'));
        return;
      }
      languageIdValues.push(languageId);
    }

    if (languageIds !== undefined) {
      const rawLanguageIds = Array.isArray(languageIds)
        ? languageIds
        : typeof languageIds === 'string'
          ? languageIds.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0)
          : [];

      for (const id of rawLanguageIds) {
        if (typeof id !== 'string' || !cuidRegex.test(id)) {
          ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.language_id_invalid'));
          return;
        }
        languageIdValues.push(id);
      }
    }

    if (languageIdValues.length > 0) {
      req.query['languageIds'] = languageIdValues.join(',');
      delete req.query['languageId'];
    }

    // Validate boolean parameters
    if (isActive !== undefined) {
      if (!['true', 'false'].includes(isActive as string)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.is_active_boolean'));
        return;
      }
    }

    if (isPublic !== undefined) {
      if (!['true', 'false'].includes(isPublic as string)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.is_public_boolean'));
        return;
      }
    }

    // Validate string parameters length
    const maxLength = MessageHandler.getValidationRule('string_fields.max_length');
    const stringParams = { genre, author, narrator, search };
    for (const [key, value] of Object.entries(stringParams)) {
      if (value !== undefined && typeof value === 'string' && value.length > maxLength) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.string_length', { field: key }));
        return;
      }
    }

    next();
  }

  /**
   * Validate required owner on audiobook create (after multipart body is parsed).
   */
  static validateAudioBookCreate(req: Request, res: Response, next: NextFunction): void {
    const owner = parseAudioBookOwnerFromBody(req.body as Record<string, unknown>);
    if (!owner) {
      ResponseHandler.validationError(res, 'owner is required with type and id');
      return;
    }
    next();
  }

  /**
   * Validate MongoDB ObjectId format (if using MongoDB) or CUID format
   */
  static validateId(req: Request, res: Response, next: NextFunction): void {
    const { id, audiobookId, chapterId } = req.params;

    if (!id && !audiobookId && !chapterId) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.id_required'));
      return;
    }

    // CUID format validation (used by Prisma)
    const cuidRegex = /^c[a-z0-9]{24}$/;
    const candidate = id ?? audiobookId ?? chapterId;
    if (!candidate || !cuidRegex.test(candidate)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.id_format'));
      return;
    }

    next();
  }

  /**
   * Validate userProfileId path parameter (CUID)
   */
  static validateUserProfileIdParam(req: Request, res: Response, next: NextFunction): void {
    const { userProfileId } = req.params;

    if (!userProfileId || typeof userProfileId !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.user_profile_id_required'));
      return;
    }

    const cuidRegex = /^c[a-z0-9]{24}$/;
    if (!cuidRegex.test(userProfileId)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.id_format'));
      return;
    }

    next();
  }

  /**
   * Validate tag parameters for audiobook filtering
   */
  static validateTags(req: Request, res: Response, next: NextFunction): void {
    const { tags } = req.params;

    if (!tags || typeof tags !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tags_required'));
      return;
    }

    // Parse comma-separated tags
    const tagList = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

    if (tagList.length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tags_required'));
      return;
    }

    // Validate each tag (basic validation - alphanumeric, spaces, hyphens, underscores)
    const tagRegex = /^[a-zA-Z0-9\s\-_]+$/;
    for (const tag of tagList) {
      if (!tagRegex.test(tag)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tag_format', { tag }));
        return;
      }
      if (tag.length > 50) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tag_length', { tag }));
        return;
      }
    }

    // Limit number of tags
    if (tagList.length > 10) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tags_limit'));
      return;
    }

    // Store parsed tags in request for controller use
    (req as any).parsedTags = tagList;

    next();
  }

  /**
   * Validate chapter ID parameter
   */
  static validateChapterId(req: Request, res: Response, next: NextFunction): void {
    const { chapterId } = req.params;

    if (!chapterId) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.chapter_id_required'));
      return;
    }

    // CUID format validation
    const cuidRegex = /^c[a-z0-9]{24}$/;
    if (!cuidRegex.test(chapterId)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.chapter_id_format'));
      return;
    }

    next();
  }

  /**
   * Validate bitrate parameter
   */
  static validateBitrate(req: Request, res: Response, next: NextFunction): void {
    const { bitrate } = req.params;

    if (!bitrate) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.bitrate_required'));
      return;
    }

    const bitrateNum = parseInt(bitrate, 10);
    if (isNaN(bitrateNum) || bitrateNum < 32 || bitrateNum > 512) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.bitrate_range'));
      return;
    }

    next();
  }

  /**
   * Validate segment ID parameter
   */
  static validateSegmentId(req: Request, res: Response, next: NextFunction): void {
    const { segmentId } = req.params;

    if (!segmentId) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.segment_id_required'));
      return;
    }

    // Validate segment ID format (e.g., segment_001.ts)
    const segmentRegex = /^segment_\d{3}\.ts$/;
    if (!segmentRegex.test(segmentId)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.segment_id_format'));
      return;
    }

    next();
  }

  /**
   * Validate transcoding request body
   */
  static validateTranscodingRequest(req: Request, res: Response, next: NextFunction): void {
    const { bitrates, priority } = req.body;

    // Validate bitrates array
    if (bitrates !== undefined) {
      if (!Array.isArray(bitrates)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.bitrates_array'));
        return;
      }

      for (const bitrate of bitrates) {
        if (typeof bitrate !== 'number' || bitrate < 32 || bitrate > 512) {
          ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.bitrate_range'));
          return;
        }
      }

      if (bitrates.length > 5) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.bitrates_limit'));
        return;
      }
    }

    // Validate priority
    if (priority !== undefined) {
      if (!['low', 'normal', 'high'].includes(priority)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.priority_value'));
        return;
      }
    }

    next();
  }

  /**
   * Validate preload request body
   */
  static validatePreloadRequest(req: Request, res: Response, next: NextFunction): void {
    const { bitrate } = req.body;

    if (bitrate !== undefined) {
      if (typeof bitrate !== 'number' || bitrate < 32 || bitrate > 512) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.bitrate_range'));
        return;
      }
    }

    next();
  }

  /**
   * Validate chapter creation request
   */
  static validateChapterCreation(req: Request, res: Response, next: NextFunction): void {
    const { audiobookId, title, chapterNumber } = req.body;

    if (!audiobookId) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.audiobook_id_required'));
      return;
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.title_required'));
      return;
    }

    if (title.length > 200) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.title_length'));
      return;
    }

    const chapterNumberNum = parseInt(chapterNumber, 10);
    if (!chapterNumber || isNaN(chapterNumberNum) || chapterNumberNum < 1) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.chapter_number_positive'));
      return;
    }

    if (req.body.description && (typeof req.body.description !== 'string' || req.body.description.length > 1000)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.description_length'));
      return;
    }

    if (req.body.minSubscriptionTier !== undefined) {
      try {
        const parsedTier = parseOptionalMinSubscriptionTierFromForm(req.body.minSubscriptionTier);
        if (parsedTier !== undefined) {
          req.body.minSubscriptionTier = parsedTier;
        } else {
          delete req.body.minSubscriptionTier;
        }
      } catch (error) {
        if (error instanceof ApiError) {
          ResponseHandler.validationError(res, error.message);
          return;
        }
        throw error;
      }
    }

    next();
  }

  static validatePageCreation(req: Request, res: Response, next: NextFunction): void {
    const { pageNumber, plainText, richText } = req.body;

    const pageNumberNum = parseInt(pageNumber, 10);
    if (!pageNumber || isNaN(pageNumberNum) || pageNumberNum < 1) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.page_number_positive').replace('{label}', 'pageNumber'));
      return;
    }

    if (!plainText || typeof plainText !== 'string' || plainText.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.page_plain_text_required').replace('{label}', 'plainText'));
      return;
    }

    if (richText === undefined || richText === null) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.page_rich_text_required').replace('{label}', 'richText'));
      return;
    }

    next();
  }

  static validatePageUpdate(req: Request, res: Response, next: NextFunction): void {
    if (req.body.pageNumber !== undefined) {
      const pageNumberNum = parseInt(req.body.pageNumber, 10);
      if (isNaN(pageNumberNum) || pageNumberNum < 1) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.page_number_positive').replace('{label}', 'pageNumber'));
        return;
      }
    }

    if (
      req.body.plainText !== undefined &&
      (typeof req.body.plainText !== 'string' || req.body.plainText.trim().length === 0)
    ) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.page_plain_text_required').replace('{label}', 'plainText'));
      return;
    }

    next();
  }

  /**
   * Validate chapter update request (all fields optional)
   */
  static validateChapterUpdate(req: Request, res: Response, next: NextFunction): void {
    if (req.body.title !== undefined) {
      if (typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.title_required'));
        return;
      }
      if (req.body.title.length > 200) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.title_length'));
        return;
      }
    }

    if (
      req.body.description !== undefined &&
      req.body.description !== null &&
      req.body.description !== '' &&
      (typeof req.body.description !== 'string' || req.body.description.length > 1000)
    ) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.description_length'));
      return;
    }

    if (req.body.minSubscriptionTier !== undefined) {
      try {
        const parsedTier = parseOptionalMinSubscriptionTierFromForm(req.body.minSubscriptionTier);
        if (parsedTier !== undefined) {
          req.body.minSubscriptionTier = parsedTier;
        } else {
          req.body.minSubscriptionTier = null;
        }
      } catch (error) {
        if (error instanceof ApiError) {
          ResponseHandler.validationError(res, error.message);
          return;
        }
        throw error;
      }
    }

    next();
  }

  /**
   * Validate user profile update request
   */
  static validateUserProfileUpdate(req: Request, res: Response, next: NextFunction): void {
    const {
      username,
      avatar,
      preferences,
    } = req.body;

    const allowedFields = [
      'username',
      'avatar',
      'preferences',
    ];
    const extraFields = Object.keys(req.body).filter(k => !allowedFields.includes(k));
    if (extraFields.length > 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.unexpected_fields'));
      return;
    }

    if (username !== undefined) {
      if (typeof username !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.username_type'));
        return;
      }
      const trimmed = username.trim();
      if (trimmed.length < 3 || trimmed.length > 30) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.username_length'));
        return;
      }
      const usernameRegex = /^[a-zA-Z0-9_.-]+$/;
      if (!usernameRegex.test(trimmed)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.username_format'));
        return;
      }
      req.body.username = trimmed;
    }

    const hasAvatarUpload = Boolean((req as any).avatarFile);

    if (avatar !== undefined && !hasAvatarUpload) {
      if (typeof avatar !== 'string' || avatar.length > 500) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.avatar_url'));
        return;
      }
      try {
        new URL(avatar);
      } catch {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.avatar_url'));
        return;
      }
    }

    if (preferences !== undefined) {
      if (typeof preferences !== 'object' || Array.isArray(preferences)) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.preferences_object'));
        return;
      }
    }

    if (
      [username, avatar, preferences].every(
        v => v === undefined
      ) && !hasAvatarUpload
    ) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.no_update_fields'));
      return;
    }

    next();
  }

  /**
   * Sanitize and normalize query parameters
   */
  static sanitizeQueryParams(req: Request, _res: Response, next: NextFunction): void {
    // Sanitize string parameters
    const stringFields = ['genre', 'author', 'narrator', 'search', 'sortBy'];

    for (const field of stringFields) {
      if (req.query[field]) {
        req.query[field] = (req.query[field] as string).trim();
      }
    }

    // Convert string booleans to actual booleans
    if (req.query['isActive']) {
      (req.query as any)['isActive'] = req.query['isActive'] === 'true';
    }
    if (req.query['isPublic']) {
      (req.query as any)['isPublic'] = req.query['isPublic'] === 'true';
    }

    // Convert string numbers to actual numbers
    if (req.query['page']) {
      (req.query as any)['page'] = parseInt(req.query['page'] as string, 10);
    }
    if (req.query['limit']) {
      (req.query as any)['limit'] = parseInt(req.query['limit'] as string, 10);
    }

    next();
  }

  /**
   * Validate UserAudioBook creation request
   */
  static validateUserAudioBookCreation(req: Request, res: Response, next: NextFunction): void {
    const { userProfileId, audiobookId, type } = req.body;

    if (type !== undefined) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.user_audiobook_type_not_settable'));
      return;
    }

    // Validate required fields
    if (!userProfileId || typeof userProfileId !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.user_profile_id_required'));
      return;
    }

    // Validate CUID format for userProfileId
    const cuidRegex = /^c[a-z0-9]{24}$/;
    if (!cuidRegex.test(userProfileId)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.id_format'));
      return;
    }

    if (!audiobookId || typeof audiobookId !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.audiobook_id_required'));
      return;
    }

    // Validate CUID format for audiobookId
    if (!cuidRegex.test(audiobookId)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.id_format'));
      return;
    }

    next();
  }

  /**
   * Validate UserAudioBook type parameter
   */
  static validateUserAudioBookType(req: Request, res: Response, next: NextFunction): void {
    const { type } = req.params;

    if (!type || !['OWNED', 'PURCHASED'].includes(type)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.user_audiobook_type_invalid'));
      return;
    }

    next();
  }

  /**
   * Validate tag creation request
   */
  static validateCreateTag(req: Request, res: Response, next: NextFunction): void {
    const { name } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tag_name_required'));
      return;
    }

    // Validate name is not empty after trimming
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tag_name_empty'));
      return;
    }

    // Validate name length (max 100 characters)
    const maxLength = 100;
    if (trimmedName.length > maxLength) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tag_name_too_long', { maxLength }));
      return;
    }

    // Sanitize name by trimming
    req.body.name = trimmedName;

    next();
  }

  /**
   * Validate tag update request
   */
  static validateUpdateTag(req: Request, res: Response, next: NextFunction): void {
    const { name } = req.body;

    // Name is optional for update, but if provided must be valid
    if (name !== undefined) {
      if (typeof name !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tag_name_invalid'));
        return;
      }

      // Validate name is not empty after trimming
      const trimmedName = name.trim();
      if (trimmedName.length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tag_name_empty'));
        return;
      }

      // Validate name length (max 100 characters)
      const maxLength = 100;
      if (trimmedName.length > maxLength) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.tag_name_too_long', { maxLength }));
        return;
      }

      // Sanitize name by trimming
      req.body.name = trimmedName;
    } else {
      // Must have at least one field to update
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.no_update_fields'));
      return;
    }

    next();
  }

  /**
   * Validate mood creation request
   */
  static validateCreateMood(req: Request, res: Response, next: NextFunction): void {
    const { name, description, descriptionIcon, hexcode, icon, attributes } = req.body;

    if (!name || typeof name !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_name_required'));
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_name_empty'));
      return;
    }

    const maxNameLength = 100;
    if (trimmedName.length > maxNameLength) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_name_too_long', { maxLength: maxNameLength }));
      return;
    }

    if (!hexcode || typeof hexcode !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_hexcode_required'));
      return;
    }

    const trimmedHexcode = hexcode.trim();
    if (trimmedHexcode.length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_hexcode_empty'));
      return;
    }

    if (!icon || typeof icon !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_icon_required'));
      return;
    }

    const trimmedIcon = icon.trim();
    if (trimmedIcon.length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_icon_empty'));
      return;
    }

    const maxIconLength = 100;
    if (trimmedIcon.length > maxIconLength) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_icon_too_long', { maxLength: maxIconLength }));
      return;
    }

    if (!descriptionIcon || typeof descriptionIcon !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_icon_required'));
      return;
    }

    const trimmedDescriptionIcon = descriptionIcon.trim();
    if (trimmedDescriptionIcon.length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_icon_empty'));
      return;
    }

    if (trimmedDescriptionIcon.length > maxIconLength) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_icon_too_long', { maxLength: maxIconLength }));
      return;
    }

    if (description !== undefined && description !== null && typeof description !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_invalid'));
      return;
    }

    if (typeof description === 'string') {
      const trimmedDescription = description.trim();
      if (trimmedDescription.length > 500) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_too_long', { maxLength: 500 }));
        return;
      }
      req.body.description = trimmedDescription.length > 0 ? trimmedDescription : null;
    }

    if (attributes !== undefined && !ValidationMiddleware.validateMoodAttributes(req, res, attributes)) {
      return;
    }

    req.body.name = trimmedName;
    req.body.hexcode = trimmedHexcode;
    req.body.icon = trimmedIcon;
    req.body.descriptionIcon = trimmedDescriptionIcon;

    next();
  }

  /**
   * Validate mood update request
   */
  static validateUpdateMood(req: Request, res: Response, next: NextFunction): void {
    const { name, description, descriptionIcon, hexcode, icon, attributes } = req.body;

    if (
      name === undefined &&
      description === undefined &&
      descriptionIcon === undefined &&
      hexcode === undefined &&
      icon === undefined &&
      attributes === undefined
    ) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.no_update_fields'));
      return;
    }

    if (name !== undefined) {
      if (typeof name !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_name_invalid'));
        return;
      }

      const trimmedName = name.trim();
      if (trimmedName.length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_name_empty'));
        return;
      }

      const maxNameLength = 100;
      if (trimmedName.length > maxNameLength) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_name_too_long', { maxLength: maxNameLength }));
        return;
      }

      req.body.name = trimmedName;
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_invalid'));
        return;
      }

      if (typeof description === 'string') {
        const trimmedDescription = description.trim();
        if (trimmedDescription.length > 500) {
          ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_too_long', { maxLength: 500 }));
          return;
        }
        req.body.description = trimmedDescription.length > 0 ? trimmedDescription : null;
      }
    }

    if (descriptionIcon !== undefined) {
      if (typeof descriptionIcon !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_icon_invalid'));
        return;
      }

      const trimmedDescriptionIcon = descriptionIcon.trim();
      if (trimmedDescriptionIcon.length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_icon_empty'));
        return;
      }

      const maxIconLength = 100;
      if (trimmedDescriptionIcon.length > maxIconLength) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_description_icon_too_long', { maxLength: maxIconLength }));
        return;
      }

      req.body.descriptionIcon = trimmedDescriptionIcon;
    }

    if (hexcode !== undefined) {
      if (typeof hexcode !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_hexcode_invalid'));
        return;
      }

      const trimmedHexcode = hexcode.trim();
      if (trimmedHexcode.length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_hexcode_empty'));
        return;
      }

      req.body.hexcode = trimmedHexcode;
    }

    if (icon !== undefined) {
      if (typeof icon !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_icon_invalid'));
        return;
      }

      const trimmedIcon = icon.trim();
      if (trimmedIcon.length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_icon_empty'));
        return;
      }

      const maxIconLength = 100;
      if (trimmedIcon.length > maxIconLength) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_icon_too_long', { maxLength: maxIconLength }));
        return;
      }

      req.body.icon = trimmedIcon;
    }

    if (attributes !== undefined && !ValidationMiddleware.validateMoodAttributes(req, res, attributes)) {
      return;
    }

    next();
  }

  private static validateMoodAttributes(req: Request, res: Response, attributes: unknown): boolean {
    if (!Array.isArray(attributes)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_attributes_invalid'));
      return false;
    }

    const maxIconLength = 100;
    const maxDescriptionLength = 500;
    const sanitizedAttributes: Array<{ icon: string; description: string }> = [];

    for (const attribute of attributes) {
      if (!attribute || typeof attribute !== 'object') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_attribute_invalid'));
        return false;
      }

      const { icon, description } = attribute as { icon?: unknown; description?: unknown };

      if (!icon || typeof icon !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_attribute_icon_required'));
        return false;
      }

      const trimmedIcon = icon.trim();
      if (trimmedIcon.length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_attribute_icon_empty'));
        return false;
      }

      if (trimmedIcon.length > maxIconLength) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_attribute_icon_too_long', { maxLength: maxIconLength }));
        return false;
      }

      if (!description || typeof description !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_attribute_description_required'));
        return false;
      }

      const trimmedDescription = description.trim();
      if (trimmedDescription.length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_attribute_description_empty'));
        return false;
      }

      if (trimmedDescription.length > maxDescriptionLength) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.mood_attribute_description_too_long', { maxLength: maxDescriptionLength }));
        return false;
      }

      sanitizedAttributes.push({
        icon: trimmedIcon,
        description: trimmedDescription
      });
    }

    req.body.attributes = sanitizedAttributes;
    return true;
  }

  /**
   * Validate author creation request
   */
  static validateCreateAuthor(req: Request, res: Response, next: NextFunction): void {
    const { userId, firstName, lastName, address, contact } = req.body;

    if (!userId || typeof userId !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_user_id_required'));
      return;
    }

    const trimmedUserId = userId.trim();
    if (trimmedUserId.length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_user_id_required'));
      return;
    }

    if (trimmedUserId.length > 255) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_user_id_too_long'));
      return;
    }

    // Validate required fields
    if (!firstName || typeof firstName !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_first_name_required'));
      return;
    }

    const trimmedFirstName = firstName.trim();
    if (trimmedFirstName.length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_first_name_required'));
      return;
    }

    if (trimmedFirstName.length > 100) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_first_name_too_long'));
      return;
    }

    if (!lastName || typeof lastName !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_last_name_required'));
      return;
    }

    const trimmedLastName = lastName.trim();
    if (trimmedLastName.length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_last_name_required'));
      return;
    }

    if (trimmedLastName.length > 100) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_last_name_too_long'));
      return;
    }

    // Sanitize and set trimmed values
    req.body.userId = trimmedUserId;
    req.body.firstName = trimmedFirstName;
    req.body.lastName = trimmedLastName;
    if (address !== undefined && address !== null && address !== '') {
      if (typeof address !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_address_invalid'));
        return;
      }

      const trimmedAddress = address.trim();
      if (trimmedAddress.length > 500) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_address_too_long'));
        return;
      }
    }

    // Validate contact length if provided
    if (contact !== undefined && contact !== null && contact !== '') {
      if (typeof contact !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_contact_invalid'));
        return;
      }

      const trimmedContact = contact.trim();
      if (trimmedContact.length > 50) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_contact_too_long'));
        return;
      }
    }

    // Validate address length if provided
    if (address !== undefined && address !== null && address !== '') {
      req.body.address = address.trim();
    }
    if (contact !== undefined && contact !== null && contact !== '') {
      req.body.contact = contact.trim();
    }

    next();
  }

  /**
   * Validate author update request
   */
  static validateUpdateAuthor(req: Request, res: Response, next: NextFunction): void {
    const { firstName, lastName, address, contact } = req.body;

    // All fields are optional for update, but if provided must be valid

    if (firstName !== undefined) {
      if (typeof firstName !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_first_name_invalid'));
        return;
      }

      const trimmed = firstName.trim();
      if (trimmed.length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_first_name_required'));
        return;
      }

      if (trimmed.length > 100) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_first_name_too_long'));
        return;
      }

      req.body.firstName = trimmed;
    }

    if (lastName !== undefined) {
      if (typeof lastName !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_last_name_invalid'));
        return;
      }

      const trimmed = lastName.trim();
      if (trimmed.length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_last_name_required'));
        return;
      }

      if (trimmed.length > 100) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_last_name_too_long'));
        return;
      }

      req.body.lastName = trimmed;
    }

    if (address !== undefined && address !== null && address !== '') {
      if (typeof address !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_address_invalid'));
        return;
      }

      const trimmedAddress = address.trim();
      if (trimmedAddress.length > 500) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_address_too_long'));
        return;
      }

      req.body.address = trimmedAddress;
    }

    if (contact !== undefined && contact !== null && contact !== '') {
      if (typeof contact !== 'string') {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_contact_invalid'));
        return;
      }

      const trimmedContact = contact.trim();
      if (trimmedContact.length > 50) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_contact_too_long'));
        return;
      }

      req.body.contact = trimmedContact;
    }

    // Must have at least one field to update (including optional profile image upload)
    const hasProfileImageUpload = Boolean((req as any).profileImageFile);
    if ([firstName, lastName, address, contact, req.body.organizationIds].every(v => v === undefined) && !hasProfileImageUpload) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.no_update_fields'));
      return;
    }

    next();
  }

  private static validateCommentMetaField(
    res: Response,
    meta: unknown,
    required: boolean
  ): boolean {
    if (meta === undefined || meta === null) {
      if (required) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.comment_meta_invalid'));
        return false;
      }
      return true;
    }
    if (typeof meta !== 'object' || Array.isArray(meta)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.comment_meta_invalid'));
      return false;
    }
    const obj = meta as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length !== 1 || !keys.includes('position')) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.comment_meta_invalid'));
      return false;
    }
    if ('chapterId' in obj) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.comment_meta_chapter_forbidden'));
      return false;
    }
    if (typeof obj['position'] !== 'number' || !Number.isFinite(obj['position']) || obj['position'] < 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.comment_meta_position_invalid'));
      return false;
    }
    return true;
  }

  static validateCreateComment(req: Request, res: Response, next: NextFunction): void {
    const { audiobookId, content, meta } = req.body;

    if (!audiobookId || typeof audiobookId !== 'string' || audiobookId.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.audiobook_id_required'));
      return;
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.comment_content_required'));
      return;
    }

    if (req.body.parentId !== undefined && req.body.parentId !== null) {
      if (typeof req.body.parentId !== 'string' || req.body.parentId.trim().length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.comment_parent_invalid'));
        return;
      }
    }

    if (!ValidationMiddleware.validateCommentMetaField(res, meta, false)) {
      return;
    }

    req.body.content = content.trim();
    next();
  }

  static validateUpdateComment(req: Request, res: Response, next: NextFunction): void {
    const { content, meta } = req.body;

    if (content === undefined && meta === undefined) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.no_update_fields'));
      return;
    }

    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.comment_content_required'));
        return;
      }
      req.body.content = content.trim();
    }

    if (meta !== undefined && !ValidationMiddleware.validateCommentMetaField(res, meta, meta !== null)) {
      return;
    }

    next();
  }

  static validateCreateReview(req: Request, res: Response, next: NextFunction): void {
    const { audiobookId, rating } = req.body;

    if (!audiobookId || typeof audiobookId !== 'string' || audiobookId.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.audiobook_id_required'));
      return;
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.review_rating_invalid'));
      return;
    }

    next();
  }

  static validateUpdateReview(req: Request, res: Response, next: NextFunction): void {
    const { rating } = req.body;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.review_rating_invalid'));
      return;
    }

    next();
  }

  static validateCreateOrganizationReview(req: Request, res: Response, next: NextFunction): void {
    const { organizationId, rating, description } = req.body;

    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.organization_id_required'));
      return;
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.review_rating_invalid'));
      return;
    }

    if (
      description !== undefined &&
      description !== null &&
      (typeof description !== 'string' || description.length > 2000)
    ) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.description_length'));
      return;
    }

    next();
  }

  static validateUpdateOrganizationReview(req: Request, res: Response, next: NextFunction): void {
    const { rating, description } = req.body;

    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.review_rating_invalid'));
      return;
    }

    if (
      description !== undefined &&
      description !== null &&
      (typeof description !== 'string' || description.length > 2000)
    ) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.description_length'));
      return;
    }

    if (rating === undefined && description === undefined) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.update_field_required'));
      return;
    }

    next();
  }

  static validateCreateAuthorReview(req: Request, res: Response, next: NextFunction): void {
    const { authorId, rating, description } = req.body;

    if (!authorId || typeof authorId !== 'string' || authorId.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.author_id_required'));
      return;
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.review_rating_invalid'));
      return;
    }

    if (
      description !== undefined &&
      description !== null &&
      (typeof description !== 'string' || description.length > 2000)
    ) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.description_length'));
      return;
    }

    next();
  }

  static validateUpdateAuthorReview(req: Request, res: Response, next: NextFunction): void {
    const { rating, description } = req.body;

    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.review_rating_invalid'));
      return;
    }

    if (
      description !== undefined &&
      description !== null &&
      (typeof description !== 'string' || description.length > 2000)
    ) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.description_length'));
      return;
    }

    if (rating === undefined && description === undefined) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.update_field_required'));
      return;
    }

    next();
  }

  static validateCreateBookmark(req: Request, res: Response, next: NextFunction): void {
    const { chapterId, audiobookId } = req.body;

    if (audiobookId !== undefined) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.bookmark_audiobook_id_forbidden'));
      return;
    }

    if (!chapterId || typeof chapterId !== 'string' || chapterId.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.chapter_id_required'));
      return;
    }

    req.body.chapterId = chapterId.trim();
    next();
  }

  static validateCreateFavorite(req: Request, res: Response, next: NextFunction): void {
    const { audiobookId } = req.body;

    if (!audiobookId || typeof audiobookId !== 'string' || audiobookId.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.audiobook_id_required'));
      return;
    }

    next();
  }

  static validateCreatePlaylist(req: Request, res: Response, next: NextFunction): void {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.playlist_name_required'));
      return;
    }

    if (name.trim().length > 200) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.playlist_name_too_long'));
      return;
    }

    req.body.name = name.trim();
    next();
  }

  static validateUpdatePlaylist(req: Request, res: Response, next: NextFunction): void {
    const { name, description, isPublic } = req.body;

    if (name === undefined && description === undefined && isPublic === undefined) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.no_update_fields'));
      return;
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.playlist_name_required'));
        return;
      }
      if (name.trim().length > 200) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.playlist_name_too_long'));
        return;
      }
      req.body.name = name.trim();
    }

    if (isPublic !== undefined && typeof isPublic !== 'boolean') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.is_public_boolean'));
      return;
    }

    next();
  }

  static validateCreatePlaylistItem(req: Request, res: Response, next: NextFunction): void {
    const { audiobookId, position } = req.body;

    if (!audiobookId || typeof audiobookId !== 'string' || audiobookId.trim().length === 0) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.audiobook_id_required'));
      return;
    }

    if (position !== undefined && (!Number.isInteger(position) || position < 1)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.playlist_item_position_invalid'));
      return;
    }

    next();
  }

  static validateUpdatePlaylistItem(req: Request, res: Response, next: NextFunction): void {
    const { position } = req.body;

    if (!Number.isInteger(position) || position < 1) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.playlist_item_position_invalid'));
      return;
    }

    next();
  }

  private static validateOrganizationIds(
    res: Response,
    organizationIds: unknown
  ): organizationIds is string[] {
    if (organizationIds === undefined) {
      return true;
    }
    if (!Array.isArray(organizationIds)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.organization_ids_invalid'));
      return false;
    }
    for (const id of organizationIds) {
      if (typeof id !== 'string' || id.trim().length === 0) {
        ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.organization_ids_invalid'));
        return false;
      }
    }
    return true;
  }

  static validateAuthorOrganizationIds(req: Request, res: Response, next: NextFunction): void {
    if (!ValidationMiddleware.validateOrganizationIds(res, req.body.organizationIds)) {
      return;
    }
    next();
  }
}
