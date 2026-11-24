import { useState, type SubmitEvent } from 'react';
import { errorMessage } from '../../../shared/api/httpClient';
import { Alert, Button, Card, TextField } from '../../../shared/design-system';
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
    <Card title="Settings">
      <form className="form-stack" aria-label="Workspace settings" onSubmit={handleSubmit}>
        {update.isError && !nameError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
        {update.isSuccess && !dirty && <Alert>Changes saved.</Alert>}
        <TextField
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
        <div className="form-actions">
          <Button type="submit" busy={update.isPending} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}
