import { AlertCircle } from 'lucide-react';
import { useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '../../../shared/api/httpClient';
import type { EstimateUnit, ProjectEra, ProjectStatus, ProjectWorkItemType } from '../../projects';
import type { Priority, WorkItem } from '../api/workItemsApi';
import { useCreateWorkItem } from '../hooks/useWorkItems';
import type { Participant } from './ProjectWorkspaceHeader';
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
  eras?: ProjectEra[];
  participants?: Participant[];
  initialStatusId?: string;
  onClose: () => void;
}

function defaultStatusId(statuses: ProjectStatus[], preferred?: string): string {
  if (preferred && statuses.some((s) => s.id === preferred)) return preferred;
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
  eraId: string;
  assigneeId: string;
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
    eraId: fields.eraId || null,
    assigneeId: fields.assigneeId || null,
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

interface MetadataColumnProps {
  workItemTypes: ProjectWorkItemType[];
  statuses: ProjectStatus[];
  eras: ProjectEra[];
  participants: Participant[];
  eligibleParents: WorkItem[];
  unit: EstimateUnit;
  workItemTypeId: string;
  statusId: string;
  priority: Priority;
  estimate: string;
  eraId: string;
  assigneeId: string;
  parentId: string;
  errs: FormFieldErrors;
  onTypeChange: (id: string) => void;
  onStatusChange: (id: string) => void;
  onPriorityChange: (priority: Priority) => void;
  onEstimateChange: (value: string) => void;
  onEraChange: (id: string) => void;
  onAssigneeChange: (id: string) => void;
  onParentChange: (id: string) => void;
}

function MetadataColumn(props: MetadataColumnProps) {
  const activeEras = props.eras.filter((era) => era.state !== 'completed');
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3.5">
      <Field>
        <FieldLabel htmlFor="create-wi-type">Work Item Type</FieldLabel>
        <select
          id="create-wi-type"
          className={selectClassName}
          value={props.workItemTypeId}
          onChange={(e) => {
            props.onTypeChange(e.target.value);
          }}
        >
          {props.workItemTypes.map((wt) => (
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
          value={props.statusId}
          onChange={(e) => {
            props.onStatusChange(e.target.value);
          }}
        >
          {props.statuses.map((st) => (
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
          value={props.priority}
          onChange={(e) => {
            props.onPriorityChange(e.target.value as Priority);
          }}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityLabels[p]}
            </option>
          ))}
        </select>
      </Field>

      <EstimateInput
        id="create-wi-estimate"
        unit={props.unit}
        value={props.estimate}
        error={props.errs.estimate}
        onChange={props.onEstimateChange}
      />

      {activeEras.length > 0 && (
        <Field>
          <FieldLabel htmlFor="create-wi-era">Era</FieldLabel>
          <select
            id="create-wi-era"
            className={selectClassName}
            value={props.eraId}
            onChange={(e) => {
              props.onEraChange(e.target.value);
            }}
          >
            <option value="">No era</option>
            {activeEras.map((era) => (
              <option key={era.id} value={era.id}>
                {era.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {props.participants.length > 0 && (
        <Field>
          <FieldLabel htmlFor="create-wi-assignee">Assignee</FieldLabel>
          <select
            id="create-wi-assignee"
            className={selectClassName}
            value={props.assigneeId}
            onChange={(e) => {
              props.onAssigneeChange(e.target.value);
            }}
          >
            <option value="">Unassigned</option>
            {props.participants.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name || `@${person.username}`}
              </option>
            ))}
          </select>
        </Field>
      )}

      {props.eligibleParents.length > 0 && (
        <ParentSelect
          id="create-wi-parent"
          value={props.parentId}
          candidates={props.eligibleParents}
          error={props.errs.parent}
          onChange={props.onParentChange}
        />
      )}
    </div>
  );
}

/** Two-column Work Item creation form with Ctrl+Enter quick save. */
export function CreateWorkItemForm({
  projectId,
  statuses,
  workItemTypes,
  existingItems,
  eras = [],
  participants = [],
  initialStatusId,
  onClose,
}: CreateWorkItemFormProps) {
  const create = useCreateWorkItem(projectId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workItemTypeId, setWorkItemTypeId] = useState(workItemTypes[0]?.id ?? '');
  const [statusId, setStatusId] = useState(() => defaultStatusId(statuses, initialStatusId));
  const [priority, setPriority] = useState<Priority>('none');
  const [parentId, setParentId] = useState('');
  const [eraId, setEraId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [estimate, setEstimate] = useState('');

  const unit: EstimateUnit =
    workItemTypes.find((t) => t.id === workItemTypeId)?.estimateUnit ?? 'none';
  const eligibleParents = eligibleParentsForType(existingItems, workItemTypes, workItemTypeId);
  const errs = readFormErrors(create.isError ? create.error : null);

  function submitWorkItem() {
    if (create.isPending) return;
    const payload = buildCreatePayload({
      workItemTypeId,
      statusId,
      parentId,
      eraId,
      assigneeId,
      eligibleParents,
      title,
      description,
      priority,
      unit,
      estimate,
    });
    create.mutate(payload, { onSuccess: onClose });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    submitWorkItem();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submitWorkItem();
    }
  }

  return (
    <form
      className="grid gap-4"
      aria-label="New Work Item"
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
    >
      <FormErrorBanner error={create.isError ? create.error : null} hidden={errs.hasField} />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_224px]">
        {/* Column 1: Title + Description */}
        <div className="flex min-w-0 flex-col gap-3">
          <FormField
            label="Title"
            name="title"
            required
            autoFocus
            maxLength={255}
            placeholder="Work item title..."
            value={title}
            error={errs.title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
          <Field className="flex flex-1 flex-col">
            <FieldLabel htmlFor="create-wi-description">Description</FieldLabel>
            <textarea
              id="create-wi-description"
              placeholder="Add context, acceptance criteria, or notes..."
              className={`${textareaClassName} min-h-44 flex-1 resize-y`}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
            />
          </Field>
        </div>

        {/* Column 2: Compact stacked metadata */}
        <MetadataColumn
          workItemTypes={workItemTypes}
          statuses={statuses}
          eras={eras}
          participants={participants}
          eligibleParents={eligibleParents}
          unit={unit}
          workItemTypeId={workItemTypeId}
          statusId={statusId}
          priority={priority}
          estimate={estimate}
          eraId={eraId}
          assigneeId={assigneeId}
          parentId={parentId}
          errs={errs}
          onTypeChange={(nextTypeId) => {
            setWorkItemTypeId(nextTypeId);
            setEstimate('');
            setParentId('');
          }}
          onStatusChange={setStatusId}
          onPriorityChange={setPriority}
          onEstimateChange={setEstimate}
          onEraChange={setEraId}
          onAssigneeChange={setAssigneeId}
          onParentChange={setParentId}
        />
      </div>

      <DialogFooter className="border-t border-border pt-3 sm:justify-between">
        <span className="text-xs text-muted-foreground">Press Ctrl + Enter to save</span>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={create.isPending}
            aria-busy={create.isPending || undefined}
          >
            Create Work Item
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

interface CreateWorkItemDialogProps extends Omit<CreateWorkItemFormProps, 'onClose'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Modal dialog for creating a Work Item without disturbing the board canvas. */
export function CreateWorkItemDialog({
  open,
  onOpenChange,
  ...formProps
}: CreateWorkItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Work Item</DialogTitle>
          <DialogDescription>
            Add a title and description on the left and configure its details on the right.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CreateWorkItemForm
            {...formProps}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
