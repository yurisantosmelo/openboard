import { AlertCircle } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { errorMessage } from '../../../shared/api/httpClient';
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
    <form className="grid gap-4 border-b p-6" aria-label="New Workspace" onSubmit={handleSubmit}>
      {create.isError && !nameError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(create.error)}</AlertDescription>
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
        <Button type="submit" disabled={create.isPending} aria-busy={create.isPending || undefined}>
          Create Workspace
        </Button>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
