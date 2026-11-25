import { apiRequest } from '../../../shared/api/httpClient';

export const PAGE_SIZE = 20;

export type OrganizationRole = 'owner' | 'contributor';
export type WorkspaceVisibility = 'open' | 'restricted';
export type WorkspaceRole = 'owner' | 'contributor' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  currentUserRole: OrganizationRole;
  deletedAt?: string | null;
  purgeAfter?: string | null;
}

export interface OrganizationMembership {
  organizationId: string;
  userId: string;
  username: string;
  name: string;
  role: OrganizationRole;
  createdAt: string;
}

export interface NewOrganizationMembership {
  organizationId: string;
  username: string;
  name: string;
  role: OrganizationRole;
}

export interface AddedOrganizationMembership extends OrganizationMembership {
  /** Shown once when an unknown Username created a new User. */
  temporaryPassword?: string;
}

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  visibility: WorkspaceVisibility;
  createdAt: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  purgeAfter?: string | null;
  currentUserRole: WorkspaceRole;
}

export interface WorkspaceMembership {
  workspaceId: string;
  organizationId: string;
  userId: string;
  username: string;
  name: string;
  role: WorkspaceRole;
  createdAt: string;
}

export interface NewWorkspaceMembership {
  workspaceId: string;
  username: string;
  role: WorkspaceRole;
}

/** The fields to change in a Workspace; those left out keep their value. */
export interface WorkspaceChange {
  name?: string;
  visibility?: WorkspaceVisibility;
}

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
}

export interface NewWorkspace {
  organizationId: string;
  name: string;
  visibility: WorkspaceVisibility;
}

interface PageDto<T> {
  items: T[];
  page: number;
  total_pages: number;
}

interface OrganizationDto {
  id: string;
  name: string;
  deleted_at?: string | null;
  purge_after?: string | null;
  current_user_role: OrganizationRole;
}

interface OrganizationMembershipDto {
  organization_id: string;
  user_id: string;
  username: string;
  name: string;
  role: OrganizationRole;
  created_at: string;
}

interface AddedOrganizationMembershipDto extends OrganizationMembershipDto {
  temporary_password?: string;
}

interface WorkspaceDto {
  id: string;
  organization_id: string;
  name: string;
  visibility: WorkspaceVisibility;
  created_at: string;
  archived_at?: string | null;
  deleted_at?: string | null;
  purge_after?: string | null;
  current_user_role: WorkspaceRole;
}

interface WorkspaceMembershipDto {
  workspace_id: string;
  organization_id: string;
  user_id: string;
  username: string;
  name: string;
  role: WorkspaceRole;
  created_at: string;
}

function toOrganization(dto: OrganizationDto): Organization {
  return {
    id: dto.id,
    name: dto.name,
    currentUserRole: dto.current_user_role,
    ...(dto.deleted_at !== undefined && { deletedAt: dto.deleted_at }),
    ...(dto.purge_after !== undefined && { purgeAfter: dto.purge_after }),
  };
}

function toOrganizationMembership(dto: OrganizationMembershipDto): OrganizationMembership {
  return {
    organizationId: dto.organization_id,
    userId: dto.user_id,
    username: dto.username,
    name: dto.name,
    role: dto.role,
    createdAt: dto.created_at,
  };
}

function toAddedOrganizationMembership(
  dto: AddedOrganizationMembershipDto,
): AddedOrganizationMembership {
  return {
    ...toOrganizationMembership(dto),
    ...(dto.temporary_password !== undefined && { temporaryPassword: dto.temporary_password }),
  };
}

function toWorkspace(dto: WorkspaceDto): Workspace {
  return {
    id: dto.id,
    organizationId: dto.organization_id,
    name: dto.name,
    visibility: dto.visibility,
    createdAt: dto.created_at,
    archivedAt: dto.archived_at ?? null,
    ...(dto.deleted_at !== undefined && { deletedAt: dto.deleted_at }),
    ...(dto.purge_after !== undefined && { purgeAfter: dto.purge_after }),
    currentUserRole: dto.current_user_role,
  };
}

