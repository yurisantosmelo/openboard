import { useState } from 'react';
import { errorMessage } from '../../../shared/api/httpClient';
import { Alert, Button, Lozenge } from '../../../shared/design-system';
import type {
  AddedOrganizationMembership,
  OrganizationMembership,
  OrganizationRole,
} from '../api/organizationsApi';
import {
  useOrganizationMemberships,
  useRemoveOrganizationMembership,
  useUpdateOrganizationMembership,
} from '../hooks/useOrganizations';
import { AddOrganizationMembershipForm } from './AddOrganizationMembershipForm';
import { ListPanel } from './ListPanel';
import { organizationRoleLabels } from './organizationRole';

interface TemporaryPasswordNoticeProps {
  username: string;
  password: string;
  onDismiss: () => void;
}

function TemporaryPasswordNotice({ username, password, onDismiss }: TemporaryPasswordNoticeProps) {
  return (
    <div className="form-stack list-form">
      <Alert tone="info">
        <p className="notice-text">
          New User <strong>{username}</strong> created with Temporary Password{' '}
          <code>{password}</code>. Share it now — it will not be shown again.
        </p>
      </Alert>
      <div className="form-actions">
        <Button variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

interface MembershipRowProps {
  membership: OrganizationMembership;
  busy: boolean;
  onChangeRole: (userId: string, role: OrganizationRole) => void;
  onRemove: (userId: string) => void;
}

function MembershipRow({ membership, busy, onChangeRole, onRemove }: MembershipRowProps) {
  const nextRole: OrganizationRole = membership.role === 'owner' ? 'contributor' : 'owner';
  const roleActionLabel =
    nextRole === 'owner' ? 'Make Organization Owner' : 'Make Organization Contributor';
  return (
    <li key={membership.userId} className="panel__row">
      <div className="entity-list__identity">
        <span className="entity-list__name">{membership.name}</span>
        <span className="entity-list__meta">@{membership.username}</span>
      </div>
      <div className="row-actions">
        <Lozenge>{organizationRoleLabels[membership.role]}</Lozenge>
        <Button
          variant="secondary"
          disabled={busy}
          aria-label={`${roleActionLabel}: ${membership.name}`}
          onClick={() => {
            onChangeRole(membership.userId, nextRole);
          }}
        >
          {nextRole === 'owner' ? 'Make Owner' : 'Make Contributor'}
        </Button>
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

interface OrganizationMembershipsProps {
  organizationId: string;
}

/** Lists, grants, updates and removes Organization Memberships for an Organization Owner. */
export function OrganizationMemberships({ organizationId }: OrganizationMembershipsProps) {
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [issuedPassword, setIssuedPassword] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const query = useOrganizationMemberships(organizationId, page);
  const update = useUpdateOrganizationMembership(organizationId);
  const remove = useRemoveOrganizationMembership(organizationId);

  const actionError = update.isError ? update.error : remove.isError ? remove.error : null;
  const rowBusy = update.isPending || remove.isPending;

  function handleAdded(added: AddedOrganizationMembership) {
    setAdding(false);
    setIssuedPassword(
      added.temporaryPassword
        ? { username: added.username, password: added.temporaryPassword }
        : null,
    );
  }

  function handleChangeRole(userId: string, role: OrganizationRole) {
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
      {adding ? (
        <AddOrganizationMembershipForm
          organizationId={organizationId}
          onAdded={handleAdded}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : (
        issuedPassword && (
          <TemporaryPasswordNotice
            username={issuedPassword.username}
            password={issuedPassword.password}
            onDismiss={() => {
              setIssuedPassword(null);
            }}
          />
        )
      )}
    </>
  );

  return (
    <ListPanel
      title="Organization Memberships"
      query={query}
      emptyTitle="No Organization Memberships yet"
      emptyDescription="Add people to give them access to this Organization."
      action={
        !adding && (
          <Button
            onClick={() => {
              update.reset();
              remove.reset();
              setIssuedPassword(null);
              setAdding(true);
            }}
          >
            Add person
          </Button>
        )
      }
      form={formContent}
      renderItem={(membership) => (
        <MembershipRow
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
