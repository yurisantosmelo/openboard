import type {
  Project,
  ProjectEra,
  ProjectStatus,
  ProjectView,
  ProjectWorkItemType,
  StatusGroup,
  ViewLayout,
  ViewVisibility,
} from '@/features/projects';
import type { Priority, WorkItem } from '@/features/work-items/api/workItemsApi';

export type PaletteTab = 'all' | 'work-items' | 'projects-views' | 'commands';

export type UpdatedWindow = 'any' | 'today' | '7d' | '30d' | 'active-era';

export interface PaletteActionEntry {
  id: string;
  run: () => void;
}

export function formatShortKey(id: string): string {
  return `#${id.slice(0, 6).toUpperCase()}`;
}

export interface PaletteParticipant {
  id: string;
  name: string;
  username: string;
}

export interface PaletteFilters {
  updated: UpdatedWindow;
  statusGroups: StatusGroup[];
  typeIds: string[];
  priorities: Priority[];
  projectIds: string[];
  assigneeIds: string[];
  assignedToMe: boolean;
  eraMode: 'all' | 'active' | 'none';
  viewVisibility: 'all' | ViewVisibility;
  viewLayouts: ViewLayout[];
}

export const INITIAL_PALETTE_FILTERS: PaletteFilters = {
  updated: 'any',
  statusGroups: [],
  typeIds: [],
  priorities: [],
  projectIds: [],
  assigneeIds: [],
  assignedToMe: false,
  eraMode: 'all',
  viewVisibility: 'all',
  viewLayouts: [],
};

export interface CommandEntry {
  id: string;
  group: 'CREATE' | 'NAVIGATION' | 'PREFERENCES';
  glyph: string;
  label: string;
  subtitle?: string;
  shortcut: string;
  description: string;
  scope: string;
  roleRequired: string;
  run: () => void;
}

export interface ParsedPaletteQuery {
  prefix: '>' | '#' | '@' | '/' | null;
  term: string;
}

export function parsePaletteQuery(raw: string): ParsedPaletteQuery {
  const trimmed = raw.trim();
  const first = trimmed.charAt(0);
  if (first === '>' || first === '#' || first === '@' || first === '/') {
    return { prefix: first, term: trimmed.slice(1).trim().toLowerCase() };
  }
  return { prefix: null, term: trimmed.toLowerCase() };
}

export function toggleListValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function matchesTimeWindow(updatedAt: string, window: UpdatedWindow, nowMs: number): boolean {
  if (window === 'any' || window === 'active-era') return true;
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return true;
  const ageDays = (nowMs - ts) / 86_400_000;
  if (window === 'today') return ageDays <= 1;
  if (window === '7d') return ageDays <= 7;
  return ageDays <= 30;
}

function matchesWorkItemText(item: WorkItem, parsed: ParsedPaletteQuery): boolean {
  if (!parsed.term) return true;
  const shortKey = formatShortKey(item.id).toLowerCase();
  if (parsed.prefix === '@') {
    return (
      item.assigneeName.toLowerCase().includes(parsed.term) ||
      item.assigneeUsername.toLowerCase().includes(parsed.term)
    );
  }
  if (parsed.prefix === '#') {
    return shortKey.includes(parsed.term) || item.id.toLowerCase().includes(parsed.term);
  }
  return (
    item.title.toLowerCase().includes(parsed.term) ||
    item.description.toLowerCase().includes(parsed.term) ||
    shortKey.includes(parsed.term)
  );
}

function matchesWorkItemEra(
  item: WorkItem,
  filters: PaletteFilters,
  activeEraId?: string,
): boolean {
  if (filters.updated === 'active-era' || filters.eraMode === 'active') {
    return Boolean(activeEraId) && item.eraId === activeEraId;
  }
  if (filters.eraMode === 'none') return item.eraId === null;
  return true;
}

function matchesWorkItemAssignee(
  item: WorkItem,
  filters: PaletteFilters,
  currentUserId?: string,
): boolean {
  if (filters.assignedToMe && currentUserId && item.assigneeId !== currentUserId) {
    return false;
  }
  if (filters.assigneeIds.length > 0) {
    return Boolean(item.assigneeId) && filters.assigneeIds.includes(item.assigneeId ?? '');
  }
  return true;
}