function toWorkspaceMembership(dto: WorkspaceMembershipDto): WorkspaceMembership {
  return {
    workspaceId: dto.workspace_id,
    organizationId: dto.organization_id,
    userId: dto.user_id,
    username: dto.username,
    name: dto.name,
    role: dto.role,
    createdAt: dto.created_at,
  };
}

function toPage<D, T>(dto: PageDto<D>, toItem: (item: D) => T): Page<T> {
  return { items: dto.items.map(toItem), page: dto.page, totalPages: dto.total_pages };
}

export async function listOrganizations(
  page: number,
  signal?: AbortSignal,
): Promise<Page<Organization>> {
  const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  const dto = await apiRequest<PageDto<OrganizationDto>>(`/api/v1/organizations?${query}`, {
    signal,
  });
  return toPage(dto, toOrganization);
}

export async function getOrganization(id: string, signal?: AbortSignal): Promise<Organization> {
  const path = `/api/v1/organizations/${encodeURIComponent(id)}`;
  return toOrganization(await apiRequest<OrganizationDto>(path, { signal }));
}

/** Creates an Organization whose first Organization Owner is the signed-in User. */
export async function createOrganization(name: string): Promise<Organization> {
  const dto = await apiRequest<OrganizationDto>('/api/v1/organizations', {
    method: 'POST',
    body: { name },
  });
  return toOrganization(dto);
}

