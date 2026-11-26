import {
  AlertCircle,
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  KeyRound,
  Layers,
  Loader2,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { saveNavigationContext } from '@/app/navigationContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useCurrentUser, type User } from '@/features/auth';
import { CreateProjectForm } from '@/features/projects/components/CreateProjectForm';
import { useProjects } from '@/features/projects/hooks/useProjects';
import { projectPath } from '@/features/projects/paths';
import { USERS_PATH } from '@/features/users';
import { errorMessage } from '../../../shared/api/httpClient';
import type { Organization, Page, Workspace } from '../api/organizationsApi';
import { useWorkspaces } from '../hooks/useOrganizations';
import { organizationPath, workspacePath } from '../paths';
import { CreateOrganizationForm } from './CreateOrganizationForm';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { organizationRoleLabels } from './organizationRole';
import { PendingDeletionOrganizationsCard } from './PendingDeletionOrganizationsCard';
import { VisibilityLozenge } from './VisibilityLozenge';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'U';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

function PortalProfileSidebar({ user }: { user: User }) {
  return (
    <aside
      aria-label="User profile"
      className="flex flex-col items-center gap-4 border-b border-border pb-6 text-center lg:items-start lg:border-r lg:border-b-0 lg:pr-8 lg:pb-0 lg:text-left"
    >
      <Avatar className="size-20 shadow-xs">
        <AvatarFallback className="bg-primary text-xl font-semibold text-primary-foreground">
          {initialsOf(user.name)}
        </AvatarFallback>
      </Avatar>

      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight break-words">
          {`Welcome, ${user.name}`}
        </h2>
        <p className="text-sm text-muted-foreground break-words">@{user.username}</p>
        {user.isAdministrator && (
          <div className="pt-1">
            <Badge variant="secondary">Administrator</Badge>
          </div>
        )}
      </div>

      <Separator />

      <div className="flex w-full flex-col gap-1">
        <Link
          to="/change-password"
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'justify-start' })}
        >
          <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
          Change password
        </Link>
        {user.isAdministrator && (
          <Link
            to={USERS_PATH}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'justify-start' })}
          >
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            Manage Users
          </Link>
        )}
      </div>
    </aside>
  );
}

interface PortalWorkspaceProjectsProps {
  organization: Organization;
  workspace: Workspace;
  userId?: string;
}

function PortalWorkspaceProjects({
  organization,
  workspace,
  userId,
}: PortalWorkspaceProjectsProps) {
  const projectsQuery = useProjects(workspace.id, 1, false);
  const projects = projectsQuery.data?.items ?? [];

  if (projectsQuery.isPending) {
    return (
      <div className="flex items-center gap-2 py-1.5 pl-6 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Loading Projects...
      </div>
    );
  }
  if (projectsQuery.isError) {
    return (
      <p className="py-1.5 pl-6 text-xs text-muted-foreground">
        Could not load Projects right now.
      </p>
    );
  }
  if (projects.length === 0) {
    return <p className="py-1.5 pl-6 text-xs text-muted-foreground">No Projects yet.</p>;
  }

  return (
    <ul className="grid gap-1 pl-4">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            to={projectPath(project.id)}
            onClick={() => {
              saveNavigationContext({
                userId,
                organizationId: organization.id,
                organizationName: organization.name,
                workspaceId: workspace.id,
                workspaceName: workspace.name,
                projectId: project.id,
                projectName: project.name,
              });
            }}
            className="group flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <span className="flex min-w-0 items-center gap-2">
              <FolderKanban className="size-4 shrink-0 text-primary/80" aria-hidden="true" />
              <span className="truncate">{project.name}</span>
            </span>
            <ArrowRight
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

interface PortalWorkspaceRowProps {
  organization: Organization;
  workspace: Workspace;
  userId?: string;
  onCreateProject: (workspace: Workspace) => void;
}

function PortalWorkspaceRow({
  organization,
  workspace,
  userId,
  onCreateProject,
}: PortalWorkspaceRowProps) {
  const canCreateProject = workspace.currentUserRole === 'owner' && !workspace.archivedAt;

  return (
    <div className="grid gap-1.5 py-3 first:pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Link
            to={workspacePath(workspace.id)}
            className="min-w-0 text-sm font-medium break-words text-foreground no-underline hover:underline"
          >
            {workspace.name}
          </Link>
          <VisibilityLozenge visibility={workspace.visibility} />
          {workspace.archivedAt && <Badge variant="secondary">Archived</Badge>}
        </div>

        <div className="flex items-center gap-1">
          {canCreateProject && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`New Project in ${workspace.name}`}
              onClick={() => {
                onCreateProject(workspace);
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              New Project
            </Button>
          )}
          <Link
            to={workspacePath(workspace.id)}
            aria-label={`Workspace settings for ${workspace.name}`}
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            title="Workspace settings & Teams"
          >
            <Settings className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <PortalWorkspaceProjects organization={organization} workspace={workspace} userId={userId} />
    </div>
  );
}

interface PortalOrganizationWorkspacesProps {
  organization: Organization;
  canManageOrg: boolean;
  ownedWorkspaces?: Workspace[];
  userId?: string;
  onCreateProject: (workspace: Workspace) => void;
}

function PortalOrganizationWorkspaces({
  organization,
  canManageOrg,
  ownedWorkspaces,
  userId,
  onCreateProject,
}: PortalOrganizationWorkspacesProps) {
  const wsQuery = useWorkspaces(organization.id, 1, false, true);

  if (wsQuery.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Loading Workspaces...
      </div>
    );
  }
  if (wsQuery.isError) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">
        Could not load Workspaces right now.
      </p>
    );
  }

  const allWorkspaces = wsQuery.data.items;
  const visibleWorkspaces = canManageOrg
    ? allWorkspaces
    : (ownedWorkspaces ?? allWorkspaces.filter((ws) => ws.currentUserRole === 'owner'));

  if (visibleWorkspaces.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">No active Workspaces to show.</p>;
  }

  return (
    <div className="divide-y divide-border/70 px-4 pb-2">
      {visibleWorkspaces.map((workspace) => (
        <PortalWorkspaceRow
          key={workspace.id}
          organization={organization}
          workspace={workspace}
          userId={userId}
          onCreateProject={onCreateProject}
        />
      ))}
    </div>
  );
}

