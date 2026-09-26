-- AlterEnum
ALTER TYPE "submission_kind" ADD VALUE 'VERIFY';

-- AlterTable
ALTER TABLE "coding_reference_solutions" ADD COLUMN     "verification_submission_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "coding_reference_solutions_verification_submission_id_key" ON "coding_reference_solutions"("verification_submission_id");

-- AddForeignKey
ALTER TABLE "coding_reference_solutions" ADD CONSTRAINT "coding_reference_solutions_verification_submission_id_fkey" FOREIGN KEY ("verification_submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

