import { AlertCircle, ArrowLeft, Loader2, Trash2, UserCheck, UserMinus, X } from 'lucide-react';
import { useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { InlineInput } from '@/components/ui/inline-field';
import { PriorityBadge } from '@/components/ui/priority-badge';
import { cn } from '@/lib/utils';
import { errorMessage } from '../../../shared/api/httpClient';
import { useCurrentUser } from '../../auth';
import {
  projectPath,
  type EstimateUnit,
  type ProjectEra,
  type ProjectStatus,
} from '../../projects';
import {
  useProject,
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
  useWorkItemLinks,
  useWorkItems,
} from '../hooks/useWorkItems';
import { EstimateInput, ParentSelect } from './CreateWorkItemForm';
import { initialsOf, resolveStatusTone, typeDotClass } from './statusTone';
import {
  CollapsibleSection,
  EraDateWindow,
  MarkdownDescriptionSection,
} from './WorkItemEditorParts';
import { WorkItemLinksCard } from './WorkItemLinksCard';
import {
  eligibleParentsForType,
  formatShortKey,
  parseEstimateInput,
  PRIORITIES,
  priorityLabels,
  quietEditorSelectClass,
  workItemFieldError,
} from './workItemLabels';

type EditorTab = 'details' | 'links';

function initialEstimateText(item: WorkItem): string {
  if (item.storyPoints !== null) return String(item.storyPoints);
  if (item.hours !== null) return String(item.hours);
  return '';
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
    <div className="px-6 pt-3">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
      </Alert>
    </div>
  );
}

function EditorTopBar({ item, typeName }: { item: WorkItem; typeName: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-6 pt-3.5 pb-1">
      <div className="flex items-center gap-2 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
        <span className={cn('size-2 rounded-xs', typeDotClass(typeName))} aria-hidden="true" />
        <span>
          {typeName} · {formatShortKey(item.id)}
        </span>
      </div>
      <Link
        to={projectPath(item.projectId)}
        aria-label="Back to Project"
        title="Back to Project"
        className="inline-flex h-6 items-center gap-1 rounded-xs border border-transparent px-1.5 text-2xs font-medium text-muted-foreground transition-colors hover:border-input hover:bg-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Back to Project</span>
        <X className="size-3.5 sm:hidden" aria-hidden="true" />
      </Link>
    </div>
  );
}

function EditorTitleBand({
  value,
  error,
  locked,
  onChange,
}: {
  value: string;
  error?: string;
  locked: boolean;
  onChange: (next: string) => void;
}) {
  const invalid = error ? true : undefined;
  return (
    <div className="px-5 py-1">
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="edit-wi-title" className="sr-only">
          Title
        </FieldLabel>
        <InlineInput
          id="edit-wi-title"
          name="title"
          required
          maxLength={255}
          value={value}
          disabled={locked}
          aria-invalid={invalid}
          className="h-9 text-lg font-semibold tracking-tight"
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
        {error && <FieldError className="px-2">{error}</FieldError>}
      </Field>
    </div>
  );
}

function EditorAssigneeStrip({
  item,
  currentUserId,
  canWrite,
  busy,
  onAssign,
}: {
  item: WorkItem;
  currentUserId?: string;
  canWrite: boolean;
  busy: boolean;
  onAssign: (assigneeId: string | null) => void;
}) {
  const canAssignToMe = canWrite && Boolean(currentUserId) && item.assigneeId !== currentUserId;
  const canUnassign = canWrite && Boolean(item.assigneeId);
  const displayName = item.assigneeName || item.assigneeUsername;
  const fallback = item.assigneeId ? initialsOf(item.assigneeName, item.assigneeUsername) : '?';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs">
        <Avatar size="xs">
          <AvatarFallback className="text-3xs font-semibold">{fallback}</AvatarFallback>
        </Avatar>
        {item.assigneeId ? (
          <span className="font-medium text-foreground">{displayName}</span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        )}
      </div>
      {canAssignToMe && currentUserId && (
        <Button
          type="button"
          size="compact"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            onAssign(currentUserId);
          }}
        >
          <UserCheck className="size-3.5" aria-hidden="true" />
          Assign to me
        </Button>
      )}
      {canUnassign && (
        <Button
          type="button"
          size="compact"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            onAssign(null);
          }}
        >
          <UserMinus className="size-3.5" aria-hidden="true" />
          Unassign
        </Button>
      )}
    </div>
  );
}