interface PortalOrganizationSectionProps {
  organization: Organization;
  isAdministrator: boolean;
  ownedWorkspaces?: Workspace[];
  userId?: string;
  onCreateWorkspace: (organization: Organization) => void;
  onCreateProject: (workspace: Workspace) => void;
}

function PortalOrganizationSection({
  organization,
  isAdministrator,
  ownedWorkspaces,
  userId,
  onCreateWorkspace,
  onCreateProject,
}: PortalOrganizationSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const canManageOrg = isAdministrator || organization.currentUserRole === 'owner';

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${organization.name}`}
            onClick={() => {
              setExpanded((prev) => !prev);
            }}
          >
            {expanded ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <Link
            to={organizationPath(organization.id)}
            className="min-w-0 text-base font-semibold break-words text-foreground no-underline hover:underline"
          >
            {organization.name}
          </Link>
          <Badge variant="secondary">{organizationRoleLabels[organization.currentUserRole]}</Badge>
        </div>

        {canManageOrg && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`New Workspace in ${organization.name}`}
              onClick={() => {
                onCreateWorkspace(organization);
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              New Workspace
            </Button>
            <Link
              to={organizationPath(organization.id)}
              aria-label={`Organization settings for ${organization.name}`}
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
              title="Organization settings & Memberships"
            >
              <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>

      {expanded && (
        <PortalOrganizationWorkspaces
          organization={organization}
          canManageOrg={canManageOrg}
          ownedWorkspaces={ownedWorkspaces}
          userId={userId}
          onCreateProject={onCreateProject}
        />
      )}
    </Card>
  );
}

interface PortalPaginationProps {
  pageData: Page<Organization> | undefined;
  onPageChange: (page: number) => void;
}

function PortalPagination({ pageData, onPageChange }: PortalPaginationProps) {
  if (!pageData || pageData.totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
      <span>
        Page {pageData.page} of {pageData.totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pageData.page <= 1}
          onClick={() => {
            onPageChange(pageData.page - 1);
          }}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pageData.page >= pageData.totalPages}
          onClick={() => {
            onPageChange(pageData.page + 1);
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

interface PortalDialogsProps {
  userId?: string;
  createOrgOpen: boolean;
  onCloseCreateOrg: () => void;
  workspaceTargetOrg: Organization | null;
  onCloseCreateWorkspace: () => void;
  projectTargetWorkspace: Workspace | null;
  onCloseCreateProject: () => void;
}

function PortalDialogs({
  userId,
  createOrgOpen,
  onCloseCreateOrg,
  workspaceTargetOrg,
  onCloseCreateWorkspace,
  projectTargetWorkspace,
  onCloseCreateProject,
}: PortalDialogsProps) {
  const navigate = useNavigate();

  return (
    <>
      <Dialog
        open={createOrgOpen}
        onOpenChange={(open) => {
          if (!open) onCloseCreateOrg();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
            <DialogDescription>
              Create a new Organization with its Default Workspace.
            </DialogDescription>
          </DialogHeader>
          <CreateOrganizationForm compact onClose={onCloseCreateOrg} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={workspaceTargetOrg !== null}
        onOpenChange={(open) => {
          if (!open) onCloseCreateWorkspace();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Workspace</DialogTitle>
            <DialogDescription>
              {workspaceTargetOrg
                ? `Create a Workspace inside ${workspaceTargetOrg.name}.`
                : 'Create a Workspace inside this Organization.'}
            </DialogDescription>
          </DialogHeader>
          {workspaceTargetOrg && (
            <CreateWorkspaceForm
              compact
              organizationId={workspaceTargetOrg.id}
              onClose={onCloseCreateWorkspace}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={projectTargetWorkspace !== null}
        onOpenChange={(open) => {
          if (!open) onCloseCreateProject();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>
              {projectTargetWorkspace
                ? `Create a Project in ${projectTargetWorkspace.name} with its default workflow.`
                : 'Create a Project in this Workspace.'}
            </DialogDescription>
          </DialogHeader>
          {projectTargetWorkspace && (
            <CreateProjectForm
              compact
              workspaceId={projectTargetWorkspace.id}
              onClose={onCloseCreateProject}
              onCreated={(created) => {
                saveNavigationContext({
                  userId,
                  organizationId: created.organizationId,
                  workspaceId: created.workspaceId,
                  projectId: created.id,
                  projectName: created.name,
                });
                void navigate(projectPath(created.id));
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface OrganizationsDirectoryBodyProps {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isAdministrator: boolean;
  organizations: Organization[];
  ownedWorkspacesByOrg: Map<string, Workspace[]>;
  userId?: string;
  onCreateWorkspace: (organization: Organization) => void;
  onCreateProject: (workspace: Workspace) => void;
}

function OrganizationsDirectoryBody({
  isPending,
  isError,
  error,
  isAdministrator,
  organizations,
  ownedWorkspacesByOrg,
  userId,
  onCreateWorkspace,
  onCreateProject,
}: OrganizationsDirectoryBodyProps) {
  if (isPending) {
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
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
      </Alert>
    );
  }
  if (organizations.length === 0) {
    return (
      <Card>
        <CardContent className="grid gap-1.5 py-6">
          <h3 className="text-base font-medium">No Organizations yet</h3>
          <p className="text-sm text-muted-foreground">
            {isAdministrator
              ? 'Create the first Organization to start organizing work.'
              : 'You will see an Organization here once an Organization Owner adds you to it.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {organizations.map((org) => (
        <PortalOrganizationSection
          key={org.id}
          organization={org}
          isAdministrator={isAdministrator}
          ownedWorkspaces={ownedWorkspacesByOrg.get(org.id)}
          userId={userId}
          onCreateWorkspace={onCreateWorkspace}
          onCreateProject={onCreateProject}
        />
      ))}
    </div>
  );
}

export interface OrganizationsPortalProps {
  isAdministrator: boolean;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  pageData: Page<Organization> | undefined;
  organizations: Organization[];
  ownedWorkspacesByOrg: Map<string, Workspace[]>;
  onPageChange: (page: number) => void;
}

/**
 * Dedicated two-column Management Portal for Administrators, Organization Owners,
 * and Workspace Owners to manage Organizations, Workspaces, and Projects and jump
 * straight into any Project Board.
 */
export function OrganizationsPortal({
  isAdministrator,
  isPending,
  isError,
  error,
  pageData,
  organizations,
  ownedWorkspacesByOrg,
  onPageChange,
}: OrganizationsPortalProps) {
  const { data: user } = useCurrentUser();
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [workspaceTargetOrg, setWorkspaceTargetOrg] = useState<Organization | null>(null);
  const [projectTargetWorkspace, setProjectTargetWorkspace] = useState<Workspace | null>(null);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      {user && <PortalProfileSidebar user={user} />}

      <section aria-label="Organizations directory" className="grid min-w-0 gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="grid gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
            <p className="text-sm text-muted-foreground">
              Manage Organizations, Workspaces, and Projects or open a Project Board.
            </p>
          </div>
          {isAdministrator && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCreateOrgOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              New Organization
            </Button>
          )}
        </header>

        <OrganizationsDirectoryBody
          isPending={isPending}
          isError={isError}
          error={error}
          isAdministrator={isAdministrator}
          organizations={organizations}
          ownedWorkspacesByOrg={ownedWorkspacesByOrg}
          userId={user?.id}
          onCreateWorkspace={setWorkspaceTargetOrg}
          onCreateProject={setProjectTargetWorkspace}
        />

        <PortalPagination pageData={pageData} onPageChange={onPageChange} />

        {isAdministrator && <PendingDeletionOrganizationsCard />}
      </section>

      <PortalDialogs
        userId={user?.id}
        createOrgOpen={createOrgOpen}
        onCloseCreateOrg={() => {
          setCreateOrgOpen(false);
        }}
        workspaceTargetOrg={workspaceTargetOrg}
        onCloseCreateWorkspace={() => {
          setWorkspaceTargetOrg(null);
        }}
        projectTargetWorkspace={projectTargetWorkspace}
        onCloseCreateProject={() => {
          setProjectTargetWorkspace(null);
        }}
      />
    </div>
  );
}
