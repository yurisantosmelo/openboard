import { Plus } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type {
  Project,
  ProjectEra,
  ProjectStatus,
  ProjectView,
  ProjectWorkItemType,
} from '@/features/projects';
import type { WorkItem } from '@/features/work-items/api/workItemsApi';
import { initialsOf, resolveStatusTone } from '@/features/work-items/components/statusTone';
import { formatEstimate } from '@/features/work-items/components/workItemLabels';
import { WorkItemTypeIcon } from '@/features/work-items/components/WorkItemTypeIcon';
import { cn } from '@/lib/utils';
import {
  formatShortKey,
  projectCode,
  typeNameOf,
  type CommandEntry,
  type PaletteTab,
} from './command-palette-types';

function projectBadgeTone(idx: number): string {
  if (idx === 0) return 'bg-primary';
  if (idx === 1) return 'bg-success';
  return 'bg-warning';
}

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="px-2 pb-1 text-3xs font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </div>
  );
}

function StatusPill({ status }: { status?: ProjectStatus }) {
  const tone = resolveStatusTone(status);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-xs border px-1.5 py-0.5 text-2xs font-medium text-foreground',
        tone.surface,
      )}
    >
      {status?.name ?? 'Status'}
    </span>
  );
}

function Keycap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 shrink-0 items-center rounded-xs border border-border bg-secondary px-[5px] font-sans text-2xs font-normal text-muted-foreground">
      {children}
    </kbd>
  );
}

