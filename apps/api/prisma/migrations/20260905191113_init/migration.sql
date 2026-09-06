-- CreateEnum
CREATE TYPE "user_role_code" AS ENUM ('ADMIN', 'STUDENT');

-- CreateEnum
CREATE TYPE "assessment_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "section_type" AS ENUM ('CODING', 'MCQ');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('CODING', 'MCQ');

-- CreateEnum
CREATE TYPE "question_source" AS ENUM ('MANUAL', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_EDIT');

-- CreateEnum
CREATE TYPE "difficulty_level" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "programming_language" AS ENUM ('CPP', 'JAVA', 'PYTHON');

-- CreateEnum
CREATE TYPE "mcq_type" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'CODE_OUTPUT', 'SCENARIO');

-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "submission_kind" AS ENUM ('RUN', 'SUBMIT');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('PENDING', 'RUNNING', 'ACCEPTED', 'WRONG_ANSWER', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'INTERNAL_ERROR');

-- CreateEnum
CREATE TYPE "execution_job_status" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ai_request_status" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "participant_source" AS ENUM ('DIRECT', 'GROUP');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" "user_role_code" NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "department" TEXT,
    "batch" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "type" "question_type" NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" "difficulty_level" NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "marks" DECIMAL(6,2) NOT NULL,
    "source" "question_source" NOT NULL DEFAULT 'MANUAL',
    "approval_status" "approval_status" NOT NULL DEFAULT 'APPROVED',
    "created_by" UUID NOT NULL,
    "ai_generation_request_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coding_questions" (
    "question_id" UUID NOT NULL,
    "problem_statement" TEXT NOT NULL,
    "input_format" TEXT NOT NULL,
    "output_format" TEXT NOT NULL,
    "constraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "examples" JSONB NOT NULL DEFAULT '[]',
    "time_limit_seconds" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "memory_limit_mb" INTEGER NOT NULL DEFAULT 256,

    CONSTRAINT "coding_questions_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "coding_question_languages" (
    "question_id" UUID NOT NULL,
    "language" "programming_language" NOT NULL,

    CONSTRAINT "coding_question_languages_pkey" PRIMARY KEY ("question_id","language")
);

