-- AlterTable
ALTER TABLE "meeting" ADD COLUMN     "speakersInferred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transcriptProvider" TEXT;