function matchesStatusGroup(
  item: WorkItem,
  statusGroups: StatusGroup[],
  statusById: Map<string, ProjectStatus>,
): boolean {
  if (statusGroups.length === 0) return true;
  const group = statusById.get(item.statusId)?.statusGroup;
  return Boolean(group) && statusGroups.includes(group as StatusGroup);
}

function matchesWorkItemFacets(
  item: WorkItem,
  filters: PaletteFilters,
  statusById: Map<string, ProjectStatus>,
): boolean {
  if (!matchesStatusGroup(item, filters.statusGroups, statusById)) return false;
  if (filters.typeIds.length > 0 && !filters.typeIds.includes(item.workItemTypeId)) return false;
  if (filters.priorities.length > 0 && !filters.priorities.includes(item.priority)) return false;
  if (filters.projectIds.length > 0 && !filters.projectIds.includes(item.projectId)) return false;
  return true;
}

export function filterPaletteWorkItems(params: {
  items: WorkItem[];
  parsed: ParsedPaletteQuery;
  filters: PaletteFilters;
  statusById: Map<string, ProjectStatus>;
  activeEraId?: string;
  currentUserId?: string;
  nowMs?: number;
}): WorkItem[] {
  const nowMs = params.nowMs ?? Date.now();
  return params.items.filter(
    (item) =>
      matchesWorkItemText(item, params.parsed) &&
      matchesTimeWindow(item.updatedAt, params.filters.updated, nowMs) &&
      matchesWorkItemEra(item, params.filters, params.activeEraId) &&
      matchesWorkItemAssignee(item, params.filters, params.currentUserId) &&
      matchesWorkItemFacets(item, params.filters, params.statusById),
  );
}

export function filterPaletteProjects(
  projects: Project[],
  parsed: ParsedPaletteQuery,
  projectIds: string[],
): Project[] {
  return projects.filter((project) => {
    if (projectIds.length > 0 && !projectIds.includes(project.id)) return false;
    if (!parsed.term) return true;
    return project.name.toLowerCase().includes(parsed.term);
  });
}

export function filterPaletteViews(
  views: ProjectView[],
  parsed: ParsedPaletteQuery,
  filters: PaletteFilters,
): ProjectView[] {
  return views.filter((view) => {
    if (filters.viewVisibility !== 'all' && view.visibility !== filters.viewVisibility) {
      return false;
    }
    if (filters.viewLayouts.length > 0 && !filters.viewLayouts.includes(view.layout)) {
      return false;
    }
    if (!parsed.term) return true;
    return (
      view.name.toLowerCase().includes(parsed.term) ||
      view.layout.toLowerCase().includes(parsed.term)
    );
  });
}

export function filterPaletteCommands(
  commands: CommandEntry[],
  parsed: ParsedPaletteQuery,
): CommandEntry[] {
  if (!parsed.term) return commands;
  return commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(parsed.term) ||
      (cmd.subtitle ?? '').toLowerCase().includes(parsed.term) ||
      cmd.description.toLowerCase().includes(parsed.term),
  );
}

export function collectPaletteParticipants(
  items: WorkItem[],
  currentUser: PaletteParticipant | null | undefined,
): PaletteParticipant[] {
  const map = new Map<string, PaletteParticipant>();
  if (currentUser) map.set(currentUser.id, currentUser);
  for (const item of items) {
    if (item.assigneeId && !map.has(item.assigneeId)) {
      map.set(item.assigneeId, {
        id: item.assigneeId,
        name: item.assigneeName,
        username: item.assigneeUsername,
      });
    }
  }
  return [...map.values()];
}

export function projectCode(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'P';
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

export function activeEraOf(eras: ProjectEra[]): ProjectEra | undefined {
  return eras.find((era) => era.state === 'active');
}

export function typeNameOf(types: ProjectWorkItemType[], typeId: string): string {
  return types.find((t) => t.id === typeId)?.name ?? 'Item';
}
