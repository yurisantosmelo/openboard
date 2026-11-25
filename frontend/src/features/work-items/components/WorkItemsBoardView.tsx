import { Calendar, GripVertical, Plus } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProjectEra, ProjectStatus, StatusGroup } from '@/features/projects';
import { cn } from '@/lib/utils';
import type { WorkItem } from '../api/workItemsApi';
import { workItemPath } from '../paths';
import { formatEstimate, priorityLabels, priorityVariants } from './workItemLabels';

const DRAG_ITEM_MIME = 'application/x-openboard-work-item';

const STATUS_DOT_CLASS: Record<StatusGroup, string> = {
  not_committed: 'bg-muted-foreground',
  planned: 'bg-info',
  started: 'bg-warning',
  completed: 'bg-success',
};

function typeDotClass(name: string): string {
  const lower = name.trim().toLowerCase();
  if (lower === 'epic') return 'bg-primary';
  if (lower === 'bug') return 'bg-destructive';
  if (lower === 'task') return 'bg-info';
  return 'bg-success';
}

function initialsOf(name: string, username: string): string {
  const source = (name || username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

interface DragPayload {
  id: string;
  statusId: string;
}

function readDragPayload(event: DragEvent, fallback: DragPayload | null): DragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_ITEM_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<DragPayload>;
      if (parsed.id && parsed.statusId) {
        return { id: parsed.id, statusId: parsed.statusId };
      }
    } catch {
      // Fall through to text/plain or state fallback.
    }
  }
  const plainId = event.dataTransfer.getData('text/plain');
  if (plainId) {
    return { id: plainId, statusId: fallback?.id === plainId ? fallback.statusId : '' };
  }
  return fallback;
}

export interface WorkItemsBoardViewProps {
  items: WorkItem[];
  statuses: ProjectStatus[];
  eras: ProjectEra[];
  typeNames: Map<string, string>;
  statusFilterId?: string;
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
  onStartCreate?: (statusId?: string) => void;
}