-- CreateTable
CREATE TABLE "coding_reference_solutions" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "language" "programming_language" NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "coding_reference_solutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coding_test_cases" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "input" TEXT NOT NULL,
    "expected_output" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coding_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcq_questions" (
    "question_id" UUID NOT NULL,
    "mcq_type" "mcq_type" NOT NULL,
    "question_text" TEXT NOT NULL,
    "code_snippet" TEXT,
    "explanation" TEXT,
    "negative_marking_value" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "mcq_questions_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "mcq_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mcq_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation_requests" (
    "id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "section_type" "question_type" NOT NULL DEFAULT 'CODING',
    "topic" TEXT NOT NULL,
    "difficulty" "difficulty_level" NOT NULL,
    "count_requested" INTEGER NOT NULL,
    "language_hint" "programming_language",
    "marks_hint" DECIMAL(6,2),
    "time_limit_hint" DECIMAL(5,2),
    "memory_limit_hint" INTEGER,
    "prompt_snapshot" TEXT NOT NULL,
    "raw_response" JSONB,
    "status" "ai_request_status" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_generation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_reviews" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "reviewed_by" UUID,
    "status" "approval_status" NOT NULL,
    "review_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "max_marks" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "status" "assessment_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_sections" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "section_type" "section_type" NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assessment_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "marks_override" DECIMAL(6,2),
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_participants" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "participant_source" NOT NULL DEFAULT 'DIRECT',
    "group_label" TEXT,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "status" "attempt_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "kind" "submission_kind" NOT NULL,
    "language" "programming_language" NOT NULL,
    "code" TEXT NOT NULL,
    "status" "submission_status" NOT NULL DEFAULT 'PENDING',
    "score" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "tests_passed" INTEGER NOT NULL DEFAULT 0,
    "tests_total" INTEGER NOT NULL DEFAULT 0,
    "runtime_ms" INTEGER,
    "memory_kb" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_test_results" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "is_hidden" BOOLEAN NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "actual_output" TEXT,
    "runtime_ms" INTEGER,
    "memory_kb" INTEGER,
    "error_message" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "submission_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_jobs" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "status" "execution_job_status" NOT NULL DEFAULT 'QUEUED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "execution_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcq_responses" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "is_correct" BOOLEAN,
    "score" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcq_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcq_response_options" (
    "response_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,

    CONSTRAINT "mcq_response_options_pkey" PRIMARY KEY ("response_id","option_id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "total_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "max_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "coding_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "mcq_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "questions_attempted" INTEGER NOT NULL DEFAULT 0,
    "questions_solved" INTEGER NOT NULL DEFAULT 0,
    "time_taken_seconds" INTEGER NOT NULL DEFAULT 0,
    "submission_count" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "finalized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_department_batch_idx" ON "users"("department", "batch");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "questions_type_approval_status_idx" ON "questions"("type", "approval_status");

-- CreateIndex
CREATE INDEX "questions_difficulty_idx" ON "questions"("difficulty");

-- CreateIndex
CREATE INDEX "questions_topics_idx" ON "questions" USING GIN ("topics");

-- CreateIndex
CREATE UNIQUE INDEX "coding_reference_solutions_question_id_language_key" ON "coding_reference_solutions"("question_id", "language");

-- CreateIndex
CREATE INDEX "coding_test_cases_question_id_idx" ON "coding_test_cases"("question_id");

-- CreateIndex
CREATE INDEX "mcq_options_question_id_idx" ON "mcq_options"("question_id");

-- CreateIndex
CREATE INDEX "question_reviews_question_id_idx" ON "question_reviews"("question_id");

-- CreateIndex
CREATE INDEX "assessments_status_idx" ON "assessments"("status");

-- CreateIndex
CREATE INDEX "assessments_start_at_end_at_idx" ON "assessments"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "assessment_sections_assessment_id_idx" ON "assessment_sections"("assessment_id");

-- CreateIndex
CREATE INDEX "assessment_questions_question_id_idx" ON "assessment_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_section_id_question_id_key" ON "assessment_questions"("section_id", "question_id");

-- CreateIndex
CREATE INDEX "assessment_participants_user_id_idx" ON "assessment_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_participants_assessment_id_user_id_key" ON "assessment_participants"("assessment_id", "user_id");

-- CreateIndex
CREATE INDEX "attempts_user_id_idx" ON "attempts"("user_id");

-- CreateIndex
CREATE INDEX "attempts_status_ends_at_idx" ON "attempts"("status", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_assessment_id_user_id_key" ON "attempts"("assessment_id", "user_id");

-- CreateIndex
CREATE INDEX "submissions_attempt_id_question_id_idx" ON "submissions"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "submissions_status_idx" ON "submissions"("status");

-- CreateIndex
CREATE INDEX "submission_test_results_submission_id_idx" ON "submission_test_results"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "execution_jobs_submission_id_key" ON "execution_jobs"("submission_id");

-- CreateIndex
CREATE INDEX "execution_jobs_status_created_at_idx" ON "execution_jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mcq_responses_attempt_id_question_id_key" ON "mcq_responses"("attempt_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_attempt_id_key" ON "results"("attempt_id");

-- CreateIndex
CREATE INDEX "results_assessment_id_rank_idx" ON "results"("assessment_id", "rank");

-- CreateIndex
CREATE INDEX "results_user_id_idx" ON "results"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_ai_generation_request_id_fkey" FOREIGN KEY ("ai_generation_request_id") REFERENCES "ai_generation_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coding_questions" ADD CONSTRAINT "coding_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coding_question_languages" ADD CONSTRAINT "coding_question_languages_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "coding_questions"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coding_reference_solutions" ADD CONSTRAINT "coding_reference_solutions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "coding_questions"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coding_test_cases" ADD CONSTRAINT "coding_test_cases_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "coding_questions"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_questions" ADD CONSTRAINT "mcq_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_options" ADD CONSTRAINT "mcq_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "mcq_questions"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_requests" ADD CONSTRAINT "ai_generation_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_reviews" ADD CONSTRAINT "question_reviews_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_reviews" ADD CONSTRAINT "question_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "assessment_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_participants" ADD CONSTRAINT "assessment_participants_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_participants" ADD CONSTRAINT "assessment_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "coding_questions"("question_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_test_results" ADD CONSTRAINT "submission_test_results_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_test_results" ADD CONSTRAINT "submission_test_results_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "coding_test_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_responses" ADD CONSTRAINT "mcq_responses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_responses" ADD CONSTRAINT "mcq_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "mcq_questions"("question_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_response_options" ADD CONSTRAINT "mcq_response_options_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "mcq_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_response_options" ADD CONSTRAINT "mcq_response_options_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "mcq_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
