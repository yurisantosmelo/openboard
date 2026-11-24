import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, errorMessage } from '../../../shared/api/httpClient';
import { Alert, Button, TextField } from '../../../shared/design-system';
import { useCreateOrganization } from '../hooks/useOrganizations';
import { organizationPath } from '../paths';

/** The message for the name field, when the failure concerns the name. */
function nameErrorOf(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) {
    return undefined;
  }
  return error.problem?.errors?.find(({ field }) => field === 'name')?.message;
}

interface CreateOrganizationFormProps {
  onClose: () => void;
}

/** Creates an Organization and opens it; the creator becomes its first Organization Owner. */
export function CreateOrganizationForm({ onClose }: CreateOrganizationFormProps) {
  const create = useCreateOrganization();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  const nameError = create.isError ? nameErrorOf(create.error) : undefined;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(name, {
      onSuccess: (organization) => {
        void navigate(organizationPath(organization.id));
      },
    });
  }

  return (
    <form className="form-stack list-form" aria-label="New Organization" onSubmit={handleSubmit}>
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
      <div className="form-actions">
        <Button type="submit" busy={create.isPending}>
          Create Organization
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
