import { useState, type SubmitEvent } from 'react';
import { ApiError, errorMessage } from '../../../shared/api/httpClient';
import { Alert, Button, TextField } from '../../../shared/design-system';
import type { WorkspaceRole } from '../api/organizationsApi';
import { useAddWorkspaceMembership } from '../hooks/useOrganizations';
import { WorkspaceRolePicker } from './WorkspaceRolePicker';

function workspaceMembershipUsernameError(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) {
    return undefined;
  }
  if (error.status === 409) {
    return 'This User already belongs to this Workspace.';
  }
  return error.problem?.errors?.find(({ field }) => field === 'username')?.message;
}

interface AddWorkspaceMembershipFormProps {
  workspaceId: string;
  onClose: () => void;
}

export function AddWorkspaceMembershipForm({
  workspaceId,
  onClose,
}: AddWorkspaceMembershipFormProps) {
  const add = useAddWorkspaceMembership(workspaceId);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('contributor');

  const usernameError = add.isError ? workspaceMembershipUsernameError(add.error) : undefined;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    add.mutate({ workspaceId, username, role }, { onSuccess: onClose });
  }

  return (
    <form
      className="form-stack list-form"
      aria-label="Add Workspace Membership"
      onSubmit={handleSubmit}
    >
      {add.isError && !usernameError && <Alert tone="danger">{errorMessage(add.error)}</Alert>}
      <TextField
        label="Username"
        name="username"
        required
        maxLength={32}
        value={username}
        error={usernameError}
        onChange={(e) => {
          setUsername(e.target.value);
        }}
      />
      <WorkspaceRolePicker value={role} onChange={setRole} />
      <div className="form-actions">
        <Button type="submit" busy={add.isPending}>
          Add person
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
