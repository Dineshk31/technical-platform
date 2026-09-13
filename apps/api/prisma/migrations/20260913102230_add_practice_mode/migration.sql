-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "user_id" UUID,
ALTER COLUMN "attempt_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "practice_code_drafts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "language" "programming_language" NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practice_code_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_code_drafts_user_id_idx" ON "practice_code_drafts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_code_drafts_user_id_question_id_language_key" ON "practice_code_drafts"("user_id", "question_id", "language");

-- CreateIndex
CREATE INDEX "submissions_user_id_question_id_idx" ON "submissions"("user_id", "question_id");

-- AddForeignKey
ALTER TABLE "practice_code_drafts" ADD CONSTRAINT "practice_code_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_code_drafts" ADD CONSTRAINT "practice_code_drafts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "coding_questions"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
