import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  ChevronDown,
  FolderKanban,
  Loader2,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/features/auth';
import {
  listWorkspaces,
  type Organization,
  type Workspace,
} from '@/features/organizations/api/organizationsApi';
import { CreateOrganizationForm } from '@/features/organizations/components/CreateOrganizationForm';
import { CreateWorkspaceForm } from '@/features/organizations/components/CreateWorkspaceForm';
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

function matchStoredName(
  storedId: string | undefined,
  activeId: string,
  storedName: string | undefined,
): string | undefined {
  return storedId === activeId ? storedName : undefined;
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
    organizationRole: cachedOrg?.currentUserRole,
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

interface SwitcherListProps<T extends { id: string; name: string }> {
  items: T[];
  activeId: string;
  isPending: boolean;
  loadingLabel: string;
  emptyLabel: string;
  icon: typeof Building2;
  onSelect: (item: T) => void;
}

function SwitcherList<T extends { id: string; name: string }>({
  items,
  activeId,
  isPending,
  loadingLabel,
  emptyLabel,
  icon: Icon,
  onSelect,
}: SwitcherListProps<T>) {
  if (isPending) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        {loadingLabel}
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="px-2 py-2 text-xs text-muted-foreground">{emptyLabel}</div>;
  }
  return (
    <>
      {items.map((item) => (
        <DropdownMenuItem
          key={item.id}
          onSelect={() => {
            onSelect(item);
          }}
        >
          <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 truncate">{item.name}</span>
          {item.id === activeId && <Check className="size-3.5 text-primary" aria-hidden="true" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}

interface OrganizationSwitcherProps {
  userId?: string;
  isAdministrator: boolean;
  activeOrgId: string;
  activeOrgName?: string;
}

function OrganizationSwitcher({
  userId,
  isAdministrator,
  activeOrgId,
  activeOrgName,
}: OrganizationSwitcherProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const orgsQuery = useOrganizations(1, menuOpen);
  const orgs = orgsQuery.data?.items ?? [];
  const label = orgs.find((o) => o.id === activeOrgId)?.name ?? activeOrgName ?? 'Organizations';

  async function handleSelectOrg(org: Organization) {
    setMenuOpen(false);
    const dest = await resolveOrganizationDestination(org, userId);
    void navigate(dest);
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="compact"
            aria-label="Switch Organization"
            className="max-w-44 gap-1.5 px-2 font-medium text-foreground"
          >
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{label}</span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          <SwitcherList
            items={orgs}
            activeId={activeOrgId}
            isPending={orgsQuery.isPending}
            loadingLabel="Loading Organizations..."
            emptyLabel="No Organizations yet."
            icon={Building2}
            onSelect={(org) => {
              void handleSelectOrg(org);
            }}
          />
          <DropdownMenuSeparator />
          {activeOrgId && (
            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false);
                void navigate(organizationPath(activeOrgId));
              }}
            >
              <Settings className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Organization settings
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              setMenuOpen(false);
              void navigate('/organizations');
            }}
          >
            <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
            All Organizations
          </DropdownMenuItem>
          {isAdministrator && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setMenuOpen(false);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-3.5 text-primary" aria-hidden="true" />
                Add Organization
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Organization</DialogTitle>
            <DialogDescription>
              Create a new Organization to group Workspaces, Teams, and Projects.
            </DialogDescription>
          </DialogHeader>
          <CreateOrganizationForm
            compact
            onClose={() => {
              setDialogOpen(false);
            }}
            onCreated={(organization) => {
              setDialogOpen(false);
              saveNavigationContext({
                userId,
                organizationId: organization.id,
                organizationName: organization.name,
                workspaceId: undefined,
                workspaceName: undefined,
                projectId: undefined,
                projectName: undefined,
              });
              void navigate(organizationPath(organization.id));
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

interface WorkspaceSwitcherProps {
  userId?: string;
  organizationId: string;
  activeWsId: string;
  activeWsName?: string;
  canCreateWorkspace: boolean;
}

function WorkspaceSwitcher({
  userId,
  organizationId,
  activeWsId,
  activeWsName,
  canCreateWorkspace,
}: WorkspaceSwitcherProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const wsQuery = useWorkspaces(organizationId, 1, false, menuOpen);
  const workspaces = wsQuery.data?.items ?? [];
  const label = workspaces.find((w) => w.id === activeWsId)?.name ?? activeWsName ?? 'Workspace';

  async function handleSelectWorkspace(ws: Workspace) {
    setMenuOpen(false);
    const dest = await resolveWorkspaceDestination(ws, userId);
    void navigate(dest);
  }

  return (
    <>
      <span className="text-sm text-muted-foreground/60 select-none" aria-hidden="true">
        /
      </span>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="compact"
            aria-label="Switch Workspace"
            className="max-w-44 gap-1.5 px-2 font-medium text-foreground"
          >
            <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{label}</span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <SwitcherList
            items={workspaces}
            activeId={activeWsId}
            isPending={wsQuery.isPending}
            loadingLabel="Loading Workspaces..."
            emptyLabel="No active Workspaces."
            icon={FolderKanban}
            onSelect={(ws) => {
              void handleSelectWorkspace(ws);
            }}
          />
          {activeWsId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setMenuOpen(false);
                  void navigate(workspacePath(activeWsId));
                }}
              >
                <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
                Workspace & Teams
              </DropdownMenuItem>
            </>
          )}
          {canCreateWorkspace && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setMenuOpen(false);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-3.5 text-primary" aria-hidden="true" />
                Add Workspace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Workspace</DialogTitle>
            <DialogDescription>
              Create a new Workspace inside this Organization for Projects and Teams.
            </DialogDescription>
          </DialogHeader>
          <CreateWorkspaceForm
            compact
            organizationId={organizationId}
            onClose={() => {
              setDialogOpen(false);
            }}
            onCreated={(workspace) => {
              saveNavigationContext({
                userId,
                organizationId: workspace.organizationId,
                workspaceId: workspace.id,
                workspaceName: workspace.name,
                projectId: undefined,
                projectName: undefined,
              });
              void navigate(workspacePath(workspace.id));
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Header Organization and Workspace switchers with inline quick-create dialogs. */
export function ContextSwitchers() {
  const { data: user } = useCurrentUser();
  const stored = useStoredNavContext(user?.id);
  const active = useActiveContextIds(stored);
  const isAdmin = user?.isAdministrator ?? false;
  const canCreateWorkspace = isAdmin || active.organizationRole === 'owner';

  if (!user) return null;

  return (
    <div className="flex min-w-0 items-center gap-0.5" aria-label="Workspace navigation">
      <OrganizationSwitcher
        userId={user.id}
        isAdministrator={isAdmin}
        activeOrgId={active.organizationId}
        activeOrgName={active.organizationName}
      />
      {active.organizationId && (
        <WorkspaceSwitcher
          userId={user.id}
          organizationId={active.organizationId}
          activeWsId={active.workspaceId}
          activeWsName={active.workspaceName}
          canCreateWorkspace={canCreateWorkspace}
        />
      )}
    </div>
  );
}
