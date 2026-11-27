import { AlertCircle, Archive, Loader2, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useProjectShell,
  type ProjectConfigTab,
  type ProjectShellState,
} from '@/app/project-shell-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth';
import { errorMessage } from '../../../shared/api/httpClient';
import type {
  Project,
  ProjectEra,
  ProjectStatus,
  ProjectView,
  ProjectWorkItemType,
  ViewLayout,
} from '../../projects';
import {
  useProjectEras,
  useProjectStatuses,
  useProjectWorkItemTypes,
  useUnarchiveProject,
} from '../../projects/hooks/useProjects';
import {
  useCreateProjectView,
  useDeleteProjectView,
  useProjectViews,
  useUpdateProjectView,
} from '../../projects/hooks/useProjectViews';
import type { Priority, WorkItem, WorkItemFilters } from '../api/workItemsApi';
import { useCreateWorkItem, useTransitionWorkItem, useWorkItems } from '../hooks/useWorkItems';
import { CreateWorkItemDialog } from './CreateWorkItemForm';
import { SaveViewBanner } from './ProjectViewsBar';
import { ProjectWorkspaceHeader, type Participant } from './ProjectWorkspaceHeader';
import { WorkItemsBoardView } from './WorkItemsBoardView';
import {
  WorkItemsCalendarView,
  WorkItemsListView,
  WorkItemsTableView,
  WorkItemsTimelineView,
} from './WorkItemsLayouts';

const LAYOUT_TITLES: Record<ViewLayout, string> = {
  board: 'Board',
  timeline: 'Timeline',
  list: 'Backlog',
  table: 'Table',
  calendar: 'Calendar',
};

function canEditSavedView(
  view: ProjectView,
  userId: string | undefined,
  project: Project,
): boolean {
  if (project.currentUserRole === 'viewer') return false;
  if (view.visibility === 'personal') return view.createdBy === userId;
  return view.createdBy === userId || project.currentUserRole === 'owner';
}

function toSavedFilters(filters: WorkItemFilters) {
  return {
    ...(filters.statusId ? { statusId: filters.statusId } : {}),
    ...(filters.workItemTypeId ? { workItemTypeId: filters.workItemTypeId } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(filters.eraId ? { eraId: filters.eraId } : {}),
  };
}

function filtersFromView(view: ProjectView): WorkItemFilters {
  return {
    ...(view.filters.statusId ? { statusId: view.filters.statusId } : {}),
    ...(view.filters.workItemTypeId ? { workItemTypeId: view.filters.workItemTypeId } : {}),
    ...(view.filters.priority ? { priority: view.filters.priority as Priority } : {}),
    ...(view.filters.assigneeId ? { assigneeId: view.filters.assigneeId } : {}),
    ...(view.filters.eraId ? { eraId: view.filters.eraId } : {}),
  };
}

function collectParticipants(
  items: WorkItem[],
  currentUser: { id: string; name: string; username: string } | null | undefined,
): Participant[] {
  const map = new Map<string, Participant>();
  if (currentUser) {
    map.set(currentUser.id, {
      id: currentUser.id,
      name: currentUser.name,
      username: currentUser.username,
    });
  }
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

function filterBySearch(items: WorkItem[], query: string): WorkItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) => item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
  );
}

interface BodyProps {
  isPending: boolean;
  error: unknown;
  items: WorkItem[];
  viewMode: ViewLayout;
  statusFilterId?: string;
  statuses: ProjectStatus[];
  types: ProjectWorkItemType[];
  eras: ProjectEra[];
  canWrite: boolean;
  busy: boolean;
  onTransition: (workItemId: string, statusId: string) => void;
  onStartCreate?: (statusId?: string) => void;
  onQuickCreate?: (statusId: string, title: string) => Promise<void>;
}

function renderActiveLayout(props: Omit<BodyProps, 'isPending' | 'error'>) {
  const typeNames = new Map(props.types.map((t) => [t.id, t.name]));
  const statusNames = new Map(props.statuses.map((s) => [s.id, s.name]));
  const shared = { ...props, typeNames, statusNames, defaultTypeName: props.types[0]?.name };
  if (props.viewMode === 'board' && props.statuses.length > 0) {
    return <WorkItemsBoardView {...shared} />;
  }
  if (props.viewMode === 'table') return <WorkItemsTableView {...shared} />;
  if (props.viewMode === 'timeline') return <WorkItemsTimelineView {...shared} />;
  if (props.viewMode === 'calendar') return <WorkItemsCalendarView {...shared} />;
  return <WorkItemsListView {...shared} />;
}

