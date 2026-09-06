import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export type RefreshInput = z.infer<typeof RefreshSchema>;
