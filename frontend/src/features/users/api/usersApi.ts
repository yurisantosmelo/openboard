import { apiRequest } from '../../../shared/api/httpClient';

export const PAGE_SIZE = 20;

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  isAdministrator: boolean;
  mustChangePassword: boolean;
  deactivatedAt: string | null;
  createdAt: string;
}

export interface IssuedTemporaryPassword extends AdminUser {
  temporaryPassword: string;
}

export interface UserPage {
  items: AdminUser[];
  page: number;
  totalPages: number;
}

interface AdminUserDto {
  id: string;
  username: string;
  name: string;
  is_administrator: boolean;
  must_change_password: boolean;
  deactivated_at: string | null;
  created_at: string;
}

interface IssuedTemporaryPasswordDto extends AdminUserDto {
  temporary_password: string;
}

interface PageDto<T> {
  items: T[];
  page: number;
  total_pages: number;
}

function toAdminUser(dto: AdminUserDto): AdminUser {
  return {
    id: dto.id,
    username: dto.username,
    name: dto.name,
    isAdministrator: dto.is_administrator,
    mustChangePassword: dto.must_change_password,
    deactivatedAt: dto.deactivated_at,
    createdAt: dto.created_at,
  };
}

export async function listUsers(page: number, signal?: AbortSignal): Promise<UserPage> {
  const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  const dto = await apiRequest<PageDto<AdminUserDto>>(`/api/v1/users?${query}`, { signal });
  return {
    items: dto.items.map(toAdminUser),
    page: dto.page,
    totalPages: dto.total_pages,
  };
}

export async function deactivateUser(userId: string): Promise<AdminUser> {
  const path = `/api/v1/users/${encodeURIComponent(userId)}/deactivate`;
  return toAdminUser(await apiRequest<AdminUserDto>(path, { method: 'POST' }));
}

export async function reactivateUser(userId: string): Promise<AdminUser> {
  const path = `/api/v1/users/${encodeURIComponent(userId)}/reactivate`;
  return toAdminUser(await apiRequest<AdminUserDto>(path, { method: 'POST' }));
}

export async function issueTemporaryPassword(userId: string): Promise<IssuedTemporaryPassword> {
  const path = `/api/v1/users/${encodeURIComponent(userId)}/temporary-password`;
  const dto = await apiRequest<IssuedTemporaryPasswordDto>(path, { method: 'POST' });
  return {
    ...toAdminUser(dto),
    temporaryPassword: dto.temporary_password,
  };
}
