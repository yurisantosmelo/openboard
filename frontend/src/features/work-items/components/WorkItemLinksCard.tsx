import { AlertCircle, Link2, Loader2, Plus, Trash2 } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { errorMessage } from '../../../shared/api/httpClient';
import type { LinkKind, WorkItem, WorkItemLink } from '../api/workItemsApi';
import {
  useCreateWorkItemLink,
  useDeleteWorkItemLink,
  useWorkItemLinks,
} from '../hooks/useWorkItems';
import { workItemPath } from '../paths';
import { selectClassName } from './workItemLabels';

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
    return { label: isSource ? 'Blocks' : 'Blocked by', otherId, otherTitle };
  }
  if (link.kind === 'duplicates') {
    return { label: isSource ? 'Duplicates' : 'Duplicated by', otherId, otherTitle };
  }
  return { label: 'Relates To', otherId, otherTitle };
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

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (targetWorkItemId) onSubmit(targetWorkItemId, kind);
  }

  return (
    <form className="grid gap-3 border-b p-6" aria-label="New Link" onSubmit={handleSubmit}>
      <LinkAlert error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={kindId}>Kind</FieldLabel>
          <select
            id={kindId}
            className={selectClassName}
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
          <FieldLabel htmlFor={targetId}>Target Work Item</FieldLabel>
          <select
            id={targetId}
            className={selectClassName}
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
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !targetWorkItemId}>
          Add Link
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
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
      <CardContent className="py-6">
        <span
          role="status"
          aria-label="Loading"
          className="inline-flex items-center text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      </CardContent>
    );
  }
  if (error) {
    return (
      <CardContent className="py-6">
        <LinkAlert error={error} />
      </CardContent>
    );
  }
  if (links.length === 0) {
    return (
      <CardContent className="py-6 text-sm text-muted-foreground">
        No Links yet. Connect related Work Items in this Project.
      </CardContent>
    );
  }
  return (
    <ul className="m-0 list-none divide-y p-0">
      {links.map((link) => {
        const desc = describeLink(link, currentItemId);
        return (
          <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
              <Badge variant="outline">{desc.label}</Badge>
              <Link to={workItemPath(desc.otherId)} className="font-medium hover:underline">
                {desc.otherTitle}
              </Link>
            </div>
            {canWrite && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                aria-label={`Remove Link ${desc.label} ${desc.otherTitle}`}
                onClick={() => {
                  onRemove(link.id);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Remove
              </Button>
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
    <section aria-labelledby={titleId}>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="items-center border-b py-4">
          <CardTitle>
            <h2 id={titleId}>Links</h2>
          </CardTitle>
          {showAdd && (
            <CardAction>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  create.reset();
                  setAdding(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add Link
              </Button>
            </CardAction>
          )}
        </CardHeader>
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
        {remove.error && (
          <div className="border-b p-4">
            <LinkAlert error={remove.error} />
          </div>
        )}
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
      </Card>
    </section>
  );
}
