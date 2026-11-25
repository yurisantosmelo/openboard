import { AlertCircle, Archive, Info, RotateCcw, Trash2 } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import type { Workspace, WorkspaceChange, WorkspaceVisibility } from '../api/organizationsApi';
import {
  useArchiveWorkspace,
  useDeleteWorkspace,
  useUnarchiveWorkspace,
  useUpdateWorkspace,
} from '../hooks/useOrganizations';
import { organizationPath } from '../paths';
import { VisibilityPicker } from './VisibilityPicker';
import { workspaceNameError } from './workspaceNameError';

/** Only the fields that differ from the Workspace as it is. */
function changeOf(workspace: Workspace, name: string, visibility: WorkspaceVisibility) {
  const change: WorkspaceChange = {};
  if (name.trim() !== workspace.name) {
    change.name = name;
  }
  if (visibility !== workspace.visibility) {
    change.visibility = visibility;
  }
  return change;
}

function WorkspaceLifecycleActions({ workspace }: { workspace: Workspace }) {
  const navigate = useNavigate();
  const archive = useArchiveWorkspace(workspace.id);
  const unarchive = useUnarchiveWorkspace(workspace.id);
  const remove = useDeleteWorkspace(workspace.organizationId);
  const isArchived = Boolean(workspace.archivedAt);
  const lifecycleErr = archive.error ?? unarchive.error ?? remove.error;
  const busy = archive.isPending || unarchive.isPending || remove.isPending;

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="grid gap-0.5">
        <h3 className="text-sm font-medium">Lifecycle</h3>
        <p className="text-xs text-muted-foreground">
          Archiving makes this Workspace and all of its Projects read-only. Deleting places it in
          Pending Deletion.
        </p>
      </div>
      {lifecycleErr && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(lifecycleErr)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {isArchived ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              unarchive.mutate();
            }}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Restore Workspace
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              archive.mutate();
            }}
          >
            <Archive className="size-4" aria-hidden="true" />
            Archive Workspace
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive-outline"
          disabled={busy}
          onClick={() => {
            remove.mutate(workspace.id, {
              onSuccess: () => {
                void navigate(organizationPath(workspace.organizationId));
              },
            });
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Delete Workspace
        </Button>
      </div>
    </div>
  );
}

/** Renames, changes visibility, archives or deletes a Workspace, for those who manage it. */
export function WorkspaceSettings({ workspace }: { workspace: Workspace }) {
  const titleId = useId();
  const update = useUpdateWorkspace(workspace.id);
  const [name, setName] = useState(workspace.name);
  const [visibility, setVisibility] = useState(workspace.visibility);

  const isArchived = Boolean(workspace.archivedAt);
  const change = changeOf(workspace, name, visibility);
  const dirty = Object.keys(change).length > 0;
  const nameError = update.isError ? workspaceNameError(update.error) : undefined;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    update.mutate(change);
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
          {!isArchived && (
            <form className="grid gap-4" aria-label="Workspace settings" onSubmit={handleSubmit}>
              {update.isError && !nameError && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription role="alert">{errorMessage(update.error)}</AlertDescription>
                </Alert>
              )}
              {update.isSuccess && !dirty && (
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
              <VisibilityPicker value={visibility} onChange={setVisibility} />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={!dirty || update.isPending}
                  aria-busy={update.isPending || undefined}
                >
                  Save changes
                </Button>
              </div>
            </form>
          )}
          <WorkspaceLifecycleActions workspace={workspace} />
        </CardContent>
      </Card>
    </section>
  );
}
