import request from 'supertest';

type Server = Parameters<typeof request>[0];

export interface VerificationBody {
  status: 'UNVERIFIED' | 'PENDING' | 'PASSED' | 'FAILED';
  solutions: {
    language: string;
    status: string;
    verdict: string | null;
    testsPassed: number;
    testsTotal: number;
    failures: { isHidden: boolean; status: string; input: string; expectedOutput: string; actualOutput: string | null }[];
  }[];
}

/**
 * Phase 18: creating a coding question starts reference-solution verification in the
 * real execution service. Polls the admin detail until that run leaves PENDING.
 */
export async function waitForVerification(server: Server, adminToken: string, questionId: string, timeoutMs = 30_000): Promise<VerificationBody> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(server).get(`/api/v1/questions/${questionId}`).set('Authorization', `Bearer ${adminToken}`);
    const verification = res.body.verification as VerificationBody | undefined;
    if (verification && verification.status !== 'PENDING') return verification;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Verification of question ${questionId} did not finish within ${timeoutMs}ms`);
}

/** Waits for verification to pass, then approves — the only way a coding question can be approved now. */
export async function approveVerifiedCodingQuestion(server: Server, adminToken: string, questionId: string): Promise<void> {
  const verification = await waitForVerification(server, adminToken, questionId);
  if (verification.status !== 'PASSED') {
    throw new Error(`Fixture question ${questionId} failed verification: ${JSON.stringify(verification.solutions)}`);
  }
  const res = await request(server)
    .post(`/api/v1/questions/${questionId}/review`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'APPROVED' });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Approving question ${questionId} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}
