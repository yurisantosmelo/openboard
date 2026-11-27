import { Search, X } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useProjectShell, type ProjectShellState } from '@/app/project-shell-context';
import { usePortalAccess } from '@/app/usePortalAccess';
import { useCurrentUser } from '@/features/auth';
import {
  projectPath,
  type Project,
  type ProjectEra,
  type ProjectStatus,
  type ProjectView,
  type ProjectWorkItemType,
} from '@/features/projects';
import {
  useProjectEras,
  useProjects,
  useProjectStatuses,
  useProjectWorkItemTypes,
} from '@/features/projects/hooks/useProjects';
import type { WorkItem } from '@/features/work-items/api/workItemsApi';
import { useWorkItems } from '@/features/work-items/hooks/useWorkItems';
import { workItemPath } from '@/features/work-items/paths';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import {
  activeEraOf,
  collectPaletteParticipants,
  filterPaletteCommands,
  filterPaletteProjects,
  filterPaletteViews,
  filterPaletteWorkItems,
  INITIAL_PALETTE_FILTERS,
  parsePaletteQuery,
  type CommandEntry,
  type PaletteActionEntry,
  type PaletteFilters,
  type PaletteTab,
} from './command-palette-types';
import { CommandPaletteFilters } from './CommandPaletteFilters';
import { CommandPaletteResults } from './CommandPaletteResults';

const TAB_ORDER: PaletteTab[] = ['all', 'work-items', 'projects-views', 'commands'];

const TAB_LABELS: Record<PaletteTab, string> = {
  all: 'All',
  'work-items': 'Work Items',
  'projects-views': 'Projects & Views',
  commands: 'Commands',
};

const EMPTY_ITEMS: WorkItem[] = [];
const EMPTY_STATUSES: ProjectStatus[] = [];
const EMPTY_TYPES: ProjectWorkItemType[] = [];
const EMPTY_ERAS: ProjectEra[] = [];
const EMPTY_PROJECTS: Project[] = [];
const EMPTY_VIEWS: ProjectView[] = [];

function resolveActiveTab(
  selectedTab: PaletteTab,
  prefix: '>' | '#' | '@' | '/' | null,
): PaletteTab {
  if (prefix === '>') return 'commands';
  if (prefix === '#' || prefix === '@') return 'work-items';
  if (prefix === '/') return 'projects-views';
  return selectedTab;
}

function buildActionList(params: {
  tab: PaletteTab;
  workItems: WorkItem[];
  projects: Project[];
  views: ProjectView[];
  commands: CommandEntry[];
  onOpenWorkItem: (item: WorkItem) => void;
  onOpenProject: (project: Project) => void;
  onOpenView: (view: ProjectView) => void;
}): PaletteActionEntry[] {
  const wiActions = (limit: number) =>
    params.workItems.slice(0, limit).map((item) => ({
      id: `wi:${item.id}`,
      run: () => {
        params.onOpenWorkItem(item);
      },
    }));
  const projActions = (limit: number) =>
    params.projects.slice(0, limit).map((project) => ({
      id: `proj:${project.id}`,
      run: () => {
        params.onOpenProject(project);
      },
    }));
  const viewActions = (limit: number) =>
    params.views.slice(0, limit).map((view) => ({
      id: `view:${view.id}`,
      run: () => {
        params.onOpenView(view);
      },
    }));
  const cmdActions = (limit?: number) =>
    (limit ? params.commands.slice(0, limit) : params.commands).map((cmd) => ({
      id: `cmd:${cmd.id}`,
      run: cmd.run,
    }));

  if (params.tab === 'work-items') return wiActions(6);
  if (params.tab === 'projects-views') return [...projActions(4), ...viewActions(5)];
  if (params.tab === 'commands') return cmdActions();
  return [...wiActions(3), ...projActions(1), ...viewActions(2), ...cmdActions(2)];
}

function stepActionId(actions: PaletteActionEntry[], activeId: string | null, delta: 1 | -1) {
  if (actions.length === 0) return null;
  const idx = actions.findIndex((a) => a.id === activeId);
  const nextIdx = (idx + delta + actions.length) % actions.length;
  return actions[nextIdx]?.id ?? null;
}

