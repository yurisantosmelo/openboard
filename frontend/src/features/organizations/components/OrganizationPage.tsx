import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { errorMessage } from '../../../shared/api/httpClient';
import type { Organization, Workspace } from '../api/organizationsApi';
import { useOrganization, useWorkspaces } from '../hooks/useOrganizations';
import { workspacePath } from '../paths';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { ListPanel } from './ListPanel';
import { OrganizationMemberships } from './OrganizationMemberships';
import { VisibilityLozenge } from './VisibilityLozenge';

function WorkspaceRow(workspace: Workspace) {
  return (
    <li key={workspace.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
      <Link
        className="min-w-0 font-medium break-words text-foreground no-underline hover:underline"
        to={workspacePath(workspace.id)}
      >
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
            type="button"
            size="sm"
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
    return (
      <span
        role="status"
        aria-label="Loading"
        className="inline-flex items-center text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </span>
    );
  }
  if (organization.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertDescription role="alert">{errorMessage(organization.error)}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
          {organization.data.name}
        </h1>
      </header>
      <WorkspaceList organization={organization.data} />
      {organization.data.currentUserRole === 'owner' && (
        <OrganizationMemberships organizationId={organization.data.id} />
      )}
      <div>
        <Link className={buttonVariants({ variant: 'link', className: 'px-0' })} to="/">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All Organizations
        </Link>
      </div>
    </div>
  );
}
