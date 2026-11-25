import { AlertCircle } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError, errorMessage } from '../../../shared/api/httpClient';
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
      className="grid gap-4 border-b p-6"
      aria-label="Add Workspace Membership"
      onSubmit={handleSubmit}
    >
      {add.isError && !usernameError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(add.error)}</AlertDescription>
        </Alert>
      )}
      <Field
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
      <div className="flex gap-2">
        <Button type="submit" disabled={add.isPending} aria-busy={add.isPending || undefined}>
          Add person
        </Button>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
