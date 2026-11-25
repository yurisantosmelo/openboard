import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { errorMessage } from '../../../shared/api/httpClient';
import type { WorkspaceMembership, WorkspaceRole } from '../api/organizationsApi';
import {
  useRemoveWorkspaceMembership,
  useUpdateWorkspaceMembership,
  useWorkspaceMemberships,
} from '../hooks/useOrganizations';
import { AddWorkspaceMembershipForm } from './AddWorkspaceMembershipForm';
import { ListPanel } from './ListPanel';
import { workspaceRoleLabels, workspaceRoleShortLabels } from './workspaceRole';

const workspaceRoles: WorkspaceRole[] = ['owner', 'contributor', 'viewer'];

interface WorkspaceMembershipRowProps {
  membership: WorkspaceMembership;
  busy: boolean;
  onChangeRole: (userId: string, role: WorkspaceRole) => void;
  onRemove: (userId: string) => void;
}

function WorkspaceMembershipRow({
  membership,
  busy,
  onChangeRole,
  onRemove,
}: WorkspaceMembershipRowProps) {
  return (
    <li
      key={membership.userId}
      className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
    >
      <div className="grid min-w-0">
        <span className="font-medium break-words">{membership.name}</span>
        <span className="text-sm break-words text-muted-foreground">@{membership.username}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label={`Workspace role for ${membership.name}`}
        >
          {workspaceRoles.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={membership.role === option ? 'default' : 'outline'}
              aria-pressed={membership.role === option}
              aria-label={`Set ${membership.name} as ${workspaceRoleLabels[option]}`}
              disabled={busy || membership.role === option}
              onClick={() => {
                onChangeRole(membership.userId, option);
              }}
            >
              {workspaceRoleShortLabels[option]}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          aria-label={`Remove ${membership.name}`}
          onClick={() => {
            onRemove(membership.userId);
          }}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

interface WorkspaceMembershipsProps {
  workspaceId: string;
}

/** Lists, grants, updates and removes Workspace Memberships for a Workspace Owner. */
export function WorkspaceMemberships({ workspaceId }: WorkspaceMembershipsProps) {
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const query = useWorkspaceMemberships(workspaceId, page);
  const update = useUpdateWorkspaceMembership(workspaceId);
  const remove = useRemoveWorkspaceMembership(workspaceId);

  const actionError = update.isError ? update.error : remove.isError ? remove.error : null;
  const rowBusy = update.isPending || remove.isPending;

  function handleChangeRole(userId: string, role: WorkspaceRole) {
    remove.reset();
    update.mutate({ userId, role });
  }

  function handleRemove(userId: string) {
    update.reset();
    remove.mutate(userId);
  }

  const formContent = (
    <>
      {actionError && (
        <div className="border-b p-6">
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription role="alert">{errorMessage(actionError)}</AlertDescription>
          </Alert>
        </div>
      )}
      {adding && (
        <AddWorkspaceMembershipForm
          workspaceId={workspaceId}
          onClose={() => {
            setAdding(false);
          }}
        />
      )}
    </>
  );

  return (
    <ListPanel
      title="Workspace Memberships"
      query={query}
      emptyTitle="No Workspace Memberships yet"
      emptyDescription="Add people from this Organization to grant access or set a Workspace role."
      action={
        !adding && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              update.reset();
              remove.reset();
              setAdding(true);
            }}
          >
            Add person
          </Button>
        )
      }
      form={formContent}
      renderItem={(membership) => (
        <WorkspaceMembershipRow
          key={membership.userId}
          membership={membership}
          busy={rowBusy}
          onChangeRole={handleChangeRole}
          onRemove={handleRemove}
        />
      )}
      onPageChange={setPage}
    />
  );
}
