import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { errorMessage } from '../../../shared/api/httpClient';
import type { EstimateUnit, ProjectWorkItemType } from '../api/projectsApi';
import {
  useCreateProjectWorkItemType,
  useDeleteProjectWorkItemType,
  useProjectWorkItemTypes,
  useUpdateProjectWorkItemType,
} from '../hooks/useProjects';

const ESTIMATE_UNITS: EstimateUnit[] = ['story_points', 'hours', 'none'];

const estimateUnitLabels: Record<EstimateUnit, string> = {
  story_points: 'Story Points',
  hours: 'Hours',
  none: 'No estimate',
};

const selectClassName =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50';

function childNamesOf(type: ProjectWorkItemType, namesById: Map<string, string>): string {
  const names = type.allowedChildTypeIds
    .map((id) => namesById.get(id))
    .filter((name): name is string => name !== undefined);
  return names.length > 0 ? `Children: ${names.join(', ')}` : 'No children';
}

function TypeErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}

interface ChildTypeCheckboxesProps {
  candidates: ProjectWorkItemType[];
  selected: string[];
  onToggle: (typeId: string) => void;
}

function ChildTypeCheckboxes({ candidates, selected, onToggle }: ChildTypeCheckboxesProps) {
  if (candidates.length === 0) return null;
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">Allowed Child Work Item Types</legend>
      <div className="flex flex-wrap gap-3">
        {candidates.map((candidate) => (
          <label key={candidate.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(candidate.id)}
              onChange={() => {
                onToggle(candidate.id);
              }}
            />
            {candidate.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface WorkItemTypeFormProps {
  ariaLabel: string;
  submitLabel: string;
  initialName?: string;
  initialUnit?: EstimateUnit;
  initialChildren?: string[];
  candidates: ProjectWorkItemType[];
  busy: boolean;
  error: unknown;
  onSubmit: (name: string, estimateUnit: EstimateUnit, allowedChildTypeIds: string[]) => void;
  onCancel: () => void;
}

function WorkItemTypeForm({
  ariaLabel,
  submitLabel,
  initialName = '',
  initialUnit = 'none',
  initialChildren = [],
  candidates,
  busy,
  error,
  onSubmit,
  onCancel,
}: WorkItemTypeFormProps) {
  const unitId = useId();
  const [name, setName] = useState(initialName);
  const [estimateUnit, setEstimateUnit] = useState<EstimateUnit>(initialUnit);
  const [selectedChildren, setSelectedChildren] = useState<string[]>(initialChildren);

  function toggleChild(typeId: string) {
    setSelectedChildren((prev) =>
      prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId],
    );
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(name, estimateUnit, selectedChildren);
  }

  return (
    <form className="grid gap-3 border-b p-6" aria-label={ariaLabel} onSubmit={handleSubmit}>
      <TypeErrorAlert error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Name"
          name="work-item-type-name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <Field>
          <FieldLabel htmlFor={unitId}>Estimate unit</FieldLabel>
          <select
            id={unitId}
            className={selectClassName}
            value={estimateUnit}
            onChange={(e) => {
              setEstimateUnit(e.target.value as EstimateUnit);
            }}
          >
            {ESTIMATE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {estimateUnitLabels[unit]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ChildTypeCheckboxes
        candidates={candidates}
        selected={selectedChildren}
        onToggle={toggleChild}
      />
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

interface DeleteTypePromptProps {
  workItemType: ProjectWorkItemType;
  replacements: ProjectWorkItemType[];
  busy: boolean;
  error: unknown;
  onConfirm: (replacementTypeId: string) => void;
  onCancel: () => void;
}

function DeleteTypePrompt({
  workItemType,
  replacements,
  busy,
  error,
  onConfirm,
  onCancel,
}: DeleteTypePromptProps) {
  const selectId = useId();
  const [replacementId, setReplacementId] = useState(replacements[0]?.id ?? '');

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (replacementId) onConfirm(replacementId);
  }

  return (
    <form
      className="grid gap-3 border-b bg-muted/20 p-6"
      aria-label={`Remove Work Item Type ${workItemType.name}`}
      onSubmit={handleSubmit}
    >
      <TypeErrorAlert error={error} />
      <Field>
        <FieldLabel htmlFor={selectId}>Move Work Items from {workItemType.name} to</FieldLabel>
        <select
          id={selectId}
          className={selectClassName}
          value={replacementId}
          onChange={(e) => {
            setReplacementId(e.target.value);
          }}
        >
          {replacements.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
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

interface TypeRowProps {
  item: ProjectWorkItemType;
  namesById: Map<string, string>;
  canManage: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function WorkItemTypeRow({
  item,
  namesById,
  canManage,
  canDelete,
  onEdit,
  onDelete,
}: TypeRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
      <div className="grid min-w-0">
        <span className="font-medium break-words">{item.name}</span>
        <span className="text-sm text-muted-foreground">{childNamesOf(item, namesById)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{estimateUnitLabels[item.estimateUnit]}</Badge>
        {canManage && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Edit Work Item Type ${item.name}`}
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
                aria-label={`Remove Work Item Type ${item.name}`}
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

interface WorkItemTypesCardProps {
  projectId: string;
  canManage: boolean;
}

/** Displays and (for Workspace Owners) customizes a Project's Work Item Types and hierarchy. */
export function WorkItemTypesCard({ projectId, canManage }: WorkItemTypesCardProps) {
  const titleId = useId();
  const query = useProjectWorkItemTypes(projectId);
  const create = useCreateProjectWorkItemType(projectId);
  const update = useUpdateProjectWorkItemType(projectId);
  const remove = useDeleteProjectWorkItemType(projectId);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectWorkItemType | null>(null);
  const [deleting, setDeleting] = useState<ProjectWorkItemType | null>(null);

  const types = query.data ?? [];
  const namesById = new Map(types.map((item) => [item.id, item.name]));

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
            <h2 id={titleId}>Work Item Types</h2>
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
                New Work Item Type
              </Button>
            </CardAction>
          )}
        </CardHeader>
        {creating && (
          <WorkItemTypeForm
            ariaLabel="New Work Item Type"
            submitLabel="Create Work Item Type"
            candidates={types}
            busy={create.isPending}
            error={create.error}
            onSubmit={(name, estimateUnit, allowedChildTypeIds) => {
              create.mutate({ name, estimateUnit, allowedChildTypeIds }, { onSuccess: closeForms });
            }}
            onCancel={closeForms}
          />
        )}
        {editing && (
          <WorkItemTypeForm
            key={editing.id}
            ariaLabel={`Edit Work Item Type ${editing.name}`}
            submitLabel="Save Work Item Type"
            initialName={editing.name}
            initialUnit={editing.estimateUnit}
            initialChildren={editing.allowedChildTypeIds}
            candidates={types.filter((t) => t.id !== editing.id)}
            busy={update.isPending}
            error={update.error}
            onSubmit={(name, estimateUnit, allowedChildTypeIds) => {
              update.mutate(
                { typeId: editing.id, payload: { name, estimateUnit, allowedChildTypeIds } },
                { onSuccess: closeForms },
              );
            }}
            onCancel={closeForms}
          />
        )}
        {deleting && (
          <DeleteTypePrompt
            key={deleting.id}
            workItemType={deleting}
            replacements={types.filter((t) => t.id !== deleting.id)}
            busy={remove.isPending}
            error={remove.error}
            onConfirm={(replacementTypeId) => {
              remove.mutate({ typeId: deleting.id, replacementTypeId }, { onSuccess: closeForms });
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
            <TypeErrorAlert error={query.error} />
          </CardContent>
        ) : (
          <ul className="m-0 list-none divide-y p-0">
            {types.map((item) => (
              <WorkItemTypeRow
                key={item.id}
                item={item}
                namesById={namesById}
                canManage={canManage}
                canDelete={types.length > 1}
                onEdit={() => {
                  closeForms();
                  update.reset();
                  setEditing(item);
                }}
                onDelete={() => {
                  closeForms();
                  remove.reset();
                  setDeleting(item);
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
