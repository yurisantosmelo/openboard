import { AlertCircle, Info } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import type { Project } from '../api/projectsApi';
import { useRenameProject } from '../hooks/useProjects';
import { projectNameError } from './projectNameError';

/** Renames a Project, visible only to Workspace Owners. */
export function ProjectSettings({ project }: { project: Project }) {
  const titleId = useId();
  const rename = useRenameProject(project.id);
  const [name, setName] = useState(project.name);

  const dirty = name.trim() !== project.name;
  const nameError = rename.isError ? projectNameError(rename.error) : undefined;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    rename.mutate(name);
  }

  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id={titleId}>Settings</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" aria-label="Project settings" onSubmit={handleSubmit}>
            {rename.isError && !nameError && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription role="alert">{errorMessage(rename.error)}</AlertDescription>
              </Alert>
            )}
            {rename.isSuccess && !dirty && (
              <Alert>
                <Info aria-hidden="true" />
                <AlertDescription role="status">Changes saved.</AlertDescription>
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
              <Button
                type="submit"
                disabled={!dirty || rename.isPending}
                aria-busy={rename.isPending || undefined}
              >
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