function GoToChips({
  onGoTo,
}: {
  onGoTo: (target: 'projects' | 'views' | 'eras' | 'teams') => void;
}) {
  const chips: Array<{ target: 'projects' | 'views' | 'eras' | 'teams'; label: string }> = [
    { target: 'projects', label: 'Projects' },
    { target: 'views', label: 'Views' },
    { target: 'eras', label: 'Eras' },
    { target: 'teams', label: 'Teams' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 px-1.5 pt-2">
      <span className="text-2xs text-muted-foreground">Go to all:</span>
      {chips.map((chip) => (
        <button
          key={chip.target}
          type="button"
          onClick={() => {
            onGoTo(chip.target);
          }}
          className="inline-flex cursor-pointer items-center rounded-sm border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:border-input hover:bg-accent"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

export interface CommandPaletteResultsProps {
  activeTab: PaletteTab;
  activeId: string | null;
  queryTerm: string;
  currentProjectId?: string;
  currentProjectName?: string;
  workItems: WorkItem[];
  projects: Project[];
  views: ProjectView[];
  commands: CommandEntry[];
  types: ProjectWorkItemType[];
  statusById: Map<string, ProjectStatus>;
  eraById: Map<string, ProjectEra>;
  canCreateWorkItem: boolean;
  onHoverId: (id: string) => void;
  onOpenWorkItem: (item: WorkItem) => void;
  onOpenProject: (project: Project) => void;
  onOpenView: (view: ProjectView) => void;
  onCreateWorkItem: () => void;
  onGoTo: (target: 'projects' | 'views' | 'eras' | 'teams') => void;
}

function AllWorkItemsSection({
  items,
  activeId,
  types,
  statusById,
  onHoverId,
  onOpenWorkItem,
}: {
  items: WorkItem[];
  activeId: string | null;
  types: ProjectWorkItemType[];
  statusById: Map<string, ProjectStatus>;
  onHoverId: (id: string) => void;
  onOpenWorkItem: (item: WorkItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <SectionHeading>RECENTLY VIEWED</SectionHeading>
      {items.map((item) => {
        const rowId = `wi:${item.id}`;
        const selected = activeId === rowId;
        const typeName = typeNameOf(types, item.workItemTypeId);
        return (
          <button
            key={rowId}
            type="button"
            data-selected={selected ? 'true' : undefined}
            onMouseEnter={() => {
              onHoverId(rowId);
            }}
            onClick={() => {
              onOpenWorkItem(item);
            }}
            className={cn(
              'flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 text-left transition-colors',
              selected ? 'bg-accent' : 'hover:bg-accent/60',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <WorkItemTypeIcon typeName={typeName} />
              <span className="shrink-0 font-mono text-2xs font-medium text-muted-foreground tabular-nums">
                {formatShortKey(item.id)}
              </span>
              <span className={cn('truncate text-xs text-foreground', selected && 'font-medium')}>
                {item.title}
              </span>
            </span>
            <StatusPill status={statusById.get(item.statusId)} />
          </button>
        );
      })}
    </div>
  );
}

function AllProjectsViewsSection({
  projects,
  views,
  activeId,
  onHoverId,
  onOpenProject,
  onOpenView,
}: {
  projects: Project[];
  views: ProjectView[];
  activeId: string | null;
  onHoverId: (id: string) => void;
  onOpenProject: (project: Project) => void;
  onOpenView: (view: ProjectView) => void;
}) {
  if (projects.length === 0 && views.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <SectionHeading>RECENT PROJECTS &amp; VIEWS</SectionHeading>
      {projects.map((project) => {
        const rowId = `proj:${project.id}`;
        const selected = activeId === rowId;
        return (
          <button
            key={rowId}
            type="button"
            data-selected={selected ? 'true' : undefined}
            onMouseEnter={() => {
              onHoverId(rowId);
            }}
            onClick={() => {
              onOpenProject(project);
            }}
            className={cn(
              'flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 text-left transition-colors',
              selected ? 'bg-accent' : 'hover:bg-accent/60',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-xs bg-primary text-3xs font-semibold text-primary-foreground">
                {projectCode(project.name)}
              </span>
              <span className="truncate text-xs font-medium text-foreground">{project.name}</span>
            </span>
            <span className="shrink-0 text-2xs text-muted-foreground">Project</span>
          </button>
        );
      })}
      {views.map((view) => {
        const rowId = `view:${view.id}`;
        const selected = activeId === rowId;
        return (
          <button
            key={rowId}
            type="button"
            data-selected={selected ? 'true' : undefined}
            onMouseEnter={() => {
              onHoverId(rowId);
            }}
            onClick={() => {
              onOpenView(view);
            }}
            className={cn(
              'flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 text-left transition-colors',
              selected ? 'bg-accent' : 'hover:bg-accent/60',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-xs border border-border bg-secondary">
                <span
                  className={cn(
                    'h-2.5 w-0.5',
                    view.visibility === 'shared' ? 'bg-primary' : 'bg-muted-foreground',
                  )}
                />
              </span>
              <span className="truncate text-xs font-medium text-foreground">{view.name}</span>
            </span>
            <span className="shrink-0 text-2xs text-muted-foreground capitalize">
              {view.layout} · {view.visibility} View
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AllCommandsSection({
  commands,
  activeId,
  onHoverId,
}: {
  commands: CommandEntry[];
  activeId: string | null;
  onHoverId: (id: string) => void;
}) {
  if (commands.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <SectionHeading>QUICK COMMANDS</SectionHeading>
      {commands.map((cmd) => {
        const rowId = `cmd:${cmd.id}`;
        const selected = activeId === rowId;
        return (
          <button
            key={rowId}
            type="button"
            data-selected={selected ? 'true' : undefined}
            onMouseEnter={() => {
              onHoverId(rowId);
            }}
            onClick={cmd.run}
            className={cn(
              'flex h-[30px] w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 text-left transition-colors',
              selected ? 'bg-accent' : 'hover:bg-accent/60',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-xs border border-border bg-secondary text-2xs text-muted-foreground">
                {cmd.glyph}
              </span>
              <span className="truncate text-xs text-foreground">{cmd.label}</span>
            </span>
            <Keycap>{cmd.shortcut}</Keycap>
          </button>
        );
      })}
    </div>
  );
}

function AllTabResults(props: CommandPaletteResultsProps) {
  const topItems = props.workItems.slice(0, 3);
  const topProjects = props.projects.slice(0, 1);
  const topViews = props.views.slice(0, 2);
  const topCommands = props.commands.slice(0, 2);
  const totalCount = topItems.length + topProjects.length + topViews.length + topCommands.length;

  return (
    <div className="flex min-h-full flex-col justify-between gap-4">
      <div className="flex flex-col gap-3.5">
        {totalCount === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No matching Work Items, Projects, Views or commands.
          </p>
        )}

        <AllWorkItemsSection
          items={topItems}
          activeId={props.activeId}
          types={props.types}
          statusById={props.statusById}
          onHoverId={props.onHoverId}
          onOpenWorkItem={props.onOpenWorkItem}
        />

        <AllProjectsViewsSection
          projects={topProjects}
          views={topViews}
          activeId={props.activeId}
          onHoverId={props.onHoverId}
          onOpenProject={props.onOpenProject}
          onOpenView={props.onOpenView}
        />

        <AllCommandsSection
          commands={topCommands}
          activeId={props.activeId}
          onHoverId={props.onHoverId}
        />
      </div>

      <GoToChips onGoTo={props.onGoTo} />
    </div>
  );
}

function WorkItemsTabResults(props: CommandPaletteResultsProps) {
  return (
    <div className="flex min-h-full flex-col justify-between gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-3xs font-medium tracking-wider text-muted-foreground uppercase">
            MATCHING WORK ITEMS · {props.workItems.length}
          </span>
          <span className="text-2xs text-muted-foreground">Sorted by: Updated</span>
        </div>

        {props.workItems.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No Work Items match the current query and filters.
          </p>
        )}

        {props.workItems.slice(0, 6).map((item) => {
          const rowId = `wi:${item.id}`;
          const selected = props.activeId === rowId;
          const typeName = typeNameOf(props.types, item.workItemTypeId);
          const eraName = item.eraId ? props.eraById.get(item.eraId)?.name : undefined;
          const est = formatEstimate(item);
          const meta = [props.currentProjectName, eraName, est].filter(Boolean).join(' · ');

          return (
            <button
              key={rowId}
              type="button"
              data-selected={selected ? 'true' : undefined}
              onMouseEnter={() => {
                props.onHoverId(rowId);
              }}
              onClick={() => {
                props.onOpenWorkItem(item);
              }}
              className={cn(
                'flex min-h-[50px] w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left transition-colors',
                selected ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <WorkItemTypeIcon typeName={typeName} />
                  <span className="shrink-0 font-mono text-2xs font-medium text-muted-foreground tabular-nums">
                    {formatShortKey(item.id)}
                  </span>
                  <span
                    className={cn('truncate text-xs text-foreground', selected && 'font-medium')}
                  >
                    {item.title}
                  </span>
                </span>
                {meta && (
                  <span className="truncate pl-3 text-2xs text-muted-foreground">{meta}</span>
                )}
              </span>

              <span className="flex shrink-0 items-center gap-1.5">
                <StatusPill status={props.statusById.get(item.statusId)} />
                {(item.assigneeName || item.assigneeUsername) && (
                  <Avatar size="xs" className="size-[18px]">
                    <AvatarFallback className="text-4xs font-semibold">
                      {initialsOf(item.assigneeName, item.assigneeUsername)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {props.canCreateWorkItem && (
        <button
          type="button"
          onClick={props.onCreateWorkItem}
          className="flex h-8 w-full cursor-pointer items-center justify-between rounded-sm border border-border bg-secondary px-2.5 text-xs font-medium text-foreground transition-colors hover:border-input hover:bg-accent"
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <Plus className="size-3.5 text-primary" aria-hidden="true" />
            <span>
              {props.queryTerm
                ? `Create new Work Item "${props.queryTerm}"`
                : 'Create new Work Item'}
            </span>
          </span>
          <Keycap>Ctrl ↵</Keycap>
        </button>
      )}
    </div>
  );
}

function ProjectsViewsTabResults(props: CommandPaletteResultsProps) {
  return (
    <div className="flex min-h-full flex-col justify-between gap-4">
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <SectionHeading>{`PROJECTS · ${String(props.projects.length)}`}</SectionHeading>
          {props.projects.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matching Projects.</p>
          )}
          {props.projects.slice(0, 4).map((project, idx) => {
            const rowId = `proj:${project.id}`;
            const selected = props.activeId === rowId;
            const isCurrent = project.id === props.currentProjectId;
            return (
              <button
                key={rowId}
                type="button"
                data-selected={selected ? 'true' : undefined}
                onMouseEnter={() => {
                  props.onHoverId(rowId);
                }}
                onClick={() => {
                  props.onOpenProject(project);
                }}
                className={cn(
                  'flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 text-left transition-colors',
                  selected ? 'bg-accent' : 'hover:bg-accent/60',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      'inline-flex size-[22px] shrink-0 items-center justify-center rounded-xs text-3xs font-semibold text-primary-foreground',
                      projectBadgeTone(idx),
                    )}
                  >
                    {projectCode(project.name)}
                  </span>
                  <span className="truncate text-xs font-medium text-foreground">
                    {project.name}
                  </span>
                </span>
                {isCurrent && (
                  <span className="rounded-xs bg-column-planned-surface px-1.5 py-0.5 text-2xs font-medium text-primary">
                    Current
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-1">
          <SectionHeading>{`SAVED VIEWS · ${String(props.views.length)}`}</SectionHeading>
          {props.views.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matching Saved Views.</p>
          )}
          {props.views.slice(0, 5).map((view) => {
            const rowId = `view:${view.id}`;
            const selected = props.activeId === rowId;
            return (
              <button
                key={rowId}
                type="button"
                data-selected={selected ? 'true' : undefined}
                onMouseEnter={() => {
                  props.onHoverId(rowId);
                }}
                onClick={() => {
                  props.onOpenView(view);
                }}
                className={cn(
                  'flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 text-left transition-colors',
                  selected ? 'bg-accent' : 'hover:bg-accent/60',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-xs border border-border bg-secondary">
                    <span
                      className={cn(
                        'h-2.5 w-0.5',
                        view.visibility === 'shared' ? 'bg-primary' : 'bg-muted-foreground',
                      )}
                    />
                  </span>
                  <span className="truncate text-xs font-medium text-foreground">{view.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-xs border border-border bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground capitalize">
                    {view.layout}
                  </span>
                  <span className="text-2xs text-muted-foreground capitalize">
                    {view.visibility}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <GoToChips onGoTo={props.onGoTo} />
    </div>
  );
}

function CommandsTabResults(props: CommandPaletteResultsProps) {
  const groups: Array<'CREATE' | 'NAVIGATION' | 'PREFERENCES'> = [
    'CREATE',
    'NAVIGATION',
    'PREFERENCES',
  ];

  return (
    <div className="flex flex-col gap-3">
      {props.commands.length === 0 && (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          No commands match &ldquo;{props.queryTerm}&rdquo;.
        </p>
      )}
      {groups.map((group) => {
        const items = props.commands.filter((cmd) => cmd.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-0.5">
            <SectionHeading>{group}</SectionHeading>
            {items.map((cmd) => {
              const rowId = `cmd:${cmd.id}`;
              const selected = props.activeId === rowId;
              return (
                <button
                  key={rowId}
                  type="button"
                  data-selected={selected ? 'true' : undefined}
                  onMouseEnter={() => {
                    props.onHoverId(rowId);
                  }}
                  onClick={cmd.run}
                  className={cn(
                    'flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 text-left transition-colors',
                    selected ? 'bg-accent' : 'hover:bg-accent/60',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex size-[18px] shrink-0 items-center justify-center rounded-xs border text-2xs',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-secondary text-muted-foreground',
                      )}
                    >
                      {cmd.glyph}
                    </span>
                    <span
                      className={cn('truncate text-xs text-foreground', selected && 'font-medium')}
                    >
                      {cmd.label}
                    </span>
                    {cmd.subtitle && (
                      <span className="hidden truncate text-2xs text-muted-foreground sm:inline">
                        · {cmd.subtitle}
                      </span>
                    )}
                  </span>
                  <Keycap>{cmd.shortcut}</Keycap>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Left-hand results column for all 4 Command Palette scope tabs. */
export function CommandPaletteResults(props: CommandPaletteResultsProps) {
  return (
    <div className="min-h-[380px] min-w-0 flex-1 overflow-y-auto bg-card p-4">
      {props.activeTab === 'all' && <AllTabResults {...props} />}
      {props.activeTab === 'work-items' && <WorkItemsTabResults {...props} />}
      {props.activeTab === 'projects-views' && <ProjectsViewsTabResults {...props} />}
      {props.activeTab === 'commands' && <CommandsTabResults {...props} />}
    </div>
  );
}
