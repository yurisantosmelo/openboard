import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '@/components/ui/priority-badge';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/utils';
import type { ProjectEra, ProjectStatus } from '../../projects';
import type { WorkItem } from '../api/workItemsApi';
import { workItemPath } from '../paths';
import { initialsOf, resolveStatusTone, typeDotClass } from './statusTone';
import { formatEstimate } from './workItemLabels';

export interface LayoutViewProps {
  items: WorkItem[];
  statuses: ProjectStatus[];
  eras: ProjectEra[];
  typeNames: Map<string, string>;
  statusNames: Map<string, string>;
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
  onStartCreate?: (statusId?: string) => void;
}

const quietRowSelectClass =
  'h-6 w-auto min-w-28 cursor-pointer rounded-xs border border-transparent bg-transparent px-1.5 text-2xs font-medium text-foreground transition-colors outline-none hover:border-input hover:bg-secondary/60 focus-visible:border-ring focus-visible:bg-background disabled:opacity-50';

function sumEstimates(items: WorkItem[]): string {
  let pts = 0;
  let hrs = 0;
  for (const item of items) {
    if (item.storyPoints !== null) pts += item.storyPoints;
    if (item.hours !== null) hrs += item.hours;
  }
  const parts: string[] = [];
  if (pts > 0) parts.push(`${String(pts)} pts`);
  if (hrs > 0) parts.push(`${String(hrs)} h`);
  return parts.join(' · ');
}

function AssigneeCell({ name, username }: { name: string; username: string }) {
  if (!name && !username) {
    return <span className="text-2xs text-muted-foreground">Unassigned</span>;
  }
  const label = name || `@${username}`;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
      <Avatar size="xs">
        <AvatarFallback className="text-3xs font-semibold">
          {initialsOf(name, username)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{label}</span>
    </span>
  );
}

function InlineStatusCell({
  item,
  statuses,
  status,
  statusName,
  canWrite,
  busy,
  onTransition,
}: {
  item: WorkItem;
  statuses: ProjectStatus[];
  status?: ProjectStatus;
  statusName: string;
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
}) {
  const tone = resolveStatusTone(status);
  if (!canWrite || statuses.length === 0) {
    return (
      <span
        className={cn(
          'inline-flex h-[22px] items-center gap-1.5 rounded-xs border px-1.5 text-2xs font-medium text-foreground',
          tone.surface,
        )}
      >
        <span className={cn('size-1.5 rounded-xs', tone.dot)} aria-hidden="true" />
        <span>{statusName}</span>
      </span>
    );
  }
  return (
    <div
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-xs border pl-1.5',
        tone.surface,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-xs', tone.dot)} aria-hidden="true" />
      <select
        aria-label={`Status for ${item.title}`}
        className={cn(quietRowSelectClass, 'h-5 min-w-24 border-none hover:bg-transparent')}
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
    </div>
  );
}

/* ============================================================================
 * 02 · Grouped List View
 * ============================================================================ */

interface ListRowProps {
  item: WorkItem;
  statuses: ProjectStatus[];
  status?: ProjectStatus;
  statusName: string;
  typeName: string;
  eraName?: string;
  selected: boolean;
  canWrite: boolean;
  busy: boolean;
  onToggleSelect: (id: string) => void;
  onTransition: (workItemId: string, statusId: string) => void;
}

