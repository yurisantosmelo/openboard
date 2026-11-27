import type { ViewLayout } from '@/features/projects';
import { cn } from '@/lib/utils';

const VIEW_OPTIONS: Array<{ mode: ViewLayout; label: string }> = [
  { mode: 'list', label: 'List' },
  { mode: 'board', label: 'Board' },
  { mode: 'table', label: 'Table' },
  { mode: 'timeline', label: 'Timeline' },
  { mode: 'calendar', label: 'Calendar' },
];

export interface ViewSwitcherProps {
  value: ViewLayout;
  onChange: (mode: ViewLayout) => void;
  className?: string;
}

export function ViewSwitcher({ value, onChange, className }: ViewSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Board view layout"
      data-slot="view-switcher"
      className={cn(
        'inline-flex h-[26px] items-center gap-0.5 rounded-sm border border-border bg-secondary p-0.5',
        className,
      )}
    >
      {VIEW_OPTIONS.map(({ mode, label }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onChange(mode);
            }}
            className={cn(
              'inline-flex h-[22px] cursor-pointer items-center rounded-xs border px-2 text-2xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-border bg-card font-medium text-foreground'
                : 'border-transparent bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
