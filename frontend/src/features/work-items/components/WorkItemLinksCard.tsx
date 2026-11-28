import { AlertCircle, Link2, Loader2, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';
import { errorMessage } from '../../../shared/api/httpClient';
import type { LinkKind, WorkItem, WorkItemLink } from '../api/workItemsApi';
import {
  useCreateWorkItemLink,
  useDeleteWorkItemLink,
  useWorkItemLinks,
} from '../hooks/useWorkItems';
import { workItemPath } from '../paths';
import { quietEditorSelectClass } from './workItemLabels';

const LINK_KINDS: LinkKind[] = ['blocks', 'duplicates', 'relates_to'];

const linkKindCreateLabels: Record<LinkKind, string> = {
  blocks: 'Blocks',
  duplicates: 'Duplicates',
  relates_to: 'Relates To',
};

function describeLink(link: WorkItemLink, currentItemId: string) {
  const isSource = link.sourceWorkItemId === currentItemId;
  const otherId = isSource ? link.targetWorkItemId : link.sourceWorkItemId;
  const otherTitle = isSource ? link.targetTitle : link.sourceTitle;
  if (link.kind === 'blocks') {
    return {
      label: isSource ? 'Blocks' : 'Blocked by',
      toneClass: 'text-destructive',
      otherId,
      otherTitle,
    };
  }
  if (link.kind === 'duplicates') {
    return {
      label: isSource ? 'Duplicates' : 'Duplicated by',
      toneClass: 'text-warning-foreground',
      otherId,
      otherTitle,
    };
  }
  return {
    label: 'Relates To',
    toneClass: 'text-muted-foreground',
    otherId,
    otherTitle,
  };
}

function LinkAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}

interface AddLinkFormProps {
  candidates: WorkItem[];
  busy: boolean;
  error: unknown;
  onSubmit: (targetWorkItemId: string, kind: LinkKind) => void;
  onCancel: () => void;
}

function AddLinkForm({ candidates, busy, error, onSubmit, onCancel }: AddLinkFormProps) {
  const kindId = useId();
  const targetId = useId();
  const [kind, setKind] = useState<LinkKind>('blocks');
  const [targetWorkItemId, setTargetWorkItemId] = useState(candidates[0]?.id ?? '');

  function handleSave() {
    if (targetWorkItemId) onSubmit(targetWorkItemId, kind);
  }

  return (
    <div
      role="form"
      aria-label="New Link"
      className="flex flex-col gap-2.5 rounded-sm border border-border bg-secondary/40 p-3"
    >
      <LinkAlert error={error} />
      <Field>
        <FieldLabel htmlFor={kindId} className="text-2xs text-muted-foreground">
          Kind
        </FieldLabel>
        <select
          id={kindId}
          className={cn(quietEditorSelectClass, 'border-input bg-background')}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as LinkKind);
          }}
        >
          {LINK_KINDS.map((k) => (
            <option key={k} value={k}>
              {linkKindCreateLabels[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor={targetId} className="text-2xs text-muted-foreground">
          Target Work Item
        </FieldLabel>
        <select
          id={targetId}
          className={cn(quietEditorSelectClass, 'border-input bg-background')}
          value={targetWorkItemId}
          onChange={(e) => {
            setTargetWorkItemId(e.target.value);
          }}
        >
          {candidates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          type="button"
          size="compact"
          disabled={busy || !targetWorkItemId}
          onClick={handleSave}
        >
          Add Link
        </Button>
        <Button type="button" size="compact" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface LinksBodyProps {
  currentItemId: string;
  isPending: boolean;
  error: unknown;
  links: WorkItemLink[];
  canWrite: boolean;
  busy: boolean;
  onRemove: (linkId: string) => void;
}

function LinksBody({
  currentItemId,
  isPending,
  error,
  links,
  canWrite,
  busy,
  onRemove,
}: LinksBodyProps) {
  if (isPending) {
    return (
      <span
        role="status"
        aria-label="Loading"
        className="inline-flex items-center py-2 text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      </span>
    );
  }
  if (error) return <LinkAlert error={error} />;
  if (links.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No Links yet. Connect related Work Items in this Project.
      </p>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {links.map((link) => {
        const desc = describeLink(link, currentItemId);
        return (
          <li
            key={link.id}
            className="flex items-start justify-between gap-2 rounded-sm border border-transparent px-1.5 py-1 transition-colors hover:border-border hover:bg-secondary/40"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-2xs font-medium',
                  desc.toneClass,
                )}
              >
                <Link2 className="size-3 shrink-0" aria-hidden="true" />
                <span>{desc.label}</span>
              </span>
              <Link
                to={workItemPath(desc.otherId)}
                className="truncate text-xs font-medium text-foreground hover:underline"
              >
                {desc.otherTitle}
              </Link>
            </div>
            {canWrite && (
              <IconButton
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={`Remove Link ${desc.label} ${desc.otherTitle}`}
                onClick={() => {
                  onRemove(link.id);
                }}
              >
                <X aria-hidden="true" />
              </IconButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface WorkItemLinksCardProps {
  workItemId: string;
  projectItems: WorkItem[];
  canWrite: boolean;
}

/** Displays and manages non-hierarchical Links (Blocks, Duplicates, Relates To) on a Work Item. */
export function WorkItemLinksCard({ workItemId, projectItems, canWrite }: WorkItemLinksCardProps) {
  const titleId = useId();
  const linksQuery = useWorkItemLinks(workItemId);
  const create = useCreateWorkItemLink(workItemId);
  const remove = useDeleteWorkItemLink(workItemId);
  const [adding, setAdding] = useState(false);

  const candidates = projectItems.filter((item) => item.id !== workItemId);
  const showAdd = canWrite && !adding && candidates.length > 0;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <h2 id={titleId} className="text-sm font-semibold tracking-tight text-foreground">
          Links
        </h2>
        {showAdd && (
          <button
            type="button"
            onClick={() => {
              create.reset();
              setAdding(true);
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Plus className="size-3" aria-hidden="true" />
            <span>Add Link</span>
          </button>
        )}
      </div>

      {adding && (
        <AddLinkForm
          candidates={candidates}
          busy={create.isPending}
          error={create.error}
          onSubmit={(targetWorkItemId, kind) => {
            create.mutate(
              { targetWorkItemId, kind },
              {
                onSuccess: () => {
                  setAdding(false);
                },
              },
            );
          }}
          onCancel={() => {
            setAdding(false);
          }}
        />
      )}

      <LinkAlert error={remove.error} />

      <LinksBody
        currentItemId={workItemId}
        isPending={linksQuery.isPending}
        error={linksQuery.error}
        links={linksQuery.data ?? []}
        canWrite={canWrite}
        busy={remove.isPending}
        onRemove={(linkId) => {
          remove.mutate(linkId);
        }}
      />
    </section>
  );
}
