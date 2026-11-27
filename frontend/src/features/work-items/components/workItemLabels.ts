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
  'h-9 w-full min-w-0 rounded-lg border border-input bg-background not-dark:bg-clip-padding px-3 py-1 text-sm text-foreground shadow-xs/5 transition-[color,box-shadow,border-color] outline-none sm:h-8 dark:bg-input/32 focus-visible:border-ring focus-visible:shadow-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/24 disabled:pointer-events-none disabled:opacity-64';

export const textareaClassName =
  'min-h-24 w-full min-w-0 rounded-lg border border-input bg-background not-dark:bg-clip-padding px-3 py-2 text-sm text-foreground shadow-xs/5 transition-[color,box-shadow,border-color] outline-none placeholder:text-placeholder dark:bg-input/32 focus-visible:border-ring focus-visible:shadow-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/24 disabled:pointer-events-none disabled:opacity-64';

export const quietEditorSelectClass =
  'h-7 w-full min-w-0 cursor-pointer rounded-sm border border-transparent bg-transparent px-2 text-xs font-medium text-foreground transition-[border-color,background-color] outline-none hover:border-input hover:bg-secondary/60 focus-visible:border-ring focus-visible:bg-background disabled:pointer-events-none disabled:opacity-60';

/** Deterministic 8-digit numeric card key (e.g. "19827634") derived from a Work Item ID. */
export function formatShortKey(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const numeric = 10_000_000 + ((hash >>> 0) % 90_000_000);
  return String(numeric);
}

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
