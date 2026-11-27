import { Check, ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchInput } from '@/components/ui/search-input';
import { SidebarNavIndicator } from '@/components/ui/sidebar-nav-item';
import type { ProjectView } from '@/features/projects';
import { cn } from '@/lib/utils';

export interface BoardSwitcherProps {
  projectName: string;
  views: ProjectView[];
  activeViewId: string | null;
  totalCount: number;
  canWrite: boolean;
  onSelectView: (view: ProjectView | null) => void;
  onRequestCreateBoard: () => void;
}

interface BoardOptionItem {
  id: string | null;
  name: string;
  view: ProjectView | null;
  count?: number;
}

function buildBoardOptions(views: ProjectView[], totalCount: number): BoardOptionItem[] {
  const defaultBoard: BoardOptionItem = {
    id: null,
    name: 'Board',
    view: null,
    count: totalCount,
  };
  const savedBoards: BoardOptionItem[] = views.map((view) => ({
    id: view.id,
    name: view.name,
    view,
  }));
  return [defaultBoard, ...savedBoards];
}

export function BoardSwitcher({
  projectName,
  views,
  activeViewId,
  totalCount,
  canWrite,
  onSelectView,
  onRequestCreateBoard,
}: BoardSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = buildBoardOptions(views, totalCount);
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter((opt) => opt.name.toLowerCase().includes(needle))
    : options;

  function handleSelect(view: ProjectView | null) {
    onSelectView(view);
    setOpen(false);
    setQuery('');
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Switch board"
          aria-expanded={open}
          data-slot="board-switcher-trigger"
          className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-transparent bg-secondary text-muted-foreground transition-colors outline-none hover:border-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[264px] p-2">
        <div className="flex flex-col gap-1.5">
          <SearchInput
            aria-label="Search boards"
            placeholder="Search boards..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onClear={() => {
              setQuery('');
            }}
          />

          <div className="px-1.5 pt-1 text-3xs font-medium tracking-wider text-muted-foreground uppercase">
            Boards in {projectName}
          </div>

          <div role="listbox" aria-label="Available boards" className="flex flex-col gap-0.5">
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                No boards match &ldquo;{query.trim()}&rdquo;
              </p>
            ) : (
              filtered.map((opt) => {
                const active = opt.id === activeViewId;
                return (
                  <button
                    key={opt.id ?? '__default__'}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      handleSelect(opt.view);
                    }}
                    className={cn(
                      'flex h-[30px] w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-1.5 pr-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-secondary font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <SidebarNavIndicator active={active} />
                      <span className="truncate">{opt.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {opt.count !== undefined && (
                        <span className="text-2xs text-muted-foreground tabular-nums">
                          {opt.count}
                        </span>
                      )}
                      {active && <Check className="size-3.5 text-primary" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {canWrite && (
            <>
              <div className="my-0.5 h-px w-full bg-border" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRequestCreateBoard();
                }}
                className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Create new board</span>
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