function handlePaletteKeyDown(params: {
  event: KeyboardEvent<HTMLDivElement>;
  actions: PaletteActionEntry[];
  activeId: string | null;
  canCreateWorkItem: boolean;
  onSelectId: (id: string | null) => void;
  onCreateWorkItem: () => void;
}): void {
  const { event, actions, activeId } = params;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    params.onSelectId(stepActionId(actions, activeId, 1));
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    params.onSelectId(stepActionId(actions, activeId, -1));
    return;
  }
  if (event.key !== 'Enter') return;
  if (event.ctrlKey || event.metaKey) {
    if (!params.canCreateWorkItem) return;
    event.preventDefault();
    params.onCreateWorkItem();
    return;
  }
  const target = actions.find((a) => a.id === activeId);
  if (!target) return;
  event.preventDefault();
  target.run();
}

function usePaletteQueries(projectId: string, workspaceId: string) {
  const items = useWorkItems(projectId, {}, 1).data?.items ?? EMPTY_ITEMS;
  const statuses = useProjectStatuses(projectId).data ?? EMPTY_STATUSES;
  const types = useProjectWorkItemTypes(projectId).data ?? EMPTY_TYPES;
  const eras = useProjectEras(projectId).data ?? EMPTY_ERAS;
  const projects = useProjects(workspaceId, 1, false).data?.items;
  return { items, statuses, types, eras, projects };
}

function usePaletteData() {
  const { shell, openWorkItem } = useProjectShell();
  const { data: user } = useCurrentUser();
  const projectId = shell ? shell.project.id : '';
  const workspaceId = shell ? shell.project.workspaceId : '';
  const queries = usePaletteQueries(projectId, workspaceId);
  const fallbackProjects = shell ? [shell.project] : EMPTY_PROJECTS;

  return {
    shell,
    openWorkItem,
    user,
    items: queries.items,
    statuses: queries.statuses,
    types: queries.types,
    eras: queries.eras,
    projects: queries.projects ?? fallbackProjects,
    views: shell ? shell.views : EMPTY_VIEWS,
  };
}

function buildProjectCommands(shell: ProjectShellState, onClose: () => void): CommandEntry[] {
  const projectName = shell.project.name;
  const list: CommandEntry[] = [];

  if (shell.canCreateWorkItem) {
    list.push({
      id: 'create-work-item',
      group: 'CREATE',
      glyph: '+',
      label: 'Create Work Item',
      subtitle: projectName,
      shortcut: 'C',
      description: 'Opens the quick creation modal in the active Project.',
      scope: projectName,
      roleRequired: 'Contributor',
      run: () => {
        onClose();
        shell.onStartCreateWorkItem();
      },
    });
  }

  if (shell.canWrite) {
    list.push({
      id: 'create-view',
      group: 'CREATE',
      glyph: '+',
      label: 'Create Personal View',
      subtitle: 'Save current filters',
      shortcut: 'V N',
      description: 'Saves the active Layout and Filters as a Personal View.',
      scope: projectName,
      roleRequired: 'Contributor',
      run: () => {
        onClose();
        shell.onRequestSaveView();
      },
    });
  }

  list.push(
    {
      id: 'manage-eras',
      group: 'CREATE',
      glyph: '+',
      label: 'Manage Project Eras',
      subtitle: projectName,
      shortcut: 'E N',
      description: 'Opens the Eras panel to plan, start or close execution cycles.',
      scope: projectName,
      roleRequired: 'Workspace Owner',
      run: () => {
        onClose();
        shell.onOpenConfigTab('eras');
      },
    },
    {
      id: 'switch-layout-list',
      group: 'NAVIGATION',
      glyph: '⊞',
      label: 'Switch to List View',
      subtitle: 'Backlog · Status groups',
      shortcut: 'G L',
      description: 'Switches the active Project canvas to grouped List View.',
      scope: projectName,
      roleRequired: 'Viewer',
      run: () => {
        onClose();
        shell.onSelectLayout('list');
      },
    },
    {
      id: 'open-settings',
      group: 'NAVIGATION',
      glyph: '⚙',
      label: 'Open Workflow & Settings',
      subtitle: projectName,
      shortcut: 'G S',
      description: 'Opens Project Statuses, Work Item Types, Transition Rules and settings.',
      scope: projectName,
      roleRequired: 'Workspace Owner',
      run: () => {
        onClose();
        shell.onOpenConfigTab('workflow');
      },
    },
    {
      id: 'reset-search',
      group: 'PREFERENCES',
      glyph: '↺',
      label: 'Reset Active Search',
      shortcut: 'F R',
      description: 'Clears the active Project search query.',
      scope: projectName,
      roleRequired: 'Any User',
      run: () => {
        shell.onSearchChange('');
        onClose();
      },
    },
  );

  return list;
}

