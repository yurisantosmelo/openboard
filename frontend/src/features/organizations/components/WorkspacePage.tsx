import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useId } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import { ProjectList, WorkspaceTeamsCard } from '../../projects';
import { useWorkspace } from '../hooks/useOrganizations';
import { organizationPath } from '../paths';
import { visibilityLabels } from './visibility';
import { VisibilityLozenge } from './VisibilityLozenge';
import { WorkspaceMemberships } from './WorkspaceMemberships';
import { WorkspaceSettings } from './WorkspaceSettings';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function WorkspacePage() {
  const detailsTitleId = useId();
  const { workspaceId = '' } = useParams();
  const workspace = useWorkspace(workspaceId);

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
  const { name, visibility, createdAt, organizationId, currentUserRole } = workspace.data;
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{name}</h1>
        <VisibilityLozenge visibility={visibility} />
      </header>
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
      <ProjectList workspaceId={workspace.data.id} canCreate={currentUserRole === 'owner'} />
      <WorkspaceTeamsCard workspaceId={workspace.data.id} canManage={currentUserRole === 'owner'} />
      {currentUserRole === 'owner' && (
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
