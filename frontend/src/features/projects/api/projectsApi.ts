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

export interface ProjectsPage {
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

export interface TransitionRule {
  projectId: string;
  fromStatusId: string;
  toStatusId: string;
  createdAt: string;
}

export type EraState = 'planned' | 'active' | 'completed';

export interface ProjectEra {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  state: EraState;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEraPayload {
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
}

export interface UpdateEraPayload {
  name?: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateStatusPayload {
  name: string;
  statusGroup: StatusGroup;
  position?: number;
}

export interface UpdateStatusPayload {
  name?: string;
  statusGroup?: StatusGroup;
  position?: number;
}

export interface CreateWorkItemTypePayload {
  name: string;
  estimateUnit: EstimateUnit;
  position?: number;
  allowedChildTypeIds?: string[];
}

export interface UpdateWorkItemTypePayload {
  name?: string;
  estimateUnit?: EstimateUnit;
  position?: number;
  allowedChildTypeIds?: string[];
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

interface TransitionRuleDto {
  project_id: string;
  from_status_id: string;
  to_status_id: string;
  created_at: string;
}

interface ProjectEraDto {
  id: string;
  project_id: string;
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  state: EraState;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
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

function toTransitionRule(dto: TransitionRuleDto): TransitionRule {
  return {
    projectId: dto.project_id,
    fromStatusId: dto.from_status_id,
    toStatusId: dto.to_status_id,
    createdAt: dto.created_at,
  };
}

function toProjectEra(dto: ProjectEraDto): ProjectEra {
  return {
    id: dto.id,
    projectId: dto.project_id,
    name: dto.name,
    goal: dto.goal,
    startDate: dto.start_date,
    endDate: dto.end_date,
    state: dto.state,
    closedAt: dto.closed_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export async function listProjects(
  workspaceId: string,
  page: number,
  signal?: AbortSignal,
): Promise<ProjectsPage> {
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

export async function createProjectStatus(
  projectId: string,
  payload: CreateStatusPayload,
): Promise<ProjectStatus> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/statuses`;
  const body: Record<string, unknown> = {
    name: payload.name,
    status_group: payload.statusGroup,
  };
  if (payload.position !== undefined) body.position = payload.position;
  return toStatus(await apiRequest<ProjectStatusDto>(path, { method: 'POST', body }));
}

export async function updateProjectStatus(
  projectId: string,
  statusId: string,
  payload: UpdateStatusPayload,
): Promise<ProjectStatus> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/statuses/${encodeURIComponent(statusId)}`;
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.statusGroup !== undefined) body.status_group = payload.statusGroup;
  if (payload.position !== undefined) body.position = payload.position;
  return toStatus(await apiRequest<ProjectStatusDto>(path, { method: 'PATCH', body }));
}

export async function deleteProjectStatus(
  projectId: string,
  statusId: string,
  replacementStatusId: string,
): Promise<void> {
  const query = new URLSearchParams({ replacement_status_id: replacementStatusId });
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/statuses/${encodeURIComponent(statusId)}?${query}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}

export async function createProjectWorkItemType(
  projectId: string,
  payload: CreateWorkItemTypePayload,
): Promise<ProjectWorkItemType> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/work-item-types`;
  const body: Record<string, unknown> = {
    name: payload.name,
    estimate_unit: payload.estimateUnit,
    allowed_child_type_ids: payload.allowedChildTypeIds ?? [],
  };
  if (payload.position !== undefined) body.position = payload.position;
  return toWorkItemType(await apiRequest<ProjectWorkItemTypeDto>(path, { method: 'POST', body }));
}

export async function updateProjectWorkItemType(
  projectId: string,
  typeId: string,
  payload: UpdateWorkItemTypePayload,
): Promise<ProjectWorkItemType> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/work-item-types/${encodeURIComponent(typeId)}`;
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.estimateUnit !== undefined) body.estimate_unit = payload.estimateUnit;
  if (payload.position !== undefined) body.position = payload.position;
  if (payload.allowedChildTypeIds !== undefined) {
    body.allowed_child_type_ids = payload.allowedChildTypeIds;
  }
  return toWorkItemType(await apiRequest<ProjectWorkItemTypeDto>(path, { method: 'PATCH', body }));
}

export async function deleteProjectWorkItemType(
  projectId: string,
  typeId: string,
  replacementTypeId: string,
): Promise<void> {
  const query = new URLSearchParams({ replacement_type_id: replacementTypeId });
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/work-item-types/${encodeURIComponent(typeId)}?${query}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}

export async function listProjectTransitionRules(
  projectId: string,
  signal?: AbortSignal,
): Promise<TransitionRule[]> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/transition-rules`;
  const dto = await apiRequest<ListDto<TransitionRuleDto>>(path, { signal });
  return dto.items.map(toTransitionRule);
}

export async function addProjectTransitionRule(
  projectId: string,
  fromStatusId: string,
  toStatusId: string,
): Promise<TransitionRule> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/transition-rules`;
  return toTransitionRule(
    await apiRequest<TransitionRuleDto>(path, {
      method: 'POST',
      body: { from_status_id: fromStatusId, to_status_id: toStatusId },
    }),
  );
}

export async function removeProjectTransitionRule(
  projectId: string,
  fromStatusId: string,
  toStatusId: string,
): Promise<void> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/transition-rules/${encodeURIComponent(fromStatusId)}/${encodeURIComponent(toStatusId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}

export async function listProjectEras(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectEra[]> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/eras`;
  const dto = await apiRequest<ListDto<ProjectEraDto>>(path, { signal });
  return dto.items.map(toProjectEra);
}

export async function createProjectEra(
  projectId: string,
  payload: CreateEraPayload,
): Promise<ProjectEra> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/eras`;
  return toProjectEra(
    await apiRequest<ProjectEraDto>(path, {
      method: 'POST',
      body: {
        name: payload.name,
        goal: payload.goal ?? '',
        start_date: payload.startDate,
        end_date: payload.endDate,
      },
    }),
  );
}

export async function updateProjectEra(
  projectId: string,
  eraId: string,
  payload: UpdateEraPayload,
): Promise<ProjectEra> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/eras/${encodeURIComponent(eraId)}`;
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.goal !== undefined) body.goal = payload.goal;
  if (payload.startDate !== undefined) body.start_date = payload.startDate;
  if (payload.endDate !== undefined) body.end_date = payload.endDate;
  return toProjectEra(await apiRequest<ProjectEraDto>(path, { method: 'PATCH', body }));
}

export async function startProjectEra(projectId: string, eraId: string): Promise<ProjectEra> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/eras/${encodeURIComponent(eraId)}/start`;
  return toProjectEra(await apiRequest<ProjectEraDto>(path, { method: 'POST' }));
}

export async function closeProjectEra(
  projectId: string,
  eraId: string,
  nextEraId: string | null,
): Promise<ProjectEra> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/eras/${encodeURIComponent(eraId)}/close`;
  return toProjectEra(
    await apiRequest<ProjectEraDto>(path, {
      method: 'POST',
      body: { next_era_id: nextEraId },
    }),
  );
}

export async function deleteProjectEra(projectId: string, eraId: string): Promise<void> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/eras/${encodeURIComponent(eraId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}
