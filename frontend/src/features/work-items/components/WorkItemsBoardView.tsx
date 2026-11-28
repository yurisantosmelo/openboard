import { Plus } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
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

type DropPosition = 'before' | 'after';

interface DropTarget {
  statusId: string;
  targetItemId?: string;
  position?: DropPosition;
}

interface FloatingDragState {
  item: WorkItem;
  typeName: string;
  era?: ProjectEra;
  width: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
}

let cachedBlankDragImage: HTMLCanvasElement | null = null;

function blankDragImage(): HTMLCanvasElement {
  if (!cachedBlankDragImage) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    cachedBlankDragImage = canvas;
  }
  return cachedBlankDragImage;
}

function suppressNativeGhost(event: DragEvent<HTMLElement>): void {
  if (typeof event.dataTransfer.setDragImage !== 'function') return;
  event.dataTransfer.setDragImage(blankDragImage(), 0, 0);
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

function resolveDropPosition(event: DragEvent<HTMLElement>): DropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.height <= 0 || !Number.isFinite(event.clientY)) return 'before';
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function sortColumnItems(columnItems: WorkItem[], customOrder?: string[]): WorkItem[] {
  if (!customOrder || customOrder.length === 0) return columnItems;
  const rank = new Map(customOrder.map((id, idx) => [id, idx]));
  return [...columnItems].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
}