function buildCommands(params: {
  shell: ProjectShellState | null;
  canAccessPortal: boolean;
  onClose: () => void;
  onCycleTheme: () => void;
  onNavigate: (path: string) => void;
}): CommandEntry[] {
  const { shell, canAccessPortal, onClose, onCycleTheme, onNavigate } = params;
  const list: CommandEntry[] = shell ? buildProjectCommands(shell, onClose) : [];

  if (canAccessPortal) {
    list.push({
      id: 'open-portal',
      group: 'NAVIGATION',
      glyph: '⌂',
      label: 'Open Management Portal',
      subtitle: 'Organizations & Workspaces',
      shortcut: 'G O',
      description: 'Navigates to the Management Portal to manage Organizations and Workspaces.',
      scope: 'Organization',
      roleRequired: 'Owner / Admin',
      run: () => {
        onClose();
        onNavigate('/organizations');
      },
    });
  }

  list.push({
    id: 'toggle-theme',
    group: 'PREFERENCES',
    glyph: '◐',
    label: 'Toggle Light / Dark Theme',
    shortcut: 'T D',
    description: 'Cycles interface appearance between System, Light and Dark modes.',
    scope: 'Instance',
    roleRequired: 'Any User',
    run: () => {
      onCycleTheme();
      onClose();
    },
  });

  return list;
}

function footerLabelFor(
  activeTab: PaletteTab,
  queryTerm: string,
  selectedCommand?: CommandEntry,
): string {
  if (activeTab === 'commands' && selectedCommand) {
    return `Run "${selectedCommand.label}"`;
  }
  if (activeTab === 'projects-views') {
    return 'Browse all Projects & Views';
  }
  if (queryTerm) {
    return `Open full Work Items search for "${queryTerm}"`;
  }
  return 'View all matching Work Items';
}

function footerCountFor(
  activeTab: PaletteTab,
  workItemCount: number,
  navCount: number,
): number | null {
  if (activeTab === 'commands') return null;
  if (activeTab === 'projects-views') return navCount;
  return workItemCount;
}

function PaletteSearchBar({
  query,
  isCommandsMode,
  onQueryChange,
  onClear,
}: {
  query: string;
  isCommandsMode: boolean;
  onQueryChange: (next: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center bg-card px-3 py-2">
      <div className="flex h-8 w-full items-center justify-between gap-2 rounded-sm border-[1.5px] border-ring bg-background px-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isCommandsMode ? (
            <span aria-hidden="true" className="text-sm font-semibold text-primary">
              &gt;
            </span>
          ) : (
            <Search className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          )}
          <input
            type="search"
            autoFocus
            aria-label="Command palette search"
            placeholder={
              isCommandsMode
                ? 'Type a command (create, switch, layout, theme)...'
                : 'Search work items, projects, views or type > for commands...'
            }
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
            }}
            className="w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-placeholder [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {query.length > 0 ? (
            <button
              type="button"
              aria-label="Clear palette search"
              onClick={onClear}
              className="inline-flex size-[18px] cursor-pointer items-center justify-center rounded-xs bg-secondary text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          ) : (
            <kbd className="inline-flex h-5 items-center rounded-xs border border-border bg-secondary px-[5px] font-sans text-2xs text-muted-foreground">
              Ctrl + /
            </kbd>
          )}
          <kbd className="inline-flex h-5 items-center rounded-xs border border-border bg-secondary px-[5px] font-sans text-2xs text-muted-foreground">
            Esc
          </kbd>
        </div>
      </div>
    </div>
  );
}

