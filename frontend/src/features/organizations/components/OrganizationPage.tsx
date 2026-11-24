import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage } from '../../../shared/api/httpClient';
import { Alert, Button, Spinner } from '../../../shared/design-system';
import type { Organization, Workspace } from '../api/organizationsApi';
import { useOrganization, useWorkspaces } from '../hooks/useOrganizations';
import { workspacePath } from '../paths';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { ListPanel } from './ListPanel';
import { OrganizationMemberships } from './OrganizationMemberships';
import './Organizations.css';
import { VisibilityLozenge } from './VisibilityLozenge';

function WorkspaceRow(workspace: Workspace) {
  return (
    <li key={workspace.id} className="panel__row">
      <Link className="entity-list__link" to={workspacePath(workspace.id)}>
        {workspace.name}
      </Link>
      <VisibilityLozenge visibility={workspace.visibility} />
    </li>
  );
}

function WorkspaceList({ organization }: { organization: Organization }) {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = useWorkspaces(organization.id, page);
  const canCreate = organization.currentUserRole === 'owner';
  return (
    <ListPanel
      title="Workspaces"
      query={query}
      emptyTitle="No Workspaces to show"
      emptyDescription="An Organization Owner can add you to a Workspace of this Organization."
      action={
        canCreate &&
        !creating && (
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            New Workspace
          </Button>
        )
      }
      form={
        creating && (
          <CreateWorkspaceForm
            organizationId={organization.id}
            onClose={() => {
              setCreating(false);
            }}
          />
        )
      }
      renderItem={WorkspaceRow}
      onPageChange={setPage}
    />
  );
}

export function OrganizationPage() {
  const { organizationId = '' } = useParams();
  const organization = useOrganization(organizationId);

  if (organization.isPending) {
    return <Spinner />;
  }
  if (organization.isError) {
    return <Alert tone="danger">{errorMessage(organization.error)}</Alert>;
  }
  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="page-header__title">{organization.data.name}</h1>
      </header>
      <WorkspaceList organization={organization.data} />
      {organization.data.currentUserRole === 'owner' && (
        <OrganizationMemberships organizationId={organization.data.id} />
      )}
      <Link className="btn btn--link" to="/">
        All Organizations
      </Link>
    </div>
  );
}