function EditorActionButtons({
  canWrite,
  busy,
  isSaving,
  isDeleting,
  onSaveAndClose,
  onDelete,
}: {
  canWrite: boolean;
  busy: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onSaveAndClose: () => void;
  onDelete: () => void;
}) {
  if (!canWrite) return null;
  return (
    <div className="flex items-center gap-2">
      <Button
        type="submit"
        size="compact"
        variant="outline"
        disabled={busy}
        aria-busy={isSaving || undefined}
      >
        Save changes
      </Button>
      <Button type="button" size="compact" disabled={busy} onClick={onSaveAndClose}>
        Save &amp; Close
      </Button>
      <Button
        type="button"
        size="compact"
        variant="ghost"
        disabled={busy}
        aria-busy={isDeleting || undefined}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Delete Work Item
      </Button>
    </div>
  );
}

interface EditorMetaBandProps {
  item: WorkItem;
  projectName?: string;
  statuses: ProjectStatus[];
  eras: ProjectEra[];
  priority: Priority;
  eraId: string;
  linksCount: number;
  activeTab: EditorTab;
  canWrite: boolean;
  locked: boolean;
  onTransition: (statusId: string) => void;
  onPriorityChange: (next: Priority) => void;
  onEraChange: (next: string) => void;
  onTabChange: (tab: EditorTab) => void;
}

