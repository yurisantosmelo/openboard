import {
  BookmarkPlus,
  Calendar,
  FolderKanban,
  GanttChart,
  Globe,
  Kanban,
  Layers,
  List,
  Lock,
  Settings,
  Table2,
  Users,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import { clearNavigationContext } from '@/app/navigationContext';
import { useProjectShell, type ProjectShellState } from '@/app/project-shell-context';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useCurrentUser, useSignOut } from '@/features/auth';
import type { ViewLayout } from '@/features/projects';
import { useProjects } from '@/features/projects/hooks/useProjects';
import { projectPath } from '@/features/projects/paths';

const PLANNING_VIEWS: Array<{ mode: ViewLayout; label: string; icon: typeof Kanban }> = [
  { mode: 'timeline', label: 'Timeline', icon: GanttChart },
  { mode: 'list', label: 'Backlog', icon: List },
  { mode: 'board', label: 'Board', icon: Kanban },
  { mode: 'table', label: 'Table', icon: Table2 },
  { mode: 'calendar', label: 'Calendar', icon: Calendar },
];

function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'P';
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

function WorkspaceProjectsGroup({ shell }: { shell: ProjectShellState }) {
  const { project } = shell;
  const projectsQuery = useProjects(project.workspaceId, 1, false);
  const projects = projectsQuery.data?.items ?? [];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton asChild isActive={item.id === project.id} tooltip={item.name}>
              <Link to={projectPath(item.id)}>
                <FolderKanban aria-hidden="true" />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function ProjectSidebarContent({ shell }: { shell: ProjectShellState }) {
  const { project } = shell;
  return (
    <>
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={project.name}>
              <Link to={projectPath(project.id)}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground shadow-xs shadow-primary/24">
                  {projectInitials(project.name)}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold tracking-tight">{project.name}</span>
                  <span className="truncate text-2xs text-sidebar-muted-foreground">
                    Project workspace
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Planning</SidebarGroupLabel>
          <SidebarMenu>
            {PLANNING_VIEWS.map(({ mode, label, icon: Icon }) => {
              const active = shell.activeViewId === null && shell.activeViewMode === mode;
              return (
                <SidebarMenuItem key={mode}>
                  <SidebarMenuButton
                    type="button"
                    isActive={active}
                    tooltip={label}
                    aria-pressed={active}
                    onClick={() => {
                      shell.onSelectLayout(mode);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup role="region" aria-label="Saved Views">
          <SidebarGroupLabel>Saved Views</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                isActive={shell.activeViewId === null}
                tooltip="All Work Items"
                onClick={() => {
                  shell.onSelectSavedView(null);
                }}
              >
                <Layers aria-hidden="true" />
                <span>All Work Items</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {shell.views.map((view) => (
              <SidebarMenuItem key={view.id}>
                <SidebarMenuButton
                  type="button"
                  isActive={shell.activeViewId === view.id}
                  tooltip={view.name}
                  aria-pressed={shell.activeViewId === view.id}
                  onClick={() => {
                    shell.onSelectSavedView(view);
                  }}
                >
                  {view.visibility === 'shared' ? (
                    <Globe aria-hidden="true" />
                  ) : (
                    <Lock aria-hidden="true" />
                  )}
                  <span>{view.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {shell.canWrite && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  tooltip="Save View"
                  onClick={shell.onRequestSaveView}
                >
                  <BookmarkPlus aria-hidden="true" />
                  <span>Save View</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>

        <WorkspaceProjectsGroup shell={shell} />

        <SidebarGroup>
          <SidebarGroupLabel>Project</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                isActive={shell.configOpen && shell.configTab === 'teams'}
                tooltip="Project Teams"
                onClick={() => {
                  shell.onOpenConfigTab('teams');
                }}
              >
                <Users aria-hidden="true" />
                <span>Teams</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                isActive={shell.configOpen && shell.configTab !== 'teams'}
                tooltip="Project settings"
                onClick={() => {
                  shell.onOpenConfigTab(
                    project.currentUserRole === 'owner' ? 'settings' : 'workflow',
                  );
                }}
              >
                <Settings aria-hidden="true" />
                <span>Project settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();
  const { shell } = useProjectShell();

  if (!shell) return null;

  return (
    <Sidebar collapsible="icon" {...props}>
      <ProjectSidebarContent shell={shell} />
      {user && (
        <SidebarFooter>
          <NavUser
            user={{ name: user.name, username: user.username }}
            onSignOut={() => {
              clearNavigationContext();
              signOut.mutate();
            }}
          />
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
