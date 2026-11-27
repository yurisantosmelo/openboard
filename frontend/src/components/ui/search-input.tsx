import type { ComponentProps } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SearchInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  shortcut?: string;
  onClear?: () => void;
  containerClassName?: string;
};

export function SearchInput({
  className,
  containerClassName,
  shortcut,
  value,
  onClear,
  ...props
}: SearchInputProps) {
  const hasValue = typeof value === 'string' && value.length > 0;

  return (
    <div
      data-slot="search-input"
      className={cn(
        'relative flex h-7 w-full items-center gap-2 rounded-sm border border-input bg-background px-2.5 text-xs text-foreground transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20',
        containerClassName,
      )}
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        value={value}
        className={cn(
          'w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-placeholder [&::-webkit-search-cancel-button]:hidden',
          className,
        )}
        {...props}
      />
      {hasValue && onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
      {!hasValue && shortcut ? (
        <kbd className="inline-flex h-5 shrink-0 items-center rounded-xs border border-border bg-secondary px-[5px] font-sans text-2xs font-normal text-muted-foreground">
          {shortcut}
        </kbd>
      ) : null}
    </div>
  );
}
