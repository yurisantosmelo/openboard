import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '../features/auth';
import { OrganizationsPortal } from '../features/organizations';
import { useWorkspaces } from '../features/organizations/hooks/useOrganizations';
import { useProjects } from '../features/projects/hooks/useProjects';
import { projectPath } from '../features/projects/paths';
import { readNavigationContext, saveNavigationContext } from './navigationContext';
import { usePortalAccess, type PortalAccess } from './usePortalAccess';

function pickPreferred<T extends { id: string }>(
  enabled: boolean,
  items: T[] | undefined,
  preferredId?: string,
): T | undefined {
  if (!enabled || !items || items.length === 0) return undefined;
  return items.find((item) => item.id === preferredId) ?? items[0];
}

function isTargetResolving(
  enabled: boolean,
  orgsPending: boolean,
  hasOrg: boolean,
  wsPending: boolean,
  hasWs: boolean,
  projectsPending: boolean,
): boolean {
  if (!enabled) return false;
  return orgsPending || (hasOrg && wsPending) || (hasWs && projectsPending);
}

function useContributorBoardTarget(userId: string | undefined, access: PortalAccess) {
  const enabled = !access.isResolvingAccess && !access.canAccessPortal;
  const saved = readNavigationContext(userId);
  const orgs = access.organizationsQuery.data?.items;
  const targetOrg = pickPreferred(enabled, orgs, saved.organizationId);

  const wsQuery = useWorkspaces(targetOrg?.id ?? '', 1, false, Boolean(targetOrg));
  const targetWs = pickPreferred(enabled, wsQuery.data?.items, saved.workspaceId);

  const projectsQuery = useProjects(targetWs?.id ?? '', 1, false, Boolean(targetWs));
  const targetProject = pickPreferred(enabled, projectsQuery.data?.items, saved.projectId);

  useEffect(() => {
    if (!targetOrg || !targetWs || !targetProject) return;
    saveNavigationContext({
      userId,
      organizationId: targetOrg.id,
      organizationName: targetOrg.name,
      workspaceId: targetWs.id,
      workspaceName: targetWs.name,
      projectId: targetProject.id,
      projectName: targetProject.name,
    });
  }, [userId, targetOrg, targetWs, targetProject]);

  const isLoading = isTargetResolving(
    enabled,
    access.organizationsQuery.isPending,
    Boolean(targetOrg),
    wsQuery.isPending,
    Boolean(targetWs),
    projectsQuery.isPending,
  );

  return { targetProject, isLoading, hasOrganizations: Boolean(orgs?.length) };
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <span
        role="status"
        aria-label="Loading"
        className="inline-flex items-center text-muted-foreground"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </span>
    </div>
  );
}

function ContributorEmptyState({ hasOrganizations }: { hasOrganizations: boolean }) {
  const { data: user } = useCurrentUser();

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{`Welcome, ${user?.name ?? ''}`}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-sm text-muted-foreground">You are signed in as {user?.username}.</p>
          <p className="text-sm text-muted-foreground">
            {hasOrganizations
              ? 'There are no active Projects in your Workspace yet. Ask a Workspace Owner to create one.'
              : 'You will see an Organization here once an Organization Owner adds you to it.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function renderPortal(access: PortalAccess, onPageChange: (page: number) => void) {
  return (
    <OrganizationsPortal
      isAdministrator={access.isAdministrator}
      isPending={access.organizationsQuery.isPending}
      isError={access.organizationsQuery.isError}
      error={access.organizationsQuery.error}
      pageData={access.organizationsQuery.data}
      organizations={access.manageableOrganizations}
      ownedWorkspacesByOrg={access.ownedWorkspacesByOrg}
      onPageChange={onPageChange}
    />
  );
}

/**
 * Explicit Management Portal route (/organizations).
 * Only Administrators, Organization Owners, and Workspace Owners may access it;
 * Contributors and Viewers are redirected to their active Project.
 */
export function OrganizationsPage() {
  const [page, setPage] = useState(1);
  const access = usePortalAccess(page);

  if (access.isResolvingAccess) {
    return <LoadingState />;
  }
  if (!access.canAccessPortal) {
    return <Navigate to="/" replace />;
  }
  return renderPortal(access, setPage);
}

/**
 * Role-aware home entry (/):
 * - Administrators, Organization Owners, and Workspace Owners land on the Management Portal.
 * - Contributors and Viewers go straight to their active/first Project Board.
 */
export function HomePage() {
  const [page, setPage] = useState(1);
  const { data: user } = useCurrentUser();
  const access = usePortalAccess(page);
  const contributor = useContributorBoardTarget(user?.id, access);

  if (access.canAccessPortal) {
    return renderPortal(access, setPage);
  }
  if (access.isResolvingAccess || contributor.isLoading) {
    return <LoadingState />;
  }
  if (contributor.targetProject) {
    return <Navigate to={projectPath(contributor.targetProject.id)} replace />;
  }
  return <ContributorEmptyState hasOrganizations={contributor.hasOrganizations} />;
}