function WorkItemsBody({ isPending, error, ...rest }: BodyProps) {
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
  const keepsEmptyLayout =
    (rest.viewMode === 'board' || rest.viewMode === 'list') && rest.statuses.length > 0;
  if (rest.items.length === 0 && !keepsEmptyLayout) {
    return (
      <div className="grid gap-1 p-10 text-center">
        <p className="text-sm font-medium">No Work Items yet</p>
        <p className="text-sm text-muted-foreground">
          {rest.canWrite
            ? 'Create the first Work Item to start planning and tracking work.'
            : 'Work Items created in this Project will appear here.'}
        </p>
      </div>
    );
  }
  return renderActiveLayout(rest);
}

function WorkItemsPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-border bg-card px-6 py-3 text-sm">
      <span className="text-muted-foreground tabular-nums">
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

interface ProjectWorkItemsProps {
  project: Project;
  configOpen: boolean;
  configTab: ProjectConfigTab;
  onToggleConfig: () => void;
  onOpenConfigTab: (tab: ProjectConfigTab) => void;
}

const EMPTY_STATUSES: ProjectStatus[] = [];
const EMPTY_TYPES: ProjectWorkItemType[] = [];
const EMPTY_ERAS: ProjectEra[] = [];
const EMPTY_VIEWS: ProjectView[] = [];
const EMPTY_ITEMS: WorkItem[] = [];

function useProjectWorkItemsData(projectId: string, filters: WorkItemFilters, page: number) {
  const { data: currentUser } = useCurrentUser();
  const statuses = useProjectStatuses(projectId).data ?? EMPTY_STATUSES;
  const types = useProjectWorkItemTypes(projectId).data ?? EMPTY_TYPES;
  const eras = useProjectEras(projectId).data ?? EMPTY_ERAS;
  const views = useProjectViews(projectId).data ?? EMPTY_VIEWS;
  const itemsQuery = useWorkItems(projectId, filters, page);
  const transition = useTransitionWorkItem(projectId);
  const createView = useCreateProjectView(projectId);
  const updateView = useUpdateProjectView(projectId);
  const deleteView = useDeleteProjectView(projectId);

  return {
    currentUser,
    statuses,
    types,
    eras,
    views,
    items: itemsQuery.data?.items ?? EMPTY_ITEMS,
    totalPages: itemsQuery.data?.totalPages ?? 1,
    isPending: itemsQuery.isPending,
    error: itemsQuery.error,
    transition,
    createView,
    updateView,
    deleteView,
  };
}

function useSyncProjectShell(shellState: ProjectShellState) {
  const { setShell } = useProjectShell();

  useEffect(() => {
    setShell(shellState);
  }, [shellState, setShell]);

  useEffect(() => {
    return () => {
      setShell(null);
    };
  }, [setShell]);
}

function useActiveViewMeta(
  project: Project,
  views: ProjectView[],
  activeViewId: string | null,
  userId: string | undefined,
  viewMode: ViewLayout,
) {
  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const canEditActiveView = activeView ? canEditSavedView(activeView, userId, project) : false;
  return {
    activeView,
    canEditActiveView,
    isActiveViewCreator: activeView?.createdBy === userId,
    viewTitle: activeView ? activeView.name : LAYOUT_TITLES[viewMode],
    viewKey: activeView ? `view:${activeView.id}` : viewMode,
  };
}

function useSavedViewHandlers(
  data: ReturnType<typeof useProjectWorkItemsData>,
  activeView: ProjectView | null,
  viewMode: ViewLayout,
  filters: WorkItemFilters,
  onClearActiveView: () => void,
) {
  const viewBusy =
    data.createView.isPending || data.updateView.isPending || data.deleteView.isPending;
  const viewError = data.createView.error ?? data.updateView.error ?? data.deleteView.error;

  function onUpdateActiveView() {
    if (!activeView) return;
    data.updateView.mutate({
      viewId: activeView.id,
      payload: { layout: viewMode, filters: toSavedFilters(filters) },
    });
  }

  function onToggleActiveViewVisibility() {
    if (!activeView) return;
    data.updateView.mutate({
      viewId: activeView.id,
      payload: {
        visibility: activeView.visibility === 'personal' ? 'shared' : 'personal',
      },
    });
  }

  function onDeleteActiveView() {
    if (!activeView) return;
    data.deleteView.mutate(activeView.id, { onSuccess: onClearActiveView });
  }

  return {
    viewBusy,
    viewError,
    onUpdateActiveView,
    onToggleActiveViewVisibility,
    onDeleteActiveView,
  };
}

