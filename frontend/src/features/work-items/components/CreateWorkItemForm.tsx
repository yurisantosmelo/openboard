import { AlertCircle, Maximize2, Minimize2, X } from 'lucide-react';
import { useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { InlineInput, InlineTextarea } from '@/components/ui/inline-field';
import { cn } from '@/lib/utils';
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
  workItemFieldError,
} from './workItemLabels';

const quietSelectClass =
  'h-7 w-full min-w-0 cursor-pointer rounded-sm border border-transparent bg-transparent px-2 text-xs font-medium text-foreground transition-[border-color,background-color] outline-none hover:border-input hover:bg-secondary/60 focus-visible:border-ring focus-visible:bg-background disabled:pointer-events-none disabled:opacity-60';

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
      <FieldLabel htmlFor={id} className="text-2xs text-muted-foreground">
        {unit === 'story_points' ? 'Story Points' : 'Hours'}
      </FieldLabel>
      <InlineInput
        id={id}
        type="number"
        min="0"
        step="0.5"
        placeholder="0"
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
      <FieldLabel htmlFor={id} className="text-2xs text-muted-foreground">
        Parent
      </FieldLabel>
      <select
        id={id}
        className={quietSelectClass}
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
  maximized?: boolean;
  onToggleMaximize?: () => void;
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
    <div className="px-5 pt-3">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
      </Alert>
    </div>
  );
}

interface ModalMetaBandProps {
  statuses: ProjectStatus[];
  eras: ProjectEra[];
  statusId: string;
  priority: Priority;
  eraId: string;
  onStatusChange: (id: string) => void;
  onPriorityChange: (priority: Priority) => void;
  onEraChange: (id: string) => void;
}

