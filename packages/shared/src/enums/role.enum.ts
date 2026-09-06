export const USER_ROLE_CODES = ['ADMIN', 'STUDENT'] as const;

export type UserRoleCode = (typeof USER_ROLE_CODES)[number];
