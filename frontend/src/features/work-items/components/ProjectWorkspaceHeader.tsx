import {
  BookmarkPlus,
  Calendar,
  CircleDot,
  Globe,
  ListFilter,
  Lock,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Star,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import type { ProjectConfigTab } from '@/app/project-shell-context';
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ui/icon-button';
import { SearchInput } from '@/components/ui/search-input';
import { ViewSwitcher } from '@/components/ui/view-switcher';
import type {
  Project,
  ProjectEra,
  ProjectStatus,
  ProjectView,
  ProjectWorkItemType,
  ViewLayout,
} from '@/features/projects';
import { cn } from '@/lib/utils';
import type { Priority, WorkItemFilters } from '../api/workItemsApi';
import { BoardSwitcher } from './BoardSwitcher';
import { PRIORITIES, priorityLabels } from './workItemLabels';

export interface Participant {
  id: string;
  name: string;
  username: string;
}

type ExtraFilterKey = 'priority' | 'era';

const TYPE_ORDER: Record<string, number> = {
  epic: 0,
  task: 1,
  bug: 2,
};

function sortTypesEpicFirst(types: ProjectWorkItemType[]): ProjectWorkItemType[] {
  return [...types].sort((a, b) => {
    const rankA = TYPE_ORDER[a.name.trim().toLowerCase()] ?? 3;
    const rankB = TYPE_ORDER[b.name.trim().toLowerCase()] ?? 3;
    if (rankA !== rankB) return rankA - rankB;
    return a.position - b.position;
  });
}

function initialsOf(name: string, username: string): string {
  const source = (name || username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

function favoriteStorageKey(projectId: string, viewKey: string): string {
  return `openboard:favorite:${projectId}:${viewKey}`;
}

function readFavorite(projectId: string, viewKey: string): boolean {
  try {
    return window.localStorage.getItem(favoriteStorageKey(projectId, viewKey)) === '1';
  } catch {
    return false;
  }
}

function writeFavorite(projectId: string, viewKey: string, value: boolean): void {
  try {
    window.localStorage.setItem(favoriteStorageKey(projectId, viewKey), value ? '1' : '0');
  } catch {
    // Ignore storage quota or private mode restrictions.
  }
}

const chipSelectClass =
  'h-6 cursor-pointer bg-transparent pr-1 text-xs font-medium text-foreground outline-none';

interface BoardMoreMenuProps {
  canWrite: boolean;
  isOwner: boolean;
  activeView: ProjectView | null;
  canEditActiveView: boolean;
  isActiveViewCreator: boolean;
  viewBusy: boolean;
  onRequestSaveView: () => void;
  onUpdateActiveView: () => void;
  onToggleActiveViewVisibility: () => void;
  onDeleteActiveView: () => void;
  onOpenConfigTab: (tab: ProjectConfigTab) => void;
}

function BoardMoreMenu({
  canWrite,
  isOwner,
  activeView,
  canEditActiveView,
  isActiveViewCreator,
  viewBusy,
  onRequestSaveView,
  onUpdateActiveView,
  onToggleActiveViewVisibility,
  onDeleteActiveView,
  onOpenConfigTab,
}: BoardMoreMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Board options">
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {canWrite && (
          <DropdownMenuItem onSelect={onRequestSaveView}>
            <BookmarkPlus className="size-4" aria-hidden="true" />
            Save View
          </DropdownMenuItem>
        )}
        {activeView && canEditActiveView && (
          <>
            <DropdownMenuItem disabled={viewBusy} onSelect={onUpdateActiveView}>
              <Save className="size-4" aria-hidden="true" />
              Update View
            </DropdownMenuItem>
            {isActiveViewCreator && (
              <DropdownMenuItem disabled={viewBusy} onSelect={onToggleActiveViewVisibility}>
                {activeView.visibility === 'personal' ? (
                  <>
                    <Globe className="size-4" aria-hidden="true" />
                    Share View
                  </>
                ) : (
                  <>
                    <Lock className="size-4" aria-hidden="true" />
                    Make Personal
                  </>
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              disabled={viewBusy}
              onSelect={onDeleteActiveView}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete View
            </DropdownMenuItem>
          </>
        )}
        {(canWrite || (activeView && canEditActiveView)) && <DropdownMenuSeparator />}
        <DropdownMenuItem
          onSelect={() => {
            onOpenConfigTab('workflow');
          }}
        >
          Workflow &amp; Types
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onOpenConfigTab('eras');
          }}
        >
          Manage Eras
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onOpenConfigTab('teams');
          }}
        >
          Project Teams
        </DropdownMenuItem>
        {isOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onOpenConfigTab('settings');
              }}
            >
              Project Settings
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ParticipantAvatarsProps {
  participants: Participant[];
  selectedOwnerId: string | undefined;
  onSelectOwner: (userId: string | undefined) => void;
}

function ParticipantAvatars({
  participants,
  selectedOwnerId,
  onSelectOwner,
}: ParticipantAvatarsProps) {
  if (participants.length === 0) return null;
  const visible = participants.slice(0, 5);
  const overflow = participants.length - visible.length;

  return (
    <AvatarGroup role="group" aria-label="Filter by participant">
      {visible.map((person) => {
        const selected = selectedOwnerId === person.id;
        return (
          <button
            key={person.id}
            type="button"
            aria-label={`Filter by ${person.name || person.username}`}
            aria-pressed={selected}
            title={`${person.name || person.username} (@${person.username})`}
            onClick={() => {
              onSelectOwner(selected ? undefined : person.id);
            }}
            className={cn(
              'rounded-full transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring',
              selected && 'z-10 ring-2 ring-primary ring-offset-1 ring-offset-card',
            )}
          >
            <Avatar size="sm" className="size-7">
              <AvatarFallback
                className={cn(
                  'text-2xs font-semibold',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground',
                )}
              >
                {initialsOf(person.name, person.username)}
              </AvatarFallback>
            </Avatar>
          </button>
        );
      })}
      {overflow > 0 && (
        <AvatarGroupCount className="size-7 text-2xs font-medium">+{overflow}</AvatarGroupCount>
      )}
    </AvatarGroup>
  );
}

interface FilterRowProps {
  filters: WorkItemFilters;
  participants: Participant[];
  statuses: ProjectStatus[];
  eras: ProjectEra[];
  extraFilters: ExtraFilterKey[];
  hasActiveFilters: boolean;
  onChange: (patch: Partial<WorkItemFilters>) => void;
  onAddExtraFilter: (key: ExtraFilterKey) => void;
  onReset: () => void;
}

interface FilterChipSelectProps {
  label: string;
  ariaLabel: string;
  value: string;
  emptyOption: string;
  options: Array<{ value: string; label: string }>;
  icon?: typeof UserRound;
  onChange: (next: string) => void;
}

function FilterChipSelect({
  label,
  ariaLabel,
  value,
  emptyOption,
  options,
  icon: Icon,
  onChange,
}: FilterChipSelectProps) {
  const active = Boolean(value);
  return (
    <label
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-xs border px-2 text-2xs transition-colors',
        active
          ? 'border-primary/50 bg-column-planned-surface text-primary'
          : 'border-border bg-secondary text-muted-foreground hover:border-input',
      )}
    >
      {Icon && <Icon className="size-3 shrink-0" aria-hidden="true" />}
      <span>{label}:</span>
      <select
        aria-label={ariaLabel}
        className={chipSelectClass}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        <option value="">{emptyOption}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function availableExtraFilters(
  showPriority: boolean,
  showEra: boolean,
  hasEras: boolean,
): Array<{ key: ExtraFilterKey; label: string }> {
  const list: Array<{ key: ExtraFilterKey; label: string }> = [];
  if (!showPriority) list.push({ key: 'priority', label: 'Priority' });
  if (!showEra && hasEras) list.push({ key: 'era', label: 'Era' });
  return list;
}

function ExtraFilterChips({
  filters,
  eras,
  showPriority,
  showEra,
  onChange,
}: {
  filters: WorkItemFilters;
  eras: ProjectEra[];
  showPriority: boolean;
  showEra: boolean;
  onChange: (patch: Partial<WorkItemFilters>) => void;
}) {
  return (
    <>
      {showPriority && (
        <FilterChipSelect
          label="Priority"
          ariaLabel="Filter by Priority"
          value={filters.priority ?? ''}
          emptyOption="All priorities"
          options={PRIORITIES.map((p) => ({ value: p, label: priorityLabels[p] }))}
          onChange={(val) => {
            onChange({ priority: (val as Priority | '') || undefined });
          }}
        />
      )}
      {showEra && (
        <FilterChipSelect
          label="Era"
          ariaLabel="Filter by Era"
          value={filters.eraId ?? ''}
          emptyOption="All Eras"
          options={eras.map((era) => ({ value: era.id, label: era.name }))}
          onChange={(val) => {
            onChange({ eraId: val || undefined });
          }}
        />
      )}
    </>
  );
}

function AddFilterMenu({
  availableExtras,
  onAddExtraFilter,
}: {
  availableExtras: Array<{ key: ExtraFilterKey; label: string }>;
  onAddExtraFilter: (key: ExtraFilterKey) => void;
}) {
  if (availableExtras.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="compact" variant="ghost" className="text-muted-foreground">
          <Plus className="size-3.5" aria-hidden="true" />
          Filter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {availableExtras.map((extra) => (
          <DropdownMenuItem
            key={extra.key}
            onSelect={() => {
              onAddExtraFilter(extra.key);
            }}
          >
            {extra.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotionFilterRow({
  filters,
  participants,
  statuses,
  eras,
  extraFilters,
  hasActiveFilters,
  onChange,
  onAddExtraFilter,
  onReset,
}: FilterRowProps) {
  const showPriority = extraFilters.includes('priority') || Boolean(filters.priority);
  const showEra = extraFilters.includes('era') && eras.length > 0;
  const availableExtras = availableExtraFilters(showPriority, showEra, eras.length > 0);

  return (
    <div
      role="region"
      aria-label="Filters"
      className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-2.5"
    >
      <FilterChipSelect
        label="Owner"
        ariaLabel="Filter by Owner"
        icon={UserRound}
        value={filters.assigneeId ?? ''}
        emptyOption="Any"
        options={participants.map((p) => ({ value: p.id, label: p.name || p.username }))}
        onChange={(val) => {
          onChange({ assigneeId: val || undefined });
        }}
      />

      <FilterChipSelect
        label="Dates"
        ariaLabel="Filter by Dates"
        icon={Calendar}
        value={filters.eraId ?? ''}
        emptyOption="Any window"
        options={eras.map((era) => ({
          value: era.id,
          label: `${era.name} (${era.startDate} – ${era.endDate})`,
        }))}
        onChange={(val) => {
          onChange({ eraId: val || undefined });
        }}
      />

      <FilterChipSelect
        label="Status"
        ariaLabel="Filter by Status"
        icon={CircleDot}
        value={filters.statusId ?? ''}
        emptyOption="All statuses"
        options={statuses.map((st) => ({ value: st.id, label: st.name }))}
        onChange={(val) => {
          onChange({ statusId: val || undefined });
        }}
      />

      <ExtraFilterChips
        filters={filters}
        eras={eras}
        showPriority={showPriority}
        showEra={showEra}
        onChange={onChange}
      />

      <AddFilterMenu availableExtras={availableExtras} onAddExtraFilter={onAddExtraFilter} />

      {hasActiveFilters && (
        <Button type="button" size="compact" variant="ghost" onClick={onReset}>
          <RotateCcw className="size-3" aria-hidden="true" />
          Reset
        </Button>
      )}
    </div>
  );
}

export interface ProjectWorkspaceHeaderProps {
  project: Project;
  viewKey: string;
  viewTitle: string;
  visibleCount: number;
  searchQuery: string;
  filters: WorkItemFilters;
  filtersOpen: boolean;
  configOpen: boolean;
  types: ProjectWorkItemType[];
  statuses: ProjectStatus[];
  eras: ProjectEra[];
  participants: Participant[];
  canWrite: boolean;
  showCreateButton: boolean;
  activeViewMode: ViewLayout;
  activeView: ProjectView | null;
  views: ProjectView[];
  canEditActiveView: boolean;
  isActiveViewCreator: boolean;
  viewBusy: boolean;
  onSelectLayout: (mode: ViewLayout) => void;
  onSelectSavedView: (view: ProjectView | null) => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (patch: Partial<WorkItemFilters>) => void;
  onResetFilters: () => void;
  onToggleFilters: () => void;
  onToggleConfig: () => void;
  onOpenConfigTab: (tab: ProjectConfigTab) => void;
  onStartCreate: () => void;
  onRequestSaveView: () => void;
  onUpdateActiveView: () => void;
  onToggleActiveViewVisibility: () => void;
  onDeleteActiveView: () => void;
}

function countActiveRow4Filters(filters: WorkItemFilters): number {
  return [filters.assigneeId, filters.eraId, filters.statusId, filters.priority].filter(Boolean)
    .length;
}

interface HeaderControlsRowProps {
  searchQuery: string;
  filters: WorkItemFilters;
  filtersOpen: boolean;
  configOpen: boolean;
  activeFilterCount: number;
  orderedTypes: ProjectWorkItemType[];
  participants: Participant[];
  showCreateButton: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (patch: Partial<WorkItemFilters>) => void;
  onToggleFilters: () => void;
  onToggleConfig: () => void;
  onStartCreate: () => void;
}

function HeaderControlsRow({
  searchQuery,
  filters,
  filtersOpen,
  configOpen,
  activeFilterCount,
  orderedTypes,
  participants,
  showCreateButton,
  onSearchChange,
  onFilterChange,
  onToggleFilters,
  onToggleConfig,
  onStartCreate,
}: HeaderControlsRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        aria-label="Search work items"
        placeholder="Search board..."
        value={searchQuery}
        onChange={(e) => {
          onSearchChange(e.target.value);
        }}
        onClear={() => {
          onSearchChange('');
        }}
        containerClassName="w-44"
      />

      <ParticipantAvatars
        participants={participants}
        selectedOwnerId={filters.assigneeId}
        onSelectOwner={(assigneeId) => {
          onFilterChange({ assigneeId });
        }}
      />

      <select
        aria-label="Filter by Work Item Type"
        className="h-7 rounded-sm border border-input bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
        value={filters.workItemTypeId ?? ''}
        onChange={(e) => {
          onFilterChange({ workItemTypeId: e.target.value || undefined });
        }}
      >
        <option value="">All types</option>
        {orderedTypes.map((wt) => (
          <option key={wt.id} value={wt.id}>
            {wt.name}
          </option>
        ))}
      </select>

      <Button
        type="button"
        size="compact"
        variant={filtersOpen || activeFilterCount > 0 ? 'active' : 'outline'}
        aria-label="Toggle filters"
        aria-expanded={filtersOpen}
        onClick={onToggleFilters}
      >
        <ListFilter className="size-3.5" aria-hidden="true" />
        <span>Filter</span>
        {activeFilterCount > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-xs bg-primary px-1 text-3xs font-semibold text-primary-foreground tabular-nums">
            {activeFilterCount}
          </span>
        )}
      </Button>

      <Button
        type="button"
        size="compact"
        variant={configOpen ? 'active' : 'outline'}
        aria-pressed={configOpen}
        onClick={onToggleConfig}
      >
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        Configure
      </Button>

      {showCreateButton && (
        <Button type="button" size="compact" onClick={onStartCreate}>
          <Plus className="size-3.5" aria-hidden="true" />
          New Work Item
        </Button>
      )}
    </div>
  );
}

function ActiveEraBadge({ eras }: { eras: ProjectEra[] }) {
  const activeEra = eras.find((era) => era.state === 'active');
  if (!activeEra) return null;

  return (
    <span className="hidden items-center gap-1.5 rounded-xs border border-border bg-secondary px-2 py-0.5 text-2xs text-muted-foreground sm:inline-flex">
      <span className="size-1.5 rounded-xs bg-success" aria-hidden="true" />
      <span>
        {activeEra.name} · {activeEra.startDate} – {activeEra.endDate}
      </span>
    </span>
  );
}

/** Persistent 3-row workspace header shared across Board, List, Table, Timeline and Calendar views. */
export function ProjectWorkspaceHeader(props: ProjectWorkspaceHeaderProps) {
  const { project, viewKey, viewTitle, visibleCount, searchQuery, filters, filtersOpen } = props;
  const [favoriteKey, setFavoriteKey] = useState(`${project.id}:${viewKey}`);
  const [starred, setStarred] = useState(() => readFavorite(project.id, viewKey));
  const [extraFilters, setExtraFilters] = useState<ExtraFilterKey[]>([]);

  const currentFavoriteKey = `${project.id}:${viewKey}`;
  if (favoriteKey !== currentFavoriteKey) {
    setFavoriteKey(currentFavoriteKey);
    setStarred(readFavorite(project.id, viewKey));
  }

  const orderedTypes = sortTypesEpicFirst(props.types);
  const activeFilterCount = countActiveRow4Filters(filters);
  const hasAnyFilter =
    activeFilterCount > 0 || Boolean(filters.workItemTypeId) || Boolean(searchQuery.trim());

  function toggleStar() {
    const next = !starred;
    setStarred(next);
    writeFavorite(project.id, viewKey, next);
  }

  return (
    <header className="shrink-0 border-b border-border bg-card px-4 py-3 md:px-6">
      <div className="flex flex-col gap-2.5">
        {/* Row 1: Breadcrumb (left) + View Switcher, Favorite & More (right) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Project breadcrumb"
            className="flex items-center gap-1.5 text-2xs text-muted-foreground"
          >
            <span>Projects</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">{project.name}</span>
            <span aria-hidden="true">/</span>
            <span className="truncate font-medium text-foreground">{viewTitle}</span>
          </nav>
          <div className="flex items-center gap-1.5">
            <ViewSwitcher value={props.activeViewMode} onChange={props.onSelectLayout} />
            <IconButton
              size="sm"
              variant="outline"
              aria-label={starred ? 'Remove from favorites' : 'Favorite board'}
              aria-pressed={starred}
              onClick={toggleStar}
              className={cn(starred && 'text-warning')}
            >
              <Star className={cn('size-3.5', starred && 'fill-current')} aria-hidden="true" />
            </IconButton>
            <BoardMoreMenu
              canWrite={props.canWrite}
              isOwner={project.currentUserRole === 'owner'}
              activeView={props.activeView}
              canEditActiveView={props.canEditActiveView}
              isActiveViewCreator={props.isActiveViewCreator}
              viewBusy={props.viewBusy}
              onRequestSaveView={props.onRequestSaveView}
              onUpdateActiveView={props.onUpdateActiveView}
              onToggleActiveViewVisibility={props.onToggleActiveViewVisibility}
              onDeleteActiveView={props.onDeleteActiveView}
              onOpenConfigTab={props.onOpenConfigTab}
            />
          </div>
        </div>

        {/* Row 2: Title + Board Switcher + Count + Active Era (left) | Controls Cluster (right) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{viewTitle}</h1>
            <BoardSwitcher
              projectName={project.name}
              views={props.views}
              activeViewId={props.activeView?.id ?? null}
              totalCount={visibleCount}
              canWrite={props.canWrite}
              onSelectView={props.onSelectSavedView}
              onRequestCreateBoard={props.onRequestSaveView}
            />
            <Badge variant="secondary" className="tabular-nums">
              {visibleCount}
            </Badge>
            <ActiveEraBadge eras={props.eras} />
          </div>

          <HeaderControlsRow
            searchQuery={searchQuery}
            filters={filters}
            filtersOpen={filtersOpen}
            configOpen={props.configOpen}
            activeFilterCount={activeFilterCount}
            orderedTypes={orderedTypes}
            participants={props.participants}
            showCreateButton={props.showCreateButton}
            onSearchChange={props.onSearchChange}
            onFilterChange={props.onFilterChange}
            onToggleFilters={props.onToggleFilters}
            onToggleConfig={props.onToggleConfig}
            onStartCreate={props.onStartCreate}
          />
        </div>

        {/* Row 3: Collapsible Inline Filter Bar */}
        {filtersOpen && (
          <NotionFilterRow
            filters={filters}
            participants={props.participants}
            statuses={props.statuses}
            eras={props.eras}
            extraFilters={extraFilters}
            hasActiveFilters={hasAnyFilter}
            onChange={props.onFilterChange}
            onAddExtraFilter={(key) => {
              setExtraFilters((prev) => (prev.includes(key) ? prev : [...prev, key]));
            }}
            onReset={props.onResetFilters}
          />
        )}
      </div>
    </header>
  );
}
