export const WORK_ITEM_ROUTE = '/work-items/:workItemId';

export function workItemPath(workItemId: string): string {
  return `/work-items/${encodeURIComponent(workItemId)}`;
}
