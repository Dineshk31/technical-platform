import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/index.js';
import bcrypt from 'bcrypt';

const adapter = new PrismaPg(process.env.DATABASE_URL ?? '');
const prisma = new PrismaClient({ adapter });
const PASSWORD_HASH_ROUNDS = 12;

async function main() {
  const [adminRole, studentRole] = await Promise.all([
    prisma.role.upsert({
      where: { code: 'ADMIN' },
      update: {},
      create: { code: 'ADMIN', name: 'Administrator' },
    }),
    prisma.role.upsert({
      where: { code: 'STUDENT' },
      update: {},
      create: { code: 'STUDENT', name: 'Student' },
    }),
  ]);
  console.log('Roles ready: ADMIN, STUDENT');

  await maybeSeedUser({
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    name: 'Platform Admin',
    roleId: adminRole.id,
    roleLabel: 'admin',
  });

  await maybeSeedUser({
    email: process.env.SEED_STUDENT_EMAIL,
    password: process.env.SEED_STUDENT_PASSWORD,
    name: 'Test Student',
    roleId: studentRole.id,
    roleLabel: 'student',
  });

  await seedSampleCodingQuestion();
}

/**
 * One approved, ready-to-attach coding question — Phase 3 (manual question
 * authoring) doesn't exist yet, so Phase 2's "attach a question bank item to
 * an assessment" and "publish" flows need at least one real APPROVED question
 * with public + hidden test cases to exercise against.
 */
async function seedSampleCodingQuestion(): Promise<void> {
  const existing = await prisma.question.findFirst({ where: { title: 'Two Sum' } });
  if (existing) {
    console.log('Sample coding question already exists ("Two Sum") — skipping.');
    return;
  }

  const admin = await prisma.user.findFirst({ where: { role: { code: 'ADMIN' } } });
  if (!admin) {
    console.log('No admin account exists yet — skipping sample coding question.');
    return;
  }

  await prisma.question.create({
    data: {
      type: 'CODING',
      title: 'Two Sum',
      difficulty: 'EASY',
      topics: ['Arrays', 'Hashing'],
      tags: ['sample'],
      marks: 10,
      source: 'MANUAL',
      approvalStatus: 'APPROVED',
      createdById: admin.id,
      codingQuestion: {
        create: {
          problemStatement:
            'Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target.',
          inputFormat: 'First line: n and target. Second line: n space-separated integers.',
          outputFormat: 'Two space-separated indices (0-based), in any order.',
          constraints: ['2 <= n <= 10^4', '-10^9 <= nums[i] <= 10^9', 'Exactly one valid answer exists'],
          examples: [{ input: '4 9\n2 7 11 15', output: '0 1', explanation: 'nums[0] + nums[1] == 9' }],
          timeLimitSeconds: 2,
          memoryLimitMb: 256,
          languages: { create: [{ language: 'CPP' }, { language: 'JAVA' }, { language: 'PYTHON' }] },
          testCases: {
            create: [
              { isHidden: false, input: '4 9\n2 7 11 15', expectedOutput: '0 1', orderIndex: 0 },
              { isHidden: true, input: '3 6\n3 2 4', expectedOutput: '1 2', orderIndex: 1 },
            ],
          },
        },
      },
    },
  });
  console.log('Created sample coding question: Two Sum');
}

async function maybeSeedUser(opts: {
  email: string | undefined;
  password: string | undefined;
  name: string;
  roleId: string;
  roleLabel: string;
}) {
  const { email, password, name, roleId, roleLabel } = opts;

  if (!email || !password) {
    console.log(`Skipping seed ${roleLabel} account — set SEED_${roleLabel.toUpperCase()}_EMAIL/PASSWORD in .env to create one.`);
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`Seed ${roleLabel} account already exists (${email}) — skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
  await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash, name, roleId },
  });
  console.log(`Created seed ${roleLabel} account: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
