import { Plus } from 'lucide-react';
import { useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { PriorityBadge } from '@/components/ui/priority-badge';
import { Tag } from '@/components/ui/tag';
import type { ProjectEra, ProjectStatus } from '@/features/projects';
import { cn } from '@/lib/utils';
import type { WorkItem } from '../api/workItemsApi';
import { workItemPath } from '../paths';
import { initialsOf, resolveStatusTone, typeDotClass } from './statusTone';
import { formatEstimate } from './workItemLabels';

const DRAG_ITEM_MIME = 'application/x-openboard-work-item';

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

function isPlainLeftClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function isInteractiveCardTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a,button,select,input,textarea'));
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
  onOpenWorkItem?: (workItemId: string) => void;
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
  onOpenWorkItem?: (workItemId: string) => void;
}

function BoardCardAssignee({ name, username }: { name: string; username: string }) {
  if (!name && !username) return null;
  const displayName = name || `@${username}`;
  return (
    <div
      data-slot="card-assignee"
      className="flex items-center gap-1.5 text-2xs text-muted-foreground"
    >
      <Avatar size="xs">
        <AvatarFallback className="text-3xs font-semibold">
          {initialsOf(name, username)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{displayName}</span>
    </div>
  );
}

function BoardCardFooter({
  item,
  statuses,
  estimate,
  canWrite,
  busy,
  onTransition,
}: {
  item: WorkItem;
  statuses: ProjectStatus[];
  estimate: string | null;
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
}) {
  if (!estimate && !canWrite) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
      {estimate ? (
        <span className="rounded-xs border border-border bg-secondary px-1.5 py-0.5 text-2xs text-muted-foreground tabular-nums">
          {estimate}
        </span>
      ) : (
        <span />
      )}

      {canWrite && (
        <select
          aria-label={`Status for ${item.title}`}
          className="h-6 max-w-32 cursor-pointer rounded-xs border border-transparent bg-transparent px-1.5 text-2xs font-medium text-muted-foreground transition-colors outline-none hover:border-input hover:bg-secondary/60 hover:text-foreground focus-visible:border-ring focus-visible:bg-background focus-visible:text-foreground disabled:opacity-50"
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
  onOpenWorkItem,
}: BoardCardProps) {
  const estimate = formatEstimate(item);
  const canDrag = canWrite && !busy;
  const draggedRef = useRef(false);

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (!onOpenWorkItem || !isPlainLeftClick(event) || isInteractiveCardTarget(event.target)) {
      return;
    }
    onOpenWorkItem(item.id);
  }

  function handleTitleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!onOpenWorkItem || !isPlainLeftClick(event)) return;
    event.preventDefault();
    onOpenWorkItem(item.id);
  }

  return (
    <article
      data-slot="work-item-card"
      draggable={canDrag}
      onClick={handleCardClick}
      onDragStart={(event) => {
        if (!canDrag) return;
        draggedRef.current = true;
        onDragStart(item, event);
      }}
      onDragEnd={() => {
        onDragEnd();
        setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      className={cn(
        'flex flex-col gap-2 rounded-sm border border-transparent bg-card p-3 shadow-card transition-[border-color,box-shadow,opacity,transform] hover:border-input',
        canDrag ? 'cursor-grab active:cursor-grabbing' : onOpenWorkItem && 'cursor-pointer',
        isDragging && 'scale-[0.98] opacity-50',
      )}
    >
      {/* Row 1: Type identity & Priority badge */}
      <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
          <span
            className={cn('size-1.5 shrink-0 rounded-xs', typeDotClass(typeName))}
            aria-hidden="true"
          />
          <span className="truncate">{typeName}</span>
        </span>
        {item.priority !== 'none' && <PriorityBadge priority={item.priority} />}
      </div>

      {/* Row 2: Clickable Title */}
      <Link
        to={workItemPath(item.id)}
        onClick={handleTitleClick}
        className="text-sm leading-snug font-medium break-words text-foreground hover:underline focus-visible:underline"
      >
        {item.title}
      </Link>

      {/* Row 3: Assignee directly below Title, left-aligned */}
      <BoardCardAssignee name={item.assigneeName} username={item.assigneeUsername} />

      {/* Row 4: Era tag */}
      {era && (
        <div className="flex flex-wrap items-center gap-1">
          <Tag tone="info">{era.name}</Tag>
        </div>
      )}

      {/* Row 5: Quiet footer with estimate and border-on-hover status control */}
      <BoardCardFooter
        item={item}
        statuses={statuses}
        estimate={estimate}
        canWrite={canWrite}
        busy={busy}
        onTransition={onTransition}
      />
    </article>
  );
}

interface BoardColumnProps {
  status: ProjectStatus;
  items: WorkItem[];
  statuses: ProjectStatus[];
  eraMap: Map<string, ProjectEra>;
  typeNames: Map<string, string>;
  canWrite: boolean;
  busy: boolean;
  draggingId: string | null;
  isDropTarget: boolean;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onCardDragStart: (item: WorkItem, event: DragEvent<HTMLElement>) => void;
  onCardDragEnd: () => void;
  onTransition: (workItemId: string, statusId: string) => void;
  onStartCreate?: (statusId?: string) => void;
  onOpenWorkItem?: (workItemId: string) => void;
}

function BoardColumn({
  status,
  items,
  statuses,
  eraMap,
  typeNames,
  canWrite,
  busy,
  draggingId,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onTransition,
  onStartCreate,
  onOpenWorkItem,
}: BoardColumnProps) {
  const tone = resolveStatusTone(status);

  return (
    <section
      data-slot="board-column"
      data-column-tone={tone.key}
      aria-label={status.name}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'flex w-[280px] shrink-0 flex-col gap-2 rounded-md border p-2.5 transition-colors',
        tone.surface,
        isDropTarget && 'border-primary/60 ring-2 ring-primary/30',
      )}
    >
      <div className="flex h-6 items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('size-2 shrink-0 rounded-xs', tone.dot)} aria-hidden="true" />
          <h3 className="truncate text-xs font-medium text-foreground">{status.name}</h3>
          <span className="text-2xs text-muted-foreground tabular-nums">{items.length}</span>
        </div>
        {canWrite && onStartCreate && (
          <IconButton
            size="sm"
            variant="ghost"
            aria-label={`Add Work Item to ${status.name}`}
            onClick={() => {
              onStartCreate(status.id);
            }}
          >
            <Plus aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {isDropTarget ? 'Drop here' : 'No items'}
          </p>
        ) : (
          items.map((item) => (
            <BoardCard
              key={item.id}
              item={item}
              statuses={statuses}
              typeName={typeNames.get(item.workItemTypeId) ?? 'Item'}
              era={item.eraId ? eraMap.get(item.eraId) : undefined}
              canWrite={canWrite}
              busy={busy}
              isDragging={draggingId === item.id}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              onTransition={onTransition}
              onOpenWorkItem={onOpenWorkItem}
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
}

/** Kanban board view displaying status-tinted columns and floating draggable Work Item cards. */
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
  onOpenWorkItem,
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
      className="flex min-h-full items-start gap-3.5 overflow-x-auto px-6 py-4.5"
      role="region"
      aria-label="Work Items board"
    >
      {visibleStatuses.map((status) => {
        const columnItems = items.filter((item) => item.statusId === status.id);
        const isDropTarget = dragOverStatusId === status.id && dragging?.statusId !== status.id;
        return (
          <BoardColumn
            key={status.id}
            status={status}
            items={columnItems}
            statuses={statuses}
            eraMap={eraMap}
            typeNames={typeNames}
            canWrite={canWrite}
            busy={busy}
            draggingId={dragging?.id ?? null}
            isDropTarget={isDropTarget}
            onDragOver={(event) => {
              handleColumnDragOver(status.id, event);
            }}
            onDragLeave={(event) => {
              handleColumnDragLeave(status.id, event);
            }}
            onDrop={(event) => {
              handleColumnDrop(status.id, event);
            }}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            onTransition={onTransition}
            onStartCreate={onStartCreate}
            onOpenWorkItem={onOpenWorkItem}
          />
        );
      })}
    </div>
  );
}
