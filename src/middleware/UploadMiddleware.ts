/**
 * Upload Middleware
 * Handles file uploads with multer for images and audio files
 */
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

// Ensure upload directories exist
const ensureUploadDirs = (): void => {
   const dirs = [
      config.DEV_UPLOAD_DIR,
      config.DEV_AUDIOBOOK_IMAGE_DIR,
      config.DEV_CHAPTER_IMAGE_DIR,
      config.DEV_AUTHOR_IMAGE_DIR,
      config.DEV_USER_AVATAR_DIR,
      config.DEV_ORGANIZATION_IMAGE_DIR,
      config.DEV_AUDIO_DIR
   ];

   dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
         fs.mkdirSync(dir, { recursive: true });
      }
   });
};

// Initialize directories
ensureUploadDirs();

// Storage configuration for images
// Routes to chapters subdirectory for chapter routes, main images directory otherwise
const imageStorage = multer.diskStorage({
   destination: (req, _file, cb) => {
      // Check if this is a chapter route by examining the request path
      const isChapterRoute = req.path?.includes('/chapters') || req.originalUrl?.includes('/chapters');

      // For chapter routes, use chapters subdirectory; otherwise use main images directory
      if (isChapterRoute) {
         cb(null, config.DEV_CHAPTER_IMAGE_DIR);
      } else {
         cb(null, config.DEV_AUDIOBOOK_IMAGE_DIR);
      }
   },
   filename: (_req, file, cb) => {
      // Generate unique filename with timestamp
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `image-${uniqueSuffix}${ext}`);
   }
});

// Storage configuration for audio files
const audioStorage = multer.diskStorage({
   destination: (_req, _file, cb) => {
      cb(null, config.DEV_AUDIO_DIR);
   },
   filename: (_req, file, cb) => {
      // Generate unique filename with timestamp
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `audio-${uniqueSuffix}${ext}`);
   }
});

// File filter for images
const imageFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void => {
   const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
   ];

   if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
   } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
   }
};

// File filter for audio files
const audioFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void => {
   const allowedMimes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'audio/m4a',
      'audio/aac',
      'audio/x-aac',
      'audio/aacp',
      'audio/flac'
   ];

   // Get file extension as fallback
   const ext = path.extname(file.originalname).toLowerCase();
   const allowedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];

   if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
   } else {
      cb(new Error('Only audio files (MP3, WAV, OGG, M4A, AAC, FLAC) are allowed'));
   }
};

// Multer configurations
const imageUpload = multer({
   storage: imageStorage,
   fileFilter: imageFilter,
   limits: {
      fileSize: config.MAX_FILE_SIZE, // 50MB default
      files: 1 // Single file upload
   }
});

// Combined storage that routes files to appropriate directories based on field name
// For chapter creation/update: coverImage goes to chapters subdirectory
// For audiobook creation/update: coverImage goes to main images directory
const combinedStorage = multer.diskStorage({
   destination: (req, file, cb) => {
      // Route chapter coverImage to chapters subdirectory
      // Check if this is a chapter route by examining the request path
      const isChapterRoute = req.path?.includes('/chapters') || req.originalUrl?.includes('/chapters');

      if (file.fieldname === 'coverImage') {
         // For chapter routes, use chapters subdirectory; otherwise use main images directory
         if (isChapterRoute) {
            cb(null, config.DEV_CHAPTER_IMAGE_DIR);
         } else {
            cb(null, config.DEV_AUDIOBOOK_IMAGE_DIR);
         }
      } else if (file.fieldname === 'file' || file.fieldname === 'audio') {
         // Route to audio directory for audio files
         cb(null, config.DEV_AUDIO_DIR);
      } else {
         cb(null, config.DEV_UPLOAD_DIR);
      }
   },
   filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);

      if (file.fieldname === 'coverImage') {
         cb(null, `image-${uniqueSuffix}${ext}`);
      } else {
         cb(null, `audio-${uniqueSuffix}${ext}`);
      }
   }
});

