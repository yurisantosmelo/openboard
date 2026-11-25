import { AlertCircle, Plus, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage } from '../../../shared/api/httpClient';
import { useWorkspaceMemberships } from '../../organizations/hooks/useOrganizations';
import { selectClassName } from '../../work-items/components/workItemLabels';
import type { Team } from '../api/teamsApi';
import {
  useAddTeamAssignment,
  useCreateWorkspaceTeam,
  useDeleteWorkspaceTeam,
  useRemoveTeamAssignment,
  useTeamAssignments,
  useWorkspaceTeams,
} from '../hooks/useTeams';

function TeamAssignmentsPanel({
  workspaceId,
  team,
  canManage,
}: {
  workspaceId: string;
  team: Team;
  canManage: boolean;
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const assignments = useTeamAssignments(workspaceId, team.id).data ?? [];
  const memberships = useWorkspaceMemberships(workspaceId, 1).data?.items ?? [];
  const addAssignment = useAddTeamAssignment(workspaceId, team.id);
  const removeAssignment = useRemoveTeamAssignment(workspaceId, team.id);

  const assignedIds = new Set(assignments.map((a) => a.userId));
  const availableUsers = memberships.filter((m) => !assignedIds.has(m.userId));
  const err = addAssignment.error ?? removeAssignment.error;

  function handleAssign(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedUserId) return;
    addAssignment.mutate(selectedUserId, {
      onSuccess: () => {
        setSelectedUserId('');
      },
    });
  }

  return (
    <div className="grid gap-2 border-t border-border pt-2.5">
      {err && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(err)}</AlertDescription>
        </Alert>
      )}
      {assignments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No Users assigned to this Team yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {assignments.map((a) => (
            <li key={a.userId} className="inline-flex items-center gap-1">
              <Badge variant="secondary">
                {a.name} (@{a.username})
              </Badge>
              {canManage && (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${a.name} from ${team.name}`}
                  disabled={removeAssignment.isPending}
                  onClick={() => {
                    removeAssignment.mutate(a.userId);
                  }}
                >
                  <UserMinus className="size-3" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && availableUsers.length > 0 && (
        <form
          aria-label={`Assign User to ${team.name}`}
          onSubmit={handleAssign}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            aria-label={`User for ${team.name}`}
            className={`${selectClassName} h-8 w-auto min-w-44 text-xs`}
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
            }}
          >
            <option value="">Select a User</option>
            {availableUsers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name} (@{m.username})
              </option>
            ))}
          </select>
          <Button
            type="submit"
            size="compact"
            disabled={!selectedUserId || addAssignment.isPending}
          >
            <UserPlus className="size-3.5" aria-hidden="true" />
            Assign
          </Button>
        </form>
      )}
    </div>
  );
}

function CreateTeamForm({
  busy,
  onCreate,
  onCancel,
}: {
  busy: boolean;
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
  }
  return (
    <form
      aria-label="New Team"
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3"
    >
      <Input
        aria-label="Team name"
        placeholder="Team name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        className="w-56"
        required
      />
      <Button type="submit" size="sm" disabled={busy}>
        Create Team
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

/** Manages Teams and Team Assignments inside one Workspace (ADR 0005). */
export function WorkspaceTeamsCard({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const titleId = useId();
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const teams = useWorkspaceTeams(workspaceId).data ?? [];
  const createTeam = useCreateWorkspaceTeam(workspaceId);
  const deleteTeam = useDeleteWorkspaceTeam(workspaceId);
  const err = createTeam.error ?? deleteTeam.error;

  return (
    <section aria-labelledby={titleId}>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="items-center border-b py-4">
          <CardTitle>
            <h2 id={titleId} className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
              Teams
            </h2>
          </CardTitle>
          {canManage && !creating && (
            <CardAction>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setCreating(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                New Team
              </Button>
            </CardAction>
          )}
        </CardHeader>
        {creating && (
          <CreateTeamForm
            busy={createTeam.isPending}
            onCreate={(name) => {
              createTeam.mutate(name, {
                onSuccess: () => {
                  setCreating(false);
                },
              });
            }}
            onCancel={() => {
              setCreating(false);
            }}
          />
        )}
        <CardContent className="p-0">
          {err && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription role="alert">{errorMessage(err)}</AlertDescription>
              </Alert>
            </div>
          )}
          {teams.length === 0 ? (
            <div className="grid gap-1 px-5 py-6 text-center">
              <p className="text-sm font-medium">No Teams yet</p>
              <p className="text-xs text-muted-foreground">
                Teams group Users inside this Workspace for planning without changing access.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {teams.map((team) => {
                const open = expandedId === team.id;
                return (
                  <li key={team.id} className="grid gap-2 px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className="cursor-pointer text-left text-sm font-medium hover:underline"
                        aria-expanded={open}
                        onClick={() => {
                          setExpandedId(open ? null : team.id);
                        }}
                      >
                        {team.name}
                      </button>
                      {canManage && (
                        <Button
                          type="button"
                          size="compact"
                          variant="destructive-outline"
                          aria-label={`Delete ${team.name}`}
                          disabled={deleteTeam.isPending}
                          onClick={() => {
                            deleteTeam.mutate(team.id);
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Delete
                        </Button>
                      )}
                    </div>
                    {open && (
                      <TeamAssignmentsPanel
                        workspaceId={workspaceId}
                        team={team}
                        canManage={canManage}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
