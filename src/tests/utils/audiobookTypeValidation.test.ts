/**
 * STI validation tests for Publication vs Authoring audiobooks.
 */
import { AudiobookType } from '@prisma/client';
import {
  parseAudiobookType,
  assertAuthoringAudiobookMetadataForbidden,
  assertAudiobookTypeImmutableOnUpdate,
  assertAuthoringChapterRequiresPages,
  assertPublicationChapterRequiresAudio,
  assertPublicationCoverImageRequired,
  assertPublicationChapterRequiresCover,
  validatePageInputs,
  validateChapterPageInputs,
  assertPagesAllowedOnlyForAuthoring,
  assertPagesForbiddenForPublication,
} from '../../utils/audiobookTypeValidation';
import { ApiError } from '../../types/ApiError';

describe('audiobookTypeValidation', () => {
  describe('parseAudiobookType', () => {
    it('defaults to PUBLICATION when omitted', () => {
      expect(parseAudiobookType(undefined)).toBe(AudiobookType.PUBLICATION);
    });

    it('accepts AUTHORING', () => {
      expect(parseAudiobookType('AUTHORING')).toBe(AudiobookType.AUTHORING);
    });

    it('rejects invalid type', () => {
      expect(() => parseAudiobookType('INVALID')).toThrow(ApiError);
    });
  });

  describe('assertAuthoringAudiobookMetadataForbidden', () => {
    it('rejects genreIds on authoring create', () => {
      expect(() =>
        assertAuthoringAudiobookMetadataForbidden({ genreIds: ['g1'] }),
      ).toThrow(ApiError);
    });

    it('rejects subscription fields on authoring create', () => {
      expect(() =>
        assertAuthoringAudiobookMetadataForbidden({ subscriptionGatingMode: 'AUDIOBOOK' }),
      ).toThrow(ApiError);
    });

    it('allows core fields on authoring create', () => {
      expect(() =>
        assertAuthoringAudiobookMetadataForbidden({ title: 'Draft', author: 'A' }),
      ).not.toThrow();
    });
  });

  describe('assertAudiobookTypeImmutableOnUpdate', () => {
    it('rejects type change on update', () => {
      expect(() =>
        assertAudiobookTypeImmutableOnUpdate({ type: 'PUBLICATION' }),
      ).toThrow(ApiError);
    });
  });

  describe('assertAuthoringChapterRequiresPages', () => {
    it('requires at least one page', () => {
      expect(() => assertAuthoringChapterRequiresPages(undefined)).toThrow(ApiError);
      expect(() => assertAuthoringChapterRequiresPages([])).toThrow(ApiError);
    });

    it('accepts pages array', () => {
      expect(() =>
        assertAuthoringChapterRequiresPages([
          { pageNumber: 1, plainText: 'Hello', richText: { blocks: [] } },
        ]),
      ).not.toThrow();
    });
  });

  describe('assertPublicationChapterRequiresAudio', () => {
    it('requires audio for publication chapters', () => {
      expect(() => assertPublicationChapterRequiresAudio(false)).toThrow(ApiError);
    });
  });

  describe('assertPublicationCoverImageRequired', () => {
    it('requires cover for publication audiobooks', () => {
      expect(() => assertPublicationCoverImageRequired(false)).toThrow(ApiError);
    });

    it('allows cover for publication audiobooks', () => {
      expect(() => assertPublicationCoverImageRequired(true)).not.toThrow();
    });
  });

  describe('assertPublicationChapterRequiresCover', () => {
    it('requires cover for publication chapters', () => {
      expect(() => assertPublicationChapterRequiresCover(false)).toThrow(ApiError);
    });

    it('allows cover for publication chapters', () => {
      expect(() => assertPublicationChapterRequiresCover(true)).not.toThrow();
    });
  });

  describe('assertPagesForbiddenForPublication', () => {
    it('rejects pages on publication audiobooks', () => {
      expect(() => assertPagesForbiddenForPublication(AudiobookType.PUBLICATION)).toThrow(ApiError);
    });
  });

  describe('assertPagesAllowedOnlyForAuthoring', () => {
    it('rejects pages on publication audiobooks', () => {
      expect(() =>
        assertPagesAllowedOnlyForAuthoring(AudiobookType.PUBLICATION, [
          { pageNumber: 1, richText: {} },
        ]),
      ).toThrow(ApiError);
    });

    it('allows empty pages on publication audiobooks', () => {
      expect(() =>
        assertPagesAllowedOnlyForAuthoring(AudiobookType.PUBLICATION, []),
      ).not.toThrow();
    });
  });

  describe('validatePageInputs', () => {
    it('rejects empty plainText', () => {
      expect(() =>
        validatePageInputs([{ pageNumber: 1, plainText: '   ', richText: {} }]),
      ).toThrow(ApiError);
    });

    it('rejects duplicate page numbers', () => {
      expect(() =>
        validatePageInputs([
          { pageNumber: 1, plainText: 'A', richText: {} },
          { pageNumber: 1, plainText: 'B', richText: {} },
        ]),
      ).toThrow(ApiError);
    });
  });

  describe('validateChapterPageInputs', () => {
    it('allows missing plainText for chapter page payloads', () => {
      expect(() =>
        validateChapterPageInputs([{ pageNumber: 1, richText: { blocks: [] } }]),
      ).not.toThrow();
    });

    it('rejects duplicate page numbers', () => {
      expect(() =>
        validateChapterPageInputs([
          { pageNumber: 1, richText: {} },
          { pageNumber: 1, richText: {} },
        ]),
      ).toThrow(ApiError);
    });
  });
});
