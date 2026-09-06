-- CreateTable
CREATE TABLE "coding_starter_templates" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "language" "programming_language" NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "coding_starter_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_code_drafts" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "language" "programming_language" NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attempt_code_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coding_starter_templates_question_id_language_key" ON "coding_starter_templates"("question_id", "language");

-- CreateIndex
CREATE INDEX "attempt_code_drafts_attempt_id_idx" ON "attempt_code_drafts"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_code_drafts_attempt_id_question_id_language_key" ON "attempt_code_drafts"("attempt_id", "question_id", "language");

-- AddForeignKey
ALTER TABLE "coding_starter_templates" ADD CONSTRAINT "coding_starter_templates_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "coding_questions"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_code_drafts" ADD CONSTRAINT "attempt_code_drafts_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_code_drafts" ADD CONSTRAINT "attempt_code_drafts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "coding_questions"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;