// Combined file filter that validates both image and audio files
const combinedFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void => {
   if (file.fieldname === 'coverImage') {
      // Validate image file
      const allowedMimes = [
         'image/jpeg',
         'image/jpg',
         'image/png',
         'image/gif',
         'image/webp'
      ];
      if (allowedMimes.includes(file.mimetype)) {
         cb(null, true);
      } else {
         cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed for coverImage'));
      }
   } else if (file.fieldname === 'file' || file.fieldname === 'audio') {
      // Validate audio file
      const allowedMimes = [
         'audio/mpeg',
         'audio/mp3',
         'audio/wav',
         'audio/ogg',
         'audio/m4a',
         'audio/aac',
         'audio/x-aac',
         'audio/aacp',
         'audio/flac'
      ];

      // Get file extension as fallback
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];

      if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
         cb(null, true);
      } else {
         cb(new Error('Only audio files (MP3, WAV, OGG, M4A, AAC, FLAC) are allowed for audio file'));
      }
   } else {
      cb(new Error(`Unknown field name: ${file.fieldname}`));
   }
};

const audioUpload = multer({
   storage: audioStorage,
   fileFilter: audioFilter,
   limits: {
      fileSize: config.MAX_FILE_SIZE * 10, // 500MB for audio files
      files: 1 // Single file upload
   }
});

// Combined multer configuration for chapter/audiobook creation
// Handles both coverImage (max 50MB) and file/audio (max 1GB) in single upload
const combinedUpload = multer({
   storage: combinedStorage,
   fileFilter: combinedFilter,
   limits: {
      fileSize: 1073741824, // 1GB max for any file (audio files can be up to 1GB)
      files: 2 // Maximum 2 files: one image and one audio
   }
});

// Error handling middleware
export const handleUploadError = (_error: any, _req: Request, res: Response, next: NextFunction): void => {
   if (_error instanceof multer.MulterError) {
      if (_error.code === 'LIMIT_FILE_SIZE') {
         res.status(400).json({
            success: false,
            message: 'File too large. Maximum size allowed is 50MB for images and 1GB for audio files.',
            error: 'FILE_TOO_LARGE'
         });
         return;
      }
      if (_error.code === 'LIMIT_FILE_COUNT') {
         res.status(400).json({
            success: false,
            message: 'Too many files. Maximum 2 files allowed (one image and one audio).',
            error: 'TOO_MANY_FILES'
         });
         return;
      }
      if (_error.code === 'LIMIT_UNEXPECTED_FILE') {
         res.status(400).json({
            success: false,
            message: 'Unexpected file field. Expected fields: coverImage and file.',
            error: 'UNEXPECTED_FILE_FIELD'
         });
         return;
      }
   }

   if (_error.message && (_error.message.includes('Only') || _error.message.includes('Unknown field'))) {
      res.status(400).json({
         success: false,
         message: _error.message,
         error: 'INVALID_FILE_TYPE'
      });
      return;
   }

   next(_error);
};

// Storage for author profile images
const authorImageStorage = multer.diskStorage({
   destination: (_req, _file, cb) => {
      cb(null, config.DEV_AUTHOR_IMAGE_DIR);
   },
   filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `image-${uniqueSuffix}${ext}`);
   }
});

// Storage for user avatar images
const userAvatarStorage = multer.diskStorage({
   destination: (_req, _file, cb) => {
      cb(null, config.DEV_USER_AVATAR_DIR);
   },
   filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `image-${uniqueSuffix}${ext}`);
   }
});

// Storage for organization images
const organizationImageStorage = multer.diskStorage({
   destination: (_req, _file, cb) => {
      cb(null, config.DEV_ORGANIZATION_IMAGE_DIR);
   },
   filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `image-${uniqueSuffix}${ext}`);
   }
});

const profileImageUpload = multer({
   storage: authorImageStorage,
   fileFilter: imageFilter,
   limits: {
      fileSize: config.MAX_FILE_SIZE,
      files: 1
   }
});

const avatarUpload = multer({
   storage: userAvatarStorage,
   fileFilter: imageFilter,
   limits: {
      fileSize: config.MAX_FILE_SIZE,
      files: 1
   }
});

