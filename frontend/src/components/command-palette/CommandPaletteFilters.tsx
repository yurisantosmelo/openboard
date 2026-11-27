import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type {
  Project,
  ProjectEra,
  ProjectWorkItemType,
  StatusGroup,
  ViewLayout,
} from '@/features/projects';
import type { Priority } from '@/features/work-items/api/workItemsApi';
import { initialsOf } from '@/features/work-items/components/statusTone';
import { cn } from '@/lib/utils';
import {
  projectCode,
  toggleListValue,
  type CommandEntry,
  type PaletteFilters,
  type PaletteParticipant,
  type PaletteTab,
  type UpdatedWindow,
} from './command-palette-types';

const UPDATED_OPTIONS: Array<{ value: UpdatedWindow; label: string }> = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Past 7 days' },
  { value: '30d', label: 'Past 30 days' },
  { value: 'active-era', label: 'Active Era' },
];

const STATUS_GROUP_OPTIONS: Array<{ value: StatusGroup; label: string }> = [
  { value: 'not_committed', label: 'Not Committed' },
  { value: 'planned', label: 'Planned' },
  { value: 'started', label: 'Started' },
  { value: 'completed', label: 'Completed' },
];

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Med' },
  { value: 'low', label: 'Low' },
];

const VIEW_LAYOUT_OPTIONS: Array<{ value: ViewLayout; label: string }> = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'calendar', label: 'Calendar' },
];

const VISIBILITY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'shared', label: 'Shared' },
  { value: 'personal', label: 'Personal' },
] as const;

const PREFIX_HINTS = [
  { key: '>', desc: 'Run quick command' },
  { key: '#', desc: 'Jump by Work Item key' },
  { key: '@', desc: 'Filter by Assignee' },
  { key: '/', desc: 'Switch View or Layout' },
] as const;

function FilterHeading({ children }: { children: string }) {
  return (
    <div className="text-3xs font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-sm border px-2 py-0.5 text-2xs transition-colors',
        active
          ? 'border-primary bg-column-planned-surface font-medium text-primary'
          : 'border-border bg-card text-secondary-foreground hover:border-input hover:bg-secondary',
      )}
    >
      {label}
    </button>
  );
}

