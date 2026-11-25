import { AlertCircle, Archive, ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { useEffect, useId } from 'react';
import { Link, useParams } from 'react-router';
import { saveNavigationContext } from '@/app/navigationContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth';
import { errorMessage } from '../../../shared/api/httpClient';
import { ProjectList, WorkspaceTeamsCard } from '../../projects';
import { useUnarchiveWorkspace, useWorkspace } from '../hooks/useOrganizations';
import { organizationPath } from '../paths';
import { visibilityLabels } from './visibility';
import { VisibilityLozenge } from './VisibilityLozenge';
import { WorkspaceMemberships } from './WorkspaceMemberships';
import { WorkspaceSettings } from './WorkspaceSettings';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function useSyncWorkspaceContext(
  userId: string | undefined,
  workspace: { id: string; organizationId: string; name: string } | undefined,
) {
  useEffect(() => {
    if (!workspace) return;
    saveNavigationContext({
      userId,
      organizationId: workspace.organizationId,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    });
  }, [userId, workspace]);
}

function ArchivedWorkspaceBanner({
  isOwner,
  busy,
  onRestore,
}: {
  isOwner: boolean;
  busy: boolean;
  onRestore: () => void;
}) {
  return (
    <Alert>
      <Archive aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>This Workspace and all of its Projects are Archived and read-only.</span>
        {isOwner && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRestore}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Restore Workspace
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function WorkspacePage() {
  const detailsTitleId = useId();
  const { workspaceId = '' } = useParams();
  const { data: currentUser } = useCurrentUser();
  const workspace = useWorkspace(workspaceId);
  const unarchive = useUnarchiveWorkspace(workspaceId);
  useSyncWorkspaceContext(currentUser?.id, workspace.data);

  if (workspace.isPending) {
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
  if (workspace.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertDescription role="alert">{errorMessage(workspace.error)}</AlertDescription>
      </Alert>
    );
  }
  const { name, visibility, createdAt, organizationId, currentUserRole, archivedAt } =
    workspace.data;
  const isArchived = Boolean(archivedAt);
  const isOwner = currentUserRole === 'owner';

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{name}</h1>
        <VisibilityLozenge visibility={visibility} />
        {isArchived && <Badge variant="secondary">Archived</Badge>}
      </header>
      {isArchived && (
        <ArchivedWorkspaceBanner
          isOwner={isOwner}
          busy={unarchive.isPending}
          onRestore={() => {
            unarchive.mutate();
          }}
        />
      )}
      <section aria-labelledby={detailsTitleId}>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id={detailsTitleId}>Details</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Visibility</dt>
              <dd className="m-0">{visibilityLabels[visibility]}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="m-0">{dateFormat.format(new Date(createdAt))}</dd>
            </dl>
          </CardContent>
        </Card>
      </section>
      <ProjectList
        workspaceId={workspace.data.id}
        canCreate={isOwner && !isArchived}
        canManagePending={isOwner}
      />
      <WorkspaceTeamsCard workspaceId={workspace.data.id} canManage={isOwner && !isArchived} />
      {isOwner && (
        <>
          <WorkspaceMemberships workspaceId={workspace.data.id} />
          <WorkspaceSettings workspace={workspace.data} />
        </>
      )}
      <div>
        <Link
          className={buttonVariants({ variant: 'link', className: 'px-0' })}
          to={organizationPath(organizationId)}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Organization
        </Link>
      </div>
    </div>
  );
}
