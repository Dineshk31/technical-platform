import type { UserRoleCode } from '@technical-platform/shared';
import { apiFetch } from './api-client';
import type { PaginatedResult } from './practice-api';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRoleCode;
  department: string | null;
  batch: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  role?: UserRoleCode;
  search?: string;
  department?: string;
  batch?: string;
}

export interface UpdateUserInput {
  role?: UserRoleCode;
  department?: string | null;
  batch?: string | null;
  isActive?: boolean;
}

function toQueryString(params: object): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function listUsers(params: ListUsersParams = {}) {
  return apiFetch<PaginatedResult<UserDto>>(`/users${toQueryString(params)}`);
}

export function updateUser(id: string, input: UpdateUserInput) {
  return apiFetch<UserDto>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
