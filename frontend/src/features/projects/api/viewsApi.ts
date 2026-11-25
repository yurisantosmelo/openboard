import { apiRequest } from '../../../shared/api/httpClient';

export type ViewLayout = 'board' | 'list' | 'table' | 'timeline' | 'calendar';
export type ViewVisibility = 'personal' | 'shared';

export interface ProjectViewFilters {
  statusId?: string;
  workItemTypeId?: string;
  priority?: string;
  assigneeId?: string;
  eraId?: string;
}

export interface ProjectView {
  id: string;
  projectId: string;
  name: string;
  layout: ViewLayout;
  visibility: ViewVisibility;
  filters: ProjectViewFilters;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateViewPayload {
  name: string;
  layout: ViewLayout;
  filters?: ProjectViewFilters;
}

export interface UpdateViewPayload {
  name?: string;
  layout?: ViewLayout;
  visibility?: ViewVisibility;
  filters?: ProjectViewFilters;
}

interface ViewFiltersDto {
  status_id?: string;
  work_item_type_id?: string;
  priority?: string;
  assignee_id?: string;
  era_id?: string;
}

interface ProjectViewDto {
  id: string;
  project_id: string;
  name: string;
  layout: ViewLayout;
  visibility: ViewVisibility;
  filters: ViewFiltersDto;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ListDto<T> {
  items: T[];
}

function toViewFilters(dto: ViewFiltersDto | undefined): ProjectViewFilters {
  if (!dto) return {};
  return {
    ...(dto.status_id ? { statusId: dto.status_id } : {}),
    ...(dto.work_item_type_id ? { workItemTypeId: dto.work_item_type_id } : {}),
    ...(dto.priority ? { priority: dto.priority } : {}),
    ...(dto.assignee_id ? { assigneeId: dto.assignee_id } : {}),
    ...(dto.era_id ? { eraId: dto.era_id } : {}),
  };
}

function toViewFiltersDto(filters: ProjectViewFilters | undefined): ViewFiltersDto {
  if (!filters) return {};
  return {
    ...(filters.statusId ? { status_id: filters.statusId } : {}),
    ...(filters.workItemTypeId ? { work_item_type_id: filters.workItemTypeId } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.assigneeId ? { assignee_id: filters.assigneeId } : {}),
    ...(filters.eraId ? { era_id: filters.eraId } : {}),
  };
}

function toProjectView(dto: ProjectViewDto): ProjectView {
  return {
    id: dto.id,
    projectId: dto.project_id,
    name: dto.name,
    layout: dto.layout,
    visibility: dto.visibility,
    filters: toViewFilters(dto.filters),
    createdBy: dto.created_by,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export async function listProjectViews(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectView[]> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/views`;
  const dto = await apiRequest<ListDto<ProjectViewDto>>(path, { signal });
  return dto.items.map(toProjectView);
}

export async function createProjectView(
  projectId: string,
  payload: CreateViewPayload,
): Promise<ProjectView> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/views`;
  return toProjectView(
    await apiRequest<ProjectViewDto>(path, {
      method: 'POST',
      body: {
        name: payload.name,
        layout: payload.layout,
        filters: toViewFiltersDto(payload.filters),
      },
    }),
  );
}

export async function updateProjectView(
  projectId: string,
  viewId: string,
  payload: UpdateViewPayload,
): Promise<ProjectView> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/views/${encodeURIComponent(viewId)}`;
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.layout !== undefined) body.layout = payload.layout;
  if (payload.visibility !== undefined) body.visibility = payload.visibility;
  if (payload.filters !== undefined) body.filters = toViewFiltersDto(payload.filters);
  return toProjectView(await apiRequest<ProjectViewDto>(path, { method: 'PATCH', body }));
}

export async function deleteProjectView(projectId: string, viewId: string): Promise<void> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/views/${encodeURIComponent(viewId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}
