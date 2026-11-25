import { AlertCircle } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '../../../shared/api/httpClient';
import type { Organization } from '../api/organizationsApi';
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
  onCreated?: (organization: Organization) => void;
  compact?: boolean;
}

/** Creates an Organization and opens it; the creator becomes its first Organization Owner. */
export function CreateOrganizationForm({
  onClose,
  onCreated,
  compact = false,
}: CreateOrganizationFormProps) {
  const create = useCreateOrganization();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  const nameError = create.isError ? nameErrorOf(create.error) : undefined;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(name, {
      onSuccess: (organization) => {
        if (onCreated) {
          onCreated(organization);
          return;
        }
        onClose();
        void navigate(organizationPath(organization.id));
      },
    });
  }

  return (
    <form
      className={compact ? 'grid gap-4' : 'grid gap-4 border-b p-6'}
      aria-label="New Organization"
      onSubmit={handleSubmit}
    >
      {create.isError && !nameError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(create.error)}</AlertDescription>
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
        <Button type="submit" disabled={create.isPending} aria-busy={create.isPending || undefined}>
          Create Organization
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
