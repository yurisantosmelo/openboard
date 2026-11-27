import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ChevronDown, FolderKanban } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/features/auth';
import {
  listWorkspaces,
  type Organization,
  type Workspace,
} from '@/features/organizations/api/organizationsApi';
import { useOrganizations, useWorkspaces } from '@/features/organizations/hooks/useOrganizations';
import { organizationPath, workspacePath } from '@/features/organizations/paths';
import { listProjects } from '@/features/projects/api/projectsApi';
import { projectPath } from '@/features/projects/paths';
import {
  readNavigationContext,
  saveNavigationContext,
  subscribeNavigationContext,
  type NavigationContext,
} from './navigationContext';
import { useProjectShell } from './project-shell-context';

let navVersion = 0;
function subscribeWithVersion(listener: () => void): () => void {
  return subscribeNavigationContext(() => {
    navVersion += 1;
    listener();
  });
}

function getNavVersion(): number {
  return navVersion;
}

function useStoredNavContext(userId?: string): NavigationContext {
  useSyncExternalStore(subscribeWithVersion, getNavVersion, getNavVersion);
  return readNavigationContext(userId);
}

function resolveOrgId(
  paramOrgId: string | undefined,
  shellOrgId: string | undefined,
  wsOrgId: string | undefined,
  storedOrgId: string | undefined,
): string {
  return paramOrgId ?? shellOrgId ?? wsOrgId ?? storedOrgId ?? '';
}

function resolveWsId(
  paramWsId: string | undefined,
  shellWsId: string | undefined,
  organizationId: string,
  stored: NavigationContext,
): string {
  const fromStored = stored.organizationId === organizationId ? stored.workspaceId : undefined;
  return paramWsId ?? shellWsId ?? fromStored ?? '';
}

function matchStoredName(
  storedId: string | undefined,
  activeId: string,
  storedName: string | undefined,
): string | undefined {
  return storedId === activeId ? storedName : undefined;
}

function readCachedOrg(
  queryClient: ReturnType<typeof useQueryClient>,
  id?: string,
): Organization | undefined {
  return id ? queryClient.getQueryData<Organization>(['organization', id]) : undefined;
}

function readCachedWorkspace(
  queryClient: ReturnType<typeof useQueryClient>,
  id?: string,
): Workspace | undefined {
  return id ? queryClient.getQueryData<Workspace>(['workspace', id]) : undefined;
}

function useActiveContextIds(stored: NavigationContext) {
  const params = useParams();
  const { shell } = useProjectShell();
  const queryClient = useQueryClient();

  const cachedParamWs = readCachedWorkspace(queryClient, params.workspaceId);
  const organizationId = resolveOrgId(
    params.organizationId,
    shell?.project.organizationId,
    cachedParamWs?.organizationId,
    stored.organizationId,
  );
  const workspaceId = resolveWsId(
    params.workspaceId,
    shell?.project.workspaceId,
    organizationId,
    stored,
  );
  const cachedOrg = readCachedOrg(queryClient, organizationId);
  const cachedActiveWs = readCachedWorkspace(queryClient, workspaceId);

  return {
    organizationId,
    workspaceId,
    organizationName:
      cachedOrg?.name ??
      matchStoredName(stored.organizationId, organizationId, stored.organizationName),
    workspaceName:
      cachedActiveWs?.name ??
      matchStoredName(stored.workspaceId, workspaceId, stored.workspaceName),
  };
}

async function resolveWorkspaceDestination(workspace: Workspace, userId?: string): Promise<string> {
  try {
    const projects = await listProjects(workspace.id, 1);
    const first = projects.items[0];
    if (first) {
      saveNavigationContext({
        userId,
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        projectId: first.id,
        projectName: first.name,
      });
      return projectPath(first.id);
    }
  } catch {
    // Fall back to the Workspace page when Projects cannot be pre-fetched.
  }
  saveNavigationContext({
    userId,
    organizationId: workspace.organizationId,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    projectId: undefined,
    projectName: undefined,
  });
  return workspacePath(workspace.id);
}

