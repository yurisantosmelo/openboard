import { AlertCircle, Info } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { errorMessage } from '../../../shared/api/httpClient';
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
    <div className="grid gap-3 border-b p-6">
      <Alert>
        <Info aria-hidden="true" />
        <AlertDescription role="status">
          <p className="m-0 break-words">
            New User <strong>{username}</strong> created with Temporary Password{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{password}</code>.
            Share it now — it will not be shown again.
          </p>
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onDismiss}>
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
    <li
      key={membership.userId}
      className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
    >
      <div className="grid min-w-0">
        <span className="font-medium break-words">{membership.name}</span>
        <span className="text-sm break-words text-muted-foreground">@{membership.username}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{organizationRoleLabels[membership.role]}</Badge>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          aria-label={`${roleActionLabel}: ${membership.name}`}
          onClick={() => {
            onChangeRole(membership.userId, nextRole);
          }}
        >
          {nextRole === 'owner' ? 'Make Owner' : 'Make Contributor'}
        </Button>
        <Button
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
        <div className="border-b p-6">
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription role="alert">{errorMessage(actionError)}</AlertDescription>
          </Alert>
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
            size="sm"
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
