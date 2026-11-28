import { AlertCircle, Maximize2, Minimize2, X } from 'lucide-react';
import { useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { InlineInput } from '@/components/ui/inline-field';
import { PriorityBadge } from '@/components/ui/priority-badge';
import { cn } from '@/lib/utils';
import { errorMessage } from '../../../shared/api/httpClient';
import type { EstimateUnit, ProjectEra, ProjectStatus, ProjectWorkItemType } from '../../projects';
import type { Priority, WorkItem } from '../api/workItemsApi';
import { useCreateWorkItem } from '../hooks/useWorkItems';
import { workItemPath } from '../paths';
import type { Participant } from './ProjectWorkspaceHeader';
import { initialsOf, resolveStatusTone, typeDotClass } from './statusTone';
import {
  CollapsibleSection,
  EraDateWindow,
  MarkdownDescriptionSection,
} from './WorkItemEditorParts';
import {
  eligibleParentsForType,
  parseEstimateInput,
  PRIORITIES,
  priorityLabels,
  quietEditorSelectClass,
  workItemFieldError,
} from './workItemLabels';

const quietSelectClass = quietEditorSelectClass;

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
  projectName?: string;
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
  projectName?: string;
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
  projectName,
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
  const currentStatus = statuses.find((s) => s.id === statusId);
  const tone = resolveStatusTone(currentStatus);

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-y border-border bg-secondary/60 px-5 py-2.5">
      <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
        <div className="flex items-center gap-2.5">
          <label
            htmlFor="create-wi-status"
            className="w-12 text-2xs font-medium text-muted-foreground"
          >
            Status
          </label>
          <span className={cn('size-2 shrink-0 rounded-xs', tone.dot)} aria-hidden="true" />
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

        {projectName && (
          <div className="flex items-center gap-2.5">
            <span className="w-12 text-2xs font-medium text-muted-foreground">Project</span>
            <span className="truncate px-1.5 text-xs font-medium text-foreground">
              {projectName}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <label
            htmlFor="create-wi-priority"
            className="w-12 text-2xs font-medium text-muted-foreground"
          >
            Priority
          </label>
          {priority !== 'none' && <PriorityBadge priority={priority} />}
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
          <div className="flex items-center gap-2.5">
            <label
              htmlFor="create-wi-era"
              className="w-12 text-2xs font-medium text-muted-foreground"
            >
              Era
            </label>
            <select
              id="create-wi-era"
              className={cn(quietSelectClass, 'w-auto min-w-36')}
              value={eraId}
              onChange={(e) => {
                onEraChange(e.target.value);
              }}
            >
              <option value="">No era</option>
              {activeEras.map((era) => (
                <option key={era.id} value={era.id}>
                  {era.name} · {era.startDate} – {era.endDate}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="hidden items-center gap-4 text-xs sm:flex">
        <span className="border-b-2 border-primary pb-1 font-medium text-foreground">Details</span>
      </div>
    </div>
  );
}

interface SettingsColumnProps {
  workItemTypes: ProjectWorkItemType[];
  eligibleParents: WorkItem[];
  selectedEra?: ProjectEra;
  typeName: string;
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
  selectedEra,
  typeName,
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
    <aside className="flex flex-col gap-5 border-t border-border p-5 md:border-t-0 md:border-l">
      <CollapsibleSection title="Planning & Details">
        <Field>
          <FieldLabel htmlFor="create-wi-type" className="text-2xs text-muted-foreground">
            Work Item Type
          </FieldLabel>
          <div className="flex items-center gap-2">
            <span
              className={cn('size-2 shrink-0 rounded-xs', typeDotClass(typeName))}
              aria-hidden="true"
            />
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
          </div>
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

        <EraDateWindow era={selectedEra} />
      </CollapsibleSection>
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
        <span className={cn('size-2 rounded-xs', typeDotClass(typeName))} aria-hidden="true" />
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
  onCreateAndOpen: () => void;
  onClose: () => void;
}

function ModalActionsBar({
  participants,
  assigneeId,
  isPending,
  onAssigneeChange,
  onCreateAndOpen,
  onClose,
}: ModalActionsBarProps) {
  const selectedPerson = participants.find((p) => p.id === assigneeId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-1 pb-3">
      <div className="flex items-center gap-3">
        {participants.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Avatar size="xs">
              <AvatarFallback className="text-3xs font-semibold">
                {selectedPerson ? initialsOf(selectedPerson.name, selectedPerson.username) : '?'}
              </AvatarFallback>
            </Avatar>
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
        <Button type="button" size="compact" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="compact"
          variant="outline"
          disabled={isPending}
          onClick={onCreateAndOpen}
        >
          Create &amp; Open
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
  const {
    projectId,
    projectName,
    statuses,
    workItemTypes,
    existingItems,
    initialStatusId,
    onClose,
  } = props;
  const navigate = useNavigate();
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
  const selectedEra = (props.eras ?? []).find((e) => e.id === eraId);
  const createError = create.isError ? create.error : null;
  const errs = readFormErrors(createError);

  function submitWorkItem(openAfterCreate = false) {
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
    create.mutate(payload, {
      onSuccess: (created) => {
        onClose();
        if (openAfterCreate) {
          void navigate(workItemPath(created.id));
        }
      },
    });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    submitWorkItem(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submitWorkItem(false);
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
        onCreateAndOpen={() => {
          submitWorkItem(true);
        }}
        onClose={onClose}
      />

      <ModalMetaBand
        projectName={projectName}
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
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5 p-5">
          <MarkdownDescriptionSection
            id="create-wi-description"
            value={description}
            onChange={setDescription}
          />
        </div>

        <SettingsColumn
          workItemTypes={workItemTypes}
          eligibleParents={eligibleParents}
          selectedEra={selectedEra}
          typeName={typeMeta.name}
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
