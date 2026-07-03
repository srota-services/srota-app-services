/**
 * STI validation tests for Publication vs Authoring audiobooks.
 */
import { AudiobookType } from '@prisma/client';
import {
  parseAudiobookType,
  assertAuthoringAudiobookMetadataForbidden,
  assertAuthoringChapterRequiresPages,
  assertPublicationChapterRequiresAudio,
  validatePageInputs,
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
        assertAuthoringAudiobookMetadataForbidden({ genreIds: ['g1'] }, 'create'),
      ).toThrow(ApiError);
    });

    it('rejects subscription fields on authoring create', () => {
      expect(() =>
        assertAuthoringAudiobookMetadataForbidden({ subscriptionGatingMode: 'AUDIOBOOK' }, 'create'),
      ).toThrow(ApiError);
    });

    it('rejects type change on update', () => {
      expect(() =>
        assertAuthoringAudiobookMetadataForbidden({ type: 'PUBLICATION' }, 'update'),
      ).toThrow(ApiError);
    });

    it('allows core fields on authoring create', () => {
      expect(() =>
        assertAuthoringAudiobookMetadataForbidden({ title: 'Draft', author: 'A' }, 'create'),
      ).not.toThrow();
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

  describe('assertPagesForbiddenForPublication', () => {
    it('rejects pages on publication audiobooks', () => {
      expect(() => assertPagesForbiddenForPublication(AudiobookType.PUBLICATION)).toThrow(ApiError);
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
});
