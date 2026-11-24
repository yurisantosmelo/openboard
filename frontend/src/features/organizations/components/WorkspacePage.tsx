import { Link, useParams } from 'react-router';
import { errorMessage } from '../../../shared/api/httpClient';
import { Alert, Card, Spinner } from '../../../shared/design-system';
import { useWorkspace } from '../hooks/useOrganizations';
import { organizationPath } from '../paths';
import './Organizations.css';
import { visibilityLabels } from './visibility';
import { VisibilityLozenge } from './VisibilityLozenge';
import { WorkspaceMemberships } from './WorkspaceMemberships';
import { WorkspaceSettings } from './WorkspaceSettings';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function WorkspacePage() {
  const { workspaceId = '' } = useParams();
  const workspace = useWorkspace(workspaceId);

  if (workspace.isPending) {
    return <Spinner />;
  }
  if (workspace.isError) {
    return <Alert tone="danger">{errorMessage(workspace.error)}</Alert>;
  }
  const { name, visibility, createdAt, organizationId, currentUserRole } = workspace.data;
  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="page-header__title">{name}</h1>
        <VisibilityLozenge visibility={visibility} />
      </header>
      <Card title="Details">
        <dl className="details">
          <dt>Visibility</dt>
          <dd>{visibilityLabels[visibility]}</dd>
          <dt>Created</dt>
          <dd>{dateFormat.format(new Date(createdAt))}</dd>
        </dl>
      </Card>
      {currentUserRole === 'owner' && (
        <>
          <WorkspaceMemberships workspaceId={workspace.data.id} />
          <WorkspaceSettings workspace={workspace.data} />
        </>
      )}
      <Link className="btn btn--link" to={organizationPath(organizationId)}>
        Back to Organization
      </Link>
    </div>
  );
}
