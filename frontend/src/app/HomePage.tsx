import { useEffect } from 'react';
import { Navigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '../features/auth';
import { OrganizationList } from '../features/organizations';
import { PendingDeletionOrganizationsCard } from '../features/organizations/components/PendingDeletionOrganizationsCard';
import { useOrganizations, useWorkspaces } from '../features/organizations/hooks/useOrganizations';
import { useProjects } from '../features/projects/hooks/useProjects';
import { projectPath } from '../features/projects/paths';
import { readNavigationContext, saveNavigationContext } from './navigationContext';

function pickPreferred<T extends { id: string }>(items: T[] | undefined, preferredId?: string) {
  if (!items || items.length === 0) return undefined;
  return items.find((item) => item.id === preferredId) ?? items[0];
}

function useInitialBoardTarget(userId?: string) {
  const saved = readNavigationContext(userId);
  const orgsQuery = useOrganizations(1);
  const targetOrg = pickPreferred(orgsQuery.data?.items, saved.organizationId);

  const wsQuery = useWorkspaces(targetOrg?.id ?? '', 1, false, Boolean(targetOrg));
  const targetWs = pickPreferred(wsQuery.data?.items, saved.workspaceId);

  const projectsQuery = useProjects(targetWs?.id ?? '', 1, false, Boolean(targetWs));
  const targetProject = pickPreferred(projectsQuery.data?.items, saved.projectId);

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

  return targetProject;
}

function OrganizationsOverview() {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.isAdministrator ?? false;
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{`Welcome, ${user?.name ?? ''}`}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">You are signed in as {user?.username}.</p>
        </CardContent>
      </Card>
      <OrganizationList canCreate={isAdmin} />
      {isAdmin && <PendingDeletionOrganizationsCard />}
    </div>
  );
}

/** Explicit Organization directory route that never auto-redirects into a Board. */
export function OrganizationsPage() {
  return <OrganizationsOverview />;
}

/** Smart home entry: lands straight on the active/first Project Board when available. */
export function HomePage() {
  const { data: user } = useCurrentUser();
  const targetProject = useInitialBoardTarget(user?.id);

  if (targetProject) {
    return <Navigate to={projectPath(targetProject.id)} replace />;
  }

  return <OrganizationsOverview />;
}
