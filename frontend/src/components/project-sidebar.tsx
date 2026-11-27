import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router';
import { useProjectShell, type ProjectShellState } from '@/app/project-shell-context';
import { SidebarNavIndicator, SidebarNavItem } from '@/components/ui/sidebar-nav-item';
import { useProjects } from '@/features/projects/hooks/useProjects';
import { projectPath } from '@/features/projects/paths';

function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'P';
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

function SidebarGroupHeading({ children }: { children: string }) {
  return (
    <div className="px-2 py-0.5 text-3xs font-medium tracking-wider text-sidebar-muted-foreground uppercase">
      {children}
    </div>
  );
}

function ProjectHeader({ shell }: { shell: ProjectShellState }) {
  const { project } = shell;
  return (
    <div className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-3">
      <Link
        to={projectPath(project.id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-sm bg-sidebar-primary text-2xs font-semibold text-sidebar-primary-foreground">
          {projectInitials(project.name)}
        </span>
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate text-xs font-semibold tracking-tight text-sidebar-foreground">
            {project.name}
          </span>
          <span className="truncate text-3xs text-sidebar-muted-foreground">Project workspace</span>
        </span>
      </Link>
      <ChevronDown className="size-3.5 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
    </div>
  );
}

function WorkNavGroup({ shell }: { shell: ProjectShellState }) {
  const isWorkItemsActive =
    !shell.configOpen && shell.activeViewId === null && shell.activeViewMode === 'list';
  const isBoardsActive =
    !shell.configOpen &&
    shell.activeViewId === null &&
    (shell.activeViewMode === 'board' ||
      shell.activeViewMode === 'table' ||
      shell.activeViewMode === 'timeline' ||
      shell.activeViewMode === 'calendar');
  const isErasActive = shell.configOpen && shell.configTab === 'eras';

  return (
    <div className="flex flex-col gap-0.5" role="group" aria-label="Work navigation">
      <SidebarGroupHeading>WORK</SidebarGroupHeading>
      <SidebarNavItem
        active={isWorkItemsActive}
        aria-pressed={isWorkItemsActive}
        onClick={() => {
          shell.onSelectLayout('list');
        }}
      >
        Work Items
      </SidebarNavItem>
      <SidebarNavItem
        active={isBoardsActive}
        aria-pressed={isBoardsActive}
        onClick={() => {
          shell.onSelectLayout('board');
        }}
      >
        Boards
      </SidebarNavItem>
      <SidebarNavItem
        onClick={() => {
          shell.onSelectLayout('list');
        }}
      >
        Backlogs
      </SidebarNavItem>
      <SidebarNavItem
        active={isErasActive}
        aria-pressed={isErasActive}
        onClick={() => {
          shell.onOpenConfigTab('eras');
        }}
      >
        Eras
      </SidebarNavItem>
      <SidebarNavItem tone="muted" disabled>
        Wiki
      </SidebarNavItem>
    </div>
  );
}

function SavedViewsNavGroup({ shell }: { shell: ProjectShellState }) {
  return (
    <div className="flex flex-col gap-0.5" role="region" aria-label="Saved Views">
      <SidebarGroupHeading>SAVED VIEWS</SidebarGroupHeading>
      <SidebarNavItem
        active={shell.activeViewId === null && !shell.configOpen}
        onClick={() => {
          shell.onSelectSavedView(null);
        }}
      >
        All Work Items
      </SidebarNavItem>
      {shell.views.map((view) => (
        <SidebarNavItem
          key={view.id}
          active={shell.activeViewId === view.id}
          aria-pressed={shell.activeViewId === view.id}
          onClick={() => {
            shell.onSelectSavedView(view);
          }}
        >
          {view.name}
        </SidebarNavItem>
      ))}
      {shell.canWrite && (
        <SidebarNavItem tone="muted" aria-label="Save View" onClick={shell.onRequestSaveView}>
          + Save current view
        </SidebarNavItem>
      )}
    </div>
  );
}

function ProjectsNavGroup({ shell }: { shell: ProjectShellState }) {
  const { project } = shell;
  const projectsQuery = useProjects(project.workspaceId, 1, false);
  const projects = projectsQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-0.5" role="group" aria-label="Projects">
      <SidebarGroupHeading>PROJECTS</SidebarGroupHeading>
      {projects.map((item) => {
        const current = item.id === project.id;
        return (
          <SidebarNavItem key={item.id} asChild tone={current ? 'default' : 'muted'}>
            <Link to={projectPath(item.id)}>
              <span className="flex min-w-0 items-center gap-2">
                <SidebarNavIndicator active={false} />
                <span className="truncate">{item.name}</span>
              </span>
            </Link>
          </SidebarNavItem>
        );
      })}
    </div>
  );
}

function SidebarFooterNav({ shell }: { shell: ProjectShellState }) {
  const { project } = shell;
  const isTeamsActive = shell.configOpen && shell.configTab === 'teams';
  const isSettingsActive =
    shell.configOpen && (shell.configTab === 'settings' || shell.configTab === 'workflow');

  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-t border-sidebar-border p-2">
      <SidebarNavItem
        tone="muted"
        active={isTeamsActive}
        onClick={() => {
          shell.onOpenConfigTab('teams');
        }}
      >
        Teams
      </SidebarNavItem>
      <SidebarNavItem
        tone="muted"
        active={isSettingsActive}
        onClick={() => {
          shell.onOpenConfigTab(project.currentUserRole === 'owner' ? 'settings' : 'workflow');
        }}
      >
        Workflow &amp; Settings
      </SidebarNavItem>
    </div>
  );
}

export function ProjectSidebar() {
  const { shell } = useProjectShell();
  if (!shell) return null;

  return (
    <aside
      data-app-sidebar=""
      aria-label="Project sidebar"
      className="flex h-svh w-[228px] shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ProjectHeader shell={shell} />
        <nav
          aria-label="Project navigation"
          className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto px-2 py-3.5"
        >
          <WorkNavGroup shell={shell} />
          <SavedViewsNavGroup shell={shell} />
          <ProjectsNavGroup shell={shell} />
        </nav>
      </div>
      <SidebarFooterNav shell={shell} />
    </aside>
  );
}
