import { apiRequest } from '../../../shared/api/httpClient';
import type { WorkspaceRole } from '../../organizations/api/organizationsApi';

export const PAGE_SIZE = 20;

export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface WorkItem {
  id: string;
  organizationId: string;
  projectId: string;
  workItemTypeId: string;
  statusId: string;
  parentId: string | null;
  assigneeId: string | null;
  assigneeUsername: string;
  assigneeName: string;
  title: string;
  description: string;
  priority: Priority;
  storyPoints: number | null;
  hours: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  currentUserRole: WorkspaceRole;
}

export interface WorkItemsPage {
  items: WorkItem[];
  page: number;
  totalPages: number;
}

export interface WorkItemFilters {
  statusId?: string;
  workItemTypeId?: string;
  priority?: Priority | '';
  assigneeId?: string;
}

export interface CreateWorkItemPayload {
  workItemTypeId: string;
  statusId?: string;
  parentId?: string | null;
  assigneeId?: string | null;
  title: string;
  description?: string;
  priority?: Priority;
  storyPoints?: number | null;
  hours?: number | null;
}

export interface UpdateWorkItemPayload {
  title?: string;
  description?: string;
  priority?: Priority;
  workItemTypeId?: string;
  parentId?: string | null;
  assigneeId?: string | null;
  storyPoints?: number | null;
  hours?: number | null;
}

interface WorkItemDto {
  id: string;
  organization_id: string;
  project_id: string;
  work_item_type_id: string;
  status_id: string;
  parent_id: string | null;
  assignee_id: string | null;
  assignee_username?: string;
  assignee_name?: string;
  title: string;
  description: string;
  priority: Priority;
  story_points: number | null;
  hours: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  current_user_role: WorkspaceRole;
}

interface PageDto<T> {
  items: T[];
  page: number;
  total_pages: number;
}

function toWorkItem(dto: WorkItemDto): WorkItem {
  return {
    id: dto.id,
    organizationId: dto.organization_id,
    projectId: dto.project_id,
    workItemTypeId: dto.work_item_type_id,
    statusId: dto.status_id,
    parentId: dto.parent_id,
    assigneeId: dto.assignee_id,
    assigneeUsername: dto.assignee_username ?? '',
    assigneeName: dto.assignee_name ?? '',
    title: dto.title,
    description: dto.description,
    priority: dto.priority,
    storyPoints: dto.story_points,
    hours: dto.hours,
    createdBy: dto.created_by,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    currentUserRole: dto.current_user_role,
  };
}

export async function listWorkItems(
  projectId: string,
  filters: WorkItemFilters,
  page: number,
  signal?: AbortSignal,
): Promise<WorkItemsPage> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  if (filters.statusId) query.set('status_id', filters.statusId);
  if (filters.workItemTypeId) query.set('work_item_type_id', filters.workItemTypeId);
  if (filters.priority) query.set('priority', filters.priority);
  if (filters.assigneeId) query.set('assignee_id', filters.assigneeId);
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/work-items?${query}`;
  const dto = await apiRequest<PageDto<WorkItemDto>>(path, { signal });
  return {
    items: dto.items.map(toWorkItem),
    page: dto.page,
    totalPages: dto.total_pages,
  };
}

export async function getWorkItem(workItemId: string, signal?: AbortSignal): Promise<WorkItem> {
  const path = `/api/v1/work-items/${encodeURIComponent(workItemId)}`;
  return toWorkItem(await apiRequest<WorkItemDto>(path, { signal }));
}

export async function createWorkItem(
  projectId: string,
  payload: CreateWorkItemPayload,
): Promise<WorkItem> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/work-items`;
  const body: Record<string, unknown> = {
    work_item_type_id: payload.workItemTypeId,
    title: payload.title,
    description: payload.description ?? '',
    priority: payload.priority ?? 'none',
  };
  if (payload.statusId) body.status_id = payload.statusId;
  if (payload.parentId) body.parent_id = payload.parentId;
  if (payload.assigneeId) body.assignee_id = payload.assigneeId;
  if (payload.storyPoints !== undefined && payload.storyPoints !== null) {
    body.story_points = payload.storyPoints;
  }
  if (payload.hours !== undefined && payload.hours !== null) {
    body.hours = payload.hours;
  }
  return toWorkItem(await apiRequest<WorkItemDto>(path, { method: 'POST', body }));
}

export async function updateWorkItem(
  workItemId: string,
  payload: UpdateWorkItemPayload,
): Promise<WorkItem> {
  const path = `/api/v1/work-items/${encodeURIComponent(workItemId)}`;
  const body: Record<string, unknown> = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.priority !== undefined) body.priority = payload.priority;
  if (payload.workItemTypeId !== undefined) body.work_item_type_id = payload.workItemTypeId;
  if ('parentId' in payload) body.parent_id = payload.parentId ?? null;
  if ('assigneeId' in payload) body.assignee_id = payload.assigneeId ?? null;
  if ('storyPoints' in payload) body.story_points = payload.storyPoints ?? null;
  if ('hours' in payload) body.hours = payload.hours ?? null;
  return toWorkItem(await apiRequest<WorkItemDto>(path, { method: 'PATCH', body }));
}

export async function transitionWorkItem(workItemId: string, statusId: string): Promise<WorkItem> {
  const path = `/api/v1/work-items/${encodeURIComponent(workItemId)}/transitions`;
  return toWorkItem(
    await apiRequest<WorkItemDto>(path, { method: 'POST', body: { status_id: statusId } }),
  );
}

export async function deleteWorkItem(workItemId: string): Promise<void> {
  const path = `/api/v1/work-items/${encodeURIComponent(workItemId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}
