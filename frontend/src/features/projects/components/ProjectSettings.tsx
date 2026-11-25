import { AlertCircle, ArrowRightLeft, Info } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import { useWorkspaces } from '../../organizations/hooks/useOrganizations';
import { selectClassName } from '../../work-items/components/workItemLabels';
import type { Project } from '../api/projectsApi';
import { useRenameProject } from '../hooks/useProjects';
import { useMoveProject } from '../hooks/useTeams';
import { projectNameError } from './projectNameError';

function MoveProjectSection({ project }: { project: Project }) {
  const [targetWorkspaceId, setTargetWorkspaceId] = useState('');
  const workspaces = useWorkspaces(project.organizationId, 1).data?.items ?? [];
  const move = useMoveProject(project.id);
  const candidates = workspaces.filter(
    (ws) => ws.id !== project.workspaceId && ws.currentUserRole === 'owner',
  );

  if (candidates.length === 0) return null;

  function handleMove(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetWorkspaceId) return;
    move.mutate(targetWorkspaceId, {
      onSuccess: () => {
        setTargetWorkspaceId('');
      },
    });
  }

  return (
    <form
      aria-label="Move Project"
      onSubmit={handleMove}
      className="grid gap-3 border-t border-border pt-4"
    >
      <div className="grid gap-0.5">
        <h3 className="text-sm font-medium">Move to another Workspace</h3>
        <p className="text-xs text-muted-foreground">
          Moving keeps all Work Items and workflow settings, and removes current Project Teams.
        </p>
      </div>
      {move.isError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(move.error)}</AlertDescription>
        </Alert>
      )}
      {move.isSuccess && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription role="status">Project moved.</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Destination Workspace"
          className={`${selectClassName} h-8 w-auto min-w-52 text-xs`}
          value={targetWorkspaceId}
          onChange={(e) => {
            setTargetWorkspaceId(e.target.value);
          }}
        >
          <option value="">Select destination Workspace</option>
          {candidates.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!targetWorkspaceId || move.isPending}
        >
          <ArrowRightLeft className="size-4" aria-hidden="true" />
          Move Project
        </Button>
      </div>
    </form>
  );
}

/** Renames or moves a Project, visible only to Workspace Owners. */
export function ProjectSettings({ project }: { project: Project }) {
  const titleId = useId();
  const rename = useRenameProject(project.id);
  const [name, setName] = useState(project.name);

  const dirty = name.trim() !== project.name;
  const nameError = rename.isError ? projectNameError(rename.error) : undefined;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    rename.mutate(name);
  }

  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id={titleId}>Settings</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form className="grid gap-4" aria-label="Project settings" onSubmit={handleSubmit}>
            {rename.isError && !nameError && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription role="alert">{errorMessage(rename.error)}</AlertDescription>
              </Alert>
            )}
            {rename.isSuccess && !dirty && (
              <Alert>
                <Info aria-hidden="true" />
                <AlertDescription role="status">Changes saved.</AlertDescription>
              </Alert>
            )}
            <FormField
              label="Name"
              name="name"
              required
              maxLength={255}
              value={name}
              error={nameError}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!dirty || rename.isPending}
                aria-busy={rename.isPending || undefined}
              >
                Save changes
              </Button>
            </div>
          </form>
          <MoveProjectSection project={project} />
        </CardContent>
      </Card>
    </section>
  );
}
