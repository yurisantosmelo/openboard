import { AlertCircle } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { errorMessage } from '../../../shared/api/httpClient';
import type { Project } from '../api/projectsApi';
import { useCreateProject } from '../hooks/useProjects';
import { projectNameError } from './projectNameError';

interface CreateProjectFormProps {
  workspaceId: string;
  onClose: () => void;
  onCreated?: (project: Project) => void;
  compact?: boolean;
}

/** Creates a Project inside a Workspace, seeded with its default workflow. */
export function CreateProjectForm({
  workspaceId,
  onClose,
  onCreated,
  compact = false,
}: CreateProjectFormProps) {
  const create = useCreateProject(workspaceId);
  const [name, setName] = useState('');

  const nameError = create.isError ? projectNameError(create.error) : undefined;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(name, {
      onSuccess: (project) => {
        onClose();
        onCreated?.(project);
      },
    });
  }

  return (
    <form
      className={compact ? 'grid gap-4' : 'grid gap-4 border-b p-6'}
      aria-label="New Project"
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
          Create Project
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
