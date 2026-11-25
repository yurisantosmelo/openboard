import type { ProjectWorkItemType } from '../../projects';
import { ApiError } from '../../../shared/api/httpClient';
import type { Priority, WorkItem } from '../api/workItemsApi';

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

export const priorityLabels: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

export const priorityVariants: Record<
  Priority,
  'destructive' | 'default' | 'secondary' | 'outline'
> = {
  urgent: 'destructive',
  high: 'default',
  medium: 'secondary',
  low: 'outline',
  none: 'outline',
};

export const selectClassName =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';

export const textareaClassName =
  'min-h-24 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';

export function formatEstimate(item: Pick<WorkItem, 'storyPoints' | 'hours'>): string | null {
  if (item.storyPoints !== null) return `${String(item.storyPoints)} pts`;
  if (item.hours !== null) return `${String(item.hours)} h`;
  return null;
}

export function eligibleParentsForType(
  items: WorkItem[],
  types: ProjectWorkItemType[],
  childTypeId: string,
  excludeId?: string,
): WorkItem[] {
  const allowedParentTypes = new Set(
    types.filter((t) => t.allowedChildTypeIds.includes(childTypeId)).map((t) => t.id),
  );
  return items.filter(
    (item) => item.id !== excludeId && allowedParentTypes.has(item.workItemTypeId),
  );
}

export function parseEstimateInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function workItemFieldError(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError)) {
    return undefined;
  }
  return error.problem?.errors?.find((entry) => entry.field === field)?.message;
}