const organizationImageUpload = multer({
   storage: organizationImageStorage,
   fileFilter: imageFilter,
   limits: {
      fileSize: config.MAX_FILE_SIZE,
      files: 1
   }
});

// Middleware for single image upload
export const uploadSingleImage = imageUpload.single('coverImage');

export const uploadProfileImage = profileImageUpload.single('profileImage');

export const uploadAvatar = avatarUpload.single('avatar');

export const uploadOrganizationImage = organizationImageUpload.single('image');

// Middleware for single audio upload
// Accepts both 'audio' and 'file' field names for flexibility
export const uploadSingleAudio = audioUpload.single('file');

// Middleware for combined image and audio upload (for chapter/audiobook creation)
// Expects both coverImage and file fields, both are required
export const uploadImageAndAudio = combinedUpload.fields([
   { name: 'coverImage', maxCount: 1 },
   { name: 'file', maxCount: 1 }
]);

// Middleware for multiple image uploads
export const uploadMultipleImages = imageUpload.array('images', 5);

// Middleware for multiple audio uploads
export const uploadMultipleAudio = audioUpload.array('audio', 3);

// Development-only: convert multer disk path to /uploads/ URL.
// Non-development cover uploads must use FileUrlService.processUploadedCoverFile().
export const getFileUrl = (filePath: string): string => {
   // In development, serve files from src/uploads
   if (config.NODE_ENV === 'development') {
      return `/uploads${filePath.replace(config.DEV_UPLOAD_DIR, '')}`;
   }
   return filePath;
};

// Utility function to delete file
export const deleteFile = (filePath: string): boolean => {
   try {
      if (fs.existsSync(filePath)) {
         fs.unlinkSync(filePath);
         return true;
      }
      return false;
   } catch (_error) {
      // console.error('Error deleting file:', _error);
      return false;
   }
};

