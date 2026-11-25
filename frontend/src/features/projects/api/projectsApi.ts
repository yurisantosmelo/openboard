import { apiRequest } from '../../../shared/api/httpClient';
import type { WorkspaceRole } from '../../organizations/api/organizationsApi';

export const PAGE_SIZE = 20;

export type StatusGroup = 'not_committed' | 'planned' | 'started' | 'completed';
export type EstimateUnit = 'story_points' | 'hours' | 'none';

export interface Project {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentUserRole: WorkspaceRole;
}

export interface ProjectPage {
  items: Project[];
  page: number;
  totalPages: number;
}

export interface ProjectStatus {
  id: string;
  projectId: string;
  name: string;
  statusGroup: StatusGroup;
  position: number;
  createdAt: string;
}

export interface ProjectWorkItemType {
  id: string;
  projectId: string;
  name: string;
  estimateUnit: EstimateUnit;
  position: number;
  allowedChildTypeIds: string[];
  createdAt: string;
}

interface ProjectDto {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  current_user_role: WorkspaceRole;
}

interface PageDto<T> {
  items: T[];
  page: number;
  total_pages: number;
}

interface ListDto<T> {
  items: T[];
}

interface ProjectStatusDto {
  id: string;
  project_id: string;
  name: string;
  status_group: StatusGroup;
  position: number;
  created_at: string;
}

interface ProjectWorkItemTypeDto {
  id: string;
  project_id: string;
  name: string;
  estimate_unit: EstimateUnit;
  position: number;
  allowed_child_type_ids: string[];
  created_at: string;
}

function toProject(dto: ProjectDto): Project {
  return {
    id: dto.id,
    organizationId: dto.organization_id,
    workspaceId: dto.workspace_id,
    name: dto.name,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    currentUserRole: dto.current_user_role,
  };
}

function toStatus(dto: ProjectStatusDto): ProjectStatus {
  return {
    id: dto.id,
    projectId: dto.project_id,
    name: dto.name,
    statusGroup: dto.status_group,
    position: dto.position,
    createdAt: dto.created_at,
  };
}

function toWorkItemType(dto: ProjectWorkItemTypeDto): ProjectWorkItemType {
  return {
    id: dto.id,
    projectId: dto.project_id,
    name: dto.name,
    estimateUnit: dto.estimate_unit,
    position: dto.position,
    allowedChildTypeIds: dto.allowed_child_type_ids,
    createdAt: dto.created_at,
  };
}

export async function listProjects(
  workspaceId: string,
  page: number,
  signal?: AbortSignal,
): Promise<ProjectPage> {
  const query = new URLSearchParams({
    workspace_id: workspaceId,
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  const dto = await apiRequest<PageDto<ProjectDto>>(`/api/v1/projects?${query}`, { signal });
  return {
    items: dto.items.map(toProject),
    page: dto.page,
    totalPages: dto.total_pages,
  };
}

export async function getProject(projectId: string, signal?: AbortSignal): Promise<Project> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}`;
  return toProject(await apiRequest<ProjectDto>(path, { signal }));
}

export async function createProject(workspaceId: string, name: string): Promise<Project> {
  const dto = await apiRequest<ProjectDto>('/api/v1/projects', {
    method: 'POST',
    body: { workspace_id: workspaceId, name },
  });
  return toProject(dto);
}

export async function renameProject(projectId: string, name: string): Promise<Project> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}`;
  return toProject(await apiRequest<ProjectDto>(path, { method: 'PATCH', body: { name } }));
}

export async function listProjectStatuses(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectStatus[]> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/statuses`;
  const dto = await apiRequest<ListDto<ProjectStatusDto>>(path, { signal });
  return dto.items.map(toStatus);
}

export async function listProjectWorkItemTypes(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectWorkItemType[]> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/work-item-types`;
  const dto = await apiRequest<ListDto<ProjectWorkItemTypeDto>>(path, { signal });
  return dto.items.map(toWorkItemType);
}
