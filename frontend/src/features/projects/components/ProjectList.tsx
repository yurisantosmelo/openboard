import { AlertCircle, Archive, FolderKanban, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import { ListPanel } from '../../organizations/components/ListPanel';
import type { Project } from '../api/projectsApi';
import { usePendingDeletionProjects, useProjects, useRestoreProject } from '../hooks/useProjects';
import { projectPath } from '../paths';
import { CreateProjectForm } from './CreateProjectForm';

function ProjectRow(project: Project) {
  return (
    <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
      <Link
        className="inline-flex min-w-0 items-center gap-2 font-medium break-words text-foreground no-underline hover:underline"
        to={projectPath(project.id)}
      >
        <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{project.name}</span>
      </Link>
      {project.archivedAt && <Badge variant="secondary">Archived</Badge>}
    </li>
  );
}

function PendingDeletionProjectsCard({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const query = usePendingDeletionProjects(workspaceId, 1, open);
  const restore = useRestoreProject(workspaceId);
  const items = query.data?.items ?? [];
  const err = restore.error ?? query.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
          Pending Deletion Projects
        </CardTitle>
        <CardAction>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setOpen((prev) => !prev);
            }}
          >
            {open ? 'Hide Pending Deletion' : 'View Pending Deletion'}
          </Button>
        </CardAction>
      </CardHeader>
      {open && (
        <CardContent className="grid gap-3">
          {Boolean(err) && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription role="alert">{errorMessage(err)}</AlertDescription>
            </Alert>
          )}
          {!query.isPending && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No Projects in Pending Deletion.</p>
          )}
          {items.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((proj) => (
                <li
                  key={proj.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{proj.name}</span>
                    <Badge variant="outline">Pending Deletion</Badge>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={restore.isPending}
                    aria-label={`Restore Project ${proj.name}`}
                    onClick={() => {
                      restore.mutate(proj.id);
                    }}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface ProjectListProps {
  workspaceId: string;
  /** Whether the signed-in User may create Projects: only Workspace Owners on active Workspaces. */
  canCreate: boolean;
  /** Whether to show the opt-in Pending Deletion Projects panel. */
  canManagePending?: boolean;
}

/** Lists and creates Projects owned by one Workspace. */
export function ProjectList({
  workspaceId,
  canCreate,
  canManagePending = false,
}: ProjectListProps) {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const query = useProjects(workspaceId, page, includeArchived);

  return (
    <div className="grid gap-4">
      <ListPanel
        title="Projects"
        query={query}
        emptyTitle="No Projects yet"
        emptyDescription={
          canCreate
            ? 'Create the first Project to plan and track work in this Workspace.'
            : 'Projects created in this Workspace will appear here.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={includeArchived ? 'secondary' : 'outline'}
              aria-pressed={includeArchived}
              onClick={() => {
                setPage(1);
                setIncludeArchived((prev) => !prev);
              }}
            >
              <Archive className="size-3.5" aria-hidden="true" />
              {includeArchived ? 'Hide archived' : 'Show archived'}
            </Button>
            {canCreate && !creating && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setCreating(true);
                }}
              >
                New Project
              </Button>
            )}
          </div>
        }
        form={
          creating && (
            <CreateProjectForm
              workspaceId={workspaceId}
              onClose={() => {
                setCreating(false);
              }}
            />
          )
        }
        renderItem={ProjectRow}
        onPageChange={setPage}
      />
      {canManagePending && <PendingDeletionProjectsCard workspaceId={workspaceId} />}
    </div>
  );
}