function StatusGroupFilter({
  selected,
  onChange,
}: {
  selected: StatusGroup[];
  onChange: (next: StatusGroup[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FilterHeading>STATUS GROUP</FilterHeading>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        {STATUS_GROUP_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground"
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => {
                onChange(toggleListValue(selected, opt.value));
              }}
              className="size-3.5 shrink-0 cursor-pointer rounded-xs border-input accent-primary"
            />
            <span className="truncate">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ProjectFilter({
  projects,
  selectedIds,
  onChange,
}: {
  projects: Project[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <FilterHeading>FILTER BY PROJECT</FilterHeading>
      <div className="flex flex-col gap-1.5">
        {projects.slice(0, 4).map((project, idx) => (
          <label
            key={project.id}
            className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(project.id)}
              onChange={() => {
                onChange(toggleListValue(selectedIds, project.id));
              }}
              className="size-3.5 shrink-0 cursor-pointer rounded-xs border-input accent-primary"
            />
            <span
              className={cn(
                'inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-4xs font-semibold text-primary-foreground',
                idx === 0 ? 'bg-primary' : 'bg-success',
              )}
            >
              {projectCode(project.name)}
            </span>
            <span className="truncate">{project.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function AssigneeFilter({
  participants,
  assignedToMe,
  selectedIds,
  onToggleMe,
  onChangeIds,
}: {
  participants: PaletteParticipant[];
  assignedToMe: boolean;
  selectedIds: string[];
  onToggleMe: () => void;
  onChangeIds: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FilterHeading>FILTER BY ASSIGNEE</FilterHeading>
      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={assignedToMe}
            onChange={onToggleMe}
            className="size-3.5 shrink-0 cursor-pointer rounded-xs border-input accent-primary"
          />
          <span>Assigned to me</span>
        </label>
        {participants.slice(0, 3).map((person) => (
          <label
            key={person.id}
            className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(person.id)}
              onChange={() => {
                onChangeIds(toggleListValue(selectedIds, person.id));
              }}
              className="size-3.5 shrink-0 cursor-pointer rounded-xs border-input accent-primary"
            />
            <Avatar size="xs" className="size-[18px]">
              <AvatarFallback className="text-4xs font-semibold">
                {initialsOf(person.name, person.username)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{person.name || `@${person.username}`}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function CommandsInspector({ command }: { command?: CommandEntry }) {
  return (
    <div className="flex flex-col gap-4">
      {command && (
        <div className="flex flex-col gap-2">
          <FilterHeading>SELECTED COMMAND</FilterHeading>
          <div className="flex flex-col gap-2.5 rounded-sm border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-xs bg-primary text-xs font-medium text-primary-foreground">
                {command.glyph}
              </span>
              <span className="truncate text-xs font-semibold text-foreground">
                {command.label}
              </span>
            </div>
            <p className="text-2xs leading-relaxed text-muted-foreground">{command.description}</p>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between text-2xs">
              <span className="text-muted-foreground">Shortcut</span>
              <kbd className="inline-flex h-5 items-center rounded-xs border border-border bg-secondary px-[5px] font-sans text-2xs text-muted-foreground">
                {command.shortcut}
              </kbd>
            </div>
            <div className="flex items-center justify-between text-2xs">
              <span className="text-muted-foreground">Scope</span>
              <span className="truncate font-medium text-foreground">{command.scope}</span>
            </div>
            <div className="flex items-center justify-between text-2xs">
              <span className="text-muted-foreground">Role required</span>
              <span className="font-medium text-foreground">{command.roleRequired}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <FilterHeading>SEARCH PREFIXES</FilterHeading>
        <div className="flex flex-col gap-1.5">
          {PREFIX_HINTS.map((pf) => (
            <div key={pf.key} className="flex items-center gap-2 text-xs text-secondary-foreground">
              <kbd className="inline-flex size-5 shrink-0 items-center justify-center rounded-xs border border-border bg-secondary font-sans text-2xs text-muted-foreground">
                {pf.key}
              </kbd>
              <span>{pf.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkItemsTabFilters({
  filters,
  types,
  activeEra,
  participants,
  onPatch,
}: {
  filters: PaletteFilters;
  types: ProjectWorkItemType[];
  activeEra?: ProjectEra;
  participants: PaletteParticipant[];
  onPatch: (patch: Partial<PaletteFilters>) => void;
}) {
  return (
    <>
      {types.length > 0 && (
        <div className="flex flex-col gap-2">
          <FilterHeading>WORK ITEM TYPE</FilterHeading>
          <div className="flex flex-wrap gap-1.5">
            {types.map((wt) => (
              <FilterPill
                key={wt.id}
                label={wt.name}
                active={filters.typeIds.includes(wt.id)}
                onClick={() => {
                  onPatch({ typeIds: toggleListValue(filters.typeIds, wt.id) });
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <FilterHeading>PRIORITY</FilterHeading>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITY_OPTIONS.map((opt) => (
            <FilterPill
              key={opt.value}
              label={opt.label}
              active={filters.priorities.includes(opt.value)}
              onClick={() => {
                onPatch({ priorities: toggleListValue(filters.priorities, opt.value) });
              }}
            />
          ))}
        </div>
      </div>

      <StatusGroupFilter
        selected={filters.statusGroups}
        onChange={(statusGroups) => {
          onPatch({ statusGroups });
        }}
      />

      <div className="flex flex-col gap-2">
        <FilterHeading>ERA</FilterHeading>
        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={filters.eraMode === 'active'}
              onChange={() => {
                onPatch({ eraMode: filters.eraMode === 'active' ? 'all' : 'active' });
              }}
              className="size-3.5 shrink-0 cursor-pointer rounded-xs border-input accent-primary"
            />
            <span className="truncate">
              {activeEra ? `Active Era (${activeEra.name})` : 'Active Era'}
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={filters.eraMode === 'none'}
              onChange={() => {
                onPatch({ eraMode: filters.eraMode === 'none' ? 'all' : 'none' });
              }}
              className="size-3.5 shrink-0 cursor-pointer rounded-xs border-input accent-primary"
            />
            <span>No Era (Backlog)</span>
          </label>
        </div>
      </div>

      <AssigneeFilter
        participants={participants}
        assignedToMe={filters.assignedToMe}
        selectedIds={filters.assigneeIds}
        onToggleMe={() => {
          onPatch({ assignedToMe: !filters.assignedToMe });
        }}
        onChangeIds={(assigneeIds) => {
          onPatch({ assigneeIds });
        }}
      />
    </>
  );
}

function ProjectsViewsTabFilters({
  filters,
  projects,
  onPatch,
}: {
  filters: PaletteFilters;
  projects: Project[];
  onPatch: (patch: Partial<PaletteFilters>) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <FilterHeading>VIEW VISIBILITY</FilterHeading>
        <div className="flex flex-wrap gap-1.5">
          {VISIBILITY_OPTIONS.map((opt) => (
            <FilterPill
              key={opt.value}
              label={opt.label}
              active={filters.viewVisibility === opt.value}
              onClick={() => {
                onPatch({ viewVisibility: opt.value });
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FilterHeading>VIEW LAYOUT</FilterHeading>
        <div className="flex flex-wrap gap-1.5">
          {VIEW_LAYOUT_OPTIONS.map((opt) => (
            <FilterPill
              key={opt.value}
              label={opt.label}
              active={filters.viewLayouts.includes(opt.value)}
              onClick={() => {
                onPatch({ viewLayouts: toggleListValue(filters.viewLayouts, opt.value) });
              }}
            />
          ))}
        </div>
      </div>

      <ProjectFilter
        projects={projects}
        selectedIds={filters.projectIds}
        onChange={(projectIds) => {
          onPatch({ projectIds });
        }}
      />
    </>
  );
}

export interface CommandPaletteFiltersProps {
  activeTab: PaletteTab;
  filters: PaletteFilters;
  projects: Project[];
  types: ProjectWorkItemType[];
  activeEra?: ProjectEra;
  participants: PaletteParticipant[];
  selectedCommand?: CommandEntry;
  onPatch: (patch: Partial<PaletteFilters>) => void;
}

/** Right-hand contextual filter or command inspector column matching Penpot Overlays / Command Palette. */
export function CommandPaletteFilters({
  activeTab,
  filters,
  projects,
  types,
  activeEra,
  participants,
  selectedCommand,
  onPatch,
}: CommandPaletteFiltersProps) {
  return (
    <aside
      aria-label="Search filters"
      className="hidden w-[272px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-background p-4 md:flex"
    >
      {activeTab === 'commands' && <CommandsInspector command={selectedCommand} />}
      {activeTab === 'work-items' && (
        <WorkItemsTabFilters
          filters={filters}
          types={types}
          activeEra={activeEra}
          participants={participants}
          onPatch={onPatch}
        />
      )}
      {activeTab === 'projects-views' && (
        <ProjectsViewsTabFilters filters={filters} projects={projects} onPatch={onPatch} />
      )}
      {activeTab === 'all' && (
        <>
          <div className="flex flex-col gap-2">
            <FilterHeading>LAST UPDATED</FilterHeading>
            <div className="flex flex-wrap gap-1.5">
              {UPDATED_OPTIONS.map((opt) => (
                <FilterPill
                  key={opt.value}
                  label={opt.label}
                  active={filters.updated === opt.value}
                  onClick={() => {
                    onPatch({ updated: opt.value });
                  }}
                />
              ))}
            </div>
          </div>
          <StatusGroupFilter
            selected={filters.statusGroups}
            onChange={(statusGroups) => {
              onPatch({ statusGroups });
            }}
          />
          <ProjectFilter
            projects={projects}
            selectedIds={filters.projectIds}
            onChange={(projectIds) => {
              onPatch({ projectIds });
            }}
          />
          <AssigneeFilter
            participants={participants}
            assignedToMe={filters.assignedToMe}
            selectedIds={filters.assigneeIds}
            onToggleMe={() => {
              onPatch({ assignedToMe: !filters.assignedToMe });
            }}
            onChangeIds={(assigneeIds) => {
              onPatch({ assigneeIds });
            }}
          />
        </>
      )}
    </aside>
  );
}