function PaletteScopeTabs({
  activeTab,
  workItemCount,
  onSelectTab,
}: {
  activeTab: PaletteTab;
  workItemCount: number;
  onSelectTab: (tab: PaletteTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Search scope"
      className="flex h-9 shrink-0 items-stretch gap-5 border-b border-border bg-card px-4"
    >
      {TAB_ORDER.map((tab) => {
        const active = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onSelectTab(tab);
            }}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 border-b-2 text-xs font-medium transition-colors',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <span>{TAB_LABELS[tab]}</span>
            {tab === 'work-items' && workItemCount > 0 && (
              <span
                className={cn(
                  'rounded-xs px-1 py-0.5 text-3xs tabular-nums',
                  active
                    ? 'bg-column-planned-surface text-primary'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                {workItemCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PaletteFooter({
  activeTab,
  queryTerm,
  workItemCount,
  navCount,
  selectedCommand,
  onFooterAction,
}: {
  activeTab: PaletteTab;
  queryTerm: string;
  workItemCount: number;
  navCount: number;
  selectedCommand?: CommandEntry;
  onFooterAction: () => void;
}) {
  const footerLabel = footerLabelFor(activeTab, queryTerm, selectedCommand);
  const count = footerCountFor(activeTab, workItemCount, navCount);

  return (
    <div className="flex h-[38px] shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-4">
      <button
        type="button"
        onClick={onFooterAction}
        className="inline-flex min-w-0 cursor-pointer items-center gap-2 text-xs font-medium text-foreground hover:underline"
      >
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{footerLabel}</span>
        {count !== null && (
          <span className="rounded-xs border border-border bg-secondary px-1.5 py-0.5 text-2xs font-normal text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </button>

      <div className="hidden shrink-0 items-center gap-2.5 text-2xs text-muted-foreground sm:flex">
        <span className="inline-flex items-center gap-1">
          <kbd className="inline-flex h-5 items-center rounded-xs border border-border bg-secondary px-1 font-sans">
            ↑↓
          </kbd>
          Navigate
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="inline-flex h-5 items-center rounded-xs border border-border bg-secondary px-1 font-sans">
            ↵
          </kbd>
          Open
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="inline-flex h-5 items-center rounded-xs border border-border bg-secondary px-1 font-sans">
            Esc
          </kbd>
          Close
        </span>
      </div>
    </div>
  );
}

function resolveActiveId(hoveredId: string | null, actions: PaletteActionEntry[]): string | null {
  if (hoveredId && actions.some((a) => a.id === hoveredId)) return hoveredId;
  return actions[0]?.id ?? null;
}

function resolveSelectedCommand(
  commands: CommandEntry[],
  activeId: string | null,
): CommandEntry | undefined {
  return commands.find((c) => `cmd:${c.id}` === activeId) ?? commands[0];
}

function CommandPaletteDialogBody({
  initialQuery,
  onClose,
}: {
  initialQuery: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { canAccessPortal } = usePortalAccess();
  const { cycleTheme } = useTheme();
  const data = usePaletteData();

  const [query, setQuery] = useState(initialQuery);
  const [selectedTab, setSelectedTab] = useState<PaletteTab>('all');
  const [filters, setFilters] = useState<PaletteFilters>(INITIAL_PALETTE_FILTERS);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const parsed = useMemo(() => parsePaletteQuery(query), [query]);
  const activeTab = resolveActiveTab(selectedTab, parsed.prefix);
  const statusById = useMemo(() => new Map(data.statuses.map((s) => [s.id, s])), [data.statuses]);
  const eraById = useMemo(() => new Map(data.eras.map((e) => [e.id, e])), [data.eras]);
  const activeEra = useMemo(() => activeEraOf(data.eras), [data.eras]);
  const participants = useMemo(
    () => collectPaletteParticipants(data.items, data.user),
    [data.items, data.user],
  );

  const allCommands = useMemo(
    () =>
      buildCommands({
        shell: data.shell,
        canAccessPortal,
        onClose,
        onCycleTheme: cycleTheme,
        onNavigate: (path) => {
          void navigate(path);
        },
      }),
    [data.shell, canAccessPortal, onClose, cycleTheme, navigate],
  );

  const matchedWorkItems = useMemo(
    () =>
      filterPaletteWorkItems({
        items: data.items,
        parsed,
        filters,
        statusById,
        activeEraId: activeEra?.id,
        currentUserId: data.user?.id,
      }),
    [data.items, parsed, filters, statusById, activeEra?.id, data.user?.id],
  );

  const matchedProjects = useMemo(
    () => filterPaletteProjects(data.projects, parsed, filters.projectIds),
    [data.projects, parsed, filters.projectIds],
  );

  const matchedViews = useMemo(
    () => filterPaletteViews(data.views, parsed, filters),
    [data.views, parsed, filters],
  );

  const matchedCommands = useMemo(
    () => filterPaletteCommands(allCommands, parsed),
    [allCommands, parsed],
  );

  function handleOpenWorkItem(item: WorkItem) {
    onClose();
    if (data.openWorkItem) {
      data.openWorkItem(item.id);
      return;
    }
    void navigate(workItemPath(item.id));
  }

  function handleOpenProject(project: Project) {
    onClose();
    void navigate(projectPath(project.id));
  }

  function handleOpenView(view: ProjectView) {
    data.shell?.onSelectSavedView(view);
    onClose();
  }

  function handleCreateWorkItem() {
    onClose();
    data.shell?.onStartCreateWorkItem();
  }

  const actions = buildActionList({
    tab: activeTab,
    workItems: matchedWorkItems,
    projects: matchedProjects,
    views: matchedViews,
    commands: matchedCommands,
    onOpenWorkItem: handleOpenWorkItem,
    onOpenProject: handleOpenProject,
    onOpenView: handleOpenView,
  });

  const activeId = resolveActiveId(hoveredId, actions);
  const selectedCommand = resolveSelectedCommand(matchedCommands, activeId);

  function handleGoTo(target: 'projects' | 'views' | 'eras' | 'teams') {
    if (target === 'projects' || target === 'views') {
      setSelectedTab('projects-views');
      return;
    }
    onClose();
    data.shell?.onOpenConfigTab(target);
  }

  function handleFooterAction() {
    if (activeTab === 'commands' && selectedCommand) {
      selectedCommand.run();
      return;
    }
    if (activeTab === 'projects-views') {
      onClose();
      if (canAccessPortal) void navigate('/organizations');
      return;
    }
    if (data.shell) {
      data.shell.onSearchChange(parsed.term);
      data.shell.onSelectLayout('list');
    }
    onClose();
  }

  return (
    <DialogPrimitive.Content
      data-slot="command-palette"
      aria-label="Command palette"
      onKeyDown={(event) => {
        handlePaletteKeyDown({
          event,
          actions,
          activeId,
          canCreateWorkItem: Boolean(data.shell?.canCreateWorkItem),
          onSelectId: setHoveredId,
          onCreateWorkItem: handleCreateWorkItem,
        });
      }}
      className="fixed top-[52px] left-1/2 z-[51] flex max-h-[min(560px,calc(100svh-68px))] w-[calc(100%-2rem)] max-w-[760px] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-card outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
    >
      <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        Search Work Items, Projects, Views, and run quick commands.
      </DialogPrimitive.Description>

      <PaletteSearchBar
        query={query}
        isCommandsMode={activeTab === 'commands'}
        onQueryChange={setQuery}
        onClear={() => {
          setQuery('');
        }}
      />

      <PaletteScopeTabs
        activeTab={activeTab}
        workItemCount={matchedWorkItems.length}
        onSelectTab={(tab) => {
          if (parsed.prefix) setQuery(parsed.term);
          setSelectedTab(tab);
          setHoveredId(null);
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <CommandPaletteResults
          activeTab={activeTab}
          activeId={activeId}
          queryTerm={parsed.term}
          currentProjectId={data.shell?.project.id}
          currentProjectName={data.shell?.project.name}
          workItems={matchedWorkItems}
          projects={matchedProjects}
          views={matchedViews}
          commands={matchedCommands}
          types={data.types}
          statusById={statusById}
          eraById={eraById}
          canCreateWorkItem={Boolean(data.shell?.canCreateWorkItem)}
          onHoverId={setHoveredId}
          onOpenWorkItem={handleOpenWorkItem}
          onOpenProject={handleOpenProject}
          onOpenView={handleOpenView}
          onCreateWorkItem={handleCreateWorkItem}
          onGoTo={handleGoTo}
        />

        <CommandPaletteFilters
          activeTab={activeTab}
          filters={filters}
          projects={data.projects}
          types={data.types}
          activeEra={activeEra}
          participants={participants}
          selectedCommand={selectedCommand}
          onPatch={(patch) => {
            setFilters((prev) => ({ ...prev, ...patch }));
          }}
        />
      </div>

      <PaletteFooter
        activeTab={activeTab}
        queryTerm={parsed.term}
        workItemCount={matchedWorkItems.length}
        navCount={matchedProjects.length + matchedViews.length}
        selectedCommand={selectedCommand}
        onFooterAction={handleFooterAction}
      />
    </DialogPrimitive.Content>
  );
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
}

/** Horizontally centered Command Palette overlay anchored below GlobalHeader (Penpot 01E). */
export function CommandPalette({ open, onOpenChange, initialQuery = '' }: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="command-palette-backdrop"
          className="dialog-backdrop fixed inset-x-0 top-[var(--workspace-topbar-height)] bottom-0 z-50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        {open && (
          <CommandPaletteDialogBody
            initialQuery={initialQuery}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
