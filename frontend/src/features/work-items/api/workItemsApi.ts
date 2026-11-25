import { apiRequest } from '../../../shared/api/httpClient';
import type { WorkspaceRole } from '../../organizations/api/organizationsApi';

export const PAGE_SIZE = 20;

export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type LinkKind = 'blocks' | 'duplicates' | 'relates_to';

export interface WorkItemLink {
  id: string;
  projectId: string;
  sourceWorkItemId: string;
  sourceTitle: string;
  targetWorkItemId: string;
  targetTitle: string;
  kind: LinkKind;
  createdAt: string;
}

export interface WorkItem {
  id: string;
  organizationId: string;
  projectId: string;
  workItemTypeId: string;
  statusId: string;
  parentId: string | null;
  eraId: string | null;
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
  eraId?: string;
}

export interface CreateWorkItemPayload {
  workItemTypeId: string;
  statusId?: string;
  parentId?: string | null;
  eraId?: string | null;
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
  eraId?: string | null;
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
  era_id?: string | null;
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

interface WorkItemLinkDto {
  id: string;
  project_id: string;
  source_work_item_id: string;
  source_title: string;
  target_work_item_id: string;
  target_title: string;
  kind: LinkKind;
  created_at: string;
}

interface ListDto<T> {
  items: T[];
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
    eraId: dto.era_id ?? null,
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

function toWorkItemLink(dto: WorkItemLinkDto): WorkItemLink {
  return {
    id: dto.id,
    projectId: dto.project_id,
    sourceWorkItemId: dto.source_work_item_id,
    sourceTitle: dto.source_title,
    targetWorkItemId: dto.target_work_item_id,
    targetTitle: dto.target_title,
    kind: dto.kind,
    createdAt: dto.created_at,
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
  if (filters.eraId) query.set('era_id', filters.eraId);
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
  assignDefined(body, [
    ['status_id', payload.statusId, Boolean(payload.statusId)],
    ['parent_id', payload.parentId, Boolean(payload.parentId)],
    ['era_id', payload.eraId, Boolean(payload.eraId)],
    ['assignee_id', payload.assigneeId, Boolean(payload.assigneeId)],
    ['story_points', payload.storyPoints, payload.storyPoints != null],
    ['hours', payload.hours, payload.hours != null],
  ]);
  return toWorkItem(await apiRequest<WorkItemDto>(path, { method: 'POST', body }));
}

function assignDefined(
  target: Record<string, unknown>,
  entries: [string, unknown, boolean][],
): void {
  for (const [key, value, include] of entries) {
    if (include) target[key] = value;
  }
}

export async function updateWorkItem(
  workItemId: string,
  payload: UpdateWorkItemPayload,
): Promise<WorkItem> {
  const path = `/api/v1/work-items/${encodeURIComponent(workItemId)}`;
  const body: Record<string, unknown> = {};
  assignDefined(body, [
    ['title', payload.title, payload.title !== undefined],
    ['description', payload.description, payload.description !== undefined],
    ['priority', payload.priority, payload.priority !== undefined],
    ['work_item_type_id', payload.workItemTypeId, payload.workItemTypeId !== undefined],
    ['parent_id', payload.parentId ?? null, 'parentId' in payload],
    ['era_id', payload.eraId ?? null, 'eraId' in payload],
    ['assignee_id', payload.assigneeId ?? null, 'assigneeId' in payload],
    ['story_points', payload.storyPoints ?? null, 'storyPoints' in payload],
    ['hours', payload.hours ?? null, 'hours' in payload],
  ]);
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

export async function listWorkItemLinks(
  workItemId: string,
  signal?: AbortSignal,
): Promise<WorkItemLink[]> {
  const path = `/api/v1/work-items/${encodeURIComponent(workItemId)}/links`;
  const dto = await apiRequest<ListDto<WorkItemLinkDto>>(path, { signal });
  return dto.items.map(toWorkItemLink);
}

export async function createWorkItemLink(
  workItemId: string,
  targetWorkItemId: string,
  kind: LinkKind,
): Promise<WorkItemLink> {
  const path = `/api/v1/work-items/${encodeURIComponent(workItemId)}/links`;
  return toWorkItemLink(
    await apiRequest<WorkItemLinkDto>(path, {
      method: 'POST',
      body: { target_work_item_id: targetWorkItemId, kind },
    }),
  );
}

export async function deleteWorkItemLink(workItemId: string, linkId: string): Promise<void> {
  const path = `/api/v1/work-items/${encodeURIComponent(workItemId)}/links/${encodeURIComponent(linkId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}