function StatusMetaField({
  statusId,
  statuses,
  canWrite,
  locked,
  onTransition,
}: {
  statusId: string;
  statuses: ProjectStatus[];
  canWrite: boolean;
  locked: boolean;
  onTransition: (statusId: string) => void;
}) {
  const currentStatus = statuses.find((s) => s.id === statusId);
  const tone = resolveStatusTone(currentStatus);

  return (
    <div className="flex items-center gap-2.5">
      <label htmlFor="edit-wi-status" className="w-12 text-2xs font-medium text-muted-foreground">
        Status
      </label>
      <span className={cn('size-2 shrink-0 rounded-xs', tone.dot)} aria-hidden="true" />
      {canWrite && statuses.length > 0 ? (
        <select
          id="edit-wi-status"
          aria-label="Status"
          className={cn(quietEditorSelectClass, 'w-auto min-w-28')}
          value={statusId}
          disabled={locked}
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
  );
}

function EditorTabs({
  activeTab,
  linksCount,
  onTabChange,
}: {
  activeTab: EditorTab;
  linksCount: number;
  onTabChange: (tab: EditorTab) => void;
}) {
  const tabClass = (active: boolean) =>
    cn(
      'cursor-pointer border-b-2 pb-1 transition-colors',
      active
        ? 'border-primary font-medium text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    );

  return (
    <div role="tablist" aria-label="Editor sections" className="flex items-center gap-4 text-xs">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'details'}
        onClick={() => {
          onTabChange('details');
        }}
        className={tabClass(activeTab === 'details')}
      >
        Details
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'links'}
        onClick={() => {
          onTabChange('links');
        }}
        className={tabClass(activeTab === 'links')}
      >
        Links ({linksCount})
      </button>
    </div>
  );
}

function EditorMetaBand(props: EditorMetaBandProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-y border-border bg-secondary/60 px-6 py-2.5">
      <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
        <StatusMetaField
          statusId={props.item.statusId}
          statuses={props.statuses}
          canWrite={props.canWrite}
          locked={props.locked}
          onTransition={props.onTransition}
        />

        <div className="flex items-center gap-2.5">
          <span className="w-12 text-2xs font-medium text-muted-foreground">Project</span>
          <span className="truncate px-1.5 text-xs font-medium text-foreground">
            {props.projectName ?? 'Project'}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <label
            htmlFor="edit-wi-priority"
            className="w-12 text-2xs font-medium text-muted-foreground"
          >
            Priority
          </label>
          {props.priority !== 'none' && <PriorityBadge priority={props.priority} />}
          <select
            id="edit-wi-priority"
            className={cn(quietEditorSelectClass, 'w-auto min-w-24')}
            value={props.priority}
            disabled={props.locked}
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
        </div>

        {props.eras.length > 0 && (
          <div className="flex items-center gap-2.5">
            <label
              htmlFor="edit-wi-era"
              className="w-12 text-2xs font-medium text-muted-foreground"
            >
              Era
            </label>
            <select
              id="edit-wi-era"
              className={cn(quietEditorSelectClass, 'w-auto min-w-36')}
              value={props.eraId}
              disabled={props.locked}
              onChange={(e) => {
                props.onEraChange(e.target.value);
              }}
            >
              <option value="">No Era</option>
              {props.eras.map((era) => (
                <option key={era.id} value={era.id}>
                  {era.name} · {era.startDate} – {era.endDate}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <span className="text-2xs text-muted-foreground tabular-nums">
          Updated {props.item.updatedAt.slice(0, 10)}
        </span>
        <EditorTabs
          activeTab={props.activeTab}
          linksCount={props.linksCount}
          onTabChange={props.onTabChange}
        />
      </div>
    </div>
  );
}

interface EditorBodyColumnsProps {
  item: WorkItem;
  typeName: string;
  unit: EstimateUnit;
  description: string;
  parentId: string;
  estimate: string;
  eligibleParents: WorkItem[];
  projectItems: WorkItem[];
  selectedEra?: ProjectEra;
  activeTab: EditorTab;
  canWrite: boolean;
  locked: boolean;
  errs: ReturnType<typeof readDetailErrors>;
  onDescriptionChange: (next: string) => void;
  onParentChange: (next: string) => void;
  onEstimateChange: (next: string) => void;
}

function EditorBodyColumns(props: EditorBodyColumnsProps) {
  const showDetails = props.activeTab === 'details';

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-6 p-6">
        {showDetails ? (
          <MarkdownDescriptionSection
            id="edit-wi-description"
            value={props.description}
            disabled={props.locked}
            onChange={props.onDescriptionChange}
          />
        ) : (
          <WorkItemLinksCard
            workItemId={props.item.id}
            projectItems={props.projectItems}
            canWrite={props.canWrite}
          />
        )}
      </div>

      <aside className="flex flex-col gap-6 border-t border-border p-6 md:border-t-0 md:border-l">
        <CollapsibleSection title="Planning & Details">
          <div className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-muted-foreground">Work Item Type</span>
            <div className="flex items-center gap-2 px-1.5 py-1 text-xs font-medium text-foreground">
              <span
                className={cn('size-2 shrink-0 rounded-xs', typeDotClass(props.typeName))}
                aria-hidden="true"
              />
              <span>{props.typeName}</span>
            </div>
          </div>

          <ParentSelect
            id="edit-wi-parent"
            value={props.parentId}
            candidates={props.eligibleParents}
            disabled={props.locked}
            error={props.errs.parent}
            onChange={props.onParentChange}
          />

          <EstimateInput
            id="edit-wi-estimate"
            unit={props.unit}
            value={props.estimate}
            disabled={props.locked}
            error={props.errs.estimate}
            onChange={props.onEstimateChange}
          />

          <EraDateWindow era={props.selectedEra} />
        </CollapsibleSection>

        {showDetails && (
          <WorkItemLinksCard
            workItemId={props.item.id}
            projectItems={props.projectItems}
            canWrite={props.canWrite}
          />
        )}
      </aside>
    </div>
  );
}

function deriveWorkItemMeta(
  item: WorkItem,
  types: ReturnType<typeof useProjectWorkItemTypes>['data'],
  eras: ReturnType<typeof useProjectEras>['data'],
  projectItems: WorkItem[],
) {
  const safeTypes = types ?? [];
  const safeEras = eras ?? [];
  const currentType = safeTypes.find((t) => t.id === item.workItemTypeId);
  return {
    typeName: currentType?.name ?? 'Work Item',
    unit: currentType?.estimateUnit ?? 'none',
    selectableEras: safeEras.filter((e) => e.state !== 'completed' || e.id === item.eraId),
    eligibleParents: eligibleParentsForType(projectItems, safeTypes, item.workItemTypeId, item.id),
  };
}

function useWorkItemContext(item: WorkItem) {
  const currentUser = useCurrentUser();
  const project = useProject(item.projectId).data;
  const statuses = useProjectStatuses(item.projectId).data ?? [];
  const typesQuery = useProjectWorkItemTypes(item.projectId);
  const erasQuery = useProjectEras(item.projectId);
  const links = useWorkItemLinks(item.id).data ?? [];
  const projectItems = useWorkItems(item.projectId, {}, 1).data?.items ?? [];
  const meta = deriveWorkItemMeta(item, typesQuery.data, erasQuery.data, projectItems);

  return {
    currentUserId: currentUser.data?.id,
    projectName: project?.name,
    statuses,
    linksCount: links.length,
    projectItems,
    ...meta,
  };
}

function isCtrlEnter(event: KeyboardEvent<HTMLFormElement>): boolean {
  return (event.ctrlKey || event.metaKey) && event.key === 'Enter';
}

function WorkItemEditor({ item }: { item: WorkItem }) {
  const navigate = useNavigate();
  const ctx = useWorkItemContext(item);
  const update = useUpdateWorkItem(item.id);
  const transition = useTransitionWorkItem(item.projectId);
  const remove = useDeleteWorkItem(item.projectId);

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [parentId, setParentId] = useState(item.parentId ?? '');
  const [eraId, setEraId] = useState(item.eraId ?? '');
  const [estimate, setEstimate] = useState(() => initialEstimateText(item));
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('details');

  const canWrite = item.currentUserRole !== 'viewer';
  const busy = update.isPending || transition.isPending || remove.isPending;
  const locked = !canWrite || busy;
  const selectedEra = ctx.selectableEras.find((e) => e.id === eraId);
  const updateError = update.isError ? update.error : null;
  const errs = readDetailErrors(updateError);
  const linksLabel = ctx.linksCount === 1 ? '1 Link' : `${String(ctx.linksCount)} Links`;

  function saveItem(closeAfter: boolean) {
    if (locked) return;
    setSaved(false);
    const payload = buildUpdatePayload({
      title,
      description,
      priority,
      parentId,
      eraId,
      eraChanged: eraId !== (item.eraId ?? ''),
      unit: ctx.unit,
      estimate,
    });
    update.mutate(payload, {
      onSuccess: () => {
        if (closeAfter) {
          void navigate(projectPath(item.projectId));
          return;
        }
        setSaved(true);
      },
    });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    saveItem(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (!isCtrlEnter(event)) return;
    event.preventDefault();
    saveItem(false);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-card">
      <h1 className="sr-only">{item.title}</h1>
      <EditorTopBar item={item} typeName={ctx.typeName} />

      <form
        aria-label="Work Item details"
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        className="flex flex-col"
      >
        <EditorTitleBand
          value={title}
          error={errs.title}
          locked={locked}
          onChange={(next) => {
            setTitle(next);
            setSaved(false);
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-1 pb-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <EditorAssigneeStrip
              item={item}
              currentUserId={ctx.currentUserId}
              canWrite={canWrite}
              busy={busy}
              onAssign={(assigneeId) => {
                update.mutate({ assigneeId });
              }}
            />
            <span className="text-2xs font-medium text-primary tabular-nums">{linksLabel}</span>
            {saved && (
              <span role="status" className="text-xs text-muted-foreground">
                Changes saved.
              </span>
            )}
          </div>

          <EditorActionButtons
            canWrite={canWrite}
            busy={busy}
            isSaving={update.isPending}
            isDeleting={remove.isPending}
            onSaveAndClose={() => {
              saveItem(true);
            }}
            onDelete={() => {
              remove.mutate(item.id, {
                onSuccess: () => {
                  void navigate(projectPath(item.projectId));
                },
              });
            }}
          />
        </div>

        <EditorMetaBand
          item={item}
          projectName={ctx.projectName}
          statuses={ctx.statuses}
          eras={ctx.selectableEras}
          priority={priority}
          eraId={eraId}
          linksCount={ctx.linksCount}
          activeTab={activeTab}
          canWrite={canWrite}
          locked={locked}
          onTransition={(statusId) => {
            transition.mutate({ workItemId: item.id, statusId });
          }}
          onPriorityChange={(next) => {
            setPriority(next);
            setSaved(false);
          }}
          onEraChange={(next) => {
            setEraId(next);
            setSaved(false);
          }}
          onTabChange={setActiveTab}
        />

        <ErrorBanner error={transition.error} />
        <ErrorBanner error={remove.error} />
        <ErrorBanner error={updateError} hidden={errs.hasField} />

        <EditorBodyColumns
          item={item}
          typeName={ctx.typeName}
          unit={ctx.unit}
          description={description}
          parentId={parentId}
          estimate={estimate}
          eligibleParents={ctx.eligibleParents}
          projectItems={ctx.projectItems}
          selectedEra={selectedEra}
          activeTab={activeTab}
          canWrite={canWrite}
          locked={locked}
          errs={errs}
          onDescriptionChange={(next) => {
            setDescription(next);
            setSaved(false);
          }}
          onParentChange={(next) => {
            setParentId(next);
            setSaved(false);
          }}
          onEstimateChange={(next) => {
            setEstimate(next);
            setSaved(false);
          }}
        />
      </form>
    </div>
  );
}

/** Displays and edits a single Work Item inside its Project using the 01C 5-band architectural editor. */
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