export class UploadMiddleware {
   // Static method to handle required image upload only (for audiobook creation)
   // coverImage is required, no audio file needed
   static handleRequiredImageUpload = (req: Request, res: Response, next: NextFunction): void => {
      uploadSingleImage(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }

         // Validate that coverImage is present (required)
         if (!req.file) {
            res.status(400).json({
               success: false,
               message: 'Cover image is required',
               error: 'MISSING_COVER_IMAGE'
            });
            return;
         }

         // Store image file in convenient property for controllers
         (req as any).coverImageFile = req.file;

         // req.body is now populated after multer processes the multipart/form-data
         next();
      });
   };

   // Static method to handle chapter create upload — cover required, audio optional (validated by service).
   static handleChapterCreateUpload = (req: Request, res: Response, next: NextFunction): void => {
      uploadImageAndAudio(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }

         const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

         if (!files) {
            res.status(400).json({
               success: false,
               message: 'Cover image is required',
               error: 'MISSING_COVER_IMAGE'
            });
            return;
         }

         const coverImageFiles = files['coverImage'];
         const audioFiles = files['file'] || files['audio'];

         if (!coverImageFiles || coverImageFiles.length === 0) {
            res.status(400).json({
               success: false,
               message: 'Cover image is required',
               error: 'MISSING_COVER_IMAGE'
            });
            return;
         }

         (req as any).coverImageFile = coverImageFiles[0];
         if (audioFiles && audioFiles.length > 0) {
            (req as any).audioFile = audioFiles[0];
         }

         next();
      });
   };

   // Static method to handle combined image and audio uploads (mandatory for chapter creation)
   // Both coverImage and file are required
   static handleImageAndAudioUpload = (req: Request, res: Response, next: NextFunction): void => {
      uploadImageAndAudio(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }

         // Validate that both files are present (required)
         const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

         if (!files) {
            res.status(400).json({
               success: false,
               message: 'Both coverImage and file are required',
               error: 'MISSING_REQUIRED_FILES'
            });
            return;
         }

         const coverImageFiles = files['coverImage'];
         const audioFiles = files['file'] || files['audio'];

         if (!coverImageFiles || coverImageFiles.length === 0) {
            res.status(400).json({
               success: false,
               message: 'Cover image is required',
               error: 'MISSING_COVER_IMAGE'
            });
            return;
         }

         if (!audioFiles || audioFiles.length === 0) {
            res.status(400).json({
               success: false,
               message: 'Audio file is required',
               error: 'MISSING_AUDIO_FILE'
            });
            return;
         }

         // Cover image validation is performed spec-driven in ImageAssetService

         // Store files in convenient properties for controllers
         (req as any).coverImageFile = coverImageFiles[0];
         (req as any).audioFile = audioFiles[0];

         // req.body is now populated after multer processes the multipart/form-data
         next();
      });
   };

   // Static method to handle optional combined image and audio uploads (for chapter/audiobook updates)
   // coverImage and file are both optional; parses multipart once so body fields are preserved
   static handleOptionalImageAndAudioUpload = (req: Request, res: Response, next: NextFunction): void => {
      uploadImageAndAudio(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }

         const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
         if (files) {
            const coverImageFiles = files['coverImage'];
            const audioFiles = files['file'] || files['audio'];

            if (coverImageFiles && coverImageFiles.length > 0) {
               (req as any).coverImageFile = coverImageFiles[0];
            }
            if (audioFiles && audioFiles.length > 0) {
               (req as any).audioFile = audioFiles[0];
            }
         }

         next();
      });
   };

   // Static method to handle optional image uploads
   // Only processes upload if client is sending an image file
   // If no image is sent, the middleware passes through without error
   // Stores the image file in req.coverImageFile to avoid conflicts with audio file in req.file
   static handleImageUpload = (req: Request, res: Response, next: NextFunction): void => {
      // Multer's .single() handles optional uploads gracefully
      // If no file is sent with the 'coverImage' field name, req.file will be undefined
      // and no error is thrown - the middleware simply passes through
      uploadSingleImage(req, res, (err) => {
         if (err) {
            // Handle actual upload errors (file too large, invalid type, etc.)
            // Note: Multer does NOT throw errors for missing files - it's optional by default
            return handleUploadError(err, req, res, next);
         }
         // Store image file in custom property to avoid conflict with audio file
         // This allows both image and audio files to be uploaded in the same request
         if (req.file) {
            (req as any).coverImageFile = req.file;
            // Clear req.file so audio middleware can use it
            delete (req as any).file;
         }
         // Success or no file sent - both cases are fine
         // req.coverImageFile will be undefined if no image was sent, which is expected
         next();
      });
   };

   // Static method to handle audio uploads
   static handleAudioUpload = (req: Request, res: Response, next: NextFunction): void => {
      uploadSingleAudio(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }
         // req.body is now populated after multer processes the multipart/form-data
         next();
      });
   };

   // Static method to handle multiple image uploads
   static handleMultipleImages = (req: Request, res: Response, next: NextFunction): void => {
      uploadMultipleImages(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }
         next();
      });
   };

   // Static method to handle multiple audio uploads
   static handleMultipleAudio = (req: Request, res: Response, next: NextFunction): void => {
      uploadMultipleAudio(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }
         next();
      });
   };

   // Optional author profile image upload (field: profileImage)
   static handleOptionalProfileImageUpload = (req: Request, res: Response, next: NextFunction): void => {
      uploadProfileImage(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }
         if (req.file) {
            (req as any).profileImageFile = req.file;
            delete (req as any).file;
         }
         next();
      });
   };

   // Optional user avatar upload (field: avatar)
   static handleOptionalAvatarUpload = (req: Request, res: Response, next: NextFunction): void => {
      uploadAvatar(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }
         if (req.file) {
            (req as any).avatarFile = req.file;
            delete (req as any).file;
         }
         next();
      });
   };

   // Optional organization image upload (field: image)
   static handleOptionalOrganizationImageUpload = (req: Request, res: Response, next: NextFunction): void => {
      uploadOrganizationImage(req, res, (err) => {
         if (err) {
            return handleUploadError(err, req, res, next);
         }
         if (req.file) {
            (req as any).organizationImageFile = req.file;
            delete (req as any).file;
         }
         next();
      });
   };
}
