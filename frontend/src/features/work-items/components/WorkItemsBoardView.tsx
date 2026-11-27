import { Plus } from 'lucide-react';
import { useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { PriorityBadge } from '@/components/ui/priority-badge';
import { Tag } from '@/components/ui/tag';
import type { ProjectEra, ProjectStatus } from '@/features/projects';
import { cn } from '@/lib/utils';
import type { WorkItem } from '../api/workItemsApi';
import { workItemPath } from '../paths';
import { AssigneePickerPopover } from './AssigneePickerPopover';
import type { Participant } from './ProjectWorkspaceHeader';
import { resolveStatusTone } from './statusTone';
import { formatEstimate, formatShortKey } from './workItemLabels';
import { WorkItemTypeIcon } from './WorkItemTypeIcon';

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

function attachCardDragPreview(event: DragEvent<HTMLElement>): void {
  if (typeof event.dataTransfer.setDragImage !== 'function') return;
  const source = event.currentTarget;
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.style.position = 'fixed';
  ghost.style.top = '-9999px';
  ghost.style.left = '-9999px';
  ghost.style.width = `${String(Math.max(rect.width, 240))}px`;
  ghost.style.pointerEvents = 'none';
  ghost.style.opacity = '1';
  ghost.style.margin = '0';
  ghost.style.boxShadow = '0 14px 32px rgba(15, 23, 42, 0.22)';
  ghost.style.borderColor = 'var(--ring)';
  document.body.appendChild(ghost);

  const offsetX =
    rect.width > 0 ? Math.max(0, Math.min(rect.width, event.clientX - rect.left)) : 24;
  const offsetY =
    rect.height > 0 ? Math.max(0, Math.min(rect.height, event.clientY - rect.top)) : 20;
  event.dataTransfer.setDragImage(ghost, offsetX, offsetY);

  window.requestAnimationFrame(() => {
    ghost.remove();
  });
}

export interface WorkItemsBoardViewProps {
  items: WorkItem[];
  statuses: ProjectStatus[];
  eras: ProjectEra[];
  typeNames: Map<string, string>;
  workspaceId?: string;
  participants?: Participant[];
  statusFilterId?: string;
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
  onAssign?: (workItemId: string, assigneeId: string | null) => void;
  onStartCreate?: (statusId?: string) => void;
  onOpenWorkItem?: (workItemId: string) => void;
}

interface BoardCardProps {
  item: WorkItem;
  typeName: string;
  era?: ProjectEra;
  workspaceId?: string;
  participants: Participant[];
  canWrite: boolean;
  busy: boolean;
  isDragging: boolean;
  onDragStart: (item: WorkItem, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onAssign?: (workItemId: string, assigneeId: string | null) => void;
  onOpenWorkItem?: (workItemId: string) => void;
}

function BoardCardMeta({
  priority,
  era,
  estimate,
}: {
  priority: WorkItem['priority'];
  era?: ProjectEra;
  estimate: string | null;
}) {
  if (priority === 'none' && !era && !estimate) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {priority !== 'none' && <PriorityBadge priority={priority} />}
      {era && <Tag tone="info">{era.name}</Tag>}
      {estimate && (
        <span className="rounded-xs border border-border bg-secondary px-1.5 py-0.5 text-2xs text-muted-foreground tabular-nums">
          {estimate}
        </span>
      )}
    </div>
  );
}

function BoardCard({
  item,
  typeName,
  era,
  workspaceId,
  participants,
  canWrite,
  busy,
  isDragging,
  onDragStart,
  onDragEnd,
  onAssign,
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
        attachCardDragPreview(event);
        onDragStart(item, event);
      }}
      onDragEnd={() => {
        onDragEnd();
        setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      className={cn(
        'flex flex-col gap-2 rounded-sm border bg-card p-3 shadow-card transition-[border-color,box-shadow,opacity,transform]',
        isDragging
          ? 'scale-[0.98] border-dashed border-primary/50 opacity-35'
          : 'border-transparent hover:border-input',
        canDrag ? 'cursor-grab active:cursor-grabbing' : onOpenWorkItem && 'cursor-pointer',
      )}
    >
      {/* Row 1: Inline flow — type icon + 8-digit card key followed by full-width wrapping title */}
      <div className="text-sm leading-snug break-words">
        <span className="mr-1.5 inline-flex items-center gap-1.5 align-text-bottom">
          <WorkItemTypeIcon typeName={typeName} />
          <span
            data-slot="work-item-key"
            className="font-mono text-2xs font-medium text-muted-foreground tabular-nums"
          >
            {formatShortKey(item.id)}
          </span>
        </span>
        <Link
          to={workItemPath(item.id)}
          onClick={handleTitleClick}
          className="inline font-medium text-foreground hover:underline focus-visible:underline"
        >
          {item.title}
        </Link>
      </div>

      {/* Row 2: Assignee picker directly below title (always rendered, even when unassigned) */}
      <div className="-ml-1">
        <AssigneePickerPopover
          workItemTitle={item.title}
          assigneeId={item.assigneeId}
          assigneeName={item.assigneeName}
          assigneeUsername={item.assigneeUsername}
          workspaceId={workspaceId}
          participants={participants}
          canWrite={canWrite}
          busy={busy}
          onAssign={
            onAssign
              ? (nextAssigneeId) => {
                  onAssign(item.id, nextAssigneeId);
                }
              : undefined
          }
        />
      </div>

      {/* Row 3: Priority, Era and Estimate badges */}
      <BoardCardMeta priority={item.priority} era={era} estimate={estimate} />
    </article>
  );
}

interface BoardColumnProps {
  status: ProjectStatus;
  items: WorkItem[];
  eraMap: Map<string, ProjectEra>;
  typeNames: Map<string, string>;
  workspaceId?: string;
  participants: Participant[];
  canWrite: boolean;
  busy: boolean;
  draggingId: string | null;
  isDropTarget: boolean;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onCardDragStart: (item: WorkItem, event: DragEvent<HTMLElement>) => void;
  onCardDragEnd: () => void;
  onAssign?: (workItemId: string, assigneeId: string | null) => void;
  onStartCreate?: (statusId?: string) => void;
  onOpenWorkItem?: (workItemId: string) => void;
}

function BoardColumn({
  status,
  items,
  eraMap,
  typeNames,
  workspaceId,
  participants,
  canWrite,
  busy,
  draggingId,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onAssign,
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
              typeName={typeNames.get(item.workItemTypeId) ?? 'Item'}
              era={item.eraId ? eraMap.get(item.eraId) : undefined}
              workspaceId={workspaceId}
              participants={participants}
              canWrite={canWrite}
              busy={busy}
              isDragging={draggingId === item.id}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              onAssign={onAssign}
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

const EMPTY_PARTICIPANTS: Participant[] = [];

/** Kanban board view displaying status-tinted columns and floating draggable Work Item cards. */
export function WorkItemsBoardView({
  items,
  statuses,
  eras,
  typeNames,
  workspaceId,
  participants = EMPTY_PARTICIPANTS,
  statusFilterId,
  canWrite,
  busy,
  onTransition,
  onAssign,
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
            eraMap={eraMap}
            typeNames={typeNames}
            workspaceId={workspaceId}
            participants={participants}
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
            onAssign={onAssign}
            onStartCreate={onStartCreate}
            onOpenWorkItem={onOpenWorkItem}
          />
        );
      })}
    </div>
  );
}
