export const userRoles = ['admin', 'user'] as const;
export type UserRole = (typeof userRoles)[number];

export interface SessionUser {
  id: string;
  login: string | null;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}
