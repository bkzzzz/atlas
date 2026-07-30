-- Blob metadata is nullable so existing URL-only references remain intact.
ALTER TABLE "ImageAsset"
ADD COLUMN "blobPathname" TEXT,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "byteSize" INTEGER;
