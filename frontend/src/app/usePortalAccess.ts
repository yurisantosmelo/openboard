import { useQueries } from '@tanstack/react-query';
import { useCurrentUser } from '@/features/auth';
import {
  listWorkspaces,
  type Organization,
  type Workspace,
} from '@/features/organizations/api/organizationsApi';
import { useOrganizations } from '@/features/organizations/hooks/useOrganizations';

export interface PortalAccess {
  /** True while determining whether a non-Administrator manages any Organization or Workspace. */
  isResolvingAccess: boolean;
  /** True for Administrators, Organization Owners, and Workspace Owners. */
  canAccessPortal: boolean;
  isAdministrator: boolean;
  organizationsQuery: ReturnType<typeof useOrganizations>;
  /** Organizations the signed-in User can manage (directly or via a Workspace they own). */
  manageableOrganizations: Organization[];
  /**
   * For Contributor-role Organizations, maps organizationId -> Workspaces owned by the User.
   * For Administrator / Organization Owner Organizations, all Workspaces are manageable.
   */
  ownedWorkspacesByOrg: Map<string, Workspace[]>;
}

function collectOwnedWorkspaces(
  contributorOrgs: Organization[],
  wsResults: Array<{ data?: { items: Workspace[] } }>,
): Map<string, Workspace[]> {
  const map = new Map<string, Workspace[]>();
  contributorOrgs.forEach((org, index) => {
    const owned = (wsResults[index]?.data?.items ?? []).filter(
      (ws) => ws.currentUserRole === 'owner',
    );
    if (owned.length > 0) {
      map.set(org.id, owned);
    }
  });
  return map;
}

function filterManageableOrganizations(
  orgs: Organization[],
  isAdministrator: boolean,
  ownedWorkspacesByOrg: Map<string, Workspace[]>,
): Organization[] {
  if (isAdministrator) return orgs;
  return orgs.filter((org) => org.currentUserRole === 'owner' || ownedWorkspacesByOrg.has(org.id));
}

function computeAccessFlags(
  isAdministrator: boolean,
  orgsPending: boolean,
  hasOwnedOrg: boolean,
  hasOwnedWorkspace: boolean,
  wsStillLoading: boolean,
) {
  const canAccessPortal = isAdministrator || hasOwnedOrg || hasOwnedWorkspace;
  const isResolvingAccess =
    !isAdministrator && (orgsPending || (!canAccessPortal && wsStillLoading));
  return { canAccessPortal, isResolvingAccess };
}

/**
 * Resolves whether the signed-in User can access the Management Portal
 * (Administrator, Organization Owner, or Workspace Owner) and which
 * Organizations and Workspaces fall under their management scope.
 */
export function usePortalAccess(page = 1): PortalAccess {
  const { data: user } = useCurrentUser();
  const isAdministrator = user?.isAdministrator ?? false;
  const organizationsQuery = useOrganizations(page, Boolean(user));
  const orgs = organizationsQuery.data?.items ?? [];

  const contributorOrgs = isAdministrator
    ? []
    : orgs.filter((org) => org.currentUserRole !== 'owner');

  const wsQueries = useQueries({
    queries: contributorOrgs.map((org) => ({
      queryKey: ['workspaces', org.id, 1, false] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => listWorkspaces(org.id, 1, signal, false),
      enabled: Boolean(user),
    })),
  });

  const ownedWorkspacesByOrg = collectOwnedWorkspaces(contributorOrgs, wsQueries);
  const { canAccessPortal, isResolvingAccess } = computeAccessFlags(
    isAdministrator,
    organizationsQuery.isPending,
    orgs.some((org) => org.currentUserRole === 'owner'),
    ownedWorkspacesByOrg.size > 0,
    wsQueries.some((query) => query.isPending),
  );

  return {
    isResolvingAccess,
    canAccessPortal,
    isAdministrator,
    organizationsQuery,
    manageableOrganizations: filterManageableOrganizations(
      orgs,
      isAdministrator,
      ownedWorkspacesByOrg,
    ),
    ownedWorkspacesByOrg,
  };
}
