import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import type { ProjectEra, ProjectStatus } from '../../projects';
import type { WorkItem } from '../api/workItemsApi';
import { workItemPath } from '../paths';
import {
  formatEstimate,
  priorityLabels,
  priorityVariants,
  selectClassName,
} from './workItemLabels';

export interface LayoutViewProps {
  items: WorkItem[];
  statuses: ProjectStatus[];
  eras: ProjectEra[];
  typeNames: Map<string, string>;
  statusNames: Map<string, string>;
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
}

function InlineStatusCell({
  item,
  statuses,
  statusName,
  canWrite,
  busy,
  onTransition,
}: {
  item: WorkItem;
  statuses: ProjectStatus[];
  statusName: string;
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
}) {
  if (!canWrite || statuses.length === 0) {
    return <Badge variant="secondary">{statusName}</Badge>;
  }
  return (
    <select
      aria-label={`Status for ${item.title}`}
      className={`${selectClassName} h-7 w-auto min-w-28 text-xs`}
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
  );
}

/** Tabular layout showing each Work Item's key fields in aligned columns. */
export function WorkItemsTableView({
  items,
  statuses,
  eras,
  typeNames,
  statusNames,
  canWrite,
  busy,
  onTransition,
}: LayoutViewProps) {
  const eraNames = new Map(eras.map((e) => [e.id, e.name]));
  return (
    <div className="p-4 md:p-6">
      <div
        className="overflow-x-auto rounded-xl border border-border bg-card"
        role="region"
        aria-label="Work Items table"
      >
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
              <th className="px-5 py-2.5">Title</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Priority</th>
              <th className="px-3 py-2.5">Estimate</th>
              <th className="px-3 py-2.5">Era</th>
              <th className="px-5 py-2.5">Assignee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-accent/40">
                <td className="px-5 py-2.5 font-medium">
                  <Link
                    to={workItemPath(item.id)}
                    className="hover:underline focus-visible:underline"
                  >
                    {item.title}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline">{typeNames.get(item.workItemTypeId) ?? 'Item'}</Badge>
                </td>
                <td className="px-3 py-2.5">
                  <InlineStatusCell
                    item={item}
                    statuses={statuses}
                    statusName={statusNames.get(item.statusId) ?? 'Status'}
                    canWrite={canWrite}
                    busy={busy}
                    onTransition={onTransition}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={priorityVariants[item.priority]}>
                    {priorityLabels[item.priority]}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                  {formatEstimate(item) ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {item.eraId ? (eraNames.get(item.eraId) ?? '—') : '—'}
                </td>
                <td className="px-5 py-2.5 text-xs text-muted-foreground">
                  {item.assigneeUsername ? `@${item.assigneeUsername}` : 'Unassigned'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimelineLane({
  title,
  subtitle,
  badge,
  items,
  statusNames,
  typeNames,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  items: WorkItem[];
  statusNames: Map<string, string>;
  typeNames: Map<string, string>;
}) {
  return (
    <section
      aria-label={title}
      className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {badge && <Badge variant="secondary">{badge}</Badge>}
        </div>
        {subtitle && <span className="text-xs text-muted-foreground tabular-nums">{subtitle}</span>}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No Work Items scheduled here.</p>
      ) : (
        <ul className="grid gap-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <Link to={workItemPath(item.id)} className="font-medium hover:underline">
                {item.title}
              </Link>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline">{typeNames.get(item.workItemTypeId) ?? 'Item'}</Badge>
                <Badge variant="secondary">{statusNames.get(item.statusId) ?? 'Status'}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Timeline layout organizing Work Items chronologically across Project Eras. */
export function WorkItemsTimelineView({
  items,
  eras,
  typeNames,
  statusNames,
}: Pick<LayoutViewProps, 'items' | 'eras' | 'typeNames' | 'statusNames'>) {
  const unscheduled = items.filter((i) => !i.eraId);
  return (
    <div className="grid gap-3 p-5" role="region" aria-label="Work Items timeline">
      {eras.map((era) => (
        <TimelineLane
          key={era.id}
          title={era.name}
          subtitle={`${era.startDate} → ${era.endDate}`}
          badge={era.state}
          items={items.filter((i) => i.eraId === era.id)}
          statusNames={statusNames}
          typeNames={typeNames}
        />
      ))}
      <TimelineLane
        title="Unscheduled"
        items={unscheduled}
        statusNames={statusNames}
        typeNames={typeNames}
      />
    </div>
  );
}

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
      className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3"
      role="region"
      aria-label="Work Items calendar"
    >
      {sortedBuckets.map(([bucket, bucketItems]) => (
        <section
          key={bucket}
          aria-label={bucket}
          className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3"
        >
          <h3 className="text-xs font-semibold text-muted-foreground tabular-nums">{bucket}</h3>
          <ul className="grid gap-1.5">
            {bucketItems.map((item) => (
              <li
                key={item.id}
                className="grid gap-1 rounded-md border border-border bg-card p-2.5 text-sm"
              >
                <Link to={workItemPath(item.id)} className="font-medium hover:underline">
                  {item.title}
                </Link>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">{typeNames.get(item.workItemTypeId) ?? 'Item'}</Badge>
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
