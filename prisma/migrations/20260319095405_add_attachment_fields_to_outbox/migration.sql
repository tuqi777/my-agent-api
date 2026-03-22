-- AlterTable
ALTER TABLE "OutboxEmail" ADD COLUMN     "attachmentInfo" TEXT,
ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentPath" TEXT,
ADD COLUMN     "hasAttachment" BOOLEAN NOT NULL DEFAULT false;
