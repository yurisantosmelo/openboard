import { useState, type SubmitEvent } from 'react';
import { errorMessage } from '../../../shared/api/httpClient';
import { Alert, Button, TextField } from '../../../shared/design-system';
import type { WorkspaceVisibility } from '../api/organizationsApi';
import { useCreateWorkspace } from '../hooks/useOrganizations';
import { VisibilityPicker } from './VisibilityPicker';
import { workspaceNameError } from './workspaceNameError';

interface CreateWorkspaceFormProps {
  organizationId: string;
  onClose: () => void;
}

export function CreateWorkspaceForm({ organizationId, onClose }: CreateWorkspaceFormProps) {
  const create = useCreateWorkspace(organizationId);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<WorkspaceVisibility>('restricted');

  const nameError = create.isError ? workspaceNameError(create.error) : undefined;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({ organizationId, name, visibility }, { onSuccess: onClose });
  }

  return (
    <form className="form-stack list-form" aria-label="New Workspace" onSubmit={handleSubmit}>
      {create.isError && !nameError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
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
        <Button type="submit" busy={create.isPending}>
          Create Workspace
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
