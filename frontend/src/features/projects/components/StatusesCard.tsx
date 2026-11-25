import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { errorMessage } from '../../../shared/api/httpClient';
import type { ProjectStatus, StatusGroup } from '../api/projectsApi';
import {
  useCreateProjectStatus,
  useDeleteProjectStatus,
  useProjectStatuses,
  useUpdateProjectStatus,
} from '../hooks/useProjects';

const STATUS_GROUPS: StatusGroup[] = ['not_committed', 'planned', 'started', 'completed'];

const statusGroupLabels: Record<StatusGroup, string> = {
  not_committed: 'Not Committed',
  planned: 'Planned',
  started: 'Started',
  completed: 'Completed',
};

const selectClassName =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50';

function StatusErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}

interface StatusFormProps {
  ariaLabel: string;
  submitLabel: string;
  initialName?: string;
  initialGroup?: StatusGroup;
  busy: boolean;
  error: unknown;
  onSubmit: (name: string, group: StatusGroup) => void;
  onCancel: () => void;
}

function StatusForm({
  ariaLabel,
  submitLabel,
  initialName = '',
  initialGroup = 'started',
  busy,
  error,
  onSubmit,
  onCancel,
}: StatusFormProps) {
  const groupId = useId();
  const [name, setName] = useState(initialName);
  const [group, setGroup] = useState<StatusGroup>(initialGroup);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(name, group);
  }

  return (
    <form className="grid gap-3 border-b p-6" aria-label={ariaLabel} onSubmit={handleSubmit}>
      <StatusErrorAlert error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Name"
          name="status-name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <Field>
          <FieldLabel htmlFor={groupId}>Status Group</FieldLabel>
          <select
            id={groupId}
            className={selectClassName}
            value={group}
            onChange={(e) => {
              setGroup(e.target.value as StatusGroup);
            }}
          >
            {STATUS_GROUPS.map((g) => (
              <option key={g} value={g}>
                {statusGroupLabels[g]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface DeleteStatusPromptProps {
  status: ProjectStatus;
  replacements: ProjectStatus[];
  busy: boolean;
  error: unknown;
  onConfirm: (replacementStatusId: string) => void;
  onCancel: () => void;
}

function DeleteStatusPrompt({
  status,
  replacements,
  busy,
  error,
  onConfirm,
  onCancel,
}: DeleteStatusPromptProps) {
  const selectId = useId();
  const [replacementId, setReplacementId] = useState(replacements[0]?.id ?? '');

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (replacementId) onConfirm(replacementId);
  }

  return (
    <form
      className="grid gap-3 border-b bg-muted/20 p-6"
      aria-label={`Remove Status ${status.name}`}
      onSubmit={handleSubmit}
    >
      <StatusErrorAlert error={error} />
      <Field>
        <FieldLabel htmlFor={selectId}>Move Work Items from {status.name} to</FieldLabel>
        <select
          id={selectId}
          className={selectClassName}
          value={replacementId}
          onChange={(e) => {
            setReplacementId(e.target.value);
          }}
        >
          {replacements.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={busy || !replacementId}>
          Confirm remove
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface StatusRowProps {
  status: ProjectStatus;
  canManage: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function StatusRow({ status, canManage, canDelete, onEdit, onDelete }: StatusRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
      <span className="font-medium break-words">{status.name}</span>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{statusGroupLabels[status.statusGroup]}</Badge>
        {canManage && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Edit Status ${status.name}`}
              onClick={onEdit}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </Button>
            {canDelete && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`Remove Status ${status.name}`}
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Remove
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

interface StatusesCardProps {
  projectId: string;
  canManage: boolean;
}

/** Displays and (for Workspace Owners) customizes a Project's Statuses. */
export function StatusesCard({ projectId, canManage }: StatusesCardProps) {
  const titleId = useId();
  const query = useProjectStatuses(projectId);
  const create = useCreateProjectStatus(projectId);
  const update = useUpdateProjectStatus(projectId);
  const remove = useDeleteProjectStatus(projectId);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectStatus | null>(null);
  const [deleting, setDeleting] = useState<ProjectStatus | null>(null);

  const statuses = query.data ?? [];

  function closeForms() {
    setCreating(false);
    setEditing(null);
    setDeleting(null);
  }

  return (
    <section aria-labelledby={titleId}>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="items-center border-b py-4">
          <CardTitle>
            <h2 id={titleId}>Statuses</h2>
          </CardTitle>
          {canManage && !creating && (
            <CardAction>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  closeForms();
                  create.reset();
                  setCreating(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                New Status
              </Button>
            </CardAction>
          )}
        </CardHeader>
        {creating && (
          <StatusForm
            ariaLabel="New Status"
            submitLabel="Create Status"
            busy={create.isPending}
            error={create.error}
            onSubmit={(name, statusGroup) => {
              create.mutate({ name, statusGroup }, { onSuccess: closeForms });
            }}
            onCancel={closeForms}
          />
        )}
        {editing && (
          <StatusForm
            key={editing.id}
            ariaLabel={`Edit Status ${editing.name}`}
            submitLabel="Save Status"
            initialName={editing.name}
            initialGroup={editing.statusGroup}
            busy={update.isPending}
            error={update.error}
            onSubmit={(name, statusGroup) => {
              update.mutate(
                { statusId: editing.id, payload: { name, statusGroup } },
                { onSuccess: closeForms },
              );
            }}
            onCancel={closeForms}
          />
        )}
        {deleting && (
          <DeleteStatusPrompt
            key={deleting.id}
            status={deleting}
            replacements={statuses.filter((s) => s.id !== deleting.id)}
            busy={remove.isPending}
            error={remove.error}
            onConfirm={(replacementStatusId) => {
              remove.mutate(
                { statusId: deleting.id, replacementStatusId },
                { onSuccess: closeForms },
              );
            }}
            onCancel={closeForms}
          />
        )}
        {query.isPending ? (
          <CardContent className="py-6">
            <span
              role="status"
              aria-label="Loading"
              className="inline-flex items-center text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            </span>
          </CardContent>
        ) : query.isError ? (
          <CardContent className="py-6">
            <StatusErrorAlert error={query.error} />
          </CardContent>
        ) : (
          <ul className="m-0 list-none divide-y p-0">
            {statuses.map((status) => (
              <StatusRow
                key={status.id}
                status={status}
                canManage={canManage}
                canDelete={statuses.length > 2}
                onEdit={() => {
                  closeForms();
                  update.reset();
                  setEditing(status);
                }}
                onDelete={() => {
                  closeForms();
                  remove.reset();
                  setDeleting(status);
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
