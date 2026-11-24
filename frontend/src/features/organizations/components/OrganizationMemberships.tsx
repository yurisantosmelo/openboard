import { useState } from 'react';
import { Alert, Button, Lozenge } from '../../../shared/design-system';
import type { AddedOrganizationMembership, OrganizationMembership } from '../api/organizationsApi';
import { useOrganizationMemberships } from '../hooks/useOrganizations';
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

function MembershipRow(membership: OrganizationMembership) {
  return (
    <li key={membership.userId} className="panel__row">
      <div className="entity-list__identity">
        <span className="entity-list__name">{membership.name}</span>
        <span className="entity-list__meta">@{membership.username}</span>
      </div>
      <Lozenge>{organizationRoleLabels[membership.role]}</Lozenge>
    </li>
  );
}

interface OrganizationMembershipsProps {
  organizationId: string;
}

/** Lists and grants Organization Memberships for an Organization Owner. */
export function OrganizationMemberships({ organizationId }: OrganizationMembershipsProps) {
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [issuedPassword, setIssuedPassword] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const query = useOrganizationMemberships(organizationId, page);

  function handleAdded(added: AddedOrganizationMembership) {
    setAdding(false);
    setIssuedPassword(
      added.temporaryPassword
        ? { username: added.username, password: added.temporaryPassword }
        : null,
    );
  }

  const formContent = adding ? (
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
              setIssuedPassword(null);
              setAdding(true);
            }}
          >
            Add person
          </Button>
        )
      }
      form={formContent}
      renderItem={MembershipRow}
      onPageChange={setPage}
    />
  );
}