export async function listPendingDeletionOrganizations(
  page: number,
  signal?: AbortSignal,
): Promise<Page<Organization>> {
  const query = new URLSearchParams({
    pending_deletion: 'true',
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  const dto = await apiRequest<PageDto<OrganizationDto>>(`/api/v1/organizations?${query}`, {
    signal,
  });
  return toPage(dto, toOrganization);
}

export async function deleteOrganization(id: string): Promise<void> {
  await apiRequest<undefined>(`/api/v1/organizations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function restoreOrganization(id: string): Promise<Organization> {
  const path = `/api/v1/organizations/${encodeURIComponent(id)}/restore`;
  return toOrganization(await apiRequest<OrganizationDto>(path, { method: 'POST' }));
}

export async function listWorkspaces(
  organizationId: string,
  page: number,
  signal?: AbortSignal,
  includeArchived = false,
): Promise<Page<Workspace>> {
  const query = new URLSearchParams({
    organization_id: organizationId,
    page: String(page),
    page_size: String(PAGE_SIZE),
    ...(includeArchived ? { include_archived: 'true' } : {}),
  });
  const dto = await apiRequest<PageDto<WorkspaceDto>>(`/api/v1/workspaces?${query}`, { signal });
  return toPage(dto, toWorkspace);
}

export async function listPendingDeletionWorkspaces(
  organizationId: string,
  page: number,
  signal?: AbortSignal,
): Promise<Page<Workspace>> {
  const query = new URLSearchParams({
    organization_id: organizationId,
    pending_deletion: 'true',
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  const dto = await apiRequest<PageDto<WorkspaceDto>>(`/api/v1/workspaces?${query}`, { signal });
  return toPage(dto, toWorkspace);
}

export async function archiveWorkspace(id: string): Promise<Workspace> {
  const path = `/api/v1/workspaces/${encodeURIComponent(id)}/archive`;
  return toWorkspace(await apiRequest<WorkspaceDto>(path, { method: 'POST' }));
}

export async function unarchiveWorkspace(id: string): Promise<Workspace> {
  const path = `/api/v1/workspaces/${encodeURIComponent(id)}/unarchive`;
  return toWorkspace(await apiRequest<WorkspaceDto>(path, { method: 'POST' }));
}

export async function deleteWorkspace(id: string): Promise<void> {
  await apiRequest<undefined>(`/api/v1/workspaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function restoreWorkspace(id: string): Promise<Workspace> {
  const path = `/api/v1/workspaces/${encodeURIComponent(id)}/restore`;
  return toWorkspace(await apiRequest<WorkspaceDto>(path, { method: 'POST' }));
}

export async function getWorkspace(id: string, signal?: AbortSignal): Promise<Workspace> {
  const path = `/api/v1/workspaces/${encodeURIComponent(id)}`;
  return toWorkspace(await apiRequest<WorkspaceDto>(path, { signal }));
}

export async function createWorkspace(workspace: NewWorkspace): Promise<Workspace> {
  const dto = await apiRequest<WorkspaceDto>('/api/v1/workspaces', {
    method: 'POST',
    body: {
      organization_id: workspace.organizationId,
      name: workspace.name,
      visibility: workspace.visibility,
    },
  });
  return toWorkspace(dto);
}

export async function updateWorkspace(id: string, change: WorkspaceChange): Promise<Workspace> {
  const path = `/api/v1/workspaces/${encodeURIComponent(id)}`;
  return toWorkspace(await apiRequest<WorkspaceDto>(path, { method: 'PATCH', body: change }));
}

export async function listOrganizationMemberships(
  organizationId: string,
  page: number,
  signal?: AbortSignal,
): Promise<Page<OrganizationMembership>> {
  const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  const path = `/api/v1/organizations/${encodeURIComponent(organizationId)}/memberships?${query}`;
  const dto = await apiRequest<PageDto<OrganizationMembershipDto>>(path, { signal });
  return toPage(dto, toOrganizationMembership);
}

export async function addOrganizationMembership(
  membership: NewOrganizationMembership,
): Promise<AddedOrganizationMembership> {
  const path = `/api/v1/organizations/${encodeURIComponent(membership.organizationId)}/memberships`;
  const dto = await apiRequest<AddedOrganizationMembershipDto>(path, {
    method: 'POST',
    body: {
      username: membership.username,
      name: membership.name,
      role: membership.role,
    },
  });
  return toAddedOrganizationMembership(dto);
}

export async function updateOrganizationMembership(
  organizationId: string,
  userId: string,
  role: OrganizationRole,
): Promise<OrganizationMembership> {
  const path = `/api/v1/organizations/${encodeURIComponent(organizationId)}/memberships/${encodeURIComponent(userId)}`;
  const dto = await apiRequest<OrganizationMembershipDto>(path, {
    method: 'PATCH',
    body: { role },
  });
  return toOrganizationMembership(dto);
}

export async function removeOrganizationMembership(
  organizationId: string,
  userId: string,
): Promise<void> {
  const path = `/api/v1/organizations/${encodeURIComponent(organizationId)}/memberships/${encodeURIComponent(userId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}

export async function listWorkspaceMemberships(
  workspaceId: string,
  page: number,
  signal?: AbortSignal,
): Promise<Page<WorkspaceMembership>> {
  const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/memberships?${query}`;
  const dto = await apiRequest<PageDto<WorkspaceMembershipDto>>(path, { signal });
  return toPage(dto, toWorkspaceMembership);
}

export async function addWorkspaceMembership(
  membership: NewWorkspaceMembership,
): Promise<WorkspaceMembership> {
  const path = `/api/v1/workspaces/${encodeURIComponent(membership.workspaceId)}/memberships`;
  const dto = await apiRequest<WorkspaceMembershipDto>(path, {
    method: 'POST',
    body: {
      username: membership.username,
      role: membership.role,
    },
  });
  return toWorkspaceMembership(dto);
}

export async function updateWorkspaceMembership(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<WorkspaceMembership> {
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/memberships/${encodeURIComponent(userId)}`;
  const dto = await apiRequest<WorkspaceMembershipDto>(path, {
    method: 'PATCH',
    body: { role },
  });
  return toWorkspaceMembership(dto);
}

export async function removeWorkspaceMembership(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/memberships/${encodeURIComponent(userId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}
