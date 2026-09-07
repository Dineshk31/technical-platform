import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { ConfigService } from '@nestjs/config';

const generateContentMock: Mock = vi.fn();

class FakeApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

class FakeGoogleGenAI {
  models = { generateContent: generateContentMock };
}

vi.mock('@google/genai', () => ({
  GoogleGenAI: FakeGoogleGenAI,
  ApiError: FakeApiError,
  Type: {
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT',
  },
}));

const { GeminiProvider } = await import('./gemini.provider.js');

function configWith(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const VALID_REQUEST = {
  topic: 'Arrays' as const,
  difficulty: 'MEDIUM' as const,
  language: 'PYTHON' as const,
  count: 1,
};

function validCandidate(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Max Subarray Sum',
    problemStatement: 'Given an array, find the maximum sum of a contiguous subarray.',
    inputFormat: 'n, then n integers',
    outputFormat: 'the max sum',
    constraints: ['1 <= n <= 1000'],
    examples: [{ input: '3\n1 2 3', output: '6', explanation: 'sum all' }],
    difficulty: 'MEDIUM',
    topics: ['Arrays'],
    tags: [],
    marks: 10,
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    supportedLanguages: ['PYTHON'],
    referenceSolutions: { PYTHON: 'print(sum(map(int, input().split())))' },
    starterTemplates: {},
    publicTestCases: [{ input: '1', expectedOutput: '1' }],
    hiddenTestCases: [{ input: '2', expectedOutput: '2' }],
    solutionApproach: 'Kadane\'s algorithm.',
    ...overrides,
  };
}

describe('GeminiProvider', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('reports AI_PROVIDER_NOT_CONFIGURED and never calls the SDK when no API key is set', async () => {
    const provider = new GeminiProvider(configWith({ GEMINI_API_KEY: undefined, GEMINI_MODEL: undefined }));
    const result = await provider.generateCodingQuestions(VALID_REQUEST);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AI_PROVIDER_NOT_CONFIGURED');
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('returns parsed candidates on a successful structured response', async () => {
    const candidates = [validCandidate()];
    generateContentMock.mockResolvedValueOnce({ text: JSON.stringify(candidates) });

    const provider = new GeminiProvider(configWith({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-test' }));
    const result = await provider.generateCodingQuestions(VALID_REQUEST);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(candidates);
    expect(result.promptSnapshot).toContain('Arrays');
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock.mock.calls[0][0]).toMatchObject({ model: 'gemini-test' });
  });

  it('reports AI_RESPONSE_MALFORMED for non-JSON text without retrying', async () => {
    generateContentMock.mockResolvedValueOnce({ text: 'not json at all' });
    const provider = new GeminiProvider(configWith({ GEMINI_API_KEY: 'test-key' }));
    const result = await provider.generateCodingQuestions(VALID_REQUEST);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AI_RESPONSE_MALFORMED');
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('reports AI_RESPONSE_MALFORMED when the JSON is not an array', async () => {
    generateContentMock.mockResolvedValueOnce({ text: JSON.stringify({ not: 'an array' }) });
    const provider = new GeminiProvider(configWith({ GEMINI_API_KEY: 'test-key' }));
    const result = await provider.generateCodingQuestions(VALID_REQUEST);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AI_RESPONSE_MALFORMED');
  });

  it('retries on a 429 and succeeds on the second attempt', async () => {
    generateContentMock.mockRejectedValueOnce(new FakeApiError(429, 'rate limited')).mockResolvedValueOnce({
      text: JSON.stringify([validCandidate()]),
    });
    const provider = new GeminiProvider(configWith({ GEMINI_API_KEY: 'test-key' }));
    const result = await provider.generateCodingQuestions(VALID_REQUEST);
    expect(result.success).toBe(true);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a 401 (invalid API key) and reports it immediately', async () => {
    generateContentMock.mockRejectedValueOnce(new FakeApiError(401, 'unauthorized'));
    const provider = new GeminiProvider(configWith({ GEMINI_API_KEY: 'bad-key' }));
    const result = await provider.generateCodingQuestions(VALID_REQUEST);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AI_INVALID_API_KEY');
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries on repeated 5xx errors', async () => {
    generateContentMock.mockRejectedValue(new FakeApiError(503, 'unavailable'));
    const provider = new GeminiProvider(configWith({ GEMINI_API_KEY: 'test-key' }));
    const result = await provider.generateCodingQuestions(VALID_REQUEST);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(generateContentMock).toHaveBeenCalledTimes(3);
  });
});
