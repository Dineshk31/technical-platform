-- CreateEnum
CREATE TYPE "lesson_question_role" AS ENUM ('CHECK', 'PRACTICE');

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "lesson_questions" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "role" "lesson_question_role" NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lesson_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_check_responses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_option_ids" UUID[],
    "is_correct" BOOLEAN NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_check_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_questions_question_id_idx" ON "lesson_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_questions_lesson_id_question_id_key" ON "lesson_questions"("lesson_id", "question_id");

-- CreateIndex
CREATE INDEX "lesson_check_responses_lesson_id_idx" ON "lesson_check_responses"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_check_responses_user_id_lesson_id_question_id_key" ON "lesson_check_responses"("user_id", "lesson_id", "question_id");

-- AddForeignKey
ALTER TABLE "lesson_questions" ADD CONSTRAINT "lesson_questions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_questions" ADD CONSTRAINT "lesson_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_check_responses" ADD CONSTRAINT "lesson_check_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_check_responses" ADD CONSTRAINT "lesson_check_responses_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_check_responses" ADD CONSTRAINT "lesson_check_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