function reorderColumnIds(
  currentIds: string[],
  movingId: string,
  targetId?: string,
  position?: DropPosition,
): string[] {
  const without = currentIds.filter((id) => id !== movingId);
  if (!targetId || targetId === movingId) {
    return [...without, movingId];
  }
  const idx = without.indexOf(targetId);
  if (idx === -1) return [...without, movingId];
  const insertAt = position === 'after' ? idx + 1 : idx;
  without.splice(insertAt, 0, movingId);
  return without;
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

function DropIndicator({ position }: { position: DropPosition }) {
  return (
    <div
      data-slot="board-drop-indicator"
      data-position={position}
      aria-hidden="true"
      className="pointer-events-none flex items-center gap-1 py-0.5"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="h-0.5 flex-1 rounded-full bg-primary" />
    </div>
  );
}

function BoardDragPreview({ preview }: { preview: FloatingDragState }) {
  const estimate = formatEstimate(preview.item);
  return (
    <div
      data-slot="board-drag-preview"
      aria-hidden="true"
      style={{
        left: `${String(preview.x - preview.offsetX)}px`,
        top: `${String(preview.y - preview.offsetY)}px`,
        width: `${String(preview.width)}px`,
      }}
      className="pointer-events-none fixed z-[70] flex flex-col gap-2 rounded-sm border-[1.5px] border-primary bg-card p-3 opacity-100 shadow-xl"
    >
      <div className="text-sm leading-snug break-words">
        <span className="mr-1.5 inline-flex items-center gap-1.5 align-text-bottom">
          <WorkItemTypeIcon typeName={preview.typeName} />
          <span className="font-mono text-2xs font-medium text-muted-foreground tabular-nums">
            {formatShortKey(preview.item.id)}
          </span>
        </span>
        <span className="inline font-medium text-foreground">{preview.item.title}</span>
      </div>
      <BoardCardMeta priority={preview.item.priority} era={preview.era} estimate={estimate} />
    </div>
  );
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
  dropIndicator?: DropPosition;
  onDragStart: (item: WorkItem, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onCardDragOver: (item: WorkItem, position: DropPosition, event: DragEvent<HTMLElement>) => void;
  onCardDrop: (item: WorkItem, position: DropPosition, event: DragEvent<HTMLElement>) => void;
  onAssign?: (workItemId: string, assigneeId: string | null) => void;
  onOpenWorkItem?: (workItemId: string) => void;
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
  dropIndicator,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onCardDrop,
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
    <div className="flex flex-col">
      {dropIndicator === 'before' && <DropIndicator position="before" />}
      <article
        data-slot="work-item-card"
        draggable={canDrag}
        onClick={handleCardClick}
        onDragStart={(event) => {
          if (!canDrag) return;
          draggedRef.current = true;
          suppressNativeGhost(event);
          onDragStart(item, event);
        }}
        onDragOver={(event) => {
          if (!canDrag) return;
          event.stopPropagation();
          onCardDragOver(item, resolveDropPosition(event), event);
        }}
        onDrop={(event) => {
          if (!canDrag) return;
          event.stopPropagation();
          onCardDrop(item, resolveDropPosition(event), event);
        }}
        onDragEnd={() => {
          onDragEnd();
          setTimeout(() => {
            draggedRef.current = false;
          }, 0);
        }}
        className={cn(
          'flex flex-col gap-2 rounded-sm border bg-card p-3 opacity-100 shadow-card transition-[border-color,box-shadow]',
          isDragging
            ? 'border-dashed border-primary bg-secondary'
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
      {dropIndicator === 'after' && <DropIndicator position="after" />}
    </div>
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
  dropTarget: DropTarget | null;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onCardDragStart: (item: WorkItem, event: DragEvent<HTMLElement>) => void;
  onCardDragEnd: () => void;
  onCardDragOver: (item: WorkItem, position: DropPosition, event: DragEvent<HTMLElement>) => void;
  onCardDrop: (item: WorkItem, position: DropPosition, event: DragEvent<HTMLElement>) => void;
  onAssign?: (workItemId: string, assigneeId: string | null) => void;
  onStartCreate?: (statusId?: string) => void;
  onOpenWorkItem?: (workItemId: string) => void;
}

function resolveCardIndicator(
  dropTarget: DropTarget | null,
  statusId: string,
  itemId: string,
  draggingId: string | null,
): DropPosition | undefined {
  if (!dropTarget || dropTarget.statusId !== statusId) return undefined;
  if (dropTarget.targetItemId !== itemId || draggingId === itemId) return undefined;
  return dropTarget.position;
}

function isColumnDropHighlight(
  dropTarget: DropTarget | null,
  statusId: string,
  draggingId: string | null,
): boolean {
  return Boolean(draggingId) && dropTarget?.statusId === statusId && !dropTarget.targetItemId;
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
  dropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  onCardDrop,
  onAssign,
  onStartCreate,
  onOpenWorkItem,
}: BoardColumnProps) {
  const tone = resolveStatusTone(status);
  const isColumnHighlighted = isColumnDropHighlight(dropTarget, status.id, draggingId);

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
        isColumnHighlighted && 'border-primary/60 ring-2 ring-primary/30',
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
            {isColumnHighlighted ? 'Drop here' : 'No items'}
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
              dropIndicator={resolveCardIndicator(dropTarget, status.id, item.id, draggingId)}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              onCardDragOver={onCardDragOver}
              onCardDrop={onCardDrop}
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

/** Kanban board view displaying status-tinted columns, opaque drag previews and positional card drops. */
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
  const [floating, setFloating] = useState<FloatingDragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [orderByStatus, setOrderByStatus] = useState<Record<string, string[]>>({});

  const eraMap = useMemo(() => new Map(eras.map((e) => [e.id, e])), [eras]);
  const visibleStatuses = statusFilterId
    ? statuses.filter((s) => s.id === statusFilterId)
    : statuses;

  const sortedByStatus = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const status of visibleStatuses) {
      const colItems = items.filter((item) => item.statusId === status.id);
      map.set(status.id, sortColumnItems(colItems, orderByStatus[status.id]));
    }
    return map;
  }, [items, visibleStatuses, orderByStatus]);

  function clearDragState() {
    setDragging(null);
    setFloating(null);
    setDropTarget(null);
  }

  function updateFloatingPosition(event: DragEvent<HTMLElement>) {
    if (!floating || (event.clientX === 0 && event.clientY === 0)) return;
    setFloating((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : null));
  }

  function handleCardDragStart(item: WorkItem, event: DragEvent<HTMLElement>) {
    const payload: DragPayload = { id: item.id, statusId: item.statusId };
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 258;
    const offsetX = rect.width > 0 ? Math.max(0, Math.min(width, event.clientX - rect.left)) : 24;
    const offsetY =
      rect.height > 0 ? Math.max(0, Math.min(rect.height, event.clientY - rect.top)) : 20;

    setDragging(payload);
    setFloating({
      item,
      typeName: typeNames.get(item.workItemTypeId) ?? 'Item',
      era: item.eraId ? eraMap.get(item.eraId) : undefined,
      width,
      offsetX,
      offsetY,
      x: event.clientX,
      y: event.clientY,
    });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_ITEM_MIME, JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', item.id);
  }

  function commitDrop(
    payload: DragPayload,
    targetStatusId: string,
    targetItemId?: string,
    position?: DropPosition,
  ) {
    const currentIds = (sortedByStatus.get(targetStatusId) ?? []).map((i) => i.id);
    const nextIds = reorderColumnIds(currentIds, payload.id, targetItemId, position);
    setOrderByStatus((prev) => ({
      ...prev,
      ...(payload.statusId && payload.statusId !== targetStatusId
        ? { [payload.statusId]: (prev[payload.statusId] ?? []).filter((id) => id !== payload.id) }
        : {}),
      [targetStatusId]: nextIds,
    }));
    if (payload.statusId !== targetStatusId) {
      onTransition(payload.id, targetStatusId);
    }
  }

  function handleCardDragOver(
    targetItem: WorkItem,
    position: DropPosition,
    event: DragEvent<HTMLElement>,
  ) {
    if (!canWrite || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    updateFloatingPosition(event);
    setDropTarget({ statusId: targetItem.statusId, targetItemId: targetItem.id, position });
  }

  function handleCardDrop(
    targetItem: WorkItem,
    position: DropPosition,
    event: DragEvent<HTMLElement>,
  ) {
    if (!canWrite || busy) return;
    event.preventDefault();
    const payload = readDragPayload(event, dragging);
    clearDragState();
    if (!payload) return;
    commitDrop(payload, targetItem.statusId, targetItem.id, position);
  }

  function handleColumnDragOver(statusId: string, event: DragEvent<HTMLElement>) {
    if (!canWrite || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    updateFloatingPosition(event);
    setDropTarget({ statusId });
  }

  function handleColumnDragLeave(statusId: string, event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    if (dropTarget?.statusId === statusId) {
      setDropTarget(null);
    }
  }

  function handleColumnDrop(targetStatusId: string, event: DragEvent<HTMLElement>) {
    if (!canWrite || busy) return;
    event.preventDefault();
    const payload = readDragPayload(event, dragging);
    clearDragState();
    if (!payload) return;
    commitDrop(payload, targetStatusId);
  }

  return (
    <div
      className="flex min-h-full items-start gap-3.5 overflow-x-auto px-6 py-4.5"
      role="region"
      aria-label="Work Items board"
      onDragOver={(event) => {
        if (!floating) return;
        event.preventDefault();
        updateFloatingPosition(event);
      }}
    >
      {visibleStatuses.map((status) => (
        <BoardColumn
          key={status.id}
          status={status}
          items={sortedByStatus.get(status.id) ?? []}
          eraMap={eraMap}
          typeNames={typeNames}
          workspaceId={workspaceId}
          participants={participants}
          canWrite={canWrite}
          busy={busy}
          draggingId={dragging?.id ?? null}
          dropTarget={dropTarget}
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
          onCardDragEnd={clearDragState}
          onCardDragOver={handleCardDragOver}
          onCardDrop={handleCardDrop}
          onAssign={onAssign}
          onStartCreate={onStartCreate}
          onOpenWorkItem={onOpenWorkItem}
        />
      ))}
      {floating && <BoardDragPreview preview={floating} />}
    </div>
  );
}
