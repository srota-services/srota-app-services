-- Authoring chapters may omit a cover image; publication chapters still require one at the API layer.
ALTER TABLE "chapters" ALTER COLUMN "coverImage" DROP NOT NULL;
