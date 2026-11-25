import { AlertCircle, ArrowLeft, Loader2, Trash2, UserCheck, UserMinus } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { errorMessage } from '../../../shared/api/httpClient';
import { useCurrentUser } from '../../auth';
import {
  projectPath,
  type EstimateUnit,
  type ProjectEra,
  type ProjectStatus,
} from '../../projects';
import {
  useProjectEras,
  useProjectStatuses,
  useProjectWorkItemTypes,
} from '../../projects/hooks/useProjects';
import type { Priority, UpdateWorkItemPayload, WorkItem } from '../api/workItemsApi';
import {
  useDeleteWorkItem,
  useTransitionWorkItem,
  useUpdateWorkItem,
  useWorkItem,
  useWorkItems,
} from '../hooks/useWorkItems';
import { EstimateInput, ParentSelect } from './CreateWorkItemForm';
import { WorkItemLinksCard } from './WorkItemLinksCard';
import {
  eligibleParentsForType,
  parseEstimateInput,
  PRIORITIES,
  priorityLabels,
  priorityVariants,
  selectClassName,
  textareaClassName,
  workItemFieldError,
} from './workItemLabels';

function initialEstimateText(item: WorkItem): string {
  if (item.storyPoints !== null) return String(item.storyPoints);
  if (item.hours !== null) return String(item.hours);
  return '';
}

interface WorkItemHeaderProps {
  item: WorkItem;
  typeName?: string;
  statuses: ProjectStatus[];
  canWrite: boolean;
  busy: boolean;
  onTransition: (statusId: string) => void;
}

function WorkItemHeader({
  item,
  typeName,
  statuses,
  canWrite,
  busy,
  onTransition,
}: WorkItemHeaderProps) {
  const currentStatus = statuses.find((s) => s.id === item.statusId);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{item.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {typeName && <Badge variant="outline">{typeName}</Badge>}
          <Badge variant={priorityVariants[item.priority]}>
            Priority: {priorityLabels[item.priority]}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canWrite && statuses.length > 0 ? (
          <select
            aria-label="Status"
            className={`${selectClassName} w-auto min-w-36`}
            value={item.statusId}
            disabled={busy}
            onChange={(e) => {
              onTransition(e.target.value);
            }}
          >
            {statuses.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        ) : (
          currentStatus && <Badge variant="secondary">{currentStatus.name}</Badge>
        )}
      </div>
    </header>
  );
}

interface DetailsCardProps {
  item: WorkItem;
  unit: EstimateUnit;
  eligibleParents: WorkItem[];
  selectableEras: ProjectEra[];
  canWrite: boolean;
  busy: boolean;
  isSaving: boolean;
  error: unknown;
  onSave: (payload: UpdateWorkItemPayload, onSuccess: () => void) => void;
}

function readDetailErrors(error: unknown) {
  if (!error) return { hasField: false };
  const title = workItemFieldError(error, 'title');
  const estimate = workItemFieldError(error, 'estimate');
  const parent = workItemFieldError(error, 'parent_id');
  return { title, estimate, parent, hasField: Boolean(title ?? estimate ?? parent) };
}

function buildUpdatePayload(fields: {
  title: string;
  description: string;
  priority: Priority;
  parentId: string;
  eraId: string;
  eraChanged: boolean;
  unit: EstimateUnit;
  estimate: string;
}): UpdateWorkItemPayload {
  const numeric = parseEstimateInput(fields.estimate);
  const payload: UpdateWorkItemPayload = {
    title: fields.title,
    description: fields.description,
    priority: fields.priority,
    parentId: fields.parentId || null,
  };
  if (fields.eraChanged) payload.eraId = fields.eraId || null;
  if (fields.unit === 'story_points') payload.storyPoints = numeric;
  if (fields.unit === 'hours') payload.hours = numeric;
  return payload;
}

function ErrorBanner({ error, hidden }: { error: unknown; hidden?: boolean }) {
  if (!error || hidden) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}

