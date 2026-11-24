import { useState, type SubmitEvent } from 'react';
import { ApiError, errorMessage } from '../../../shared/api/httpClient';
import { Alert, Button, TextField } from '../../../shared/design-system';
import type { AddedOrganizationMembership, OrganizationRole } from '../api/organizationsApi';
import { useAddOrganizationMembership } from '../hooks/useOrganizations';
import { OrganizationRolePicker } from './OrganizationRolePicker';

interface MembershipFieldErrors {
  name?: string;
  username?: string;
}

function membershipFieldErrors(error: unknown): MembershipFieldErrors {
  if (!(error instanceof ApiError)) {
    return {};
  }
  if (error.status === 409) {
    return { username: 'This User already belongs to this Organization.' };
  }
  const errors = error.problem?.errors;
  return {
    name: errors?.find(({ field }) => field === 'name')?.message,
    username: errors?.find(({ field }) => field === 'username')?.message,
  };
}

interface AddOrganizationMembershipFormProps {
  organizationId: string;
  onAdded: (added: AddedOrganizationMembership) => void;
  onClose: () => void;
}

export function AddOrganizationMembershipForm({
  organizationId,
  onAdded,
  onClose,
}: AddOrganizationMembershipFormProps) {
  const add = useAddOrganizationMembership(organizationId);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<OrganizationRole>('contributor');

  const fieldErrors = add.isError ? membershipFieldErrors(add.error) : {};
  const hasFieldError = Boolean(fieldErrors.name ?? fieldErrors.username);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    add.mutate({ organizationId, username, name, role }, { onSuccess: onAdded });
  }

  return (
    <form
      className="form-stack list-form"
      aria-label="Add Organization Membership"
      onSubmit={handleSubmit}
    >
      {add.isError && !hasFieldError && <Alert tone="danger">{errorMessage(add.error)}</Alert>}
      <TextField
        label="Name"
        name="name"
        required
        maxLength={255}
        value={name}
        error={fieldErrors.name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <TextField
        label="Username"
        name="username"
        required
        maxLength={32}
        value={username}
        error={fieldErrors.username}
        onChange={(e) => {
          setUsername(e.target.value);
        }}
      />
      <OrganizationRolePicker value={role} onChange={setRole} />
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
