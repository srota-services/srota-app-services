-- Replace userProfileId with auth userId and drop profile tables

ALTER TABLE "user_audiobooks" ADD COLUMN "userId" TEXT;
UPDATE "user_audiobooks" ua SET "userId" = up."userId" FROM "user_profiles" up WHERE ua."userProfileId" = up.id;
ALTER TABLE "user_audiobooks" DROP CONSTRAINT IF EXISTS "user_audiobooks_userProfileId_fkey";
ALTER TABLE "user_audiobooks" DROP COLUMN "userProfileId";
ALTER TABLE "user_audiobooks" ALTER COLUMN "userId" SET NOT NULL;
DROP INDEX IF EXISTS "user_audiobooks_userProfileId_audiobookId_key";
CREATE UNIQUE INDEX "user_audiobooks_userId_audiobookId_key" ON "user_audiobooks"("userId", "audiobookId");

ALTER TABLE "playlists" ADD COLUMN "userId" TEXT;
UPDATE "playlists" p SET "userId" = up."userId" FROM "user_profiles" up WHERE p."userProfileId" = up.id;
ALTER TABLE "playlists" DROP CONSTRAINT IF EXISTS "playlists_userProfileId_fkey";
ALTER TABLE "playlists" DROP COLUMN "userProfileId";
ALTER TABLE "playlists" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "reviews" ADD COLUMN "userId" TEXT;
UPDATE "reviews" r SET "userId" = up."userId" FROM "user_profiles" up WHERE r."userProfileId" = up.id;
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_userProfileId_fkey";
ALTER TABLE "reviews" DROP COLUMN "userProfileId";
ALTER TABLE "reviews" ALTER COLUMN "userId" SET NOT NULL;
DROP INDEX IF EXISTS "reviews_userProfileId_audiobookId_key";
CREATE UNIQUE INDEX "reviews_userId_audiobookId_key" ON "reviews"("userId", "audiobookId");

ALTER TABLE "comments" ADD COLUMN "userId" TEXT;
UPDATE "comments" c SET "userId" = up."userId" FROM "user_profiles" up WHERE c."userProfileId" = up.id;
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_userProfileId_fkey";
ALTER TABLE "comments" DROP COLUMN "userProfileId";
ALTER TABLE "comments" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "favorites" ADD COLUMN "userId" TEXT;
UPDATE "favorites" f SET "userId" = up."userId" FROM "user_profiles" up WHERE f."userProfileId" = up.id;
ALTER TABLE "favorites" DROP CONSTRAINT IF EXISTS "favorites_userProfileId_fkey";
ALTER TABLE "favorites" DROP COLUMN "userProfileId";
ALTER TABLE "favorites" ALTER COLUMN "userId" SET NOT NULL;
DROP INDEX IF EXISTS "favorites_userProfileId_audiobookId_key";
CREATE UNIQUE INDEX "favorites_userId_audiobookId_key" ON "favorites"("userId", "audiobookId");

ALTER TABLE "chapter_progress" ADD COLUMN "userId" TEXT;
UPDATE "chapter_progress" cp SET "userId" = up."userId" FROM "user_profiles" up WHERE cp."userProfileId" = up.id;
ALTER TABLE "chapter_progress" DROP CONSTRAINT IF EXISTS "chapter_progress_userProfileId_fkey";
ALTER TABLE "chapter_progress" DROP COLUMN "userProfileId";
ALTER TABLE "chapter_progress" ALTER COLUMN "userId" SET NOT NULL;
DROP INDEX IF EXISTS "chapter_progress_userProfileId_chapterId_key";
CREATE UNIQUE INDEX "chapter_progress_userId_chapterId_key" ON "chapter_progress"("userId", "chapterId");

ALTER TABLE "bookmarks" ADD COLUMN "userId" TEXT;
UPDATE "bookmarks" b SET "userId" = up."userId" FROM "user_profiles" up WHERE b."userProfileId" = up.id;
ALTER TABLE "bookmarks" DROP CONSTRAINT IF EXISTS "bookmarks_userProfileId_fkey";
ALTER TABLE "bookmarks" DROP COLUMN "userProfileId";
ALTER TABLE "bookmarks" ALTER COLUMN "userId" SET NOT NULL;
DROP INDEX IF EXISTS "bookmarks_userProfileId_chapterId_key";
CREATE UNIQUE INDEX "bookmarks_userId_chapterId_key" ON "bookmarks"("userId", "chapterId");

ALTER TABLE "notes" ADD COLUMN "userId" TEXT;
UPDATE "notes" n SET "userId" = up."userId" FROM "user_profiles" up WHERE n."userProfileId" = up.id;
ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_userProfileId_fkey";
ALTER TABLE "notes" DROP COLUMN "userProfileId";
ALTER TABLE "notes" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "offline_downloads" ADD COLUMN "userId" TEXT;
UPDATE "offline_downloads" od SET "userId" = up."userId" FROM "user_profiles" up WHERE od."userProfileId" = up.id;
ALTER TABLE "offline_downloads" DROP CONSTRAINT IF EXISTS "offline_downloads_userProfileId_fkey";
ALTER TABLE "offline_downloads" DROP COLUMN "userProfileId";
ALTER TABLE "offline_downloads" ALTER COLUMN "userId" SET NOT NULL;
DROP INDEX IF EXISTS "offline_downloads_userProfileId_audiobookId_key";
CREATE UNIQUE INDEX "offline_downloads_userId_audiobookId_key" ON "offline_downloads"("userId", "audiobookId");

ALTER TABLE "listening_history" ADD COLUMN "userId" TEXT;
UPDATE "listening_history" lh SET "userId" = up."userId" FROM "user_profiles" up WHERE lh."userProfileId" = up.id;
ALTER TABLE "listening_history" DROP CONSTRAINT IF EXISTS "listening_history_userProfileId_fkey";
ALTER TABLE "listening_history" DROP COLUMN "userProfileId";
ALTER TABLE "listening_history" ALTER COLUMN "userId" SET NOT NULL;
DROP INDEX IF EXISTS "listening_history_userProfileId_audiobookId_key";
CREATE UNIQUE INDEX "listening_history_userId_audiobookId_key" ON "listening_history"("userId", "audiobookId");

UPDATE "author_reviews" ar SET "reviewerId" = up."userId"
FROM "user_profiles" up
WHERE ar."reviewerType" = 'USER' AND ar."reviewerId" = up.id;

UPDATE "organization_reviews" orv SET "reviewerId" = up."userId"
FROM "user_profiles" up
WHERE orv."reviewerType" = 'USER' AND orv."reviewerId" = up.id;

DROP TABLE IF EXISTS "author_profiles";
DROP TABLE IF EXISTS "user_profiles";

DELETE FROM "image_assets" WHERE category IN ('author', 'user');
DELETE FROM "image_placeholder_specs" WHERE category IN ('author', 'user');

CREATE TYPE "ImageCategory_new" AS ENUM ('audiobook', 'chapter');
ALTER TABLE "image_assets" ALTER COLUMN "category" TYPE "ImageCategory_new" USING ("category"::text::"ImageCategory_new");
ALTER TABLE "image_placeholder_specs" ALTER COLUMN "category" TYPE "ImageCategory_new" USING ("category"::text::"ImageCategory_new");
DROP TYPE "ImageCategory";
ALTER TYPE "ImageCategory_new" RENAME TO "ImageCategory";
