import { AlertCircle, Kanban, List, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import type { Project, ProjectStatus, ProjectWorkItemType } from '../../projects';
import { useProjectStatuses, useProjectWorkItemTypes } from '../../projects/hooks/useProjects';
import type { Priority, WorkItem, WorkItemFilters } from '../api/workItemsApi';
import { useTransitionWorkItem, useWorkItems } from '../hooks/useWorkItems';
import { workItemPath } from '../paths';
import { CreateWorkItemForm } from './CreateWorkItemForm';
import {
  formatEstimate,
  PRIORITIES,
  priorityLabels,
  priorityVariants,
  selectClassName,
} from './workItemLabels';

type ViewMode = 'list' | 'board';

function WorkItemMeta({ item, typeName }: { item: WorkItem; typeName: string }) {
  const estimate = formatEstimate(item);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Badge variant="outline">{typeName}</Badge>
      {item.priority !== 'none' && (
        <Badge variant={priorityVariants[item.priority]}>{priorityLabels[item.priority]}</Badge>
      )}
      {estimate && <Badge variant="secondary">{estimate}</Badge>}
      {item.assigneeUsername && <span>@{item.assigneeUsername}</span>}
    </div>
  );
}

interface StatusSelectProps {
  item: WorkItem;
  statuses: ProjectStatus[];
  disabled: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
}

