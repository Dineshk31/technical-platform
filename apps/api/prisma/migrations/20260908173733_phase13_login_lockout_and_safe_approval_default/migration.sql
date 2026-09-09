-- AlterTable
ALTER TABLE "questions" ALTER COLUMN "approval_status" SET DEFAULT 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(6);
