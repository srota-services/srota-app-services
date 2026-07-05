-- CreateEnum
CREATE TYPE "AudiobookType" AS ENUM ('PUBLICATION', 'AUTHORING');

-- AlterTable: STI discriminator on audiobooks
ALTER TABLE "audiobooks" ADD COLUMN "type" "AudiobookType" NOT NULL DEFAULT 'PUBLICATION';
CREATE INDEX "audiobooks_type_idx" ON "audiobooks"("type");

-- AlterTable: nullable audio fields on chapters (authoring chapters)
ALTER TABLE "chapters" ALTER COLUMN "duration" DROP NOT NULL;
ALTER TABLE "chapters" ALTER COLUMN "filePath" DROP NOT NULL;
ALTER TABLE "chapters" ALTER COLUMN "fileSize" DROP NOT NULL;
ALTER TABLE "chapters" ALTER COLUMN "startPosition" DROP NOT NULL;
ALTER TABLE "chapters" ALTER COLUMN "endPosition" DROP NOT NULL;

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "plainText" TEXT NOT NULL,
    "richText" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pages_chapterId_pageNumber_key" ON "pages"("chapterId", "pageNumber");
CREATE INDEX "pages_chapterId_idx" ON "pages"("chapterId");

ALTER TABLE "pages" ADD CONSTRAINT "pages_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