async function resolveOrganizationDestination(
  organization: Organization,
  userId?: string,
): Promise<string> {
  try {
    const workspaces = await listWorkspaces(organization.id, 1);
    const firstWs = workspaces.items[0];
    if (firstWs) {
      saveNavigationContext({
        userId,
        organizationId: organization.id,
        organizationName: organization.name,
      });
      return await resolveWorkspaceDestination(firstWs, userId);
    }
  } catch {
    // Fall back to the Organization page.
  }
  saveNavigationContext({
    userId,
    organizationId: organization.id,
    organizationName: organization.name,
    workspaceId: undefined,
    workspaceName: undefined,
    projectId: undefined,
    projectName: undefined,
  });
  return organizationPath(organization.id);
}

interface ReadOnlySwitcherProps<T extends { id: string; name: string }> {
  items: T[];
  activeId: string;
  label?: string;
  menuTitle: string;
  ariaLabel: string;
  icon: typeof Building2;
  onSelect: (item: T) => void;
}

function ReadOnlyContextControl<T extends { id: string; name: string }>({
  items,
  activeId,
  label,
  menuTitle,
  ariaLabel,
  icon: Icon,
  onSelect,
}: ReadOnlySwitcherProps<T>) {
  const [open, setOpen] = useState(false);
  const resolvedLabel = items.find((item) => item.id === activeId)?.name ?? label;

  if (items.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="compact"
          aria-label={ariaLabel}
          className="max-w-44 gap-1.5 px-2 font-medium text-foreground"
        >
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{resolvedLabel ?? menuTitle}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{menuTitle}</DropdownMenuLabel>
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => {
              setOpen(false);
              onSelect(item);
            }}
          >
            <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1 truncate">{item.name}</span>
            {item.id === activeId && <Check className="size-3.5 text-primary" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function firstFallbackName(
  items: Array<{ name: string }>,
  storedName?: string,
): string | undefined {
  return storedName ?? items[0]?.name;
}

interface ContextBarProps {
  userId?: string;
  orgs: Organization[];
  workspaces: Workspace[];
  active: ReturnType<typeof useActiveContextIds>;
}

function ContextBar({ userId, orgs, workspaces, active }: ContextBarProps) {
  const navigate = useNavigate();
  const showOrg = orgs.length > 1;
  const showWs = Boolean(active.organizationId) && workspaces.length > 1;

  if (!showOrg && !showWs) return null;

  return (
    <div className="flex min-w-0 items-center gap-0.5" aria-label="Workspace navigation">
      {showOrg && (
        <ReadOnlyContextControl
          items={orgs}
          activeId={active.organizationId}
          label={firstFallbackName(orgs, active.organizationName)}
          menuTitle="Organizations"
          ariaLabel="Switch Organization"
          icon={Building2}
          onSelect={(org) => {
            void resolveOrganizationDestination(org, userId).then((dest) => navigate(dest));
          }}
        />
      )}
      {showOrg && showWs && (
        <span className="text-sm text-muted-foreground/60 select-none" aria-hidden="true">
          /
        </span>
      )}
      {showWs && (
        <ReadOnlyContextControl
          items={workspaces}
          activeId={active.workspaceId}
          label={firstFallbackName(workspaces, active.workspaceName)}
          menuTitle="Workspaces"
          ariaLabel="Switch Workspace"
          icon={FolderKanban}
          onSelect={(ws) => {
            void resolveWorkspaceDestination(ws, userId).then((dest) => navigate(dest));
          }}
        />
      )}
    </div>
  );
}

/**
 * Lean, read-only Organization and Workspace context bar inside the Project shell.
 * Shows a dropdown only when the User belongs to more than one Organization or Workspace;
 * all structural creation and management lives in the dedicated Management Portal.
 */
export function ContextSwitchers() {
  const { data: user } = useCurrentUser();
  const stored = useStoredNavContext(user?.id);
  const active = useActiveContextIds(stored);

  const orgsQuery = useOrganizations(1, Boolean(user));
  const wsQuery = useWorkspaces(active.organizationId, 1, false, Boolean(active.organizationId));

  if (!user) return null;

  return (
    <ContextBar
      userId={user.id}
      orgs={orgsQuery.data?.items ?? []}
      workspaces={wsQuery.data?.items ?? []}
      active={active}
    />
  );
}
