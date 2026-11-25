import { AlertCircle } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '../../../shared/api/httpClient';
import type { EstimateUnit, ProjectStatus, ProjectWorkItemType } from '../../projects';
import type { Priority, WorkItem } from '../api/workItemsApi';
import { useCreateWorkItem } from '../hooks/useWorkItems';
import {
  eligibleParentsForType,
  parseEstimateInput,
  PRIORITIES,
  priorityLabels,
  selectClassName,
  textareaClassName,
  workItemFieldError,
} from './workItemLabels';

interface EstimateInputProps {
  id: string;
  unit: EstimateUnit;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function EstimateInput({ id, unit, value, error, disabled, onChange }: EstimateInputProps) {
  if (unit === 'none') return null;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{unit === 'story_points' ? 'Story Points' : 'Hours'}</FieldLabel>
      <Input
        id={id}
        type="number"
        min="0"
        step="0.5"
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

interface ParentSelectProps {
  id: string;
  value: string;
  candidates: WorkItem[];
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function ParentSelect({
  id,
  value,
  candidates,
  error,
  disabled,
  onChange,
}: ParentSelectProps) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Parent</FieldLabel>
      <select
        id={id}
        className={selectClassName}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        <option value="">No parent</option>
        {candidates.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

interface CreateWorkItemFormProps {
  projectId: string;
  statuses: ProjectStatus[];
  workItemTypes: ProjectWorkItemType[];
  existingItems: WorkItem[];
  onClose: () => void;
}

function defaultStatusId(statuses: ProjectStatus[]): string {
  return statuses.find((s) => s.statusGroup === 'not_committed')?.id ?? statuses[0]?.id ?? '';
}

interface FormFieldErrors {
  title?: string;
  estimate?: string;
  parent?: string;
  hasField: boolean;
}

function readFormErrors(error: unknown): FormFieldErrors {
  if (!error) return { hasField: false };
  const title = workItemFieldError(error, 'title');
  const estimate = workItemFieldError(error, 'estimate');
  const parent = workItemFieldError(error, 'parent_id');
  return { title, estimate, parent, hasField: Boolean(title ?? estimate ?? parent) };
}

function buildCreatePayload(fields: {
  workItemTypeId: string;
  statusId: string;
  parentId: string;
  eligibleParents: WorkItem[];
  title: string;
  description: string;
  priority: Priority;
  unit: EstimateUnit;
  estimate: string;
}) {
  const numeric = parseEstimateInput(fields.estimate);
  const validParent = fields.eligibleParents.some((p) => p.id === fields.parentId)
    ? fields.parentId
    : null;
  return {
    workItemTypeId: fields.workItemTypeId,
    statusId: fields.statusId || undefined,
    parentId: validParent,
    title: fields.title,
    description: fields.description,
    priority: fields.priority,
    storyPoints: fields.unit === 'story_points' ? numeric : null,
    hours: fields.unit === 'hours' ? numeric : null,
  };
}

function FormErrorBanner({ error, hidden }: { error: unknown; hidden: boolean }) {
  if (!error || hidden) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}

/** Creates a Work Item inside a Project, adapting estimate and Parent options to its type. */
export function CreateWorkItemForm({
  projectId,
  statuses,
  workItemTypes,
  existingItems,
  onClose,
}: CreateWorkItemFormProps) {
  const create = useCreateWorkItem(projectId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workItemTypeId, setWorkItemTypeId] = useState(workItemTypes[0]?.id ?? '');
  const [statusId, setStatusId] = useState(() => defaultStatusId(statuses));
  const [priority, setPriority] = useState<Priority>('none');
  const [parentId, setParentId] = useState('');
  const [estimate, setEstimate] = useState('');

  const unit: EstimateUnit =
    workItemTypes.find((t) => t.id === workItemTypeId)?.estimateUnit ?? 'none';
  const eligibleParents = eligibleParentsForType(existingItems, workItemTypes, workItemTypeId);
  const errs = readFormErrors(create.isError ? create.error : null);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildCreatePayload({
      workItemTypeId,
      statusId,
      parentId,
      eligibleParents,
      title,
      description,
      priority,
      unit,
      estimate,
    });
    create.mutate(payload, { onSuccess: onClose });
  }

  return (
    <form className="grid gap-4 border-b p-6" aria-label="New Work Item" onSubmit={handleSubmit}>
      <FormErrorBanner error={create.isError ? create.error : null} hidden={errs.hasField} />
      <FormField
        label="Title"
        name="title"
        required
        maxLength={255}
        value={title}
        error={errs.title}
        onChange={(e) => {
          setTitle(e.target.value);
        }}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="create-wi-type">Work Item Type</FieldLabel>
          <select
            id="create-wi-type"
            className={selectClassName}
            value={workItemTypeId}
            onChange={(e) => {
              setWorkItemTypeId(e.target.value);
              setEstimate('');
              setParentId('');
            }}
          >
            {workItemTypes.map((wt) => (
              <option key={wt.id} value={wt.id}>
                {wt.name}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="create-wi-status">Status</FieldLabel>
          <select
            id="create-wi-status"
            className={selectClassName}
            value={statusId}
            onChange={(e) => {
              setStatusId(e.target.value);
            }}
          >
            {statuses.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="create-wi-priority">Priority</FieldLabel>
          <select
            id="create-wi-priority"
            className={selectClassName}
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value as Priority);
            }}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabels[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <EstimateInput
          id="create-wi-estimate"
          unit={unit}
          value={estimate}
          error={errs.estimate}
          onChange={setEstimate}
        />
        {eligibleParents.length > 0 && (
          <ParentSelect
            id="create-wi-parent"
            value={parentId}
            candidates={eligibleParents}
            error={errs.parent}
            onChange={setParentId}
          />
        )}
      </div>
      <Field>
        <FieldLabel htmlFor="create-wi-description">Description</FieldLabel>
        <textarea
          id="create-wi-description"
          className={textareaClassName}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending} aria-busy={create.isPending || undefined}>
          Create Work Item
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