function EraSelectField({
  value,
  eras,
  disabled,
  onChange,
}: {
  value: string;
  eras: ProjectEra[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (eras.length === 0) return null;
  return (
    <Field>
      <FieldLabel htmlFor="edit-wi-era">Era</FieldLabel>
      <select
        id="edit-wi-era"
        className={selectClassName}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        <option value="">No Era</option>
        {eras.map((era) => (
          <option key={era.id} value={era.id}>
            {era.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function WorkItemDetailsCard({
  item,
  unit,
  eligibleParents,
  selectableEras,
  canWrite,
  busy,
  isSaving,
  error,
  onSave,
}: DetailsCardProps) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [parentId, setParentId] = useState(item.parentId ?? '');
  const [eraId, setEraId] = useState(item.eraId ?? '');
  const [estimate, setEstimate] = useState(() => initialEstimateText(item));
  const [saved, setSaved] = useState(false);

  const errs = readDetailErrors(error);
  const locked = !canWrite || busy;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const payload = buildUpdatePayload({
      title,
      description,
      priority,
      parentId,
      eraId,
      eraChanged: eraId !== (item.eraId ?? ''),
      unit,
      estimate,
    });
    onSave(payload, () => {
      setSaved(true);
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <form className="grid gap-4" aria-label="Work Item details" onSubmit={handleSubmit}>
          <ErrorBanner error={error} hidden={errs.hasField} />
          <FormField
            label="Title"
            name="title"
            required
            maxLength={255}
            value={title}
            disabled={locked}
            error={errs.title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaved(false);
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="edit-wi-priority">Priority</FieldLabel>
              <select
                id="edit-wi-priority"
                className={selectClassName}
                value={priority}
                disabled={locked}
                onChange={(e) => {
                  setPriority(e.target.value as Priority);
                  setSaved(false);
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
              id="edit-wi-estimate"
              unit={unit}
              value={estimate}
              disabled={locked}
              error={errs.estimate}
              onChange={(val) => {
                setEstimate(val);
                setSaved(false);
              }}
            />
            <ParentSelect
              id="edit-wi-parent"
              value={parentId}
              candidates={eligibleParents}
              disabled={locked}
              error={errs.parent}
              onChange={(val) => {
                setParentId(val);
                setSaved(false);
              }}
            />
            <EraSelectField
              value={eraId}
              eras={selectableEras}
              disabled={locked}
              onChange={(val) => {
                setEraId(val);
                setSaved(false);
              }}
            />
          </div>
          <Field>
            <FieldLabel htmlFor="edit-wi-description">Description</FieldLabel>
            <textarea
              id="edit-wi-description"
              className={textareaClassName}
              value={description}
              disabled={locked}
              onChange={(e) => {
                setDescription(e.target.value);
                setSaved(false);
              }}
            />
          </Field>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy} aria-busy={isSaving || undefined}>
                Save changes
              </Button>
              {saved && (
                <span role="status" className="text-sm text-muted-foreground">
                  Changes saved.
                </span>
              )}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

interface AssigneeCardProps {
  item: WorkItem;
  currentUserId?: string;
  canWrite: boolean;
  busy: boolean;
  onAssign: (assigneeId: string | null) => void;
}

function WorkItemAssigneeCard({
  item,
  currentUserId,
  canWrite,
  busy,
  onAssign,
}: AssigneeCardProps) {
  const showAssignToMe = Boolean(currentUserId && item.assigneeId !== currentUserId);
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Assignee</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <p className="text-sm">
          {item.assigneeId ? (
            <>
              <span className="font-medium">{item.assigneeName || item.assigneeUsername}</span>{' '}
              {item.assigneeUsername && (
                <span className="text-muted-foreground">@{item.assigneeUsername}</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </p>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {showAssignToMe && currentUserId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  onAssign(currentUserId);
                }}
              >
                <UserCheck className="size-4" aria-hidden="true" />
                Assign to me
              </Button>
            )}
            {item.assigneeId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  onAssign(null);
                }}
              >
                <UserMinus className="size-4" aria-hidden="true" />
                Unassign
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DeleteCardProps {
  busy: boolean;
  isPending: boolean;
  error: unknown;
  onDelete: () => void;
}

function WorkItemDeleteCard({ busy, isPending, error, onDelete }: DeleteCardProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Delete Work Item</CardTitle>
        <CardDescription>
          Deleting a Work Item is immediate and permanent. Any Child Work Items stay in the Project
          with no Parent.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-6">
        {Boolean(error) && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            aria-busy={isPending || undefined}
            onClick={onDelete}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete Work Item
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function useWorkItemContext(item: WorkItem) {
  const currentUser = useCurrentUser();
  const statuses = useProjectStatuses(item.projectId).data ?? [];
  const types = useProjectWorkItemTypes(item.projectId).data ?? [];
  const eras = useProjectEras(item.projectId).data ?? [];
  const projectItems = useWorkItems(item.projectId, {}, 1).data?.items ?? [];
  const currentType = types.find((t) => t.id === item.workItemTypeId);
  const selectableEras = eras.filter((e) => e.state !== 'completed' || e.id === item.eraId);
  return {
    currentUserId: currentUser.data?.id,
    statuses,
    currentType,
    projectItems,
    selectableEras,
    eligibleParents: eligibleParentsForType(projectItems, types, item.workItemTypeId, item.id),
  };
}

function WorkItemEditor({ item }: { item: WorkItem }) {
  const navigate = useNavigate();
  const ctx = useWorkItemContext(item);
  const update = useUpdateWorkItem(item.id);
  const transition = useTransitionWorkItem(item.projectId);
  const remove = useDeleteWorkItem(item.projectId);

  const canWrite = item.currentUserRole !== 'viewer';
  const busy = update.isPending || transition.isPending || remove.isPending;

  return (
    <div className="grid gap-6">
      <WorkItemHeader
        item={item}
        typeName={ctx.currentType?.name}
        statuses={ctx.statuses}
        canWrite={canWrite}
        busy={busy}
        onTransition={(statusId) => {
          transition.mutate({ workItemId: item.id, statusId });
        }}
      />
      <ErrorBanner error={transition.isError ? transition.error : null} />
      <WorkItemDetailsCard
        item={item}
        unit={ctx.currentType?.estimateUnit ?? 'none'}
        eligibleParents={ctx.eligibleParents}
        selectableEras={ctx.selectableEras}
        canWrite={canWrite}
        busy={busy}
        isSaving={update.isPending}
        error={update.isError ? update.error : null}
        onSave={(payload, onSuccess) => {
          update.mutate(payload, { onSuccess });
        }}
      />
      <WorkItemLinksCard workItemId={item.id} projectItems={ctx.projectItems} canWrite={canWrite} />
      <WorkItemAssigneeCard
        item={item}
        currentUserId={ctx.currentUserId}
        canWrite={canWrite}
        busy={busy}
        onAssign={(assigneeId) => {
          update.mutate({ assigneeId });
        }}
      />
      {canWrite && (
        <WorkItemDeleteCard
          busy={busy}
          isPending={remove.isPending}
          error={remove.isError ? remove.error : null}
          onDelete={() => {
            remove.mutate(item.id, {
              onSuccess: () => {
                void navigate(projectPath(item.projectId));
              },
            });
          }}
        />
      )}
      <div>
        <Link
          className={buttonVariants({ variant: 'link', className: 'px-0' })}
          to={projectPath(item.projectId)}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Project
        </Link>
      </div>
    </div>
  );
}

/** Displays and edits a single Work Item inside its Project. */
export function WorkItemPage() {
  const { workItemId = '' } = useParams();
  const query = useWorkItem(workItemId);

  if (query.isPending) {
    return (
      <span
        role="status"
        aria-label="Loading"
        className="inline-flex items-center text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </span>
    );
  }
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertDescription role="alert">{errorMessage(query.error)}</AlertDescription>
      </Alert>
    );
  }
  return <WorkItemEditor key={query.data.id} item={query.data} />;
}