function WorkItemStatusSelect({ item, statuses, disabled, onTransition }: StatusSelectProps) {
  return (
    <select
      aria-label={`Status for ${item.title}`}
      className={`${selectClassName} h-8 w-auto min-w-32 text-xs`}
      value={item.statusId}
      disabled={disabled}
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

interface WorkItemsListViewProps {
  items: WorkItem[];
  statuses: ProjectStatus[];
  typeNames: Map<string, string>;
  statusNames: Map<string, string>;
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
}

function WorkItemsListView({
  items,
  statuses,
  typeNames,
  statusNames,
  canWrite,
  busy,
  onTransition,
}: WorkItemsListViewProps) {
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="grid min-w-0 gap-1">
            <Link
              to={workItemPath(item.id)}
              className="font-medium break-words hover:underline focus-visible:underline"
            >
              {item.title}
            </Link>
            <WorkItemMeta item={item} typeName={typeNames.get(item.workItemTypeId) ?? 'Item'} />
          </div>
          <div className="flex items-center gap-2">
            {canWrite && statuses.length > 0 ? (
              <WorkItemStatusSelect
                item={item}
                statuses={statuses}
                disabled={busy}
                onTransition={onTransition}
              />
            ) : (
              <Badge variant="secondary">{statusNames.get(item.statusId) ?? 'Status'}</Badge>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

interface WorkItemsBoardViewProps {
  items: WorkItem[];
  statuses: ProjectStatus[];
  typeNames: Map<string, string>;
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
}

function WorkItemsBoardView({
  items,
  statuses,
  typeNames,
  canWrite,
  busy,
  onTransition,
}: WorkItemsBoardViewProps) {
  return (
    <div
      className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-4"
      role="region"
      aria-label="Work Items board"
    >
      {statuses.map((status) => {
        const columnItems = items.filter((item) => item.statusId === status.id);
        return (
          <section
            key={status.id}
            aria-label={status.name}
            className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3"
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <h3 className="text-sm font-semibold">{status.name}</h3>
              <Badge variant="outline">{columnItems.length}</Badge>
            </div>
            <div className="grid gap-2">
              {columnItems.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">No items</p>
              ) : (
                columnItems.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-md border bg-card p-3 shadow-xs">
                    <Link
                      to={workItemPath(item.id)}
                      className="text-sm font-medium break-words hover:underline"
                    >
                      {item.title}
                    </Link>
                    <WorkItemMeta
                      item={item}
                      typeName={typeNames.get(item.workItemTypeId) ?? 'Item'}
                    />
                    {canWrite && (
                      <WorkItemStatusSelect
                        item={item}
                        statuses={statuses}
                        disabled={busy}
                        onTransition={onTransition}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface FilterBarProps {
  viewMode: ViewMode;
  filters: WorkItemFilters;
  types: ProjectWorkItemType[];
  statuses: ProjectStatus[];
  onChange: (patch: Partial<WorkItemFilters>) => void;
}

function WorkItemsFilterBar({ viewMode, filters, types, statuses, onChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
      <select
        aria-label="Filter by Work Item Type"
        className={`${selectClassName} h-8 w-auto min-w-36 text-xs`}
        value={filters.workItemTypeId ?? ''}
        onChange={(e) => {
          onChange({ workItemTypeId: e.target.value || undefined });
        }}
      >
        <option value="">All types</option>
        {types.map((wt) => (
          <option key={wt.id} value={wt.id}>
            {wt.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by Priority"
        className={`${selectClassName} h-8 w-auto min-w-32 text-xs`}
        value={filters.priority ?? ''}
        onChange={(e) => {
          onChange({ priority: (e.target.value as Priority | '') || undefined });
        }}
      >
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {priorityLabels[p]}
          </option>
        ))}
      </select>
      {viewMode === 'list' && (
        <select
          aria-label="Filter by Status"
          className={`${selectClassName} h-8 w-auto min-w-36 text-xs`}
          value={filters.statusId ?? ''}
          onChange={(e) => {
            onChange({ statusId: e.target.value || undefined });
          }}
        >
          <option value="">All statuses</option>
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

interface BodyProps {
  isPending: boolean;
  error: unknown;
  items: WorkItem[];
  viewMode: ViewMode;
  statuses: ProjectStatus[];
  types: ProjectWorkItemType[];
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
}

function WorkItemsBody({
  isPending,
  error,
  items,
  viewMode,
  statuses,
  types,
  canWrite,
  busy,
  onTransition,
}: BodyProps) {
  if (isPending) {
    return (
      <div className="p-6">
        <span
          role="status"
          aria-label="Loading"
          className="inline-flex items-center text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="grid gap-1 p-6 text-center">
        <p className="text-sm font-medium">No Work Items yet</p>
        <p className="text-sm text-muted-foreground">
          {canWrite
            ? 'Create the first Work Item to start planning and tracking work.'
            : 'Work Items created in this Project will appear here.'}
        </p>
      </div>
    );
  }
  const typeNames = new Map(types.map((t) => [t.id, t.name]));
  const statusNames = new Map(statuses.map((s) => [s.id, s.name]));
  if (viewMode === 'board' && statuses.length > 0) {
    return (
      <WorkItemsBoardView
        items={items}
        statuses={statuses}
        typeNames={typeNames}
        canWrite={canWrite}
        busy={busy}
        onTransition={onTransition}
      />
    );
  }
  return (
    <WorkItemsListView
      items={items}
      statuses={statuses}
      typeNames={typeNames}
      statusNames={statusNames}
      canWrite={canWrite}
      busy={busy}
      onTransition={onTransition}
    />
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
}

function WorkItemsPagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t px-6 py-3 text-sm">
      <span className="text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => {
            onPageChange(Math.max(1, page - 1));
          }}
        >
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => {
            onPageChange(page + 1);
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

interface WorkItemsToolbarProps {
  viewMode: ViewMode;
  showCreateButton: boolean;
  onSelectView: (mode: ViewMode) => void;
  onStartCreate: () => void;
}

function WorkItemsToolbar({
  viewMode,
  showCreateButton,
  onSelectView,
  onStartCreate,
}: WorkItemsToolbarProps) {
  return (
    <CardAction className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1" role="group" aria-label="View mode">
        <Button
          type="button"
          size="sm"
          variant={viewMode === 'list' ? 'default' : 'outline'}
          aria-pressed={viewMode === 'list'}
          onClick={() => {
            onSelectView('list');
          }}
        >
          <List className="size-4" aria-hidden="true" />
          List
        </Button>
        <Button
          type="button"
          size="sm"
          variant={viewMode === 'board' ? 'default' : 'outline'}
          aria-pressed={viewMode === 'board'}
          onClick={() => {
            onSelectView('board');
          }}
        >
          <Kanban className="size-4" aria-hidden="true" />
          Board
        </Button>
      </div>
      {showCreateButton && (
        <Button type="button" size="sm" onClick={onStartCreate}>
          <Plus className="size-4" aria-hidden="true" />
          New Work Item
        </Button>
      )}
    </CardAction>
  );
}

function TransitionAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="border-b p-4">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
      </Alert>
    </div>
  );
}

interface ProjectWorkItemsProps {
  project: Project;
}

/** Displays a Project's Work Items in List or Board view with filters and inline creation. */
export function ProjectWorkItems({ project }: ProjectWorkItemsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState<WorkItemFilters>({});

  const statuses = useProjectStatuses(project.id).data ?? [];
  const types = useProjectWorkItemTypes(project.id).data ?? [];
  const itemsQuery = useWorkItems(project.id, filters, page);
  const transition = useTransitionWorkItem(project.id);

  const canWrite = project.currentUserRole !== 'viewer';
  const items = itemsQuery.data?.items ?? [];
  const totalPages = itemsQuery.data?.totalPages ?? 1;

  function updateFilter(patch: Partial<WorkItemFilters>) {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function handleSelectView(mode: ViewMode) {
    setViewMode(mode);
    if (mode === 'board' && filters.statusId) updateFilter({ statusId: '' });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Work Items</CardTitle>
        <WorkItemsToolbar
          viewMode={viewMode}
          showCreateButton={canWrite && !creating && types.length > 0}
          onSelectView={handleSelectView}
          onStartCreate={() => {
            setCreating(true);
          }}
        />
      </CardHeader>
      <CardContent className="p-0">
        {creating && (
          <CreateWorkItemForm
            projectId={project.id}
            statuses={statuses}
            workItemTypes={types}
            existingItems={items}
            onClose={() => {
              setCreating(false);
            }}
          />
        )}
        <WorkItemsFilterBar
          viewMode={viewMode}
          filters={filters}
          types={types}
          statuses={statuses}
          onChange={updateFilter}
        />
        <TransitionAlert error={transition.error} />
        <WorkItemsBody
          isPending={itemsQuery.isPending}
          error={itemsQuery.error}
          items={items}
          viewMode={viewMode}
          statuses={statuses}
          types={types}
          canWrite={canWrite}
          busy={transition.isPending}
          onTransition={(workItemId, statusId) => {
            transition.mutate({ workItemId, statusId });
          }}
        />
        <WorkItemsPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}
