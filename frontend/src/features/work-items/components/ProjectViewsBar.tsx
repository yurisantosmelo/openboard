import { AlertCircle, BookmarkPlus, Globe, Lock, Save, Trash2 } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '../../../shared/api/httpClient';
import { useCurrentUser } from '../../auth';
import type { Project, ProjectView, ViewLayout } from '../../projects';
import {
  useCreateProjectView,
  useDeleteProjectView,
  useProjectViews,
  useUpdateProjectView,
} from '../../projects/hooks/useProjectViews';
import type { WorkItemFilters } from '../api/workItemsApi';

interface ProjectViewsBarProps {
  project: Project;
  activeViewId: string | null;
  currentLayout: ViewLayout;
  currentFilters: WorkItemFilters;
  onSelectView: (view: ProjectView | null) => void;
}

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

function SaveViewForm({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
  }
  return (
    <form
      aria-label="Save View"
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 pt-2"
    >
      <Input
        aria-label="View name"
        placeholder="View name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        className="w-52"
        required
      />
      <Button type="submit" size="sm" disabled={busy}>
        Save Personal View
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function ActiveViewActions({
  view,
  isCreator,
  busy,
  onSaveLayout,
  onToggleVisibility,
  onDelete,
}: {
  view: ProjectView;
  isCreator: boolean;
  busy: boolean;
  onSaveLayout: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button type="button" size="compact" variant="outline" disabled={busy} onClick={onSaveLayout}>
        <Save className="size-3.5" aria-hidden="true" />
        Update View
      </Button>
      {isCreator && (
        <Button
          type="button"
          size="compact"
          variant="outline"
          disabled={busy}
          onClick={onToggleVisibility}
        >
          {view.visibility === 'personal' ? (
            <>
              <Globe className="size-3.5" aria-hidden="true" />
              Share View
            </>
          ) : (
            <>
              <Lock className="size-3.5" aria-hidden="true" />
              Make Personal
            </>
          )}
        </Button>
      )}
      <Button
        type="button"
        size="compact"
        variant="destructive-outline"
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Delete View
      </Button>
    </div>
  );
}

function useViewsBarData(project: Project, activeViewId: string | null) {
  const { data: user } = useCurrentUser();
  const views = useProjectViews(project.id).data ?? [];
  const createView = useCreateProjectView(project.id);
  const updateView = useUpdateProjectView(project.id);
  const deleteView = useDeleteProjectView(project.id);
  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  return {
    userId: user?.id,
    views,
    activeView,
    canWrite: project.currentUserRole !== 'viewer',
    canEditActive: activeView ? canEditSavedView(activeView, user?.id, project) : false,
    busy: createView.isPending || updateView.isPending || deleteView.isPending,
    mutationError: createView.error ?? updateView.error ?? deleteView.error,
    createView,
    updateView,
    deleteView,
  };
}

/** Displays saved Personal and Shared Views for a Project and lets writers manage them. */
export function ProjectViewsBar({
  project,
  activeViewId,
  currentLayout,
  currentFilters,
  onSelectView,
}: ProjectViewsBarProps) {
  const [creating, setCreating] = useState(false);
  const {
    userId,
    views,
    activeView,
    canWrite,
    canEditActive,
    busy,
    mutationError,
    createView,
    updateView,
    deleteView,
  } = useViewsBarData(project, activeViewId);

  return (
    <div
      role="region"
      aria-label="Saved Views"
      className="flex flex-col gap-2 border-b border-border bg-muted/20 px-5 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="compact"
            variant={activeViewId === null ? 'secondary' : 'ghost'}
            aria-pressed={activeViewId === null}
            onClick={() => {
              onSelectView(null);
            }}
          >
            All Work Items
          </Button>
          {views.map((view) => (
            <Button
              key={view.id}
              type="button"
              size="compact"
              variant={activeViewId === view.id ? 'default' : 'outline'}
              aria-pressed={activeViewId === view.id}
              onClick={() => {
                onSelectView(view);
              }}
            >
              {view.visibility === 'shared' ? (
                <Globe className="size-3" aria-hidden="true" />
              ) : (
                <Lock className="size-3" aria-hidden="true" />
              )}
              {view.name}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {activeView && canEditActive && (
            <ActiveViewActions
              view={activeView}
              isCreator={activeView.createdBy === userId}
              busy={busy}
              onSaveLayout={() => {
                updateView.mutate({
                  viewId: activeView.id,
                  payload: { layout: currentLayout, filters: toSavedFilters(currentFilters) },
                });
              }}
              onToggleVisibility={() => {
                updateView.mutate({
                  viewId: activeView.id,
                  payload: {
                    visibility: activeView.visibility === 'personal' ? 'shared' : 'personal',
                  },
                });
              }}
              onDelete={() => {
                deleteView.mutate(activeView.id, {
                  onSuccess: () => {
                    onSelectView(null);
                  },
                });
              }}
            />
          )}
          {canWrite && !creating && (
            <Button
              type="button"
              size="compact"
              variant="outline"
              onClick={() => {
                setCreating(true);
              }}
            >
              <BookmarkPlus className="size-3.5" aria-hidden="true" />
              Save View
            </Button>
          )}
        </div>
      </div>
      {creating && (
        <SaveViewForm
          busy={createView.isPending}
          onSave={(name) => {
            createView.mutate(
              { name, layout: currentLayout, filters: toSavedFilters(currentFilters) },
              {
                onSuccess: (saved) => {
                  setCreating(false);
                  onSelectView(saved);
                },
              },
            );
          }}
          onCancel={() => {
            setCreating(false);
          }}
        />
      )}
      {mutationError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(mutationError)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