function ProjectReadOnlyBanner({
  project,
  busy,
  onRestore,
}: {
  project: Project;
  busy: boolean;
  onRestore: () => void;
}) {
  if (!project.isReadOnly) return null;
  const canRestore = Boolean(project.archivedAt) && project.currentUserRole === 'owner';
  return (
    <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2.5 md:px-6">
      <Alert>
        <Archive aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {project.workspaceArchived
              ? 'This Project is read-only because its Workspace is Archived.'
              : 'This Project is Archived and read-only.'}
          </span>
          {canRestore && (
            <Button
              type="button"
              size="compact"
              variant="outline"
              disabled={busy}
              onClick={onRestore}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Restore Project
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}

/** Displays a Project's persistent 4-row view header and active Board/Timeline/Table/Calendar/List canvas. */
export function ProjectWorkItems({
  project,
  configOpen,
  configTab,
  onToggleConfig,
  onOpenConfigTab,
}: ProjectWorkItemsProps) {
  const [viewMode, setViewMode] = useState<ViewLayout>('board');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [createStatusId, setCreateStatusId] = useState<string | undefined>(undefined);
  const [savingView, setSavingView] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<WorkItemFilters>({});
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const data = useProjectWorkItemsData(project.id, filters, page);
  const createWorkItem = useCreateWorkItem(project.id);
  const unarchive = useUnarchiveProject(project.id);
  const isReadOnly = Boolean(project.isReadOnly);
  const canWrite = project.currentUserRole !== 'viewer' && !isReadOnly;
  const canCreateWorkItem = canWrite && data.types.length > 0;
  const defaultTypeId = data.types[0]?.id ?? '';
  const viewMeta = useActiveViewMeta(
    project,
    data.views,
    activeViewId,
    data.currentUser?.id,
    viewMode,
  );

  const visibleItems = useMemo(
    () => filterBySearch(data.items, searchQuery),
    [data.items, searchQuery],
  );
  const participants = useMemo(
    () => collectParticipants(data.items, data.currentUser),
    [data.items, data.currentUser],
  );

  const handleSelectLayout = useCallback((mode: ViewLayout) => {
    setActiveViewId(null);
    setViewMode(mode);
  }, []);

  const handleApplySavedView = useCallback((view: ProjectView | null) => {
    setPage(1);
    if (!view) {
      setActiveViewId(null);
      setFilters({});
      return;
    }
    setActiveViewId(view.id);
    setViewMode(view.layout);
    setFilters(filtersFromView(view));
  }, []);

  const handleRequestSaveView = useCallback(() => {
    setSavingView(true);
  }, []);

  const handleStartCreate = useCallback((preferredStatusId?: string) => {
    setCreateStatusId(typeof preferredStatusId === 'string' ? preferredStatusId : undefined);
    setCreating(true);
  }, []);

  const handleQuickCreate = useCallback(
    async (statusId: string, title: string) => {
      if (!defaultTypeId) return;
      await createWorkItem.mutateAsync({
        workItemTypeId: defaultTypeId,
        statusId,
        title,
      });
    },
    [createWorkItem, defaultTypeId],
  );

  const viewHandlers = useSavedViewHandlers(data, viewMeta.activeView, viewMode, filters, () => {
    handleApplySavedView(null);
  });

  const shellState = useMemo<ProjectShellState>(
    () => ({
      project,
      activeViewMode: viewMode,
      activeViewId,
      views: data.views,
      searchQuery,
      configOpen,
      configTab,
      canWrite,
      canCreateWorkItem,
      onSelectLayout: handleSelectLayout,
      onSelectSavedView: handleApplySavedView,
      onRequestSaveView: handleRequestSaveView,
      onSearchChange: setSearchQuery,
      onToggleConfig,
      onOpenConfigTab,
      onStartCreateWorkItem: handleStartCreate,
    }),
    [
      project,
      viewMode,
      activeViewId,
      data.views,
      searchQuery,
      configOpen,
      configTab,
      canWrite,
      canCreateWorkItem,
      handleSelectLayout,
      handleApplySavedView,
      handleRequestSaveView,
      onToggleConfig,
      onOpenConfigTab,
      handleStartCreate,
    ],
  );

  useSyncProjectShell(shellState);

  function updateFilter(patch: Partial<WorkItemFilters>) {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function resetFilters() {
    setPage(1);
    setSearchQuery('');
    setFilters({});
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Main Row 1: Persistent 4-sub-row header */}
      <ProjectWorkspaceHeader
        project={project}
        viewKey={viewMeta.viewKey}
        viewTitle={viewMeta.viewTitle}
        visibleCount={visibleItems.length}
        searchQuery={searchQuery}
        filters={filters}
        filtersOpen={filtersOpen}
        configOpen={configOpen}
        types={data.types}
        statuses={data.statuses}
        eras={data.eras}
        participants={participants}
        canWrite={canWrite}
        showCreateButton={canCreateWorkItem}
        activeViewMode={viewMode}
        activeView={viewMeta.activeView}
        views={data.views}
        canEditActiveView={viewMeta.canEditActiveView}
        isActiveViewCreator={viewMeta.isActiveViewCreator}
        viewBusy={viewHandlers.viewBusy}
        onSelectLayout={handleSelectLayout}
        onSelectSavedView={handleApplySavedView}
        onSearchChange={setSearchQuery}
        onFilterChange={updateFilter}
        onResetFilters={resetFilters}
        onToggleFilters={() => {
          setFiltersOpen((prev) => !prev);
        }}
        onToggleConfig={onToggleConfig}
        onOpenConfigTab={onOpenConfigTab}
        onStartCreate={() => {
          handleStartCreate();
        }}
        onRequestSaveView={handleRequestSaveView}
        onUpdateActiveView={viewHandlers.onUpdateActiveView}
        onToggleActiveViewVisibility={viewHandlers.onToggleActiveViewVisibility}
        onDeleteActiveView={viewHandlers.onDeleteActiveView}
      />

      <ProjectReadOnlyBanner
        project={project}
        busy={unarchive.isPending}
        onRestore={() => {
          unarchive.mutate();
        }}
      />

      <SaveViewBanner
        open={savingView}
        busy={data.createView.isPending}
        error={viewHandlers.viewError}
        onSave={(name) => {
          data.createView.mutate(
            { name, layout: viewMode, filters: toSavedFilters(filters) },
            {
              onSuccess: (saved) => {
                setSavingView(false);
                handleApplySavedView(saved);
              },
            },
          );
        }}
        onCancel={() => {
          setSavingView(false);
        }}
      />

      <CreateWorkItemDialog
        open={creating}
        onOpenChange={(nextOpen) => {
          setCreating(nextOpen);
          if (!nextOpen) setCreateStatusId(undefined);
        }}
        projectId={project.id}
        statuses={data.statuses}
        workItemTypes={data.types}
        existingItems={data.items}
        eras={data.eras}
        participants={participants}
        initialStatusId={createStatusId}
      />

      {Boolean(data.transition.error) && (
        <div className="shrink-0 border-b border-border px-4 py-2.5 md:px-6">
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription role="alert">{errorMessage(data.transition.error)}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main Row 2: Active Visualization Canvas */}
      <div className="min-h-0 flex-1 overflow-auto bg-background">
        <WorkItemsBody
          isPending={data.isPending}
          error={data.error}
          items={visibleItems}
          viewMode={viewMode}
          statusFilterId={filters.statusId}
          statuses={data.statuses}
          types={data.types}
          eras={data.eras}
          canWrite={canWrite}
          busy={data.transition.isPending}
          onTransition={(workItemId, statusId) => {
            data.transition.mutate({ workItemId, statusId });
          }}
          onStartCreate={canCreateWorkItem ? handleStartCreate : undefined}
          onQuickCreate={canCreateWorkItem ? handleQuickCreate : undefined}
        />
        <WorkItemsPagination page={page} totalPages={data.totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