function ModalMetaBand({
  statuses,
  eras,
  statusId,
  priority,
  eraId,
  onStatusChange,
  onPriorityChange,
  onEraChange,
}: ModalMetaBandProps) {
  const activeEras = eras.filter((era) => era.state !== 'completed');

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border bg-secondary/60 px-5 py-2.5">
      <div className="flex items-center gap-2">
        <label htmlFor="create-wi-status" className="text-2xs font-medium text-muted-foreground">
          Status
        </label>
        <select
          id="create-wi-status"
          className={cn(quietSelectClass, 'w-auto min-w-28')}
          value={statusId}
          onChange={(e) => {
            onStatusChange(e.target.value);
          }}
        >
          {statuses.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="create-wi-priority" className="text-2xs font-medium text-muted-foreground">
          Priority
        </label>
        <select
          id="create-wi-priority"
          className={cn(quietSelectClass, 'w-auto min-w-24')}
          value={priority}
          onChange={(e) => {
            onPriorityChange(e.target.value as Priority);
          }}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityLabels[p]}
            </option>
          ))}
        </select>
      </div>

      {activeEras.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="create-wi-era" className="text-2xs font-medium text-muted-foreground">
            Era
          </label>
          <select
            id="create-wi-era"
            className={cn(quietSelectClass, 'w-auto min-w-28')}
            value={eraId}
            onChange={(e) => {
              onEraChange(e.target.value);
            }}
          >
            <option value="">No era</option>
            {activeEras.map((era) => (
              <option key={era.id} value={era.id}>
                {era.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

interface SettingsColumnProps {
  workItemTypes: ProjectWorkItemType[];
  eligibleParents: WorkItem[];
  unit: EstimateUnit;
  workItemTypeId: string;
  estimate: string;
  parentId: string;
  errs: FormFieldErrors;
  onTypeChange: (id: string) => void;
  onEstimateChange: (value: string) => void;
  onParentChange: (id: string) => void;
}

function SettingsColumn({
  workItemTypes,
  eligibleParents,
  unit,
  workItemTypeId,
  estimate,
  parentId,
  errs,
  onTypeChange,
  onEstimateChange,
  onParentChange,
}: SettingsColumnProps) {
  return (
    <aside className="flex flex-col gap-3.5 border-t border-border p-5 md:border-t-0 md:border-l">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Planning &amp; Details
      </h2>

      <Field>
        <FieldLabel htmlFor="create-wi-type" className="text-2xs text-muted-foreground">
          Work Item Type
        </FieldLabel>
        <select
          id="create-wi-type"
          className={quietSelectClass}
          value={workItemTypeId}
          onChange={(e) => {
            onTypeChange(e.target.value);
          }}
        >
          {workItemTypes.map((wt) => (
            <option key={wt.id} value={wt.id}>
              {wt.name}
            </option>
          ))}
        </select>
      </Field>

      {eligibleParents.length > 0 && (
        <ParentSelect
          id="create-wi-parent"
          value={parentId}
          candidates={eligibleParents}
          error={errs.parent}
          onChange={onParentChange}
        />
      )}

      <EstimateInput
        id="create-wi-estimate"
        unit={unit}
        value={estimate}
        error={errs.estimate}
        onChange={onEstimateChange}
      />
    </aside>
  );
}

interface ModalTopBarProps {
  typeName: string;
  maximized: boolean;
  onToggleMaximize?: () => void;
  onClose: () => void;
}

function ModalTopBar({ typeName, maximized, onToggleMaximize, onClose }: ModalTopBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 pt-3.5 pb-1">
      <div className="flex items-center gap-2 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
        <span className="size-1.5 rounded-xs bg-primary" aria-hidden="true" />
        <span>{typeName} · New</span>
      </div>
      <div className="flex items-center gap-1">
        {onToggleMaximize && (
          <IconButton
            size="sm"
            variant="ghost"
            aria-label={maximized ? 'Minimize editor' : 'Maximize editor'}
            onClick={onToggleMaximize}
          >
            {maximized ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </IconButton>
        )}
        <IconButton size="sm" variant="ghost" aria-label="Close modal" onClick={onClose}>
          <X aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}

interface ModalActionsBarProps {
  participants: Participant[];
  assigneeId: string;
  isPending: boolean;
  onAssigneeChange: (id: string) => void;
  onClose: () => void;
}

function ModalActionsBar({
  participants,
  assigneeId,
  isPending,
  onAssigneeChange,
  onClose,
}: ModalActionsBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-1 pb-3">
      <div className="flex items-center gap-3">
        {participants.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label htmlFor="create-wi-assignee" className="sr-only">
              Assignee
            </label>
            <select
              id="create-wi-assignee"
              className={cn(quietSelectClass, 'w-auto min-w-32')}
              value={assigneeId}
              onChange={(e) => {
                onAssigneeChange(e.target.value);
              }}
            >
              <option value="">Unassigned</option>
              {participants.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name || `@${person.username}`}
                </option>
              ))}
            </select>
          </div>
        )}
        <span className="text-2xs text-muted-foreground">Ctrl + Enter to save</span>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="compact" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="compact"
          disabled={isPending}
          aria-busy={isPending || undefined}
        >
          Create Work Item
        </Button>
      </div>
    </div>
  );
}

function ModalTitleBand({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (next: string) => void;
}) {
  const invalid = error ? true : undefined;
  return (
    <div className="px-4 py-1">
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="create-wi-title" className="sr-only">
          Title
        </FieldLabel>
        <InlineInput
          id="create-wi-title"
          name="title"
          required
          autoFocus
          maxLength={255}
          placeholder="Work item title..."
          value={value}
          aria-invalid={invalid}
          className="h-9 text-base font-semibold tracking-tight"
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
        {error && <FieldError className="px-2">{error}</FieldError>}
      </Field>
    </div>
  );
}

function resolveTypeMeta(
  workItemTypes: ProjectWorkItemType[],
  id: string,
): { name: string; unit: EstimateUnit } {
  const found = workItemTypes.find((t) => t.id === id);
  return {
    name: found?.name ?? 'Work Item',
    unit: found?.estimateUnit ?? 'none',
  };
}

/** Multi-row Work Item modal form with quiet border-on-hover fields and 2-column Row 5 layout. */
export function CreateWorkItemForm(props: CreateWorkItemFormProps) {
  const { projectId, statuses, workItemTypes, existingItems, initialStatusId, onClose } = props;
  const create = useCreateWorkItem(projectId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workItemTypeId, setWorkItemTypeId] = useState(() => workItemTypes[0]?.id ?? '');
  const [statusId, setStatusId] = useState(() => defaultStatusId(statuses, initialStatusId));
  const [priority, setPriority] = useState<Priority>('none');
  const [parentId, setParentId] = useState('');
  const [eraId, setEraId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [estimate, setEstimate] = useState('');

  const typeMeta = resolveTypeMeta(workItemTypes, workItemTypeId);
  const eligibleParents = eligibleParentsForType(existingItems, workItemTypes, workItemTypeId);
  const createError = create.isError ? create.error : null;
  const errs = readFormErrors(createError);

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
      unit: typeMeta.unit,
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
      className="flex min-h-0 flex-1 flex-col"
      aria-label="New Work Item"
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
    >
      <ModalTopBar
        typeName={typeMeta.name}
        maximized={Boolean(props.maximized)}
        onToggleMaximize={props.onToggleMaximize}
        onClose={onClose}
      />

      <ModalTitleBand value={title} error={errs.title} onChange={setTitle} />

      <ModalActionsBar
        participants={props.participants ?? []}
        assigneeId={assigneeId}
        isPending={create.isPending}
        onAssigneeChange={setAssigneeId}
        onClose={onClose}
      />

      <ModalMetaBand
        statuses={statuses}
        eras={props.eras ?? []}
        statusId={statusId}
        priority={priority}
        eraId={eraId}
        onStatusChange={setStatusId}
        onPriorityChange={setPriority}
        onEraChange={setEraId}
      />

      <FormErrorBanner error={createError} hidden={errs.hasField} />

      {/* Row 5: Two main columns — Content (left) & Planning/Settings (right) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-2 p-5">
          <Field className="flex flex-1 flex-col">
            <FieldLabel
              htmlFor="create-wi-description"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              Description
            </FieldLabel>
            <InlineTextarea
              id="create-wi-description"
              placeholder="Add context, acceptance criteria, or notes..."
              className="min-h-48 flex-1 text-sm"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
            />
          </Field>
        </div>

        <SettingsColumn
          workItemTypes={workItemTypes}
          eligibleParents={eligibleParents}
          unit={typeMeta.unit}
          workItemTypeId={workItemTypeId}
          estimate={estimate}
          parentId={parentId}
          errs={errs}
          onTypeChange={(nextTypeId) => {
            setWorkItemTypeId(nextTypeId);
            setEstimate('');
            setParentId('');
          }}
          onEstimateChange={setEstimate}
          onParentChange={setParentId}
        />
      </div>
    </form>
  );
}

interface CreateWorkItemDialogProps extends Omit<CreateWorkItemFormProps, 'onClose'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Multi-row Work Item modal supporting compact quick-create and maximized editor modes. */
export function CreateWorkItemDialog({
  open,
  onOpenChange,
  ...formProps
}: CreateWorkItemDialogProps) {
  const [maximized, setMaximized] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setMaximized(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-maximized={maximized ? 'true' : undefined}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          maximized
            ? 'h-[calc(100svh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-none sm:max-w-none'
            : 'max-h-[90svh] sm:max-w-[920px]',
        )}
      >
        <DialogTitle className="sr-only">New Work Item</DialogTitle>
        <DialogDescription className="sr-only">
          Create a new work item with description on the left and planning details on the right.
        </DialogDescription>
        {open && (
          <CreateWorkItemForm
            {...formProps}
            maximized={maximized}
            onToggleMaximize={() => {
              setMaximized((prev) => !prev);
            }}
            onClose={() => {
              setMaximized(false);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