function ListRow({
  item,
  statuses,
  status,
  statusName,
  typeName,
  eraName,
  selected,
  canWrite,
  busy,
  onToggleSelect,
  onTransition,
}: ListRowProps) {
  const estimate = formatEstimate(item);
  return (
    <li
      data-slot="list-work-item-row"
      data-selected={selected ? 'true' : undefined}
      className={cn(
        'flex min-h-10 flex-wrap items-center justify-between gap-3 rounded-sm border px-3 py-1.5 transition-colors',
        selected
          ? 'border-primary bg-column-planned-surface'
          : 'border-transparent bg-card hover:border-input hover:bg-secondary/60',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <input
          type="checkbox"
          aria-label={`Select ${item.title}`}
          checked={selected}
          onChange={() => {
            onToggleSelect(item.id);
          }}
          className="size-3.5 shrink-0 cursor-pointer rounded-xs border-border accent-primary"
        />
        <span
          className={cn('size-1.5 shrink-0 rounded-xs', typeDotClass(typeName))}
          aria-hidden="true"
        />
        <Link
          to={workItemPath(item.id)}
          className="truncate text-sm font-medium text-foreground hover:underline focus-visible:underline"
        >
          {item.title}
        </Link>
        {eraName && <Tag tone="info">{eraName}</Tag>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tag>{typeName}</Tag>
        <div className="w-16">
          {item.priority !== 'none' ? (
            <PriorityBadge priority={item.priority} />
          ) : (
            <span className="text-2xs text-muted-foreground">—</span>
          )}
        </div>
        <span className="w-12 text-right text-2xs text-muted-foreground tabular-nums">
          {estimate ?? '—'}
        </span>
        <div className="w-28 truncate">
          <AssigneeCell name={item.assigneeName} username={item.assigneeUsername} />
        </div>
        <InlineStatusCell
          item={item}
          statuses={statuses}
          status={status}
          statusName={statusName}
          canWrite={canWrite}
          busy={busy}
          onTransition={onTransition}
        />
      </div>
    </li>
  );
}

interface ListGroupProps {
  status: ProjectStatus;
  items: WorkItem[];
  statuses: ProjectStatus[];
  typeNames: Map<string, string>;
  eraNames: Map<string, string>;
  selectedIds: Set<string>;
  canWrite: boolean;
  busy: boolean;
  onToggleSelect: (id: string) => void;
  onTransition: (workItemId: string, statusId: string) => void;
  onStartCreate?: (statusId?: string) => void;
}

function ListStatusGroup({
  status,
  items,
  statuses,
  typeNames,
  eraNames,
  selectedIds,
  canWrite,
  busy,
  onToggleSelect,
  onTransition,
  onStartCreate,
}: ListGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const tone = resolveStatusTone(status);
  const summary = sumEstimates(items);

  return (
    <section aria-label={status.name} className="flex flex-col gap-1">
      <div
        data-slot="list-group-header"
        className={cn(
          'flex h-8 items-center justify-between gap-2 rounded-sm border px-3',
          tone.surface,
        )}
      >
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => {
            setCollapsed((prev) => !prev);
          }}
          className="flex min-w-0 cursor-pointer items-center gap-2 text-left outline-none focus-visible:underline"
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
          )}
          <span className={cn('size-2 shrink-0 rounded-xs', tone.dot)} aria-hidden="true" />
          <span className="truncate text-xs font-medium text-foreground">{status.name}</span>
          <span className="text-2xs text-muted-foreground tabular-nums">{items.length}</span>
        </button>

        <div className="flex items-center gap-3">
          {summary && (
            <span className="text-2xs text-muted-foreground tabular-nums">{summary}</span>
          )}
          {canWrite && onStartCreate && (
            <button
              type="button"
              onClick={() => {
                onStartCreate(status.id);
              }}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground"
            >
              <Plus className="size-3" aria-hidden="true" />
              <span>Add item</span>
            </button>
          )}
        </div>
      </div>

      {!collapsed && items.length > 0 && (
        <ul className="divide-y divide-border/70">
          {items.map((item) => (
            <ListRow
              key={item.id}
              item={item}
              statuses={statuses}
              status={status}
              statusName={status.name}
              typeName={typeNames.get(item.workItemTypeId) ?? 'Item'}
              eraName={item.eraId ? eraNames.get(item.eraId) : undefined}
              selected={selectedIds.has(item.id)}
              canWrite={canWrite}
              busy={busy}
              onToggleSelect={onToggleSelect}
              onTransition={onTransition}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Dense status-grouped list view with collapsible status headers and aligned metadata columns. */
export function WorkItemsListView({
  items,
  statuses,
  eras,
  typeNames,
  statusNames,
  canWrite,
  busy,
  onTransition,
  onStartCreate,
}: LayoutViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const eraNames = new Map(eras.map((e) => [e.id, e.name]));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const groupedStatuses =
    statuses.length > 0
      ? statuses
      : [
          {
            id: '__all__',
            projectId: '',
            name: 'Work Items',
            statusGroup: 'not_committed' as const,
            position: 0,
            createdAt: '',
          },
        ];

  return (
    <div
      className="flex flex-col gap-3 px-6 py-4"
      role="region"
      aria-label="Work Items list"
      data-slot="work-items-list-view"
    >
      <div className="hidden items-center justify-between px-3 text-3xs font-medium tracking-wider text-muted-foreground uppercase md:flex">
        <span>Work Item</span>
        <div className="flex items-center gap-3">
          <span className="w-16">Type</span>
          <span className="w-16">Priority</span>
          <span className="w-12 text-right">Est.</span>
          <span className="w-28">Assignee</span>
          <span className="w-28">Status</span>
        </div>
      </div>

      {groupedStatuses.map((status) => {
        const groupItems =
          status.id === '__all__'
            ? items
            : items.filter(
                (item) =>
                  item.statusId === status.id ||
                  (!statusNames.has(item.statusId) && status === groupedStatuses[0]),
              );
        return (
          <ListStatusGroup
            key={status.id}
            status={status}
            items={groupItems}
            statuses={statuses}
            typeNames={typeNames}
            eraNames={eraNames}
            selectedIds={selectedIds}
            canWrite={canWrite}
            busy={busy}
            onToggleSelect={toggleSelect}
            onTransition={onTransition}
            onStartCreate={onStartCreate}
          />
        );
      })}
    </div>
  );
}

/* ============================================================================
 * 03 · Spreadsheet Table View
 * ============================================================================ */

/** Spreadsheet-style table view with vertical cell dividers, semantic pills and summary footer. */
export function WorkItemsTableView({
  items,
  statuses,
  eras,
  typeNames,
  statusNames,
  canWrite,
  busy,
  onTransition,
  onStartCreate,
}: LayoutViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const eraNames = new Map(eras.map((e) => [e.id, e.name]));
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const totalSummary = sumEstimates(items);

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((item) => item.id)));
  }

  return (
    <div className="px-6 py-4">
      <div
        className="overflow-x-auto rounded-md border border-border bg-card"
        role="region"
        aria-label="Work Items table"
      >
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="divide-x divide-border border-b border-border bg-secondary text-3xs font-medium tracking-wider text-muted-foreground uppercase">
              <th className="w-9 px-2.5 py-2 text-center">
                <input
                  type="checkbox"
                  aria-label="Select all work items"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-3.5 cursor-pointer rounded-xs border-border accent-primary"
                />
              </th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-foreground">Status</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Era</th>
              <th className="px-3 py-2 text-right">Est.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const typeName = typeNames.get(item.workItemTypeId) ?? 'Item';
              const selected = selectedIds.has(item.id);
              return (
                <tr
                  key={item.id}
                  data-selected={selected ? 'true' : undefined}
                  className={cn(
                    'divide-x divide-border transition-colors',
                    selected ? 'bg-column-planned-surface' : 'hover:bg-secondary/60',
                  )}
                >
                  <td className="px-2.5 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.title}`}
                      checked={selected}
                      onChange={() => {
                        toggleRow(item.id);
                      }}
                      className="size-3.5 cursor-pointer rounded-xs border-border accent-primary"
                    />
                  </td>
                  <td className="max-w-sm px-3 py-2 font-medium text-foreground">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span
                        className={cn('size-1.5 shrink-0 rounded-xs', typeDotClass(typeName))}
                        aria-hidden="true"
                      />
                      <Link
                        to={workItemPath(item.id)}
                        className="truncate hover:underline focus-visible:underline"
                      >
                        {item.title}
                      </Link>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Tag>{typeName}</Tag>
                  </td>
                  <td className="px-3 py-2">
                    <InlineStatusCell
                      item={item}
                      statuses={statuses}
                      status={statusById.get(item.statusId)}
                      statusName={statusNames.get(item.statusId) ?? 'Status'}
                      canWrite={canWrite}
                      busy={busy}
                      onTransition={onTransition}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {item.priority !== 'none' ? (
                      <PriorityBadge priority={item.priority} />
                    ) : (
                      <span className="text-2xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <AssigneeCell name={item.assigneeName} username={item.assigneeUsername} />
                  </td>
                  <td className="px-3 py-2 text-2xs text-muted-foreground">
                    {item.eraId ? (eraNames.get(item.eraId) ?? '—') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-2xs text-muted-foreground tabular-nums">
                    {formatEstimate(item) ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary px-3 py-2 text-2xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {canWrite && onStartCreate && (
              <button
                type="button"
                onClick={() => {
                  onStartCreate();
                }}
                className="inline-flex cursor-pointer items-center gap-1 font-medium text-foreground hover:underline"
              >
                <Plus className="size-3" aria-hidden="true" />
                <span>New work item</span>
              </button>
            )}
            <span className="tabular-nums">
              Showing {items.length} items
              {selectedIds.size > 0 ? ` · ${String(selectedIds.size)} selected` : ''}
            </span>
          </div>
          {totalSummary && (
            <span className="font-medium text-foreground tabular-nums">Sum: {totalSummary}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 04 · Split-Pane Timeline View
 * ============================================================================ */

type TimelineScale = 'days' | 'weeks' | 'months';

const TIMELINE_SCALES: Array<{ key: TimelineScale; label: string }> = [
  { key: 'days', label: 'Days' },
  { key: 'weeks', label: 'Weeks' },
  { key: 'months', label: 'Months' },
];

function TimelineScaleToolbar({
  scale,
  itemCount,
  onChangeScale,
}: {
  scale: TimelineScale;
  itemCount: number;
  onChangeScale: (next: TimelineScale) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-foreground">Schedule</span>
        <span className="inline-flex items-center gap-1.5 rounded-xs border border-border bg-card px-2 py-0.5 text-2xs text-primary">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Today
        </span>
        <span className="text-2xs text-muted-foreground tabular-nums">{itemCount} items</span>
      </div>

      <div
        role="group"
        aria-label="Timeline zoom scale"
        className="inline-flex h-[26px] items-center gap-0.5 rounded-sm border border-border bg-secondary p-0.5"
      >
        {TIMELINE_SCALES.map((opt) => {
          const active = scale === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onChangeScale(opt.key);
              }}
              className={cn(
                'inline-flex h-[22px] cursor-pointer items-center rounded-xs border px-2 text-2xs transition-colors',
                active
                  ? 'border-border bg-card font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function barOffsetStyle(index: number, scale: TimelineScale): { left: string; width: string } {
  const step = scale === 'days' ? 12 : scale === 'weeks' ? 8 : 5;
  const widthPct = scale === 'days' ? 42 : scale === 'weeks' ? 32 : 22;
  const leftPct = Math.min((index * step) % 52, 95 - widthPct);
  return { left: `${String(leftPct)}%`, width: `${String(widthPct)}%` };
}

function TimelineLane({
  title,
  subtitle,
  badge,
  items,
  statusById,
  statusNames,
  typeNames,
  scale,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  items: WorkItem[];
  statusById: Map<string, ProjectStatus>;
  statusNames: Map<string, string>;
  typeNames: Map<string, string>;
  scale: TimelineScale;
}) {
  return (
    <section aria-label={title} className="border-b border-border last:border-b-0">
      <div className="grid grid-cols-1 border-b border-border bg-secondary/70 md:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 md:border-r md:border-border">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-xs font-semibold text-foreground">{title}</h3>
            {badge && <Badge variant="secondary">{badge}</Badge>}
          </div>
          <span className="text-2xs text-muted-foreground tabular-nums">{items.length}</span>
        </div>
        <div className="hidden items-center justify-between px-3 py-1.5 text-2xs text-muted-foreground tabular-nums md:flex">
          <span>{subtitle ?? 'No date window'}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">No Work Items scheduled here.</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {items.map((item, idx) => {
            const typeName = typeNames.get(item.workItemTypeId) ?? 'Item';
            const status = statusById.get(item.statusId);
            const tone = resolveStatusTone(status);
            const pos = barOffsetStyle(idx, scale);
            return (
              <li
                key={item.id}
                className="grid grid-cols-1 items-center md:grid-cols-[320px_minmax(0,1fr)]"
              >
                <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 md:border-r md:border-border">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn('size-1.5 shrink-0 rounded-xs', typeDotClass(typeName))}
                      aria-hidden="true"
                    />
                    <Link
                      to={workItemPath(item.id)}
                      className="truncate text-xs font-medium text-foreground hover:underline"
                    >
                      {item.title}
                    </Link>
                  </span>
                  <span className="shrink-0 text-3xs text-muted-foreground">
                    {statusNames.get(item.statusId) ?? 'Status'}
                  </span>
                </div>

                <div className="relative hidden h-9 items-center px-3 md:flex">
                  <span
                    data-slot="timeline-today-line"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-[32%] w-px bg-primary/60"
                  />
                  <div
                    data-slot="timeline-bar"
                    data-bar-tone={tone.key}
                    style={pos}
                    className={cn(
                      'relative flex h-[26px] items-center justify-between gap-2 overflow-hidden rounded-xs border pr-1.5 text-2xs text-foreground',
                      tone.surface,
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn('h-[26px] w-[3px] shrink-0', tone.dot)}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium">{item.title}</span>
                    </span>
                    {(item.assigneeName || item.assigneeUsername) && (
                      <Avatar size="xs" className="size-[18px]">
                        <AvatarFallback className="text-4xs font-semibold">
                          {initialsOf(item.assigneeName, item.assigneeUsername)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Split-pane Timeline layout organizing Work Items chronologically across Project Eras. */
export function WorkItemsTimelineView({
  items,
  statuses,
  eras,
  typeNames,
  statusNames,
}: Pick<LayoutViewProps, 'items' | 'statuses' | 'eras' | 'typeNames' | 'statusNames'>) {
  const [scale, setScale] = useState<TimelineScale>('weeks');
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const unscheduled = items.filter((i) => !i.eraId);

  return (
    <div className="flex flex-col gap-2.5 px-6 py-4" role="region" aria-label="Work Items timeline">
      <TimelineScaleToolbar scale={scale} itemCount={items.length} onChangeScale={setScale} />

      <div className="overflow-hidden rounded-md border border-border bg-card">
        {eras.map((era) => (
          <TimelineLane
            key={era.id}
            title={era.name}
            subtitle={`${era.startDate} → ${era.endDate}`}
            badge={era.state}
            items={items.filter((i) => i.eraId === era.id)}
            statusById={statusById}
            statusNames={statusNames}
            typeNames={typeNames}
            scale={scale}
          />
        ))}
        <TimelineLane
          title="Unscheduled"
          items={unscheduled}
          statusById={statusById}
          statusNames={statusNames}
          typeNames={typeNames}
          scale={scale}
        />
      </div>
    </div>
  );
}

/* ============================================================================
 * Calendar View (OpenBoard sharp corners)
 * ============================================================================ */

function dateBucketFor(item: WorkItem, eraMap: Map<string, ProjectEra>): string {
  const era = item.eraId ? eraMap.get(item.eraId) : undefined;
  if (era) return `${era.startDate} – ${era.endDate} (${era.name})`;
  return item.createdAt.slice(0, 10);
}

/** Calendar layout grouping Work Items by Era date window or creation date. */
export function WorkItemsCalendarView({
  items,
  eras,
  typeNames,
  statusNames,
}: Pick<LayoutViewProps, 'items' | 'eras' | 'typeNames' | 'statusNames'>) {
  const eraMap = new Map(eras.map((e) => [e.id, e]));
  const buckets = new Map<string, WorkItem[]>();
  for (const item of items) {
    const key = dateBucketFor(item, eraMap);
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }
  const sortedBuckets = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div
      className="grid gap-3 px-6 py-4 sm:grid-cols-2 lg:grid-cols-3"
      role="region"
      aria-label="Work Items calendar"
    >
      {sortedBuckets.map(([bucket, bucketItems]) => (
        <section
          key={bucket}
          aria-label={bucket}
          className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-3"
        >
          <h3 className="text-2xs font-semibold text-muted-foreground tabular-nums">{bucket}</h3>
          <ul className="grid gap-1.5">
            {bucketItems.map((item) => (
              <li
                key={item.id}
                className="grid gap-1.5 rounded-sm border border-transparent bg-card p-2.5 text-sm shadow-card transition-colors hover:border-input"
              >
                <Link to={workItemPath(item.id)} className="font-medium hover:underline">
                  {item.title}
                </Link>
                <div className="flex flex-wrap gap-1">
                  <Tag>{typeNames.get(item.workItemTypeId) ?? 'Item'}</Tag>
                  <Badge variant="secondary">{statusNames.get(item.statusId) ?? 'Status'}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
