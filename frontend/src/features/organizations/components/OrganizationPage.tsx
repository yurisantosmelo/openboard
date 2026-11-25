import { AlertCircle, Archive, ArrowLeft, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import type { Organization, Workspace } from '../api/organizationsApi';
import {
  useDeleteOrganization,
  useOrganization,
  usePendingDeletionWorkspaces,
  useRestoreWorkspace,
  useWorkspaces,
} from '../hooks/useOrganizations';
import { workspacePath } from '../paths';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { ListPanel } from './ListPanel';
import { OrganizationMemberships } from './OrganizationMemberships';
import { VisibilityLozenge } from './VisibilityLozenge';

function WorkspaceRow(workspace: Workspace) {
  return (
    <li key={workspace.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          className="min-w-0 font-medium break-words text-foreground no-underline hover:underline"
          to={workspacePath(workspace.id)}
        >
          {workspace.name}
        </Link>
        {workspace.archivedAt && <Badge variant="secondary">Archived</Badge>}
      </div>
      <VisibilityLozenge visibility={workspace.visibility} />
    </li>
  );
}

function WorkspaceList({ organization }: { organization: Organization }) {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const query = useWorkspaces(organization.id, page, includeArchived);
  const canCreate = organization.currentUserRole === 'owner';

  return (
    <ListPanel
      title="Workspaces"
      query={query}
      emptyTitle="No Workspaces to show"
      emptyDescription="An Organization Owner can add you to a Workspace of this Organization."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={includeArchived ? 'secondary' : 'outline'}
            aria-pressed={includeArchived}
            onClick={() => {
              setPage(1);
              setIncludeArchived((prev) => !prev);
            }}
          >
            <Archive className="size-3.5" aria-hidden="true" />
            {includeArchived ? 'Hide archived' : 'Show archived'}
          </Button>
          {canCreate && !creating && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCreating(true);
              }}
            >
              New Workspace
            </Button>
          )}
        </div>
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

function PendingDeletionWorkspacesCard({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const query = usePendingDeletionWorkspaces(organizationId, 1, open);
  const restore = useRestoreWorkspace(organizationId);
  const items = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
          Pending Deletion Workspaces
        </CardTitle>
        <CardAction>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setOpen((prev) => !prev);
            }}
          >
            {open ? 'Hide Pending Deletion' : 'View Pending Deletion'}
          </Button>
        </CardAction>
      </CardHeader>
      {open && (
        <CardContent className="grid gap-3">
          {restore.isError && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription role="alert">{errorMessage(restore.error)}</AlertDescription>
            </Alert>
          )}
          {!query.isPending && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No Workspaces in Pending Deletion.</p>
          )}
          {items.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((ws) => (
                <li
                  key={ws.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ws.name}</span>
                    <Badge variant="outline">Pending Deletion</Badge>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={restore.isPending}
                    aria-label={`Restore Workspace ${ws.name}`}
                    onClick={() => {
                      restore.mutate(ws.id);
                    }}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function DeleteOrganizationCard({ organization }: { organization: Organization }) {
  const navigate = useNavigate();
  const remove = useDeleteOrganization();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lifecycle</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          Deleting this Organization places it in Pending Deletion. An Administrator can restore it
          until the grace period ends.
        </p>
        {remove.isError && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription role="alert">{errorMessage(remove.error)}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button
            type="button"
            size="sm"
            variant="destructive-outline"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(organization.id, {
                onSuccess: () => {
                  void navigate('/');
                },
              });
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete Organization
          </Button>
        </div>
      </CardContent>
    </Card>
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
  const isOwner = organization.data.currentUserRole === 'owner';
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
          {organization.data.name}
        </h1>
      </header>
      <WorkspaceList organization={organization.data} />
      {isOwner && (
        <>
          <PendingDeletionWorkspacesCard organizationId={organization.data.id} />
          <OrganizationMemberships organizationId={organization.data.id} />
          <DeleteOrganizationCard organization={organization.data} />
        </>
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
