-- AlterTable
ALTER TABLE "meeting" ADD COLUMN     "sourceLanguage" TEXT,
ADD COLUMN     "translated" BOOLEAN NOT NULL DEFAULT false;
