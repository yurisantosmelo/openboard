import { Check, Search, UserPlus, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWorkspaceMemberships } from '@/features/organizations/hooks/useOrganizations';
import { cn } from '@/lib/utils';
import type { Participant } from './ProjectWorkspaceHeader';
import { initialsOf } from './statusTone';

export interface AssigneePickerPopoverProps {
  workItemTitle: string;
  assigneeId: string | null;
  assigneeName: string;
  assigneeUsername: string;
  workspaceId?: string;
  participants: Participant[];
  canWrite: boolean;
  busy?: boolean;
  onAssign?: (assigneeId: string | null) => void;
  className?: string;
}

function mergeCandidates(
  participants: Participant[],
  memberships: Array<{ userId: string; name: string; username: string }>,
): Participant[] {
  const map = new Map<string, Participant>();
  for (const person of participants) {
    map.set(person.id, person);
  }
  for (const member of memberships) {
    if (!map.has(member.userId)) {
      map.set(member.userId, {
        id: member.userId,
        name: member.name,
        username: member.username,
      });
    }
  }
  return [...map.values()];
}

function filterCandidates(candidates: Participant[], query: string): Participant[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates;
  return candidates.filter(
    (person) => person.name.toLowerCase().includes(q) || person.username.toLowerCase().includes(q),
  );
}

function AssigneeDisplay({
  assigneeId,
  assigneeName,
  assigneeUsername,
}: {
  assigneeId: string | null;
  assigneeName: string;
  assigneeUsername: string;
}) {
  const hasAssignee = Boolean(assigneeId || assigneeName || assigneeUsername);
  if (!hasAssignee) {
    return (
      <>
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-input bg-secondary/60 text-muted-foreground">
          <UserPlus className="size-3" aria-hidden="true" />
        </span>
        <span className="truncate text-muted-foreground">Unassigned</span>
      </>
    );
  }
  const label = assigneeName || `@${assigneeUsername}`;
  return (
    <>
      <Avatar size="xs">
        <AvatarFallback className="text-3xs font-semibold">
          {initialsOf(assigneeName, assigneeUsername)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-foreground">{label}</span>
    </>
  );
}

interface AssigneeMenuListProps {
  assigneeId: string | null;
  candidates: Participant[];
  onSelect: (assigneeId: string | null) => void;
}

function AssigneeMenuList({ assigneeId, candidates, onSelect }: AssigneeMenuListProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterCandidates(candidates, query), [candidates, query]);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          autoFocus
          aria-label="Search assignee"
          placeholder="Search user..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          className="w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-placeholder [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      <div className="max-h-56 overflow-y-auto p-1">
        <button
          type="button"
          onClick={() => {
            onSelect(null);
          }}
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xs px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserX className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Unassigned</span>
          </span>
          {!assigneeId && <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
        </button>

        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-2xs text-muted-foreground">No matching users</p>
        ) : (
          filtered.map((person) => {
            const selected = person.id === assigneeId;
            const label = person.name || `@${person.username}`;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  onSelect(person.id);
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xs px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar size="xs">
                    <AvatarFallback className="text-3xs font-semibold">
                      {initialsOf(person.name, person.username)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{label}</span>
                    {person.username && (
                      <span className="truncate text-3xs text-muted-foreground">
                        @{person.username}
                      </span>
                    )}
                  </span>
                </span>
                {selected && (
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function WorkspaceAssigneeMenuList({
  workspaceId,
  participants,
  assigneeId,
  onSelect,
}: {
  workspaceId: string;
  participants: Participant[];
  assigneeId: string | null;
  onSelect: (assigneeId: string | null) => void;
}) {
  const membershipsQuery = useWorkspaceMemberships(workspaceId, 1, true);
  const candidates = useMemo(
    () => mergeCandidates(participants, membershipsQuery.data?.items ?? []),
    [participants, membershipsQuery.data?.items],
  );
  return <AssigneeMenuList assigneeId={assigneeId} candidates={candidates} onSelect={onSelect} />;
}

/** Searchable card popover for assigning or unassigning a User on Board, List, and Table views. */
export function AssigneePickerPopover({
  workItemTitle,
  assigneeId,
  assigneeName,
  assigneeUsername,
  workspaceId,
  participants,
  canWrite,
  busy,
  onAssign,
  className,
}: AssigneePickerPopoverProps) {
  const [open, setOpen] = useState(false);

  if (!canWrite || !onAssign) {
    return (
      <div
        data-slot="card-assignee"
        className={cn(
          'flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground',
          className,
        )}
      >
        <AssigneeDisplay
          assigneeId={assigneeId}
          assigneeName={assigneeName}
          assigneeUsername={assigneeUsername}
        />
      </div>
    );
  }

  function handleSelect(nextAssigneeId: string | null) {
    onAssign?.(nextAssigneeId);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="card-assignee"
          aria-label={`Assign ${workItemTitle}`}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
          }}
          className={cn(
            'inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-xs border border-transparent px-1 py-0.5 text-left text-2xs transition-colors outline-none hover:border-input hover:bg-secondary/70 focus-visible:border-ring focus-visible:bg-background disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
        >
          <AssigneeDisplay
            assigneeId={assigneeId}
            assigneeName={assigneeName}
            assigneeUsername={assigneeUsername}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-0"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {open &&
          (workspaceId ? (
            <WorkspaceAssigneeMenuList
              workspaceId={workspaceId}
              participants={participants}
              assigneeId={assigneeId}
              onSelect={handleSelect}
            />
          ) : (
            <AssigneeMenuList
              assigneeId={assigneeId}
              candidates={participants}
              onSelect={handleSelect}
            />
          ))}
      </PopoverContent>
    </Popover>
  );
}