interface BoardCardProps {
  item: WorkItem;
  statuses: ProjectStatus[];
  typeName: string;
  era?: ProjectEra;
  canWrite: boolean;
  busy: boolean;
  isDragging: boolean;
  onDragStart: (item: WorkItem, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onTransition: (workItemId: string, statusId: string) => void;
}

function BoardCardFooter({
  item,
  statuses,
  canWrite,
  busy,
  onTransition,
}: {
  item: WorkItem;
  statuses: ProjectStatus[];
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
}) {
  const hasAssignee = Boolean(item.assigneeUsername);
  return (
    <div className="flex items-center justify-between gap-2 pt-0.5">
      {canWrite ? (
        <select
          aria-label={`Status for ${item.title}`}
          className="h-7 max-w-36 rounded-md border border-border bg-muted/40 px-2 text-2xs font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
          value={item.statusId}
          disabled={busy}
          onChange={(e) => {
            onTransition(item.id, e.target.value);
          }}
        >
          {statuses.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>
      ) : (
        <span />
      )}

      {hasAssignee && (
        <div className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
          <Avatar size="sm" className="size-5">
            <AvatarFallback className="text-3xs font-semibold">
              {initialsOf(item.assigneeName, item.assigneeUsername)}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-24 truncate">@{item.assigneeUsername}</span>
        </div>
      )}
    </div>
  );
}

function BoardCard({
  item,
  statuses,
  typeName,
  era,
  canWrite,
  busy,
  isDragging,
  onDragStart,
  onDragEnd,
  onTransition,
}: BoardCardProps) {
  const estimate = formatEstimate(item);
  const canDrag = canWrite && !busy;

  return (
    <article
      draggable={canDrag}
      onDragStart={(event) => {
        if (canDrag) onDragStart(item, event);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 shadow-xs transition-all hover:border-input',
        canDrag && 'cursor-grab hover:shadow-sm active:cursor-grabbing',
        isDragging && 'scale-[0.98] opacity-50',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium">
          {canDrag && (
            <GripVertical
              className="size-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden="true"
            />
          )}
          <span className={cn('size-2 rounded-xs', typeDotClass(typeName))} aria-hidden="true" />
          {typeName}
        </span>
        {item.priority !== 'none' && (
          <Badge variant={priorityVariants[item.priority]} className="h-5 px-1.5 text-2xs">
            {priorityLabels[item.priority]}
          </Badge>
        )}
      </div>

      <Link
        to={workItemPath(item.id)}
        className="text-sm leading-snug font-medium break-words text-foreground hover:underline focus-visible:underline"
      >
        {item.title}
      </Link>

      {(estimate || era) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {era && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-2xs text-muted-foreground">
              <Calendar className="size-3" aria-hidden="true" />
              {era.name}
            </span>
          )}
          {estimate && (
            <Badge variant="secondary" className="h-5 px-1.5 text-2xs tabular-nums">
              {estimate}
            </Badge>
          )}
        </div>
      )}

      <BoardCardFooter
        item={item}
        statuses={statuses}
        canWrite={canWrite}
        busy={busy}
        onTransition={onTransition}
      />
    </article>
  );
}

/** Kanban board view displaying Status columns and draggable Work Item cards. */
export function WorkItemsBoardView({
  items,
  statuses,
  eras,
  typeNames,
  statusFilterId,
  canWrite,
  busy,
  onTransition,
  onStartCreate,
}: WorkItemsBoardViewProps) {
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);
  const eraMap = new Map(eras.map((e) => [e.id, e]));
  const visibleStatuses = statusFilterId
    ? statuses.filter((s) => s.id === statusFilterId)
    : statuses;

  function handleCardDragStart(item: WorkItem, event: DragEvent<HTMLElement>) {
    const payload: DragPayload = { id: item.id, statusId: item.statusId };
    setDragging(payload);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_ITEM_MIME, JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', item.id);
  }

  function handleCardDragEnd() {
    setDragging(null);
    setDragOverStatusId(null);
  }

  function handleColumnDragOver(statusId: string, event: DragEvent<HTMLElement>) {
    if (!canWrite || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverStatusId !== statusId) {
      setDragOverStatusId(statusId);
    }
  }

  function handleColumnDragLeave(statusId: string, event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    if (dragOverStatusId === statusId) {
      setDragOverStatusId(null);
    }
  }

  function handleColumnDrop(targetStatusId: string, event: DragEvent<HTMLElement>) {
    if (!canWrite || busy) return;
    event.preventDefault();
    const payload = readDragPayload(event, dragging);
    setDragging(null);
    setDragOverStatusId(null);
    if (!payload || payload.statusId === targetStatusId) return;
    onTransition(payload.id, targetStatusId);
  }

  return (
    <div
      className="flex min-h-full items-start gap-4 overflow-x-auto p-4 md:p-6"
      role="region"
      aria-label="Work Items board"
    >
      {visibleStatuses.map((status) => {
        const columnItems = items.filter((item) => item.statusId === status.id);
        const isDropTarget = dragOverStatusId === status.id && dragging?.statusId !== status.id;
        return (
          <section
            key={status.id}
            aria-label={status.name}
            onDragOver={(event) => {
              handleColumnDragOver(status.id, event);
            }}
            onDragLeave={(event) => {
              handleColumnDragLeave(status.id, event);
            }}
            onDrop={(event) => {
              handleColumnDrop(status.id, event);
            }}
            className={cn(
              'flex w-76 shrink-0 flex-col gap-2.5 rounded-xl border border-border/80 bg-muted/40 p-2.5 transition-colors',
              isDropTarget && 'border-primary/50 bg-primary/5 ring-2 ring-primary/35',
            )}
          >
            <div className="flex items-center justify-between gap-2 px-1.5 py-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    STATUS_DOT_CLASS[status.statusGroup],
                  )}
                  aria-hidden="true"
                />
                <h3 className="truncate text-sm font-semibold">{status.name}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {columnItems.length}
                </span>
              </div>
              {canWrite && onStartCreate && (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Add Work Item to ${status.name}`}
                  onClick={() => {
                    onStartCreate(status.id);
                  }}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>

            <div className="grid gap-2">
              {columnItems.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {isDropTarget ? 'Drop here' : 'No items'}
                </p>
              ) : (
                columnItems.map((item) => (
                  <BoardCard
                    key={item.id}
                    item={item}
                    statuses={statuses}
                    typeName={typeNames.get(item.workItemTypeId) ?? 'Item'}
                    era={item.eraId ? eraMap.get(item.eraId) : undefined}
                    canWrite={canWrite}
                    busy={busy}
                    isDragging={dragging?.id === item.id}
                    onDragStart={handleCardDragStart}
                    onDragEnd={handleCardDragEnd}
                    onTransition={onTransition}
                  />
                ))
              )}
            </div>

            {canWrite && onStartCreate && (
              <Button
                type="button"
                size="compact"
                variant="ghost"
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onStartCreate(status.id);
                }}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                New work item
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}
