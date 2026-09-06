import { z } from 'zod';
import { USER_ROLE_CODES } from '@technical-platform/shared';

export const CreateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(200),
  role: z.enum(USER_ROLE_CODES),
  department: z.string().trim().max(200).optional(),
  batch: z.string().trim().max(100).optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(USER_ROLE_CODES).optional(),
});
export type ListUsersQueryInput = z.infer<typeof ListUsersQuerySchema>;
