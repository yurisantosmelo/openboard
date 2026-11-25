import { AlertCircle, Info } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { errorMessage } from '../../../shared/api/httpClient';
import type { Workspace, WorkspaceChange, WorkspaceVisibility } from '../api/organizationsApi';
import { useUpdateWorkspace } from '../hooks/useOrganizations';
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

/** Renames a Workspace or changes its visibility, for those who manage it. */
export function WorkspaceSettings({ workspace }: { workspace: Workspace }) {
  const titleId = useId();
  const update = useUpdateWorkspace(workspace.id);
  const [name, setName] = useState(workspace.name);
  const [visibility, setVisibility] = useState(workspace.visibility);

  const change = changeOf(workspace, name, visibility);
  const dirty = Object.keys(change).length > 0;
  const nameError = update.isError ? workspaceNameError(update.error) : undefined;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    update.mutate(change);
  }

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>Settings</CardTitle>
      </CardHeader>
      <CardContent>
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
          <Field
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
      </CardContent>
    </Card>
  );
}
