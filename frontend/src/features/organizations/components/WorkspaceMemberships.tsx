import { useState } from 'react';
import { errorMessage } from '../../../shared/api/httpClient';
import { Alert, Button } from '../../../shared/design-system';
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
    <li key={membership.userId} className="panel__row">
      <div className="entity-list__identity">
        <span className="entity-list__name">{membership.name}</span>
        <span className="entity-list__meta">@{membership.username}</span>
      </div>
      <div className="row-actions">
        <div
          className="segmented"
          role="group"
          aria-label={`Workspace role for ${membership.name}`}
        >
          {workspaceRoles.map((option) => (
            <button
              key={option}
              type="button"
              className="btn"
              aria-pressed={membership.role === option}
              aria-label={`Set ${membership.name} as ${workspaceRoleLabels[option]}`}
              disabled={busy || membership.role === option}
              onClick={() => {
                onChangeRole(membership.userId, option);
              }}
            >
              {workspaceRoleShortLabels[option]}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
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
        <div className="list-form">
          <Alert tone="danger">{errorMessage(actionError)}</Alert>
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
